/**
 * The narrow interface AuthService talks to for the email-OTP channel.
 * Real production wraps the Resend SDK; non-production wraps a
 * console-logger so devs see codes in stdout without burning quota.
 *
 * Stays parallel to TwilioVerifyClient — same DI token pattern, same
 * "send is a side effect, do not throw on transient retry-able failure
 * unless we want the surface to 5xx" expectations.
 */
export interface EmailClient {
  sendOtp(to: string, code: string, locale: 'en' | 'ar'): Promise<void>;
}

export const EMAIL_CLIENT = Symbol('EMAIL_CLIENT');
