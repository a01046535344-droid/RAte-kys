import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Clock3,
  Globe2,
  Layers3,
  Newspaper,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Waves,
} from 'lucide-react'

type NewsItem = {
  id: string
  title: string
  link: string
  source: string
  publishedAt: string | null
  snippet: string
}

type Feed = {
  id: string
  label: string
  kind: 'rates' | 'flows' | 'geopolitics'
  items: NewsItem[]
  error?: string
}

type NewsResponse = { generatedAt: string; feeds: Feed[]; error?: string }
type View = 'overview' | 'geopolitics' | 'flows'

const productIds = ['ktb', 'us-rates', 'krw-irs', 'crs', 'eur-irs', 'eur-sofr', 'aud-irs']

function relativeTime(date: string | null) {
  if (!date) return '시간 미상'
  const elapsed = Math.max(0, Date.now() - new Date(date).getTime())
  if (!Number.isFinite(elapsed)) return '시간 미상'
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

function articleAnalysis(item: NewsItem, feed: Feed) {
  const title = item.title.toLowerCase()
  if (feed.kind === 'geopolitics') {
    const escalation = /공격|충돌|확전|제재|봉쇄|전쟁|attack|strike|conflict|sanction|war|houthi|iran/.test(title)
    return {
      tone: escalation ? 'risk' : 'mixed',
      label: escalation ? '공급 리스크 주시' : '경로 확인 필요',
      text: escalation
        ? '확전·운송 차질이면 유가와 기대인플레이션에 상승 압력. 다만 안전자산 선호는 미 국채 금리를 낮출 수 있어 금리 방향은 유가·위험회피 강도를 함께 확인해야 합니다.'
        : '유가 공급 경로와 위험회피 반응을 확인하세요. 원유발 인플레이션은 금리 상승, 안전자산 수요는 금리 하락 요인입니다.',
    }
  }

  const easing = /인하|완화|둔화|하락|금리 내|cut|easing|cooling|fall|decline|lower/.test(title)
  const tightening = /인상|긴축|가속|상승|금리 올|hawkish|hike|inflation|surge|higher|rise/.test(title)
  const direction = easing === tightening ? 'mixed' : easing ? 'down' : 'up'
  const label = direction === 'down' ? '금리 하락 압력' : direction === 'up' ? '금리 상승 압력' : '방향성 확인 필요'
  const instrument = feed.label
  const text = direction === 'down'
    ? `${instrument} 관련 완화·둔화 신호로 스왑 금리 하락 및 리시브 압력 가능성. 실제 가격 반응과 시장 컨센서스 이탈 폭을 확인하세요.`
    : direction === 'up'
      ? `${instrument} 관련 긴축·인플레이션 신호로 스왑 금리 상승 및 페이 압력 가능성. 국채 수급·기대인플레이션의 동반 여부를 확인하세요.`
      : `${instrument}의 금리 방향을 단정하기 어렵습니다. 정책 기대, 발행·수급, 현물-스왑 베이시스 반응을 함께 확인하세요.`

  return { tone: direction, label, text }
}

function App() {
  const [feeds, setFeeds] = useState<Feed[]>([])
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [connectionError, setConnectionError] = useState(false)
  const [view, setView] = useState<View>('overview')
  const [selectedFeed, setSelectedFeed] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  async function refresh(manual = false) {
    if (manual) setRefreshing(true)
    try {
      const response = await fetch('/api/news')
      const payload = (await response.json()) as NewsResponse
      if (!response.ok || payload.error) throw new Error(payload.error ?? '뉴스를 불러오지 못했습니다.')
      setFeeds(payload.feeds)
      setUpdatedAt(payload.generatedAt)
      setConnectionError(false)
    } catch {
      setConnectionError(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const relevantFeeds = useMemo(() => {
    let next = feeds
    if (view === 'geopolitics') next = next.filter((feed) => feed.kind === 'geopolitics')
    if (view === 'flows') next = next.filter((feed) => feed.kind === 'flows')
    if (selectedFeed) next = next.filter((feed) => feed.id === selectedFeed)
    return next
  }, [feeds, selectedFeed, view])

  const filteredNews = useMemo(() => relevantFeeds.flatMap((feed) =>
    feed.items
      .filter((item) => `${item.title} ${item.source} ${feed.label}`.toLowerCase().includes(query.toLowerCase()))
      .map((item) => ({ ...item, feed })),
  ).sort((left, right) => new Date(right.publishedAt ?? 0).getTime() - new Date(left.publishedAt ?? 0).getTime()), [query, relevantFeeds])

  const totalNews = feeds.reduce((count, feed) => count + feed.items.length, 0)
  const failedFeeds = feeds.filter((feed) => feed.error).length
  const geoFeed = feeds.find((feed) => feed.id === 'geopolitics')
  const flowFeed = feeds.find((feed) => feed.id === 'supply')

  function chooseView(next: View) {
    setView(next)
    setSelectedFeed(null)
  }

  return (
    <div className="terminal-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" onClick={() => chooseView('overview')}>
          <span className="brand-mark"><Activity size={19} strokeWidth={2.4} /></span>
          <span className="brand-name">basis<span>.</span></span>
          <span className="brand-caption">RATES INTELLIGENCE</span>
        </a>

        <div className="nav-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="주요 화면">
          <button className={view === 'overview' ? 'nav-item active' : 'nav-item'} onClick={() => chooseView('overview')}>
            <Layers3 size={17} /> <span>마켓 브리프</span>
          </button>
          <button className={view === 'geopolitics' ? 'nav-item active' : 'nav-item'} onClick={() => chooseView('geopolitics')}>
            <Globe2 size={17} /> <span>지정학 · 에너지</span><span className="nav-count">{geoFeed?.items.length ?? 0}</span>
          </button>
          <button className={view === 'flows' ? 'nav-item active' : 'nav-item'} onClick={() => chooseView('flows')}>
            <Waves size={17} /> <span>채권 · CRS 수급</span><span className="nav-count">{flowFeed?.items.length ?? 0}</span>
          </button>
        </nav>

        <div className="nav-label instruments-label">COVERAGE</div>
        <div className="instrument-nav">
          {feeds.filter((feed) => productIds.includes(feed.id)).map((feed) => (
            <button key={feed.id} className={selectedFeed === feed.id ? 'instrument active' : 'instrument'} onClick={() => { setView('overview'); setSelectedFeed(selectedFeed === feed.id ? null : feed.id) }}>
              <span className={`instrument-dot ${feed.items.length ? 'has-news' : ''}`} />
              <span>{feed.label}</span><span className="instrument-total">{feed.items.length}</span>
            </button>
          ))}
          {feeds.length === 0 && productIds.map((id) => <div className="instrument skeleton" key={id}><span className="instrument-dot" /><span>··········</span></div>)}
        </div>

        <div className="sidebar-bottom">
          <div className="connection-line"><span className={connectionError || (failedFeeds === feeds.length && feeds.length) ? 'status-light offline' : 'status-light'} />
            {loading ? '피드 연결 중' : connectionError ? '뉴스 연결 확인 필요' : failedFeeds ? `${failedFeeds}개 피드 확인 필요` : '실시간 피드 연결됨'}
          </div>
          <div className="sidebar-note">뉴스 원문 기준 · 투자 판단 참고용</div>
        </div>
      </aside>

      <main className="main-content" id="top">
        <header className="topbar">
          <div className="breadcrumb">MARKETS <span>/</span> {view === 'overview' ? 'OVERVIEW' : view === 'geopolitics' ? 'GEOPOLITICS' : 'FLOWS'}</div>
          <div className="topbar-right">
            <div className="live-indicator"><span /> LIVE MONITOR</div>
            <div className="top-divider" />
            <div className="updated-label"><Clock3 size={14} /><span>{updatedAt ? `갱신 ${new Date(updatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : '연결 대기 중'}</span></div>
            <button className="icon-button refresh-button" aria-label="뉴스 새로고침" title="지금 새로고침" onClick={() => void refresh(true)} disabled={refreshing}>
              <RefreshCw size={16} className={refreshing ? 'spinning' : ''} />
            </button>
          </div>
        </header>

        <div className="page-wrap">
          <section className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-rule" /> GLOBAL RATES DESK <span className="eyebrow-date">{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}</span></div>
              <h1>{view === 'overview' ? 'Rates intelligence' : view === 'geopolitics' ? 'Geopolitics & energy' : 'Bond & swap flows'}</h1>
              <p className="page-subtitle">주요 금리파생상품 뉴스와 시장 영향 모니터링</p>
            </div>
            <div className="headline-stat"><div className="stat-value">{totalNews.toString().padStart(2, '0')}</div><div className="stat-label">수집된 헤드라인</div></div>
          </section>

          {view === 'overview' && !selectedFeed && <>
            <section className="signal-strip" aria-label="오늘의 주요 시장 영향">
              <div className="signal-heading"><span className="signal-icon"><Activity size={16} /></span><div><div className="signal-title">CROSS-ASSET SIGNALS</div><div className="signal-caption">뉴스 키워드 기반 · 방향성 참고</div></div></div>
              <div className="signal-divider" />
              <div className="signal-item"><div className="signal-kicker">중동 리스크 <span className="signal-tag amber">ENERGY</span></div><div className="signal-main">{geoFeed?.items.length ? '유가 공급 경로 주시' : loading ? '뉴스 수집 중' : '관련 헤드라인 대기'}</div><div className="signal-detail">유가 인플레이션 ↔ 안전자산 금리 하락</div></div>
              <div className="signal-item"><div className="signal-kicker">채권 · CRS <span className="signal-tag mint">FLOWS</span></div><div className="signal-main">{flowFeed?.items.length ? '수급 헤드라인 포착' : loading ? '뉴스 수집 중' : '관련 헤드라인 대기'}</div><div className="signal-detail">발행·헤지 수요와 베이시스 확인</div></div>
              <div className="signal-method"><SlidersHorizontal size={14} /><span>규칙 기반 해석<br />실시간 시세 아님</span></div>
            </section>

            <section className="product-section">
              <div className="section-heading"><div><span className="section-index">01</span><h2>상품별 모니터</h2></div><span className="section-meta">{productIds.length} MARKETS</span></div>
              <div className="product-grid">
                {feeds.filter((feed) => productIds.includes(feed.id)).map((feed, index) => (
                  <button className={`product-card ${selectedFeed === feed.id ? 'selected' : ''}`} key={feed.id} onClick={() => setSelectedFeed(selectedFeed === feed.id ? null : feed.id)}>
                    <span className="product-top"><span className="product-ordinal">{String(index + 1).padStart(2, '0')}</span><span className="product-status"><i /> LIVE</span></span>
                    <span className="product-name">{feed.label}</span>
                    <span className="product-bottom"><span>{feed.error ? '피드 확인 필요' : '최근 헤드라인'}</span><span className="product-count">{String(feed.items.length).padStart(2, '0')} <ArrowUpRight size={13} /></span></span>
                  </button>
                ))}
                {feeds.length === 0 && productIds.map((id, index) => <div className="product-card loading-card" key={id}><span className="product-ordinal">{String(index + 1).padStart(2, '0')}</span><span className="loading-bar" /></div>)}
              </div>
            </section>
          </>}

          {view === 'geopolitics' && <GeopoliticsPanel feed={geoFeed} loading={loading} />}
          {view === 'flows' && <FlowsPanel feeds={feeds.filter((feed) => feed.kind === 'flows')} loading={loading} />}

          <section className="news-section">
            <div className="section-heading news-heading"><div><span className="section-index">{view === 'overview' ? '02' : '01'}</span><h2>{selectedFeed ? `${feeds.find((feed) => feed.id === selectedFeed)?.label} 뉴스` : view === 'geopolitics' ? '지정학 헤드라인' : view === 'flows' ? '수급 헤드라인' : '실시간 헤드라인'}</h2><span className="live-pill"><i /> LIVE</span></div><span className="section-meta">{filteredNews.length} ARTICLES</span></div>
            <div className="news-toolbar">
              <div className="search-box"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="키워드, 상품명, 출처 검색" aria-label="뉴스 검색" /><kbd>/</kbd></div>
              <div className="refresh-copy"><span className="refresh-dot" /> 최근 7일 · 60초 갱신</div>
            </div>
            {loading && feeds.length === 0 ? <div className="empty-state"><RefreshCw className="spinning" size={20} /><span>실시간 뉴스 피드를 연결하고 있습니다</span></div> : filteredNews.length === 0 ? <div className="empty-state"><Newspaper size={21} /><span>{failedFeeds ? '뉴스 피드에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.' : '조건에 맞는 헤드라인이 없습니다.'}</span></div> : (
              <div className="news-list">
                {filteredNews.map(({ feed, ...item }) => {
                  const analysis = articleAnalysis(item, feed)
                  return <article className="news-row" key={item.id}>
                    <div className="news-time">{relativeTime(item.publishedAt)}<span>{item.source}</span></div>
                    <div className="news-body"><div className="news-tags"><button className="category-tag" onClick={() => { setView('overview'); setSelectedFeed(feed.id) }}>{feed.label}</button>{feed.kind === 'geopolitics' && <span className="category-tag geopolitical">GEOPOLITICS</span>}{feed.kind === 'flows' && <span className="category-tag flow-tag">FLOWS</span>}</div><a className="news-title" href={item.link} target="_blank" rel="noreferrer">{item.title}</a>{item.snippet && <p className="news-snippet">{item.snippet}</p>}<div className={`analysis-line ${analysis.tone}`}><span className="analysis-mark">{analysis.tone === 'down' ? <ArrowDownRight size={14} /> : analysis.tone === 'up' || analysis.tone === 'risk' ? <ArrowUpRight size={14} /> : <Activity size={14} />}</span><span className="analysis-label">{analysis.label}</span><span className="analysis-text">{analysis.text}</span></div></div>
                    <a className="open-article" href={item.link} target="_blank" rel="noreferrer" aria-label="원문 열기">↗</a>
                  </article>
                })}
              </div>
            )}
            <div className="news-footnote">뉴스는 Google News RSS 검색 결과입니다. 영향 분석은 제목 키워드에 따른 참고용 규칙 기반 해석이며 투자 조언이 아닙니다.</div>
          </section>
          <footer className="page-footer"><span>BASIS TERMINAL <i /> MARKET INFORMATION</span><span>뉴스 갱신 간격 60초 · 피드 캐시 45초</span></footer>
        </div>
      </main>
    </div>
  )
}

function GeopoliticsPanel({ feed, loading }: { feed?: Feed; loading: boolean }) {
  const count = feed?.items.length ?? 0
  return <section className="analysis-panel geo-panel">
    <div className="panel-topline"><div><span className="section-index">RISK MAP</span><h2>중동 리스크 → 유가 → 금리</h2></div><span className="panel-live"><i /> {loading ? 'UPDATING' : `${count} HEADLINES`}</span></div>
    <p className="panel-intro">이란·후티·사우디 관련 뉴스가 에너지 공급과 위험선호를 통해 금리시장에 전달되는 경로를 추적합니다.</p>
    <div className="risk-path">
      <div className="risk-node"><span className="risk-node-index">01 / EVENT</span><Globe2 size={20} /><strong>충돌 · 제재 · 항로</strong><span>확전 및 호르무즈·홍해 운송 차질</span></div>
      <div className="risk-connector"><span /></div>
      <div className="risk-node oil-node"><span className="risk-node-index">02 / ENERGY</span><Waves size={20} /><strong>원유 공급 프리미엄</strong><span>브렌트·운임·보험료 상승 위험</span></div>
      <div className="risk-connector"><span /></div>
      <div className="risk-node rate-node"><span className="risk-node-index">03 / RATES</span><Activity size={20} /><strong>양방향 금리 반응</strong><span>인플레 상방 ↔ 안전자산 랠리</span></div>
    </div>
    <div className="scenario-row"><div className="scenario-label">체크 포인트</div><div><b>유가 상승·기대인플레 확대</b><span>글로벌 스왑 금리 상승 압력, 프런트엔드 인하 기대 후퇴 가능성</span></div><div><b>위험회피·달러 강세</b><span>미 국채 강세 가능성, 원화·아시아 리스크 자산 부담</span></div></div>
    <div className="panel-caveat">유가 실시간 시세는 이 화면에서 제공하지 않습니다. 헤드라인은 이벤트 모니터링 용도이며, 실제 가격·정책 반응과 구분해 확인하세요.</div>
  </section>
}

function FlowsPanel({ feeds, loading }: { feeds: Feed[]; loading: boolean }) {
  const total = feeds.reduce((sum, feed) => sum + feed.items.length, 0)
  return <section className="analysis-panel flow-panel">
    <div className="panel-topline"><div><span className="section-index">POSITIONING WATCH</span><h2>채권 · CRS 수급 레이더</h2></div><span className="panel-live"><i /> {loading ? 'UPDATING' : `${total} HEADLINES`}</span></div>
    <p className="panel-intro">발행·입찰, 외국인 수급, 크로스커런시 스왑 관련 공개 헤드라인을 모아 베이시스 변화 단서를 추적합니다.</p>
    <div className="flow-metrics">{feeds.map((feed) => <div className="flow-metric" key={feed.id}><span>{feed.label}</span><strong>{String(feed.items.length).padStart(2, '0')}</strong><small>{feed.error ? 'FEED CHECK' : 'HEADLINES'}</small></div>)}</div>
    <div className="flow-guide"><Waves size={18} /><div><b>수급 해석 경로</b><span>국채 발행·입찰 및 외국인 현물/선물 수요는 현물 금리와 스왑 스프레드에, CRS 헤지 수요는 통화 베이시스에 영향을 줄 수 있습니다. 기사만으로 방향을 단정하지 않고 실제 체결·플로우 확인이 필요합니다.</span></div></div>
  </section>
}

export default App