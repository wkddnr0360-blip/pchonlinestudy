import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getPremiumToken, premiumEnabled, premiumRequest, setPremiumToken, type AuthResult, type Member } from './client'

type State = 'checking' | 'guest' | 'member' | 'error'
interface PremiumContext {
  state: State
  member: Member | null
  login(email: string, password: string, register: boolean): Promise<void>
  redeem(code: string): Promise<void>
  logout(): Promise<void>
  refresh(): Promise<void>
}
const Context = createContext<PremiumContext | null>(null)
export function usePremium() {
  const context = useContext(Context)
  if (!context) throw new Error('PremiumProvider가 필요합니다.')
  return context
}
export function PremiumProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>('checking')
  const [member, setMember] = useState<Member | null>(null)
  async function refresh() {
    if (!premiumEnabled || !getPremiumToken()) {
      setMember(null)
      setState('guest')
      return
    }
    try {
      const response = await premiumRequest<Member>('/auth/me')
      setMember(response)
      setState('member')
    } catch {
      setMember(null)
      setPremiumToken('')
      setState('guest')
    }
  }
  useEffect(() => { void refresh() }, [])
  async function login(email: string, password: string, register: boolean) {
    const response = await premiumRequest<AuthResult>(register ? '/auth/register' : '/auth/login', { email, password })
    setPremiumToken(response.token)
    setMember({ email: response.email, premium: response.premium })
    setState('member')
  }
  async function redeem(code: string) {
    const response = await premiumRequest<{ premium: boolean }>('/license/redeem', { code })
    if (!response.premium) throw new Error('이용권을 확인하지 못했습니다.')
    await refresh()
  }
  async function logout() {
    try { await premiumRequest('/auth/logout', {}) } catch { /* 로컬 로그아웃은 항상 수행 */ }
    setPremiumToken('')
    setMember(null)
    setState('guest')
  }
  return <Context.Provider value={{ state, member, login, redeem, logout, refresh }}>{children}</Context.Provider>
}
