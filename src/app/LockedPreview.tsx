import { ArrowLeft, LockKeyhole } from 'lucide-react'
import { Link } from 'react-router-dom'

export function LockedPreview({ title = '잠긴 학습 범위' }: { title?: string }) {
  return <section className="center-card">
    <span className="small-icon primary-icon"><LockKeyhole size={25} /></span>
    <h1>{title}</h1>
    <p>임시 공개판에서는 1단계 학습과 실전 모의고사를 이용할 수 있어요.</p>
    <Link className="button primary" to="/"><ArrowLeft size={16} /> 학습 홈</Link>
  </section>
}
