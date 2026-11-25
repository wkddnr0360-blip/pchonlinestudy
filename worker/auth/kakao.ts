import type { KakaoProfile } from 'better-auth/social-providers'

const accountDomain = '@kakao.ons.invalid'

export function isKakaoAccountAddress(email: string) {
  return email.toLowerCase().endsWith(accountDomain)
}

export function mapKakaoProfile(profile: KakaoProfile) {
  // Better Auth requires a unique email-shaped key. Kakao users are identified by the provider account.
  const email = Number.isSafeInteger(profile.id) && profile.id > 0 ? `${profile.id}${accountDomain}` : undefined
  return { email, emailVerified: false, image: undefined, name: profile.kakao_account?.profile?.nickname?.trim() || '카카오 회원' }
}
