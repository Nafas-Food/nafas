/**
 * Stable error codes returned by Phase 1 endpoints. The mobile client
 * maps each code to a bilingual message in `mobile/constants/i18n/`.
 * The `message` field on responses is an English fallback for
 * curl-level diagnostics only (see contracts/auth.openapi.yaml).
 */
/**
 * `AUTH_REFRESH_REUSED` covers BOTH FR-008 (rotated-replay) and
 * FR-009 (signed-out-replay). The platform does not distinguish them
 * externally because both produce the same row in `InvalidatedToken`
 * and FR-021 forbids new entities in Phase 1.
 */
export const AuthErrorCode = {
  AUTH_OTP_INVALID: 'AUTH_OTP_INVALID',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_REFRESH_INVALID: 'AUTH_REFRESH_INVALID',
  AUTH_REFRESH_REUSED: 'AUTH_REFRESH_REUSED',
  AUTH_RATE_LIMITED: 'AUTH_RATE_LIMITED',
  PHONE_IN_USE: 'PHONE_IN_USE',
  EMAIL_IN_USE: 'EMAIL_IN_USE',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];