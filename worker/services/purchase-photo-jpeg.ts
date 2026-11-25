import { purchasePhotoMaxBytes } from '../../shared/purchase'

function scanEnd(bytes: Uint8Array, offset: number) {
  for (let marker = bytes.indexOf(0xff, offset); marker !== -1; marker = bytes.indexOf(0xff, marker + 2)) {
    const code = bytes[marker + 1]
    // A stuffed byte or restart marker belongs to the compressed scan.
    if (code !== 0 && (code < 0xd0 || code > 0xd7)) return marker
  }
  return -1
}

export function cleanPurchasePhoto(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4 || bytes.length > purchasePhotoMaxBytes || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.length)
  let cursor = 2
  let components = 0
  let sawScan = false
  let sawQuantization = false
  let sawHuffman = false
  let output: Uint8Array | undefined
  let outputStart = 0
  let written = 0

  while (cursor < bytes.length) {
    const start = cursor
    if (bytes[cursor++] !== 0xff) return null
    while (bytes[cursor] === 0xff) cursor++
    const marker = bytes[cursor++]
    if (marker === 0xd9) {
      if (!sawScan || cursor !== bytes.length) return null
      if (!output) return bytes
      output.set(bytes.subarray(outputStart), written)
      return output.subarray(0, written + bytes.length - outputStart)
    }
    if (cursor + 2 > bytes.length) return null
    const size = header.getUint16(cursor)
    const end = cursor + size
    if (size < 2 || end > bytes.length) return null

    if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) {
      // APP and COM segments can contain EXIF, GPS, thumbnails, or user data.
      output ??= new Uint8Array(bytes.length)
      output.set(bytes.subarray(outputStart, start), written)
      written += start - outputStart
      outputStart = end
    } else if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (components || size < 11 || bytes[cursor + 2] !== 8) return null
      const height = header.getUint16(cursor + 3)
      const width = header.getUint16(cursor + 5)
      components = bytes[cursor + 7]
      if (width < 160 || height < 160 || width > 1280 || height > 1280 ||
          (components !== 1 && components !== 3) || size !== 8 + 3 * components) return null
    } else if (marker === 0xda) {
      const scanComponents = bytes[cursor + 2]
      if (!sawQuantization || !sawHuffman || !scanComponents || scanComponents > components ||
          size !== 6 + 2 * scanComponents) return null
      cursor = scanEnd(bytes, end)
      if (cursor <= end) return null
      sawScan = true
      continue
    } else if (marker === 0xdb) {
      if (size < 67) return null
      sawQuantization = true
    } else if (marker === 0xc4) {
      if (size < 20) return null
      sawHuffman = true
    } else if (marker !== 0xdd || size !== 4) {
      return null
    }
    cursor = end
  }
  return null
}
