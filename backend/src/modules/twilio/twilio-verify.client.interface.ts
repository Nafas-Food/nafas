/**
 * The narrow interface AuthService and UsersService talk to. The real
 * implementation wraps the Twilio Node SDK; tests inject a mock that
 * never sends SMS. Keeping the interface narrow is what lets us mock
 * cleanly per research R1.
 */
export interface TwilioVerifyClient {
  sendOtp(phone: string): Promise<void>;
  /**
   * Returns true when Twilio reports `status === 'approved'`,
   * false otherwise. NEVER throws on a wrong code — that is a
   * regular outcome, not an exception.
   */
  checkOtp(phone: string, code: string): Promise<boolean>;
}

export const TWILIO_VERIFY_CLIENT = Symbol('TWILIO_VERIFY_CLIENT');
