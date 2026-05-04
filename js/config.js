/* ============================================
   config.js — App configuration with Environment Variables
   Path: /js/config.js
   ============================================ */
'use strict';

const getEnvVar = (key, fallback = '') => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key];
  }
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  return fallback;
};

const CONFIG = Object.freeze({
  FIREBASE: {
    apiKey: getEnvVar('VITE_FIREBASE_API_KEY', ''),
    authDomain: getEnvVar('VITE_FIREBASE_AUTH_DOMAIN', ''),
    databaseURL: getEnvVar('VITE_FIREBASE_DATABASE_URL', ''),
    projectId: getEnvVar('VITE_FIREBASE_PROJECT_ID', ''),
    storageBucket: getEnvVar('VITE_FIREBASE_STORAGE_BUCKET', ''),
    messagingSenderId: getEnvVar('VITE_FIREBASE_MESSAGING_SENDER_ID', ''),
    appId: getEnvVar('VITE_FIREBASE_APP_ID', '')
  },
  EMAIL_PROVIDER: getEnvVar('VITE_EMAIL_PROVIDER', 'mailto'),
  GOOGLE_APPS_SCRIPT_URL: getEnvVar('VITE_GOOGLE_APPS_SCRIPT_URL', ''),
  SITE_URL: (() => {
    const { origin, pathname } = window.location;
    return origin + pathname.replace(/\/?[^/]*$/, '/');
  })(),
  KEYS: Object.freeze({ 
    USER: 'ugqr7_user', 
    THEME: 'ugqr7_theme'
  }),
  SECURITY: {
    SESSION_EXPIRY_DAYS: parseInt(getEnvVar('VITE_SESSION_EXPIRY_DAYS', '7')),
    MAX_LOGIN_ATTEMPTS: parseInt(getEnvVar('VITE_MAX_LOGIN_ATTEMPTS', '5')),
    LOCKOUT_MINUTES: parseInt(getEnvVar('VITE_LOCKOUT_MINUTES', '15'))
  },
  STUDENT_EMAIL_DOMAINS: ['@st.ug.edu.gh', '.ug.edu.gh'],
  DEPARTMENTS: [
    'Accounting', 'Computer Science', 'Engineering', 'Medicine', 'Law'
    // ... full list
  ],
});

// Firebase initialization
(function () {
  if (CONFIG.FIREBASE.apiKey && CONFIG.FIREBASE.apiKey !== 'your_firebase_api_key_here') {
    try {
      if (!firebase.apps || !firebase.apps.length) {
        firebase.initializeApp(CONFIG.FIREBASE);
      }
      window._db = firebase.database();
      console.log('[UG-QR] Firebase connected ✅');
    } catch (e) {
      console.error('[UG-QR] Firebase error:', e.message);
      window._db = null;
    }
  } else {
    console.warn('[UG-QR] Firebase not configured. Running in demo mode.');
    window._db = null;
  }
})();
