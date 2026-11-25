import type { AppEnv } from '../index'

export const statisticsCron = '*/5 * * * *'
export const statisticsReadBudget = 250_000
export const statisticsWriteBudget = 10_000
export const dayMilliseconds = 86_400_000

export type AccountUsage = { reads: number; writes: number; requests: number }

export function usageShare(usage: AccountUsage) {
  return Math.max(usage.reads / 5_000_000, usage.writes / 100_000, usage.requests / 100_000)
}

export async function readAccountUsage(env: AppEnv, now: number): Promise<AccountUsage | null> {
  if (env.ONS_ENV === 'local') return { reads: 0, writes: 0, requests: 0 }
  if (!env.ANALYTICS_ACCOUNT_ID || !env.ANALYTICS_METRICS_TOKEN) return null
  const end = new Date(now).toISOString()
  const day = end.slice(0, 10)
  const expected = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + env.ANALYTICS_METRICS_TOKEN, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(5_000),
    body: JSON.stringify({
      query: `query Usage($account: string!, $day: Date!, $start: string!, $end: string!) {
        viewer { accounts(filter: { accountTag: $account }) {
          d1AnalyticsAdaptiveGroups(limit: 1, filter: {date_geq: $day, date_leq: $day}) {
            sum { rowsRead rowsWritten }
          }
          workersInvocationsAdaptive(limit: 1, filter: {datetime_geq: $start, datetime_leq: $end}) {
            sum { requests }
          }
        } }
      }`,
      variables: { account: env.ANALYTICS_ACCOUNT_ID, day, start: day + 'T00:00:00Z', end },
    }),
  })
  if (!expected.ok) { await expected.body?.cancel(); return null }
  type UsageAccount = {
    d1AnalyticsAdaptiveGroups: { sum: { rowsRead: number; rowsWritten: number } }[]
    workersInvocationsAdaptive: { sum: { requests: number } }[]
  }
  const { data, errors } = await expected.json<{ data?: { viewer?: { accounts?: UsageAccount[] } }; errors?: unknown[] }>()
  const account = data?.viewer?.accounts?.[0]
  if (errors?.length || !Array.isArray(account?.d1AnalyticsAdaptiveGroups) || !Array.isArray(account?.workersInvocationsAdaptive)) return null
  const d1 = account.d1AnalyticsAdaptiveGroups[0]?.sum
  const usage = {
    reads: d1?.rowsRead ?? 0,
    writes: d1?.rowsWritten ?? 0,
    requests: account.workersInvocationsAdaptive[0]?.sum.requests ?? 0,
  }
  return Object.values(usage).every((value) => Number.isSafeInteger(value) && value >= 0) ? usage : null
}
