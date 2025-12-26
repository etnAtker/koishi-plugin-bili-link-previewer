import { Context, Logger, Schema, Session } from 'koishi'
import { } from "koishi-plugin-puppeteer";
import { Eta } from "eta";

import { cardTemplate } from './template'
import { BiliResp, VideoInfo } from "./model";

export const name = 'bili-link-previewer'
export const inject = ['puppeteer']

export interface Config {
  antiRepeatTimeout: number
  userAgent: string
}

const defaultUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
export const Config: Schema<Config> = Schema.object({
  antiRepeatTimeout: Schema.number().default(10).description('对于重复BV号的静默时长，单位秒。用于多个机器人的环境，防止回声。'),
  userAgent: Schema.string().default(defaultUserAgent).description('User-Agent'),
})

const bvNumberRegex = /(?<![0-9a-zA-Z])[Bb][Vv][0-9a-zA-Z]{10}(?![0-9a-zA-Z])/
const eta = new Eta()

let log: Logger;
let recentBvNumbers: Record<string, number> = {}

async function fetchInfo(ctx: Context, bvNumber: string) {
  const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvNumber}`
  return await ctx.http.get<BiliResp<VideoInfo>>(url, {
    headers: {
      Host: 'api.bilibili.com',
      'User-Agent': ctx.config.userAgent
    }
  })
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const hourStr = hours > 9 ? `${hours}:` : hours > 0 ? `0${hours}:` : ''
  const minutes = Math.floor((seconds % 3600) / 60)
  const minutesStr = minutes > 9 ? `${minutes}:` : `0${minutes}:`
  const remainingSeconds = seconds % 60
  const secondsStr = remainingSeconds > 9 ? `${remainingSeconds}` : `0${remainingSeconds}`
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

export function apply(ctx: Context, config: Config) {
  log = ctx.logger('bili-link-previewer')
  log.info('Plugin reloaded.')
  log.info('Config: antiRepeatTimeout = ' + config.antiRepeatTimeout)
  log.info('Config: userAgent = ' + config.userAgent)

  ctx.middleware(async (session, next) => {
    const content = session.stripped.content
    const bv = bvNumberRegex.exec(content)
    if (!bv) return next()

    const bvNumber = bv[0]
    if (isRepeat(ctx, session, bvNumber)) return

    const resp = await fetchInfo(ctx, bvNumber)
    if (resp.code !== 0 || !resp.data) {
      log.error(`Fetch video info failed (${resp.code}: ${resp.message}). Raw user message: \n${content}`)
      return `${bvNumber} 视频信息获取异常：${resp.message} (${resp.code})`
    }

    const respData = resp.data
    const cardHtml = eta.renderString(cardTemplate, {
      title: respData.title, // 标题
      coverUrl: respData.pic, // 封面
      duration: formatDuration(respData.duration), // 时长
      author: respData.owner?.name || '未知', // 作者
      pubDate: formatTimestamp(respData.pubdate), // 发布时间
      views: formatStatNumber(respData.stat?.view || 0), // 播放量
      danmaku: formatStatNumber(respData.stat?.danmaku || 0), // 弹幕
      likes: formatStatNumber(respData.stat?.like || 0), // 点赞
      favorites: formatStatNumber(respData.stat?.favorite || 0), // 收藏
      desc: respData.desc || '', // 简介
      w: 600,
      h: 850,
    })

    return await ctx.puppeteer.render(
      cardHtml,
      async (page, next) => {
        const card = await page.$('#card');
        return next(card);
      }
    )
  })
}
