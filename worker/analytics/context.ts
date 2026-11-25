const maximumAgeMs = 24 * 60 * 60 * 1000

const encoder = new TextEncoder()

function keyFor(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

function message(userId: string, no: number, revision: number, eventId: string, started: number) {
  return encoder.encode(JSON.stringify(['ons2-study-statistics-v1', userId, no, revision, eventId, started]))
}

export async function issueStatisticsContext(secret: string, userId: string, no: number, revision: number, started: number) {
  const eventId = crypto.randomUUID()
  const signature = await crypto.subtle.sign('HMAC', await keyFor(secret), message(userId, no, revision, eventId, started))
  const hex = Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return { eventId, proof: `${started}.${hex}` }
}

export async function statisticsTiming(secret: string, userId: string, no: number, revision: number, eventId: string, proof: unknown, now: number) {
  const match = typeof proof === 'string' && /^(\d{13})\.([a-f0-9]{64})$/.exec(proof)
  if (!match) return
  const started = Number(match[1])
  const elapsed = now - started
  if (elapsed < 0 || elapsed > maximumAgeMs) return
  const mac = Uint8Array.from(match[2].match(/../g)!, (byte) => Number.parseInt(byte, 16))
  const valid = await crypto.subtle.verify('HMAC', await keyFor(secret), mac, message(userId, no, revision, eventId, started))
  if (valid) return { elapsedMs: elapsed >= 1000 && elapsed <= 600_000 ? elapsed : null }
}
