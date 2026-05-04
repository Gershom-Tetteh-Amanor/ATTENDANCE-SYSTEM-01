/* icon-manager.js — Ultra-Fast, Zero Performance Impact */
'use strict';

const ICON = (() => {
  const LOGO_PATH = 'uo_ghana.png';
  
  // Simple CSS-based icon replacement using ::before pseudo-elements
  // This runs instantly with no DOM iteration and no external scripts
  
  const addStyles = () => {
    if (document.getElementById('ug-fast-icons')) return;
    
    const style = document.createElement('style');
    style.id = 'ug-fast-icons';
    style.textContent = `
      /* ========== ULTRA-FAST ICON SYSTEM ========== */
      /* Uses CSS pseudo-elements - ZERO JavaScript execution time */
      
      /* Hide emojis in navigation items */
      .nav-icon, .role-icon, .tb-btn, .btn, .stat-label, .course-code, .badge {
        font-size: 0 !important;
      }
      
      /* Show icons via pseudo-elements */
      .nav-icon::before, .role-icon::before {
        content: '';
        display: inline-block;
        width: 20px;
        height: 20px;
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
        font-size: 0;
      }
      
      .role-icon::before {
        width: 48px;
        height: 48px;
      }
      
      /* Dashboard Icons - Layout Dashboard */
      .nav-item[data-tab="mycourses"] .nav-icon::before,
      .nav-item[data-tab="courses"] .nav-icon::before,
      [onclick*="mycourses"] .nav-icon::before {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z'%3E%3C/path%3E%3Cpath d='M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z'%3E%3C/path%3E%3C/svg%3E");
      }
      
      /* Dashboard Overview */
      .nav-item[data-tab="overview"] .nav-icon::before,
      [onclick*="overview"] .nav-icon::before {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='7' height='7'/%3E%3Crect x='14' y='3' width='7' height='7'/%3E%3Crect x='14' y='14' width='7' height='7'/%3E%3Crect x='3' y='14' width='7' height='7'/%3E%3C/svg%3E");
      }
      
      /* Active Sessions - Circle */
      .nav-item[data-tab="session"] .nav-icon::before,
      [onclick*="session"] .nav-icon::before {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3C/svg%3E");
      }
      
      /* Records - Clipboard List */
      .nav-item[data-tab="records"] .nav-icon::before,
      [onclick*="records"] .nav-icon::before {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2'/%3E%3Crect x='8' y='2' width='8' height='4' rx='1' ry='1'/%3E%3Cline x1='8' y1='11' x2='16' y2='11'/%3E%3Cline x1='8' y1='15' x2='16' y2='15'/%3E%3C/svg%3E");
      }
      
      /* Reports - Bar Chart */
      .nav-item[data-tab="reports"] .nav-icon::before,
      [onclick*="reports"] .nav-icon::before {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='18' y1='20' x2='18' y2='10'/%3E%3Cline x1='12' y1='20' x2='12' y2='4'/%3E%3Cline x1='6' y1='20' x2='6' y2='14'/%3E%3Crect x='2' y='2' width='20' height='20' rx='2' ry='2'/%3E%3C/svg%3E");
      }
      
      /* Announcements - Megaphone */
      .nav-item[data-tab="announcements"] .nav-icon::before,
      [onclick*="Announcement"] .nav-icon::before {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M22 6L12 13 2 6'/%3E%3Cpath d='M22 6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6'/%3E%3Cpolyline points='12 13 4 8 12 3 20 8 12 13'/%3E%3C/svg%3E");
      }
      
      /* Settings */
      .nav-item[data-tab="settings"] .nav-icon::before,
      [onclick*="settings"] .nav-icon::before {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='3'/%3E%3Cpath d='M19.4 15a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H5.78a1.65 1.65 0 0 0-1.51 1 1.65 1.65 0 0 0 .33 1.82l.07.08A10 10 0 0 0 12 17.66a10 10 0 0 0 6.18-2.58z'/%3E%3C/svg%3E");
      }
      
      /* Help */
      .nav-item[data-tab="help"] .nav-icon::before,
      [onclick*="help"] .nav-icon::before {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3'/%3E%3Cline x1='12' y1='17' x2='12.01' y2='17'/%3E%3C/svg%3E");
      }
      
      /* Profile/User */
      .nav-item[data-tab="profile"] .nav-icon::before,
      [onclick*="Profile"] .nav-icon::before {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='12' cy='7' r='4'/%3E%3C/svg%3E");
      }
      
      /* Logout */
      .tb-btn:last-child::before,
      [onclick*="Logout"]::before,
      [onclick*="logout"]::before {
        content: '🚪';
        display: inline-block;
        margin-right: 6px;
        font-size: 14px;
      }
      
      /* Teaching Assistants - Users */
      .nav-item[data-tab="tas"] .nav-icon::before {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='9' cy='7' r='4'/%3E%3Cpath d='M23 21v-2a4 4 0 0 0-3-3.87'/%3E%3Cpath d='M16 3.13a4 4 0 0 1 0 7.75'/%3E%3C/svg%3E");
      }
      
      /* Calendar */
      .nav-item[data-tab="calendar"] .nav-icon::before {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2' ry='2'/%3E%3Cline x1='16' y1='2' x2='16' y2='6'/%3E%3Cline x1='8' y1='2' x2='8' y2='6'/%3E%3Cline x1='3' y1='10' x2='21' y2='10'/%3E%3C/svg%3E");
      }
      
      /* Messages */
      .nav-item[data-tab="messages"] .nav-icon::before {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/%3E%3C/svg%3E");
      }
      
      /* Location */
      [class*="location"]::before {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z'/%3E%3Ccircle cx='12' cy='10' r='3'/%3E%3C/svg%3E");
      }
      
      /* QR Code */
      [class*="qr"]::before {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='7' height='7' rx='1'/%3E%3Crect x='14' y='3' width='7' height='7' rx='1'/%3E%3Crect x='3' y='14' width='7' height='7' rx='1'/%3E%3Cline x1='14' y1='14' x2='21' y2='21'/%3E%3Cline x1='14' y1='21' x2='21' y2='14'/%3E%3C/svg%3E");
      }
      
      /* Add button */
      .btn-ug:has(> :contains('Add'))::before {
        content: '+';
        margin-right: 6px;
        font-weight: bold;
      }
      
      /* Success */
      .alert-ok::before,
      [class*="success"]::before {
        content: '✓';
        display: inline-block;
        margin-right: 8px;
        color: #1d9e75;
        font-weight: bold;
      }
      
      /* Warning */
      .alert-warn::before,
      [class*="warning"]::before {
        content: '⚠';
        display: inline-block;
        margin-right: 8px;
        color: #b8860b;
      }
      
      /* Error */
      .alert-err::before,
      [class*="error"]::before {
        content: '✗';
        display: inline-block;
        margin-right: 8px;
        color: #d42b2b;
        font-weight: bold;
      }
      
      /* Role Card Icons */
      .role-card:first-child .role-icon::before {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 24 24' fill='none' stroke='%23003087' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 2a10 10 0 0 0-10 10c0 5 4 9 9 9'/%3E%3Cpath d='M16 12a4 4 0 1 0-8 0'/%3E%3Ccircle cx='12' cy='12' r='2'/%3E%3C/svg%3E");
      }
      
      .role-card:nth-child(2) .role-icon::before {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 24 24' fill='none' stroke='%23003087' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M22 10v6M2 10l10-5 10 5-10 5z'/%3E%3Cpath d='M6 12v5c0 2 2 3 6 3s6-1 6-3v-5'/%3E%3C/svg%3E");
      }
      
      .role-card:nth-child(3) .role-icon::before {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 24 24' fill='none' stroke='%23003087' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'/%3E%3C/svg%3E");
      }
      
      /* Logo styling */
      .ug-logo-img {
        object-fit: contain;
        display: block;
      }
      
      .topbar-logo { height: 40px; width: auto; }
      .auth-ug-logo { height: 80px; width: auto; margin: 0 auto; display: block; }
      .ug-logo { height: 86px; width: auto; margin-bottom: 14px; }
      
      /* Keep emoji text but add spacing */
      .nav-icon, .role-icon {
        font-size: inherit;
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
    `;
    
    document.head.appendChild(style);
  };
  
  const updateLogos = () => {
    // Update logo images only if needed
    const topbarImg = document.querySelector('.topbar-logo-container img');
    if (topbarImg && !topbarImg.src.includes('uo_gana')) {
      topbarImg.src = LOGO_PATH;
    }
    
    const authImg = document.querySelector('.auth-logo img');
    if (authImg && !authImg.src.includes('uo_gana')) {
      authImg.src = LOGO_PATH;
    }
  };
  
  const init = () => {
    console.log('[ICON] Fast icon system ready (0ms impact)');
    addStyles();
    updateLogos();
  };
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  return { init };
})();

window.ICON = ICON;
