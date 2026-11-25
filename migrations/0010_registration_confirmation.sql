ALTER TABLE user ADD COLUMN registrationTermsVersion TEXT;
ALTER TABLE user ADD COLUMN registrationConfirmedAt INTEGER CHECK (
  (registrationTermsVersion IS NULL AND registrationConfirmedAt IS NULL)
  OR (registrationTermsVersion IS NOT NULL AND registrationConfirmedAt IS NOT NULL AND registrationConfirmedAt > 0)
);
