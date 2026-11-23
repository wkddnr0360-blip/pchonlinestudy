import { lazy, Suspense, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bell, BookOpen, ClipboardList, Clock3, Settings } from 'lucide-react'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { getBookIndex } from '../book/catalog'
import type { BookIndex } from '../book/types'
import { FeedbackEffects } from '../feedback/FeedbackEffects'
import { AutoBackupRunner } from '../storage/AutoBackupRunner'
import { db } from '../storage/db'
import { ErrorNotice, Loading } from '../ui/Controls'
import { PremiumGate } from '../premium/PremiumGate'
import { Home } from './Home'
import { markNotesRead, PatchNotes } from './PatchNotes'
import { APP_NAME, APP_VERSION, RELEASE_CHANNEL } from './release'
import { AppUpdateNotice } from './updates/AppUpdateNotice'

const StagePage = lazy(() => import('../study/StagePage'))
const StudyPage = lazy(() => import('../study/StudyPage'))
const ExamLobby = lazy(() => import('../exam/ExamLobby'))
const ExamPage = lazy(() => import('../exam/ExamPage'))
const ReviewPage = lazy(() => import('../review/ReviewPage'))
const SettingsPage = lazy(() => import('../storage/SettingsPage'))

const navigation = [
  { to: '/', title: '학습 홈', icon: BookOpen },
  { to: '/exam', title: '모의고사', icon: Clock3 },
  { to: '/review', title: '오답노트', icon: ClipboardList },
]

function ProtectedStage({ book }: { book: BookIndex }) {
  const { stage } = useParams()
  return stage === '1' ? <StagePage book={book} /> :
    <PremiumGate title={stage + '단계 학습'}><StagePage book={book} /></PremiumGate>
}
function ProtectedStudy({ book }: { book: BookIndex }) {
  const key = useParams()['*'] ?? ''
  return key.startsWith('1/') ? <StudyPage book={book} /> :
    <PremiumGate title="2·3단계 학습"><StudyPage book={book} /></PremiumGate>
}

export function App() {
  const [book, setBook] = useState<BookIndex>()
  const [error, setError] = useState('')
  const [notes, setNotes] = useState(false)
  const read = useLiveQuery(() => db.settings.get('patchRead'))
  const { pathname } = useLocation()
  useEffect(() => { loadBook() }, [])
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])

  function loadBook() {
    setError('')
    void getBookIndex().then(setBook).catch(() => setError('교재 정보를 불러오지 못했습니다.'))
  }

  const tabs = navigation.map(({ to, title, icon: Icon }) => (
    <NavLink key={to} to={to} end={to === '/'}><Icon size={17} /><span>{title}</span></NavLink>
  ))

  return <>
    <FeedbackEffects />
    <AutoBackupRunner />
    <a className="skip-link" href="#main-content" onClick={(event) => {
      event.preventDefault()
      document.getElementById('main-content')?.focus()
    }}>본문으로 건너뛰기</a>
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" to="/" aria-label={APP_NAME + " 홈"}>
          <img className="brand-icon" src={import.meta.env.BASE_URL + "icons/ons-192.png"} width={43} height={43} alt="" />
          <span><strong>{APP_NAME}</strong><small>{RELEASE_CHANNEL}</small></span>
        </Link>
        <nav className="main-nav" aria-label="주 메뉴">{tabs}</nav>
        <div className="header-actions">
          <Link className="icon-button" to="/settings" aria-label="학습 기록 설정"><Settings size={21} /></Link>
          <button className="icon-button notification-button" aria-label="패치노트" onClick={() => {
            setNotes(true)
            void markNotesRead().catch(() => undefined)
          }}>
            <Bell size={21} />{read?.value !== APP_VERSION && <i aria-hidden="true" />}
          </button>
        </div>
      </div>
    </header>
    <main id="main-content" tabIndex={-1} className="page">
      <AppUpdateNotice />
      {error ? <ErrorNotice message={error} retry={loadBook} /> : !book ? <Loading /> :
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Home book={book} />} />
            <Route path="/stage/:stage" element={<ProtectedStage book={book} />} />
            <Route path="/study/*" element={<ProtectedStudy book={book} />} />
            <Route path="/exam" element={<PremiumGate title="실전 모의고사"><ExamLobby book={book} /></PremiumGate>} />
            <Route path="/exam/:id" element={<PremiumGate title="실전 모의고사"><ExamPage /></PremiumGate>} />
            <Route path="/review" element={<ReviewPage book={book} />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>}
    </main>
    <nav className="mobile-nav" aria-label="모바일 주 메뉴">{tabs}</nav>
    {notes && <PatchNotes close={() => setNotes(false)} />}
  </>
}
