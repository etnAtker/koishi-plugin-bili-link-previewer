import { Context, Logger, Schema, Session } from 'koishi'
import {} from 'koishi-plugin-puppeteer'
import { Eta } from 'eta'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { cardTemplate } from './template'
import { BiliResp, VideoInfo } from './model'
import { get } from 'node:http'

export const name = 'bili-link-previewer'
export const inject = ['puppeteer']

export interface Config {
  antiRepeatTimeout: number
  userAgent: string
}

const defaultUserAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
export const Config: Schema<Config> = Schema.object({
  antiRepeatTimeout: Schema.number()
    .default(10)
    .description(
      '对于重复BV号的静默时长，单位秒。用于多个机器人的环境，防止回声。',
    ),
  userAgent: Schema.string()
    .default(defaultUserAgent)
    .description('User-Agent'),
})

const bvNumberRegex = /(?<![0-9a-zA-Z])[Bb][Vv][0-9a-zA-Z]{10}(?![0-9a-zA-Z])/
const shortLinkRegex = /b23\.tv(?:\\)?\/([0-9a-zA-Z]+)/
const eta = new Eta()

let log: Logger
let recentBvNumbers: Record<string, number> = {}

const fontAssets = {
  regular: 'fonts/NotoSansSC-Regular.ttf',
  medium: 'fonts/NotoSansSC-Medium.ttf',
  bold: 'fonts/NotoSansSC-Bold.ttf',
} as const

const fontUrlCache: Partial<Record<keyof typeof fontAssets, string>> = {}

function resolveAssetPath(relativePath: string) {
  const candidates = [
    resolve(__dirname, '../assets', relativePath),
    resolve(__dirname, '../../assets', relativePath),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  throw new Error(`Asset not found: ${relativePath}`)
}

function getFontFileUrl(key: keyof typeof fontAssets) {
  if (!fontUrlCache[key]) {
    fontUrlCache[key] = pathToFileURL(resolveAssetPath(fontAssets[key])).href
  }
  return fontUrlCache[key]
}

function createFallbackCoverDataUrl() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="375" viewBox="0 0 600 375">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#2b2b36" />
          <stop offset="100%" stop-color="#121212" />
        </linearGradient>
      </defs>
      <rect width="600" height="375" fill="url(#bg)" />
      <circle cx="495" cy="88" r="110" fill="rgba(251,114,153,0.18)" />
      <circle cx="115" cy="316" r="140" fill="rgba(255,255,255,0.07)" />
      <rect x="34" y="286" width="152" height="18" rx="9" fill="rgba(255,255,255,0.12)" />
      <rect x="34" y="316" width="232" height="12" rx="6" fill="rgba(255,255,255,0.08)" />
    </svg>
  `.trim()
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

async function fetchInfo(ctx: Context, bvNumber: string, userAgent: string) {
  const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvNumber}`
  return await ctx.http.get<BiliResp<VideoInfo>>(url, {
    headers: {
      Host: 'api.bilibili.com',
      'User-Agent': userAgent,
    },
  })
}

async function fetchImageAsDataUrl(
  ctx: Context,
  imageUrl: string,
  userAgent: string,
) {
  const response = await ctx.http(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 15000,
    headers: {
      Referer: 'https://www.bilibili.com/',
      'User-Agent': userAgent,
    },
  })
  const contentType =
    response.headers.get('content-type')?.split(';', 1)[0] || 'image/jpeg'
  const base64 = Buffer.from(response.data).toString('base64')
  return `data:${contentType};base64,${base64}`
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const hourStr = hours > 9 ? `${hours}:` : hours > 0 ? `0${hours}:` : ''
  const minutes = Math.floor((seconds % 3600) / 60)
  const minutesStr = minutes > 9 ? `${minutes}:` : `0${minutes}:`
  const remainingSeconds = seconds % 60
  const secondsStr =
    remainingSeconds > 9 ? `${remainingSeconds}` : `0${remainingSeconds}`
  return `${hourStr}${minutesStr}${secondsStr}`
}

function formatTimestamp(timestamp: number) {
  const datetime = new Date(timestamp * 1000)
  const year = datetime.getFullYear()
  const month = datetime.getMonth() + 1
  const day = datetime.getDate()
  const hour = datetime.getHours()
  const hourStr = hour > 9 ? `${hour}` : `0${hour}`
  const minute = datetime.getMinutes()
  const minuteStr = minute > 9 ? `${minute}` : `0${minute}`
  const second = datetime.getSeconds()
  const secondStr = second > 9 ? `${second}` : `0${second}`
  return `${year}-${month}-${day} ${hourStr}:${minuteStr}:${secondStr}`
}

function formatStatNumber(num: number) {
  if (num >= 10000) {
    const tenK = Math.floor(num / 10000)
    const k = Math.floor((num % 10000) / 1000)
    return `${tenK}.${k} 万`
  }
  return num
}

function isRepeat(ctx: Context, session: Session, bvNumber: string) {
  const timestamp = Date.now()
  const timeout = ctx.config.antiRepeatTimeout * 1000
  const guildId = session.guildId || session.id
  const cacheKey = `${guildId}#${bvNumber}`

  let isRepeat = false

  for (const [key, value] of Object.entries(recentBvNumbers)) {
    if (timestamp - value > timeout) {
      log.info(`${key} removed from anti-repeat.`)
      delete recentBvNumbers[key]
    } else if (key === cacheKey) {
      isRepeat = true
      log.info(`${key} triggered anti-repeat.`)
    }
  }

  recentBvNumbers[cacheKey] = timestamp

  return isRepeat
}

