import { Camera, Send } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { approvedPurchasePhotoRetentionDays, purchaseStatusLabel, type PurchaseRequest } from '../../../shared/purchase'

async function encodePhoto(file: File) {
  if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) throw new Error('사진은 20MB 이하의 이미지로 선택해 주세요.')
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    if (canvas.width < 160 || canvas.height < 160) throw new Error('글씨가 읽히는 더 큰 사진을 선택해 주세요.')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('이 브라우저에서 사진을 준비하지 못했습니다.')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!jpeg) throw new Error('사진을 준비하지 못했습니다.')
    return jpeg
  } finally {
    bitmap.close()
  }
}

export function PurchaseForm() {
  const [purchase, setPurchase] = useState<PurchaseRequest | null>()
  const [preview, setPreview] = useState<string>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const abort = new AbortController()
    fetch('/api/v1/purchase', { cache: 'no-store', signal: abort.signal }).then(async (response) => {
      if (!response.ok) throw new Error('Could not load purchase')
      setPurchase((await response.json()).purchase)
    }).catch(() => { if (!abort.signal.aborted) setError('구매 인증 상태를 불러오지 못했습니다.') })
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
      form.set('photo', await encodePhoto(file), 'textbook.jpg')
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
  return <section className="ons-purchase" aria-labelledby="ons-purchase-heading">
    <h2 id="ons-purchase-heading"><Camera size={18} aria-hidden="true" />교재 구매 인증</h2>
    {error && <p className="ons-error" role="alert">{error}</p>}
    {purchase && <div className="ons-purchase-state" role="status">
      <strong>{purchaseStatusLabel[purchase.status]}</strong>
      {purchase.status === 'approved' && <span>받은 티켓은 아래에서 사용할 수 있습니다.</span>}
      {purchase.reviewNote && <span>{purchase.reviewNote}</span>}
    </div>}
    {canSubmit && <form onSubmit={submit} aria-busy={busy}>
      <p className="ons-field-hint">교재와 카페 닉네임을 손글씨로 적은 포스트잇이 한 사진에 보이게 촬영해 주세요.</p>
      <p className="ons-field-hint">승인된 사진은 승인일로부터 {approvedPurchasePhotoRetentionDays}일이 지나면 자동으로 삭제합니다.</p>
      <label>카페 닉네임<input name="nickname" maxLength={60} defaultValue={purchase?.cafeNickname} required /></label>
      <label>교재 사진<input name="photo" type="file" accept="image/*" required onChange={(event) => {
        const file = event.target.files?.[0]
        setPreview(file && file.size <= 20 * 1024 * 1024 ? URL.createObjectURL(file) : undefined)
      }} /></label>
      {preview && <img className="ons-purchase-photo" src={preview} alt="제출할 교재 사진" />}
      <button type="submit" className="ons-button" disabled={busy}><Send size={16} aria-hidden="true" />{busy ? '제출 중' : '구매 인증 신청'}</button>
    </form>}
    {purchase === undefined && !error && <p role="status">인증 상태를 확인하고 있습니다.</p>}
  </section>
}
