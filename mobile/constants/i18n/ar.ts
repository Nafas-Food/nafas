import type { I18nDict } from './en';

export const ar: I18nDict = {
  common: {
    retry: 'حاول مرة أخرى',
    cancel: 'إلغاء',
    submit: 'إرسال',
    loading: 'جارٍ التحميل...',
  },
  welcome: {
    title: 'أهلاً بك في نَفَس',
    tagline: 'أكل بيتي مصري أصيل من ربّات بيوت حقيقيات.',
    signIn: 'تسجيل الدخول',
    createAccount: 'إنشاء حساب',
    languageToggle: 'English',
  },
  signIn: {
    title: 'تسجيل الدخول',
    phoneLabel: 'رقم الهاتف',
    phonePlaceholder: '+20...',
    passwordLabel: 'كلمة المرور',
    submit: 'دخول',
    createAccountLink: 'لسه ما عندكش حساب؟ سجّل دلوقتي',
  },
  register: {
    title: 'إنشاء حسابك',
    fullNameLabel: 'الاسم بالكامل',
    phoneLabel: 'رقم الهاتف',
    passwordLabel: 'كلمة المرور (8 أحرف على الأقل)',
    birthdateLabel: 'تاريخ الميلاد',
    sendCode: 'إرسال رمز التحقق',
  },
  verifyOtp: {
    title: 'تحقق من رقمك',
    subtitle: 'أدخل الرمز الذي أرسلناه إلى {phone}.',
    codeLabel: 'رمز التحقق',
    submit: 'تحقق وأنشئ الحساب',
    resend: 'إعادة إرسال الرمز',
    resendIn: 'إعادة الإرسال خلال {seconds} ث',
  },
  profile: {
    signOut: 'تسجيل الخروج',
  },
  errors: {
    AUTH_OTP_INVALID: 'الرمز غير صحيح أو منتهي. حاول مرة أخرى.',
    AUTH_INVALID_CREDENTIALS: 'رقم الهاتف أو كلمة المرور غير صحيحة.',
    AUTH_REFRESH_INVALID: 'الجلسة غير صالحة. الرجاء تسجيل الدخول من جديد.',
    AUTH_REFRESH_REUSED: 'انتهت الجلسة. الرجاء تسجيل الدخول من جديد.',
    AUTH_RATE_LIMITED: 'محاولات كثيرة جدًا. الرجاء الانتظار قليلاً ثم المحاولة مجددًا.',
    PHONE_IN_USE: 'رقم الهاتف مسجَّل بالفعل.',
    EMAIL_IN_USE: 'البريد الإلكتروني مسجَّل بالفعل.',
    AUTH_UNAUTHENTICATED: 'أنت غير مسجّل الدخول. الرجاء تسجيل الدخول من جديد.',
    AUTH_FORBIDDEN: 'ليس لديك صلاحية للقيام بهذا الإجراء.',
    NOT_FOUND: 'المورد المطلوب غير موجود.',
    VALIDATION_ERROR: 'الرجاء مراجعة البيانات والمحاولة مجددًا.',
    NETWORK: 'مشكلة في الاتصال. تحقق من الإنترنت وحاول مجددًا.',
    UNKNOWN: 'حدث خطأ ما. حاول مرة أخرى.',
  },
};