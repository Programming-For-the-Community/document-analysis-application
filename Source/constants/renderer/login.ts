export const LOGIN_ERRORS = {
  MISSING_CREDENTIALS: 'Please enter your username and password.',
  SIGNIN_FAILURE: 'Sign in failed. Please try again.',
  MISSING_SIGNUP_FIELDS: 'Please fill in all fields.',
  // User-facing validation messages, not credentials (Sonar S2068 false positive)
  // eslint-disable-next-line sonarjs/no-hardcoded-passwords
  PASSWORDS_DO_NOT_MATCH: 'Passwords do not match.',
  // eslint-disable-next-line sonarjs/no-hardcoded-passwords
  PASSWORD_TOO_SHORT: 'Password must be at least 8 characters.',
  SIGNUP_FAILURE: 'Failed to create account. Please try again.',
} as const;