function parseShortHash(url: string) {
  const match = shortLinkRegex.exec(url)
  return match ? match[1] : null
}

async function getBvFromShortLink(
  ctx: Context,
  userAgent: string,
  link: string,
) {
  var hash = parseShortHash(link)
  if (!hash) return null

  var data = await ctx.http.get('https://b23.tv/' + hash, {
    redirect: 'manual',
    headers: {
      'User-Agent': userAgent,
    },
  })

  const match = data.match(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"/i)
  if (!match?.[1]) return null

  const normalLink = match[1]
  const bv = bvNumberRegex.exec(normalLink)
  if (bv) return bv[0]

  return null
}

async function getBvNumber(ctx: Context, userAgent: string, session: Session<never, never, Context>) {
  // 卡片
  const firstElement = session.elements?.[0]
  if (!firstElement) return null

  if (firstElement.type === 'json') {
    try {
      const cardJson = JSON.parse(firstElement.attrs.data ?? '{}')
      const shortLink = cardJson.meta?.detail_1?.qqdocurl
      if (shortLink) return await getBvFromShortLink(ctx, userAgent, shortLink)
    } catch (error) {
      log.warn(`Failed to parse card JSON: ${error}`)
    }
  }

  const content = session.stripped.content

  // bv号
  const bv = bvNumberRegex.exec(content)
  if (bv) return bv[0]

  // 短链接
  return await getBvFromShortLink(ctx, userAgent, content)
}

export function apply(ctx: Context, config: Config) {
  log = ctx.logger('bili-link-previewer')
  log.info('Plugin reloaded.')
  log.info('Config: antiRepeatTimeout = ' + config.antiRepeatTimeout)
  log.info('Config: userAgent = ' + config.userAgent)

  ctx.middleware(async (session, next) => {
    const bvNumber = await getBvNumber(ctx, config.userAgent, session)
    if (!bvNumber) return next()

    if (isRepeat(ctx, session, bvNumber)) return

    const totalStartedAt = Date.now()
    let fetchInfoElapsed = 0
    let inlineCoverElapsed = 0
    let renderElapsed = 0

    const fetchInfoStartedAt = Date.now()
    const resp = await fetchInfo(ctx, bvNumber, config.userAgent)
    fetchInfoElapsed = Date.now() - fetchInfoStartedAt
    if (resp.code !== 0 || !resp.data) {
      log.error(
        `${bvNumber}: Fetch video info failed (${resp.code}: ${resp.message})`,
      )
      return `${bvNumber} 视频信息获取异常 (${resp.code}: ${resp.message})`
    }

    const respData = resp.data
    let coverUrl = createFallbackCoverDataUrl()
    if (respData.pic) {
      const inlineCoverStartedAt = Date.now()
      try {
        coverUrl = await fetchImageAsDataUrl(
          ctx,
          respData.pic,
          config.userAgent,
        )
      } catch (error) {
        log.warn(
          `Inline cover fetch failed for ${bvNumber}, fallback placeholder will be used: ${error}`,
        )
      } finally {
        inlineCoverElapsed = Date.now() - inlineCoverStartedAt
      }
    }

    const cardHtml = eta.renderString(cardTemplate, {
      title: respData.title, // 标题
      coverUrl, // 封面
      duration: formatDuration(respData.duration), // 时长
      author: respData.owner?.name || '未知', // 作者
      pubDate: formatTimestamp(respData.pubdate), // 发布时间
      views: formatStatNumber(respData.stat?.view || 0), // 播放量
      danmaku: formatStatNumber(respData.stat?.danmaku || 0), // 弹幕
      likes: formatStatNumber(respData.stat?.like || 0), // 点赞
      favorites: formatStatNumber(respData.stat?.favorite || 0), // 收藏
      desc: respData.desc || '', // 简介
      fontRegularUrl: getFontFileUrl('regular'),
      fontMediumUrl: getFontFileUrl('medium'),
      fontBoldUrl: getFontFileUrl('bold'),
      w: 600,
      h: 850,
    })

    let renderStartedAt = 0
    try {
      renderStartedAt = Date.now()
      const renderedCard = await ctx.puppeteer.render(
        cardHtml,
        async (page, next) => {
          const card = await page.$('#card')
          return next(card ?? undefined)
        },
      )
      renderElapsed = Date.now() - renderStartedAt
      const totalElapsed = Date.now() - totalStartedAt
      log.info(
        `Rendered ${bvNumber} in ${totalElapsed}ms (fetchInfo=${fetchInfoElapsed}ms, inlineCover=${inlineCoverElapsed}ms, render=${renderElapsed}ms)`,
      )
      return renderedCard + `\nhttps://www.bilibili.com/video/${bvNumber}`
    } catch (error) {
      if (renderStartedAt) {
        renderElapsed = Date.now() - renderStartedAt
      }
      const totalElapsed = Date.now() - totalStartedAt
      log.error(
        `Render failed for ${bvNumber} after ${totalElapsed}ms (fetchInfo=${fetchInfoElapsed}ms, inlineCover=${inlineCoverElapsed}ms, render=${renderElapsed}ms): ${error}`,
      )
      throw error
    }
  })
}
