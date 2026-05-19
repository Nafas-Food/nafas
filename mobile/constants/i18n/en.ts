/**
 * English strings for Phase 1 auth screens. Keys MUST match ar.ts exactly.
 * Add a new key here AND in ar.ts together — never one without the other
 * (Constitution Principle I).
 */
export const en = {
  common: {
    retry: 'Try again',
    cancel: 'Cancel',
    back: 'Back',
    submit: 'Submit',
    done: 'Done',
    loading: 'Loading...',
    networkError: 'Network error. Check your connection and try again.',
    cooldown: {
      title: 'Please wait',
      body: 'You can try again after {timestamp}.',
    },
    day: {
      sun: 'Sun',
      mon: 'Mon',
      tue: 'Tue',
      wed: 'Wed',
      thu: 'Thu',
      fri: 'Fri',
      sat: 'Sat',
    },
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
    becomeChef: {
      body: 'To become a chef, contact us at',
      phone: '+201234567891',
    },
  },
  setLocation: {
    title: 'Set your kitchen location',
    subtitle: 'Drag the pin on the map to mark where you cook from. Customers see your distance from this point.',
    saveCta: 'Save & continue',
    validation: {
      coordinatesRequired: 'Please drop a pin on the map first.',
    },
  },
  home: {
    greeting: 'Hello, {name}',
    deliverTo: 'Delivering to',
    addAddress: 'Add address',
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
      title: 'Delivery Addresses',
      empty: {
        title: 'No saved addresses',
        body: 'Add an address to use during checkout',
      },
      addCta: 'Add New Address',
      defaultBadge: 'Default',
      setDefaultA11y: 'Set as default address',
    },
    form: {
      setLocationTitle: 'Set Location',
      addAddressTitle: 'Add Address',
      editAddressTitle: 'Edit Address',
      confirmLocation: 'Confirm Location',
      pinnedLocation: 'Pinned location',
      changeLocation: 'Change',
      streetName: 'Street Name',
      streetNamePlaceholder: 'e.g. Tahrir Street',
      buildingLabel: 'House / Building No.',
      buildingPlaceholder: '12',
      floorPlaceholder: '3',
      apartmentLabel: 'Apartment No.',
      apartmentPlaceholder: '3',
      notesLabel: 'Additional Notes',
      notesHint: 'e.g. 3rd floor, next to the pharmacy',
      notesPlaceholder: 'Any extra details...',
      saveAddress: 'Save Address',
      label: 'Label',
      labelPlaceholder: 'e.g., home',
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
  chefApply: {
    screenTitle: 'Become a chef',
    locationStep: {
      title: 'Where is your kitchen?',
      confirmCta: 'Confirm location',
    },
    detailsStep: {
      title: 'Tell us about your kitchen',
      chefNameLabel: 'Kitchen name',
      bioLabel: 'Bio',
      minOrderPriceLabel: 'Minimum order price (EGP)',
      submitCta: 'Submit application',
      locationLater: "You'll set your kitchen's location on the map after admin approves your application.",
    },
    validation: {
      chefNameRequired: 'Kitchen name is required.',
      bioRequired: 'Bio is required.',
      minOrderPricePositive: 'Minimum order price must be greater than 0.',
      coordinatesRequired: 'Please set your kitchen location on the map.',
    },
    error: {
      alreadyChef: 'You are already a verified chef.',
      applicationPending: 'Your application is pending review.',
      cooldown: 'You may re-apply after {date}.',
    },
  },
  pending: {
    title: 'Application under review',
    body: 'We are reviewing your application. You will be notified once a decision is made.',
    signOutCta: 'Sign out',
  },
  chefProfile: {
    editor: {
      title: 'Kitchen profile',
      openToggle: 'Open',
      closeToggle: 'Closed',
      bioLabel: 'Bio',
      minOrderPriceLabel: 'Minimum order price',
      replaceLogo: 'Replace logo',
      replaceBanner: 'Replace banner',
      save: 'Save changes',
    },
    upload: {
      unsupportedType: 'Only JPEG, PNG, and WebP images are accepted.',
      tooLarge: 'Image must be 5 MB or smaller.',
    },
  },
  discovery: {
    tabTitle: 'Explore',
    allChip: 'All',
    searchPlaceholder: 'Search chefs...',
    emptyState: 'No chefs found.',
    openBadge: 'Open',
    closedBadge: 'Closed',
    distanceFormat: '{km} km away',
    minOrder: 'Min. order {amount} EGP',
    reviewCount: '{count} reviews',
  },
  chefPublicProfile: {
    aboutHeader: 'About',
    categoriesHeader: 'Categories',
    reviewsHeader: 'Reviews',
    noReviewsYet: 'No reviews yet.',
  },
  notifications: {
    chef: {
      verifiedTitle: 'You are now a Nafas chef',
      verifiedBody: 'Welcome — your kitchen is live on Nafas.',
      rejectedTitle: 'Your chef application was not approved',
      rejectedBody: 'Reason: {reason}',
      revokedTitle: 'Your chef status has been revoked',
      revokedBody: 'Reason: {reason}',
    },
  },
  customerTabs: {
    home: 'Home',
    explore: 'Explore',
    favorites: 'Favorites',
    orders: 'Orders',
    profile: 'Profile',
  },
  chefTabs: {
    dashboard: 'Home',
    orders: 'Orders',
    menu: 'Menu',
    stats: 'Stats',
    schedule: 'Schedule',
    profile: 'Profile',
  },
  // Phase 4 US1 chef-side menu editor strings. Lives under `chef.menu`
  // because T024/T025/T026 reference keys as `chef.menu.*` (see spec
  // option in T064 — "merge into the existing `chef.*` namespace").
  chef: {
    menu: {
      title: 'Menu',
      create: 'Create menu',
      empty: 'No menus yet. Tap "Create menu" to add your first one.',
      everyDay: 'Every day',
      specificDays: 'Specific days',
      itemCount: '{count} items',
      items: 'Items',
      nameEn: 'Name (English)',
      nameAr: 'Name (Arabic)',
      nameEnPlaceholder: 'e.g. Koshary',
      nameArPlaceholder: 'مثلاً: كشري',
      category: 'Category',
      availability: 'Availability',
      selectDays: 'Select days',
      mode: {
        'every-day': 'Every day',
        'specific-days': 'Specific days',
      },
    },
    // Phase 4 US2 chef-side item editor strings.
    item: {
      create: 'Add item',
      empty: 'No items yet. Tap "Add item" to add your first one.',
      noImage: 'No image',
      images: {
        title: 'Item images',
        add: 'Add image',
        limit: '{count} / 5 images',
        full: 'You already have the maximum 5 images for this item.',
      },
      editor: {
        name: {
          en: 'Name (English)',
          ar: 'Name (Arabic)',
        },
        description: {
          en: 'Description (English)',
          ar: 'Description (Arabic)',
        },
        price: 'Price (EGP)',
        discount: 'Discount',
        discountUnit: {
          fixed: 'EGP',
          percent: '%',
        },
        stock: {
          unlimited: 'Unlimited stock',
          quantity: 'Quantity',
        },
      },
    },
  },
  // Phase 4 US2 customer-facing item strings (ItemCard renders these
  // even on the chef-side detail screen since the same component
  // serves both surfaces).
  customer: {
    item: {
      outOfStock: 'Out of stock',
      discountBadge: '-{discount}%',
      addToCart: 'Add to cart',
    },
  },
  comingSoon: 'Coming soon',
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
    // Phase 4 US1 menu errors. Keys are the server's error `code` lower-
    // cased (the MenuEditorSheet maps `code.toLowerCase()` into this
    // namespace).
    menu: {
      menu_name_required: 'Please enter the menu name in both languages.',
      menu_name_too_long: 'The menu name is too long (max 60 characters).',
      menu_availability_invalid_weekday: 'Pick at least one day of the week.',
      menu_not_found: "We couldn't find that menu.",
      menus_reorder_not_exact_set: 'The menu order is out of sync. Please refresh and try again.',
      category_not_found: 'That category is no longer available. Pick another.',
    },
    // Phase 4 US2 item errors. Keys are the server's error `code`
    // lower-cased (ItemEditorSheet / ItemImagesDialog map
    // `code.toLowerCase()` into this namespace).
    item: {
      item_name_required: 'Please enter the item name in both languages.',
      item_name_too_long: 'The item name is too long (max 60 characters).',
      item_description_required: 'Please enter a description in both languages.',
      item_description_too_long: 'The description is too long (max 500 characters).',
      item_price_invalid: 'Enter a valid price greater than zero.',
      item_discount_invalid: 'Enter a valid discount value.',
      item_negative_effective_price: 'The discount cannot be larger than the price.',
      item_stock_ambiguous: 'Set either "Unlimited" or a quantity — not both.',
      item_images_full: 'You already have the maximum 5 images for this item.',
      item_not_found: "We couldn't find that item.",
      menu_not_found: "We couldn't find that menu.",
      unsupported_media_type: 'Image must be JPEG, PNG, or WebP.',
      payload_too_large: 'Image must be 3 MB or smaller.',
      item_upload_rate_limited: "You're uploading too fast — please retry shortly.",
    },
  },
} as const;

type DeepStringify<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringify<T[K]>;
};

export type I18nDict = DeepStringify<typeof en>;