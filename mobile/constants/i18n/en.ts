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
    networkError: 'Network error. Check your connection and try again.',
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
    emailLabel: 'Email (optional)',
    emailHint: "We'll email your code.",
    passwordLabel: 'Password (8 characters or more)',
    confirmPasswordLabel: 'Confirm password',
    passwordTooShort: 'Password must be at least 8 characters.',
    passwordMismatch: 'Passwords do not match.',
    birthdateLabel: 'Date of birth',
    sendCode: 'Send verification code',
    datePlaceholder: 'YYYY-MM-DD',
  },
  verifyOtp: {
    title: 'Verify your account',
    subtitle: 'Enter the code we sent to {phone}.',
    subtitleEmail: 'Enter the code we emailed to {email}.',
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
  tabs: {
    home: 'Home',
    explore: 'Explore',
    favorites: 'Favorites',
    orders: 'Orders',
    profile: 'Profile',
  },
  addresses: {
    list: {
      title: 'My addresses',
      empty: {
        title: 'No saved addresses yet',
        body: 'Add a delivery address so chefs know where to send your food.',
      },
      addCta: 'Add address',
    },
    form: {
      label: 'Label',
      labelPlaceholder: 'e.g., home',
      streetName: 'Street name',
      streetNamePlaceholder: 'Optional — drag the pin to fill automatically',
      moreDetailsToggle: 'More details (optional)',
      building: 'Building',
      floor: 'Floor',
      apartment: 'Apartment',
      notes: 'Notes for the chef',
      save: 'Save',
      cancel: 'Cancel',
    },
    picker: {
      pinAccessibility: 'Map pin — drag the map to position',
      useMyLocationCta: 'Use my location',
      permissionDeniedHint: 'Location permission is off; drag the map to position the pin.',
    },
    edit: {
      title: 'Edit address',
      delete: 'Delete address',
    },
    deleteConfirm: {
      title: 'Delete this address?',
      body: 'You can add it again later.',
      confirm: 'Delete',
      cancel: 'Cancel',
    },
    inUse: {
      title: 'Address is in use',
      body: 'This address is attached to an order in progress. Finish or cancel the order first.',
      viewOrderCta: 'View that order',
      ok: 'OK',
    },
    validation: {
      labelRequired: 'Please give the address a label.',
      labelTooLong: 'Label is too long (max 80 characters).',
      streetTooLong: 'Street name is too long (max 200 characters).',
      coordinatesInvalid: 'Pick a valid pin location on the map.',
    },
  },
  errors: {
    AUTH_OTP_INVALID: 'The code is incorrect or has expired. Try again.',
    AUTH_INVALID_CREDENTIALS: 'Phone or password is incorrect.',
    AUTH_REFRESH_INVALID: 'Your session is invalid. Please sign in again.',
    AUTH_REFRESH_REUSED: 'Your session has ended. Please sign in again.',
    AUTH_RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
    PHONE_IN_USE: 'This phone number is already in use.',
    EMAIL_IN_USE: 'This email is already in use.',
    EMAIL_INVALID: 'That email address looks wrong. Check it and try again.',
    EMAIL_OTP_INVALID: 'The code is incorrect or has expired. Try again.',
    EMAIL_OTP_ATTEMPTS_EXCEEDED: 'Too many wrong attempts. Request a fresh code.',
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