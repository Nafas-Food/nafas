/**
 * English strings for Phase 1 auth screens. Keys MUST match ar.ts exactly.
 * Add a new key here AND in ar.ts together — never one without the other
 * (Constitution Principle I).
 */
export const en = {
  common: {
    retry: 'Try again',
    cancel: 'Cancel',
    submit: 'Submit',
    loading: 'Loading...',
  },
  welcome: {
    title: 'Welcome to Nafas',
    tagline: 'Authentic Egyptian home-cooked food, from real homemakers.',
    signIn: 'Sign in',
    createAccount: 'Create an account',
    languageToggle: 'العربية',
    wordmarkAr: 'نفَس',
    wordmarkEn: 'Nafas',
  },
  signIn: {
    title: 'Sign in',
    phoneLabel: 'Phone number',
    passwordLabel: 'Password',
    submit: 'Sign in',
    createAccountLink: 'New here? Create an account',
  },
  register: {
    title: 'Create your account',
    fullNameLabel: 'Full name',
    phoneLabel: 'Phone number',
    passwordLabel: 'Password (8 characters or more)',
    confirmPasswordLabel: 'Confirm password',
    passwordTooShort: 'Password must be at least 8 characters.',
    passwordMismatch: 'Passwords do not match.',
    birthdateLabel: 'Date of birth',
    sendCode: 'Send verification code',
    datePlaceholder: 'YYYY-MM-DD',
  },
  verifyOtp: {
    title: 'Verify your phone',
    subtitle: 'Enter the code we sent to {phone}.',
    codeLabel: 'Verification code',
    submit: 'Verify and create account',
    resend: 'Resend code',
    resendIn: 'Resend in {seconds}s',
  },
  profile: {
    signOut: 'Sign out',
  },
  home: {
    greeting: 'Hello, {name}',
    chefPlaceholder: 'Chef home (placeholder)',
  },
  errors: {
    AUTH_OTP_INVALID: 'The code is incorrect or has expired. Try again.',
    AUTH_INVALID_CREDENTIALS: 'Phone or password is incorrect.',
    AUTH_REFRESH_INVALID: 'Your session is invalid. Please sign in again.',
    AUTH_REFRESH_REUSED: 'Your session has ended. Please sign in again.',
    AUTH_RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
    PHONE_IN_USE: 'This phone number is already in use.',
    EMAIL_IN_USE: 'This email is already in use.',
    AUTH_UNAUTHENTICATED: 'You are not signed in. Please sign in again.',
    AUTH_FORBIDDEN: 'You do not have permission to do this.',
    NOT_FOUND: 'The requested resource was not found.',
    VALIDATION_ERROR: 'Please check the form and try again.',
    NETWORK: 'Network error. Check your connection and try again.',
    UNKNOWN: 'Something went wrong. Please try again.',
  },
} as const;

type DeepStringify<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringify<T[K]>;
};

export type I18nDict = DeepStringify<typeof en>;