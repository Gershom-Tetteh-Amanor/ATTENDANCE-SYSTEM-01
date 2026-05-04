/* config/env.js - Your Actual Configuration
 * WARNING: NEVER commit this file to GitHub!
 * This file contains your actual Firebase credentials.
 */

window.ENV_CONFIG = {
  // Firebase Configuration - YOUR ACTUAL KEYS
  FIREBASE: {
    apiKey: "AIzaSyBdg5CR39fJQuCjiKqCKPzt_fuYq-Udtmo",
    authDomain: "attendance-system-c004a.firebaseapp.com",
    databaseURL: "https://attendance-system-c004a-default-rtdb.firebaseio.com",
    projectId: "attendance-system-c004a",
    storageBucket: "attendance-system-c004a.firebasestorage.app",
    messagingSenderId: "605346471634",
    appId: "1:605346471634:web:4fb13996c9fff2ffab970b"
  },
  
  // Email Configuration
  EMAIL_PROVIDER: 'google_apps_script',
  GOOGLE_APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxqo2l5ECkZu03h7cEdNDvZkM8drixdIut7wnKxpdPwEBjYj-ID6bjR4BHgJ7e9x9zqHg/exec',
  
  // Site URL (auto-detected)
  SITE_URL: null,
  
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
