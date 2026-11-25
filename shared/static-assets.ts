export const fingerprintedAsset = /^assets\/(?:[a-zA-Z0-9_-]+-[a-zA-Z0-9_-]{8,}\.(?:js|css|webp|png|woff2)|SUIT-OFL-[a-zA-Z0-9_-]{8,}\.txt)$/
export const publicAssetCacheControl = 'public, max-age=31536000, immutable'
export const staticAssetHeaders = `/assets/*
  Cache-Control: ${publicAssetCacheControl}
  X-Content-Type-Options: nosniff
  X-Robots-Tag: noindex, nofollow
`
