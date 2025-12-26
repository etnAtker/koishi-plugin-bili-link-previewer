export interface BiliResp<T> {
  code: number
  message?: string
  ttl?: number
  data?: T
}

export interface VideoInfo {
  title: string
  pic: string
  duration: number
  owner: Owner
  pubdate: number
  stat: Stat
  desc: string
}

interface Owner {
  name: string
  face: string
}

interface Stat {
  view: number
  danmaku: number
  like: number
  favorite: number
}
