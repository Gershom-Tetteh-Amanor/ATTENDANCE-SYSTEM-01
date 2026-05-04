/* config.js - Direct configuration for Firebase Hosting */
'use strict';

const CONFIG = Object.freeze({
  // Firebase Configuration - Safe when hosted on Firebase
  // These keys are restricted to your Firebase project's domain
  FIREBASE: {
    apiKey: "AIzaSyBdg5CR39fJQuCjiKqCKPzt_fuYq-Udtmo",
    authDomain: "attendance-system-c004a.firebaseapp.com",
    databaseURL: "https://attendance-system-c004a-default-rtdb.firebaseio.com",
    projectId: "attendance-system-c004a",
    storageBucket: "attendance-system-c004a.firebasestorage.app",
    messagingSenderId: "605346471634",
    appId: "1:605346471634:web:4fb13996c9fff2ffab970b"
  },

  /* Email Configuration */
  EMAIL_PROVIDER: 'google_apps_script',
  GOOGLE_APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxqo2l5ECkZu03h7cEdNDvZkM8drixdIut7wnKxpdPwEBjYj-ID6bjR4BHgJ7e9x9zqHg/exec',
  
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

  /* All UG Departments */
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

/* Firebase initialization */
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

console.log('[UG-QR] Configuration loaded');
