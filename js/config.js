/* ============================================
   config.js — App configuration
   No API keys needed! Uses mailto: for emails
   ============================================ */
'use strict';

const CONFIG = Object.freeze({

  /* ── Firebase Configuration ── */
  FIREBASE: {
    apiKey: "AIzaSyBdg5CR39fJQuCjiKqCKPzt_fuYq-Udtmo",
    authDomain: "attendance-system-c004a.firebaseapp.com",
    databaseURL: "https://attendance-system-c004a-default-rtdb.firebaseio.com",
    projectId: "attendance-system-c004a",
    storageBucket: "attendance-system-c004a.firebasestorage.app",
    messagingSenderId: "605346471634",
    appId: "1:605346471634:web:4fb13996c9fff2ffab970b"
  },

  /* ── Email Settings ── */
  // Using mailto: links - no API keys required!
  // This opens the user's default email client with pre-filled content
  EMAIL_METHOD: 'mailto',
  
  /* Site URL — auto-detected */
  SITE_URL: (() => {
    const { origin, pathname } = window.location;
    return origin + pathname.replace(/\/?[^/]*$/, '/');
  })(),

  /* localStorage keys */
  KEYS: Object.freeze({ 
    USER: 'ugqr7_user', 
    THEME: 'ugqr7_theme' 
  }),

  /* Email domain restrictions */
  STUDENT_EMAIL_DOMAINS: ['@st.ug.edu.gh', '.ug.edu.gh'],

  /* All UG Departments — alphabetical */
  DEPARTMENTS: [
    'Accounting', 'African Studies', 'Agricultural Economics & Agribusiness',
    'Agricultural Engineering', 'Animal Science', 'Anatomy & Cell Biology',
    'Arts & Social Sciences Education', 'Banking & Finance', 'Basic Education',
    'Biochemistry, Cell & Molecular Biology', 'Biomedical Engineering',
    'Business Administration', 'Chemistry', 'Child Health', 'Civil Engineering',
    'Communication Studies', 'Community Health', 'Computer Engineering',
    'Computer Science', 'Crop Science', 'Curriculum & Teaching', 'Dance Studies',
    'Earth Science', 'Economics', 'Educational Foundations',
    'Electrical & Electronic Engineering', 'English', 'Epidemiology',
    'Food Science & Nutrition', 'French', 'General Studies',
    'Geography & Resource Development', 'History', 'Human Resource Management',
    'Information Studies', 'Interdisciplinary Studies', 'Law', 'Linguistics',
    'Management Information Systems', 'Marketing & Entrepreneurship',
    'Mathematics', 'Mechanical Engineering', 'Medical Biochemistry',
    'Medical Laboratory Sciences', 'Medical Pharmacology', 'Music', 'Nursing',
    'Obstetrics & Gynaecology',
    'Operations & Management Information Systems',
    'Optometry', 'Parasitology', 'Pathology', 'Pharmacy Practice',
    'Pharmacognosy & Herbal Medicine', 'Philosophy & Classics',
    'Physical Education & Sport Sciences', 'Physics', 'Physiology',
    'Plant & Environmental Biology', 'Political Science', 'Psychology',
    'Public Administration', 'Radiology', 'Religious Studies', 'Russian',
    'Science & Mathematics Education', 'Sociology',
    'Social, Statistical & Economic Research', 'Soil Science',
    'Statistics & Actuarial Science', 'Surgery', 'Teacher Education',
    'Theatre Arts', 'Virology', 'Zoology'
  ],
});

/* ── Firebase initialization ONLY (no EmailJS) ── */
(function () {
  if (CONFIG.FIREBASE.apiKey && !CONFIG.FIREBASE.apiKey.startsWith('YOUR_')) {
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
    document.addEventListener('DOMContentLoaded', () => {
      const b = document.getElementById('demo-bar');
      if (b) b.style.display = 'block';
    });
  }
})();

// No EmailJS initialization - using mailto: instead
console.log('[UG-QR] Using mailto: for emails - no API keys required');
