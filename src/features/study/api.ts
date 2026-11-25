export class StudyRequestError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code)
  }
}

export async function studyRequest<T>(path: string, options: { body?: object; signal?: AbortSignal } = {}): Promise<T> {
  const { body, signal } = options
  const response = await fetch('/api/v1' + path, {
    cache: 'no-store', signal,
    ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  const value = await response.json()
  if (!response.ok) throw new StudyRequestError(response.status, value.error)
  return value as T
}

export function studyError(error: unknown) {
  if (error instanceof StudyRequestError) {
    if (error.status === 401) return '로그인 시간이 끝났습니다. 내 계정에서 다시 로그인해 주세요.'
    if (error.status === 429) return '요청이 많습니다. 잠시 뒤 다시 시도해 주세요.'
    if (error.code === 'account_suspended') return '이 계정은 현재 학습할 수 없습니다.'
    if (error.code === 'stale_question') return '문제가 갱신되었습니다. 같은 번호를 다시 열어 주세요.'
    if (error.code === 'import_account_changed') return '로그인 계정이 바뀌었습니다. 새로고침한 뒤 받는 계정을 확인해 주세요.'
    if (error.status === 404) return '이 문제는 현재 계정에서 열 수 없습니다.'
  }
  return '요청을 완료하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.'
}
