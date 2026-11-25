import { Camera, Send } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { approvedPurchasePhotoRetentionDays, purchaseStatusLabel, type PurchaseRequest } from '../../../shared/purchase'
import { encodePurchasePhoto, purchasePhotoSourceMaxBytes } from './purchase-photo'
import { AccountActionDialog } from './AccountActionDialog'

export function PurchaseForm() {
  const [purchase, setPurchase] = useState<PurchaseRequest | null>()
  const [preview, setPreview] = useState<string>()
  const [error, setError] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const abort = new AbortController()
    fetch('/api/v1/purchase', { cache: 'no-store', signal: abort.signal }).then(async (response) => {
      if (!response.ok) throw new Error('Could not load purchase')
      setPurchase((await response.json()).purchase)
    }).catch(() => { if (!abort.signal.aborted) setLoadFailed(true) })
    return () => abort.abort()
  }, [])

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const file = form.get('photo')
    if (!(file instanceof File)) return
    setBusy(true)
    setError('')
    try {
      form.set('photo', await encodePurchasePhoto(file), 'textbook.jpg')
      const response = await fetch('/api/v1/purchase', { method: 'POST', body: form, cache: 'no-store' })
      if (response.status === 409) throw new Error('이미 신청했거나 현재 접수 기간이 아닙니다.')
      if (!response.ok) throw new Error('사진 또는 입력 내용을 확인해 주세요.')
      setPurchase((await response.json()).purchase)
      setPreview(undefined)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '사진을 제출하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const canSubmit = purchase === null || purchase?.status === 'resubmit' || purchase?.status === 'rejected'
  const detail = purchase ? purchaseStatusLabel[purchase.status] : '교재 사진 · 신청 상태'
  return <AccountActionDialog title="교재 구매 인증" description="교재 사진을 제출하고 신청 상태를 확인하세요."
    detail={detail} icon={Camera} busy={busy} onClose={() => { setPreview(undefined); setError('') }}>
    {(loadFailed || error) && <p className="ons-error" role="alert">{error || '구매 인증 상태를 불러오지 못했습니다.'}</p>}
    {purchase && <div className="ons-purchase-state" role="status">
      <strong>{purchaseStatusLabel[purchase.status]}</strong>
      {purchase.status === 'approved' && <span>받은 티켓은 내 계정의 ‘교재 인증 티켓’에서 사용할 수 있습니다.</span>}
      {purchase.reviewNote && <span>{purchase.reviewNote}</span>}
    </div>}
    {canSubmit && <form className="ons-purchase" onSubmit={submit} aria-busy={busy}>
      <p className="ons-field-hint">교재와 카페 닉네임을 손글씨로 적은 포스트잇이 한 사진에 보이게 촬영해 주세요.</p>
      <p className="ons-field-hint">승인된 사진은 승인일로부터 {approvedPurchasePhotoRetentionDays}일이 지나면 자동으로 삭제합니다.</p>
      <label>카페 닉네임<input name="nickname" maxLength={60} defaultValue={purchase?.cafeNickname} required /></label>
      <label>교재 사진<input name="photo" type="file" accept="image/*,.heic,.heif" required onChange={(event) => {
        const file = event.target.files?.[0]
        setPreview(file && file.size <= purchasePhotoSourceMaxBytes ? URL.createObjectURL(file) : undefined)
      }} /></label>
      {preview && <img className="ons-purchase-photo" src={preview} alt="제출할 교재 사진" />}
      <button type="submit" className="ons-button" disabled={busy}><Send size={16} aria-hidden="true" />{busy ? '제출 중' : '구매 인증 신청'}</button>
    </form>}
    {purchase === undefined && !loadFailed && <p role="status">인증 상태를 확인하고 있습니다.</p>}
  </AccountActionDialog>
}
