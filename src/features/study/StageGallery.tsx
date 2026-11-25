import * as Dialog from '@radix-ui/react-dialog'
import { ArrowRight, LockKeyhole, TicketCheck, X } from 'lucide-react'
import { stages } from '../../app/stages'
import { stageHref } from './navigation'
import { StageArtwork } from './StageArtwork'

type Level = typeof stages[number]

function StageCover({ level, locked, count }: { level: Level; locked: boolean; count: number | undefined }) {
  return <>
    <StageArtwork stage={level.number} className="ons-stage-card-art" />
    <div className="ons-stage-card-copy">
      <span className="ons-stage-no">{level.number}단계</span>
      <strong>{level.name}</strong>
      <span className="ons-stage-card-description">{level.label}</span>
      <span className="ons-stage-status">{locked ? '교재 인증 전용' : count ? `${count.toLocaleString('ko-KR')}문항` : level.number === 1 ? '무료 학습' : '학습 가능'}</span>
    </div>
    <span className="ons-stage-card-icon">{locked ? <LockKeyhole size={19} aria-hidden="true" /> : <ArrowRight size={20} aria-hidden="true" />}</span>
  </>
}

function LockedStage({ level }: { level: Level }) {
  return <Dialog.Root>
    <Dialog.Trigger asChild>
      <button type="button" className="ons-stage-card" data-stage={level.number} aria-label={`${level.number}단계 ${level.name} · 교재 인증 전용`}>
        <StageCover level={level} locked count={undefined} />
      </button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="ons-stage-overlay" />
      <Dialog.Content className="ons-stage-dialog" data-stage={level.number}>
        <Dialog.Close asChild><button type="button" className="ons-icon-button ons-stage-dialog-close" aria-label="단계 안내 닫기"><X size={22} aria-hidden="true" /></button></Dialog.Close>
        <StageArtwork stage={level.number} reaction className="ons-stage-dialog-art" />
        <div className="ons-stage-dialog-copy">
          <Dialog.Title>{level.number}단계 {level.name}</Dialog.Title>
          <Dialog.Description>교재 구매를 인증하면 이 단계의 문제를 풀 수 있어요.</Dialog.Description>
          <a className="ons-button" href={`/account?study=${level.number}`}><TicketCheck size={19} aria-hidden="true" />교재 인증<ArrowRight size={17} aria-hidden="true" /></a>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}

export function StageGallery({ verified, counts }: { verified: boolean; counts: Partial<Record<Level['number'], number>> }) {
  return <section className="ons-stage-gallery" id="levels" aria-labelledby="ons-stage-gallery-heading">
    <h2 id="ons-stage-gallery-heading">단계별 학습</h2>
    <ul>{stages.map((level) => <li key={level.number}>
      {level.number > 1 && !verified ? <LockedStage level={level} />
        : <a className="ons-stage-card" data-stage={level.number} href={stageHref(level.number)} aria-label={`${level.number}단계 ${level.name}`}>
          <StageCover level={level} locked={false} count={counts[level.number]} />
        </a>}
    </li>)}</ul>
  </section>
}
