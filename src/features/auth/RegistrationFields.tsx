import { registrationTermsVersion } from '../../../shared/registration'

export function registrationFields(form: FormData) {
  return {
    ageConfirmed: form.get('ageConfirmed') === 'on',
    termsAccepted: form.get('termsAccepted') === 'on',
    termsVersion: registrationTermsVersion,
  }
}

export function RegistrationFields() {
  return <fieldset className="ons-registration-checks">
    <legend className="ons-visually-hidden">가입 확인 사항</legend>
    <label><input name="ageConfirmed" type="checkbox" required /><span><strong>필수</strong> 만 14세 이상입니다.</span></label>
    <div>
      <label><input name="termsAccepted" type="checkbox" required /><span><strong>필수</strong> 이용약관에 동의합니다.</span></label>
      <a href="/terms" target="_blank" rel="noopener">이용약관 보기</a>
    </div>
    <a href="/privacy" target="_blank" rel="noopener">개인정보 처리방침 보기</a>
  </fieldset>
}
