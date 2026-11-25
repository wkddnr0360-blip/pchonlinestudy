import { registrationTermsVersion, signupConfirmed } from '../../shared/registration'
import type { AppEnv } from '../index'

export type RegistrationConfirmation = {
  registrationTermsVersion: string
  registrationConfirmedAt: number
}

export function acceptSignup(env: AppEnv, input: Record<string, unknown>): RegistrationConfirmation | null {
  // The current document version is approved for testing only.
  if (env.ONS_ENV === 'production' || !signupConfirmed(input)) return null
  return { registrationTermsVersion, registrationConfirmedAt: Date.now() }
}

export function readSignupState(input: unknown): RegistrationConfirmation | null {
  if (!input || typeof input !== 'object') return null
  const { registrationTermsVersion: version, registrationConfirmedAt: confirmedAt } = input as Partial<RegistrationConfirmation>
  if (version !== registrationTermsVersion || typeof confirmedAt !== 'number' || !Number.isSafeInteger(confirmedAt)
    || confirmedAt <= 0 || confirmedAt > Date.now()) return null
  return { registrationTermsVersion, registrationConfirmedAt: confirmedAt }
}
