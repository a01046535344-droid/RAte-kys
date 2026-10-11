import express from 'express'
import { join, resolve } from 'node:path'
import Parser from 'rss-parser'

const app = express()
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001)
const clientDist = resolve('dist')
const refreshMs = 45_000
const parser = new Parser()

const streams = [
  { id: 'ktb', label: '한국 국채', kind: 'rates', query: '한국 국고채 금리 OR 국채 입찰 OR 국채선물', hl: 'ko', gl: 'KR', ceid: 'KR:ko' },
  { id: 'us-rates', label: '미국 IRS', kind: 'rates', query: 'US interest rates OR Treasury yields OR Federal Reserve', hl: 'en-US', gl: 'US', ceid: 'US:en' },
  { id: 'krw-irs', label: 'KRW IRS', kind: 'rates', query: '원화 금리스왑 OR 원화 IRS 금리 OR 한국 IRS 금리', hl: 'ko', gl: 'KR', ceid: 'KR:ko' },
  { id: 'crs', label: 'CRS', kind: 'flows', query: '원달러 통화스왑 CRS 금리', hl: 'ko', gl: 'KR', ceid: 'KR:ko' },
  { id: 'eur-irs', label: 'EUR IRS', kind: 'rates', query: 'ECB rates OR euro bond yields OR euro swap rates', hl: 'en-GB', gl: 'GB', ceid: 'GB:en' },
  { id: 'eur-sofr', label: 'EUR-SOFR basis', kind: 'rates', query: 'euro dollar cross currency basis OR EUR SOFR basis swap', hl: 'en-GB', gl: 'GB', ceid: 'GB:en' },
  { id: 'aud-irs', label: 'AUD IRS', kind: 'rates', query: 'RBA rates OR Australia bond yields OR AUD swap rates', hl: 'en-AU', gl: 'AU', ceid: 'AU:en' },
  { id: 'geopolitics', label: '중동·에너지', kind: 'geopolitics', query: 'Iran war oil price OR Houthi Red Sea shipping Saudi Arabia', hl: 'en-US', gl: 'US', ceid: 'US:en' },
  { id: 'supply', label: '채권·CRS 수급', kind: 'flows', query: '한국 국채 외국인 순매수 OR 국고채 입찰 OR 채권 발행', hl: 'ko', gl: 'KR', ceid: 'KR:ko' },
] as const

type NewsItem = {
  id: string
  title: string
  link: string
  source: string
  publishedAt: string | null
  snippet: string
}

type FeedResult = {
  id: string
  label: string
  kind: string
  items: NewsItem[]
  error?: string
}

let cachedAt = 0
let cachedFeeds: FeedResult[] = []
let inFlight: Promise<FeedResult[]> | undefined

async function loadFeed(stream: (typeof streams)[number]): Promise<FeedResult> {
  const search = new URLSearchParams({ q: `${stream.query} when:7d`, hl: stream.hl, gl: stream.gl, ceid: stream.ceid })
  const url = `https://news.google.com/rss/search?${search.toString()}`

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000) })
    if (!response.ok) throw new Error(`RSS 응답 ${response.status}`)
    const xml = await response.text()
    const parsed = await parser.parseString(xml)
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    const items = (parsed.items ?? [])
      .map((item, index) => ({
        id: `${stream.id}-${index}-${item.guid ?? item.link ?? ''}`,
        title: item.title?.trim() ?? '제목 없음',
        link: item.link ?? '',
        source: item.creator?.trim() || parsed.title?.replace(/ - Google News$/, '') || 'Google News',
        publishedAt: item.isoDate ?? item.pubDate ?? null,
        snippet: item.contentSnippet?.trim() ?? '',
      }))
      .filter((item) => {
        if (!item.publishedAt) return false
        const publishedAt = new Date(item.publishedAt).getTime()
        return Number.isFinite(publishedAt) && publishedAt >= cutoff && publishedAt <= Date.now() + 10 * 60 * 1000
      })
      .filter((item) => {
        if (stream.id !== 'eur-sofr') return true
        const headline = `${item.title} ${item.snippet}`
        return /\b(eur|euro|eurozone|europe|eur\/usd)\b/i.test(headline)
          && /\b(sofr|basis|cross[- ]currency|swap)\b/i.test(headline)
      })
      .sort((left, right) => new Date(right.publishedAt!).getTime() - new Date(left.publishedAt!).getTime())
      .slice(0, 16)

    return { ...stream, items }
  } catch (error) {
    return {
      ...stream,
      items: [],
      error: error instanceof Error ? error.message : '뉴스 피드를 불러오지 못했습니다.',
    }
  }
}

async function refreshFeeds() {
  if (inFlight) return inFlight
  inFlight = Promise.all(streams.map(loadFeed))
    .then((feeds) => {
      cachedFeeds = feeds
      cachedAt = Date.now()
      return feeds
    })
    .finally(() => {
      inFlight = undefined
    })
  return inFlight
}

app.get('/api/news', async (_request, response) => {
  try {
    const feeds = Date.now() - cachedAt < refreshMs ? cachedFeeds : await refreshFeeds()
    response.json({ generatedAt: new Date(cachedAt).toISOString(), feeds })
  } catch {
    response.status(502).json({ error: '뉴스 피드를 새로고침하지 못했습니다.' })
  }
})

app.use(express.static(clientDist))
app.get('*', (_request, response) => {
  response.sendFile(join(clientDist, 'index.html'))
})

app.listen(port, '0.0.0.0', () => {
  console.log(`Rates news app listening on http://localhost:${port}`)
})