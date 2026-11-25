export const registrationTermsVersion = '2026-11-26-draft.1'

export function signupConfirmed(input: Record<string, unknown>) {
  return input.ageConfirmed === true && input.termsAccepted === true && input.termsVersion === registrationTermsVersion
}
