import type { Question } from '../book/types'

// 설정하지 않은 기존 배포는 종전처럼 동작한다.
// 실제 유료 전환 시 API 주소 설정과 유료 JSON 비공개 이전을 반드시 함께 완료할 것.
export const premiumApiUrl = String(import.meta.env.VITE_PREMIUM_API_URL ?? '').replace(/\/+$/, '')
export const premiumEnabled = Boolean(premiumApiUrl)
const key = 'ons-premium-session'

export function getPremiumToken() {
  try { return localStorage.getItem(key) ?? '' } catch { return '' }
}
export function setPremiumToken(token: string) {
  if (token) localStorage.setItem(key, token)
  else localStorage.removeItem(key)
}

export interface Member {
  email: string
  premium: boolean
}
export interface AuthResult extends Member {
  token: string
}
export async function premiumRequest<T>(route: string, data?: unknown): Promise<T> {
  if (!premiumEnabled) throw new Error('유료 서비스가 아직 연결되지 않았습니다.')
  const response = await fetch(premiumApiUrl + route, {
    method: data === undefined ? 'GET' : 'POST',
    headers: {
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(getPremiumToken() ? { Authorization: 'Bearer ' + getPremiumToken() } : {}),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    cache: 'no-store',
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(payload?.error || (response.status === 401 ? '다시 로그인해 주세요.' : '요청을 완료하지 못했습니다.'))
  }
  return response.json() as Promise<T>
}
export function getPremiumChapter(version: string, chapterKey: string): Promise<Question[]> {
  if (!/^[0-9a-f]{16}$/.test(version) || !/^[23]-[12]-[1-7]$/.test(chapterKey)) {
    return Promise.reject(new Error('교재 경로가 올바르지 않습니다.'))
  }
  return premiumRequest<Question[]>('/book/' + version + '/' + chapterKey)
}
