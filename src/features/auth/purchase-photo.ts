import { purchasePhotoMaxBytes } from '../../../shared/purchase'

export const purchasePhotoSourceMaxBytes = 20 * 1024 * 1024

async function loadPhoto(file: File) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      return { image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) }
    } catch {
      URL.revokeObjectURL(url)
      throw new Error('이 브라우저에서 사진을 열 수 없습니다. 사진을 JPEG나 PNG로 저장한 뒤 올려 주세요.')
    }
  }
}

export async function encodePurchasePhoto(file: File) {
  if (file.size > purchasePhotoSourceMaxBytes) throw new Error('20MB 이하의 사진을 선택해 주세요.')
  const photo = await loadPhoto(file)
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('이 브라우저에서 사진을 준비하지 못했습니다.')
    const longestEdge = Math.max(photo.width, photo.height)
    const shortestEdge = Math.min(photo.width, photo.height)
    for (const maxEdge of [1280, 1024, 800, 640]) {
      const scale = Math.min(1, maxEdge / longestEdge)
      if (Math.round(shortestEdge * scale) < 160) break
      canvas.width = Math.round(photo.width * scale)
      canvas.height = Math.round(photo.height * scale)
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(photo.image, 0, 0, canvas.width, canvas.height)
      for (const quality of [0.9, 0.8, 0.7]) {
        const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
        if (jpeg?.type === 'image/jpeg' && jpeg.size <= purchasePhotoMaxBytes) return jpeg
      }
      if (scale === 1 && longestEdge <= 640) break
    }
    throw new Error('사진을 압축할 수 없습니다. 글씨가 잘 보이게 가까이에서 다시 촬영해 주세요.')
  } finally {
    photo.close()
  }
}
