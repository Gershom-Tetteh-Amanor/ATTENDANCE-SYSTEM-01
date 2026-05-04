/* config/env.template.js - Environment Variables Template
 * Copy this file to env.js and add your actual keys
 * NEVER commit env.js to version control!
 */

window.ENV_CONFIG = {
  // Firebase Configuration (Get from Firebase Console)
  FIREBASE: {
    apiKey: 'YOUR_API_KEY_HERE',
    authDomain: 'YOUR_AUTH_DOMAIN_HERE',
    databaseURL: 'YOUR_DATABASE_URL_HERE',
    projectId: 'YOUR_PROJECT_ID_HERE',
    storageBucket: 'YOUR_STORAGE_BUCKET_HERE',
    messagingSenderId: 'YOUR_MESSAGING_SENDER_ID_HERE',
    appId: 'YOUR_APP_ID_HERE'
  },
  
  // Email Configuration
  EMAIL_PROVIDER: 'mailto', // 'google_apps_script', 'mailto', or 'clipboard'
  GOOGLE_APPS_SCRIPT_URL: '',
  
  // Site URL (auto-detected, override if needed)
  SITE_URL: null, // null = auto-detect
  
  // App Settings
  APP_NAME: 'UG QR Attendance System',
  SESSION_EXPIRY_DAYS: 7,
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_MINUTES: 15,
  PASSWORD_MIN_LENGTH: 8,
  
  // Feature Flags
  ENABLE_BIOMETRIC: true,
  ENABLE_OFFLINE_MODE: true,
  ENABLE_SOUND_NOTIFICATIONS: true
};
