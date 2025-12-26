import { Context, Schema } from 'koishi'
import { } from "koishi-plugin-puppeteer";
import { Eta } from "eta";

import { cardTemplate } from './template'
import { BiliResp, VideoInfo } from "./model";

export const name = 'bili-link-previewer'
export const inject = ['puppeteer']

export interface Config {
}

export const Config: Schema<Config> = Schema.object({})

const bvNumberRegex = /[Bb][Vv][0-9a-zA-Z]{10}/
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const eta = new Eta()

async function fetchInfo(ctx: Context, bvNumber: string) {
  const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvNumber}`
  return await ctx.http.get<BiliResp<VideoInfo>>(url, {
    headers: {
      Host: 'api.bilibili.com',
      'User-Agent': ua
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

export function apply(ctx: Context) {
  ctx.middleware(async (session, next) => {
    const bv = bvNumberRegex.exec(session.stripped.content)
    if (!bv) return next()

    const bvNumber = bv[0]
    const resp = await fetchInfo(ctx, bvNumber)

    if (resp.code !== 0 || !resp.data) {
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
        await page.setViewport({ width: 600, height: 850 });
        const card = await page.$('#card');
        return next(card);
      }
    )
  })
}
