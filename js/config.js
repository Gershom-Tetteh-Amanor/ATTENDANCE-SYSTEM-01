/* ============================================
   config.js — App configuration
   ★ Edit the FIREBASE block with your values
   ★ Edit the EMAILJS block with your EmailJS credentials
   ============================================ */
'use strict';

const CONFIG = Object.freeze({

  /* ── REPLACE all values below with yours from Firebase Console ── */
  FIREBASE: {
   apiKey: "AIzaSyBdg5CR39fJQuCjiKqCKPzt_fuYq-Udtmo",
  authDomain: "attendance-system-c004a.firebaseapp.com",
  databaseURL: "https://attendance-system-c004a-default-rtdb.firebaseio.com",
  projectId: "attendance-system-c004a",
  storageBucket: "attendance-system-c004a.firebasestorage.app",
  messagingSenderId: "605346471634",
  appId: "1:605346471634:web:7c43fd6636580fa2ab970b"
  },

  /* ── EmailJS Configuration (get from https://www.emailjs.com) ──
     To enable automatic emails:
     1. Sign up at emailjs.com (free tier: 200 emails/month)
     2. Go to Email Services → Add New Service (Gmail, Outlook, etc.)
     3. Copy the Service ID (looks like: service_xxxxxxx)
     4. Go to Email Templates → Create New Template
     5. Create two templates:
        - template_uid_email (for sending UIDs to lecturers)
        - template_reset_email (for password reset codes)
     6. Go to Account → API Keys → Copy your Public Key
     7. Paste all three values below
  */
  EMAILJS: {
    PUBLIC_KEY: 'KoyK8IH0xZn4QrlCh',  // From EmailJS Account → API Keys
    SERVICE_ID: 'service_yn4wj4f',          // From EmailJS Email Services
    TEMPLATE_ID_UID: 'template_47p7ao1',  // Template ID for UID emails
    TEMPLATE_ID_RESET: 'template_rjoeniq', // Template ID for password reset emails
  },

  /* Site URL — auto-detected (works on any GitHub Pages URL) */
  SITE_URL: (() => {
    const { origin, pathname } = window.location;
    return origin + pathname.replace(/\/?[^/]*$/, '/');
  })(),

  /* localStorage keys */
  KEYS: Object.freeze({ USER: 'ugqr7_user', THEME: 'ugqr7_theme' }),

  /* Email domain restrictions */
  STUDENT_EMAIL_DOMAINS: ['@st.ug.edu.gh', '.ug.edu.gh'],

  /* All UG Departments — alphabetical */
  DEPARTMENTS: [
    'Accounting','African Studies','Agricultural Economics & Agribusiness',
    'Agricultural Engineering','Animal Science','Anatomy & Cell Biology',
    'Arts & Social Sciences Education','Banking & Finance','Basic Education',
    'Biochemistry, Cell & Molecular Biology','Biomedical Engineering',
    'Business Administration','Chemistry','Child Health','Civil Engineering',
    'Communication Studies','Community Health','Computer Engineering',
    'Computer Science','Crop Science','Curriculum & Teaching','Dance Studies',
    'Earth Science','Economics','Educational Foundations',
    'Electrical & Electronic Engineering','English','Epidemiology',
    'Food Science & Nutrition','French','General Studies',
    'Geography & Resource Development','History','Human Resource Management',
    'Information Studies','Interdisciplinary Studies','Law','Linguistics',
    'Management Information Systems','Marketing & Entrepreneurship',
    'Mathematics','Mechanical Engineering','Medical Biochemistry',
    'Medical Laboratory Sciences','Medical Pharmacology','Music','Nursing',
    'Obstetrics & Gynaecology',
    'Operations & Management Information Systems',
    'Optometry','Parasitology','Pathology','Pharmacy Practice',
    'Pharmacognosy & Herbal Medicine','Philosophy & Classics',
    'Physical Education & Sport Sciences','Physics','Physiology',
    'Plant & Environmental Biology','Political Science','Psychology',
    'Public Administration','Radiology','Religious Studies','Russian',
    'Science & Mathematics Education','Sociology',
    'Social, Statistical & Economic Research','Soil Science',
    'Statistics & Actuarial Science','Surgery','Teacher Education',
    'Theatre Arts','Virology','Zoology',
  ],
});

/* ── Firebase init (runs once on page load) ── */
(function () {
  if (CONFIG.FIREBASE.apiKey.startsWith('YOUR_')) {
    console.warn('[UG-QR] Firebase not configured. Running in demo mode.');
    window._db = null;
    document.addEventListener('DOMContentLoaded', () => {
      const b = document.getElementById('demo-bar');
      if (b) b.style.display = 'block';
    });
    return;
  }
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
}());

/* ── EmailJS init ── */
(function () {
  const isConfigured = CONFIG.EMAILJS && 
                       CONFIG.EMAILJS.PUBLIC_KEY && 
                       !CONFIG.EMAILJS.PUBLIC_KEY.startsWith('YOUR_') &&
                       CONFIG.EMAILJS.SERVICE_ID && 
                       !CONFIG.EMAILJS.SERVICE_ID.startsWith('YOUR_');
  
  if (isConfigured) {
    if (typeof emailjs !== 'undefined') {
      emailjs.init(CONFIG.EMAILJS.PUBLIC_KEY);
      console.log('[UG-QR] EmailJS initialized ✅');
      console.log('[UG-QR] EmailJS Service ID:', CONFIG.EMAILJS.SERVICE_ID);
    } else {
      console.warn('[UG-QR] EmailJS library not loaded. Check script tag in index.html');
    }
  } else {
    console.warn('[UG-QR] EmailJS not configured. Emails will not be sent.');
  }
}());
