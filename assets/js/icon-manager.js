/* icon-manager.js — Professional Icons for UG QR Attendance System */
'use strict';

const ICON = (() => {
  const LOGO_PATH = 'uo_ghana.png';
  
  // EXACT mapping based on YOUR website's emojis
  const emojiToIcon = {
    // Landing Page Role Cards
    '👨‍🏫': 'presentation',
    '🎓': 'graduation-cap',
    '🔐': 'shield',
    
    // Lecturer Dashboard Navigation
    '📚': 'book-open',
    '🟢': 'circle',
    '📋': 'clipboard-list',
    '📊': 'bar-chart-3',
    '📖': 'book',
    '👥': 'users',
    '❓': 'help-circle',
    '👤': 'user',
    '📢': 'megaphone',
    
    // Admin Dashboard
    '🆔': 'id-card',
    '🤝': 'handshake',
    '💾': 'database',
    '⚙️': 'settings',
    
    // Student Dashboard
    '📅': 'calendar',
    '💬': 'message-circle',
    
    // Actions
    '➕': 'plus',
    '✏️': 'pencil',
    '🗑️': 'trash-2',
    '💾': 'save',
    '⬇️': 'download',
    '⬆️': 'upload',
    '🔍': 'search',
    '🔧': 'filter',
    '🔄': 'refresh-cw',
    '✕': 'x',
    '✓': 'check',
    '✔': 'check',
    
    // Status
    '✅': 'check-circle',
    '⚠️': 'alert-triangle',
    '❌': 'alert-circle',
    'ℹ️': 'info',
    
    // Features
    '📍': 'map-pin',
    '◧': 'qr-code',
    '🔑': 'fingerprint',
    '🔒': 'lock',
    '🔓': 'unlock',
    
    // Theme
    '🌙': 'moon',
    '☀️': 'sun',
    
    // UI
    '🔔': 'bell',
    '👁': 'eye',
    '🙈': 'eye-off',
    '🚪': 'log-out',
    '🔚': 'log-out',
    
    // Time
    '⏱️': 'clock',
    '🕐': 'clock',
    
    // Additional
    '📧': 'mail',
    '📞': 'phone',
    '📎': 'paperclip',
    '🔗': 'link',
    '⭐': 'star',
    '🏆': 'award'
  };
  
  // Icon name mapping for direct access
  const icons = {
    dashboard: 'layout-dashboard',
    mycourses: 'book-open',
    courses: 'book-open',
    session: 'circle',
    records: 'clipboard-list',
    reports: 'bar-chart-3',
    announcements: 'megaphone',
    settings: 'settings',
    help: 'help-circle',
    profile: 'user',
    account: 'user',
    logout: 'log-out',
    menu: 'menu',
    tas: 'users',
    biometric: 'fingerprint',
    ids: 'id-card',
    coadmins: 'handshake',
    database: 'database',
    calendar: 'calendar',
    messages: 'message-circle',
    history: 'clipboard-list',
    overview: 'layout-dashboard',
    qrCode: 'qr-code',
    location: 'map-pin',
    success: 'check-circle',
    warning: 'alert-triangle',
    error: 'alert-circle',
    info: 'info',
    add: 'plus',
    edit: 'pencil',
    delete: 'trash-2',
    save: 'save',
    download: 'download',
    upload: 'upload',
    search: 'search',
    filter: 'filter',
    refresh: 'refresh-cw',
    close: 'x',
    check: 'check',
    sun: 'sun',
    moon: 'moon',
    bell: 'bell',
    eye: 'eye',
    eyeOff: 'eye-off',
    lock: 'lock',
    unlock: 'unlock',
    clock: 'clock',
    calendar: 'calendar',
    mail: 'mail',
    phone: 'phone'
  };
  
  const LUCIDE_CDN = 'https://unpkg.com/lucide@latest/dist/umd/lucide.min.js';
  let lucideLoaded = false;
  let loadingPromise = null;
  
  const loadLucide = () => {
    if (lucideLoaded && typeof lucide !== 'undefined') {
      return Promise.resolve();
    }
    if (loadingPromise) return loadingPromise;
    
    loadingPromise = new Promise((resolve, reject) => {
      if (typeof lucide !== 'undefined') {
        lucideLoaded = true;
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = LUCIDE_CDN;
      script.onload = () => { lucideLoaded = true; resolve(); };
      script.onerror = () => reject(new Error('Failed to load Lucide icons'));
      document.head.appendChild(script);
    });
    return loadingPromise;
  };
  
  const createIconElement = async (name, options = {}) => {
    const { className = '', size = 20, color = 'currentColor' } = options;
    const iconName = icons[name] || name;
    await loadLucide();
    
    const wrapper = document.createElement('span');
    wrapper.className = `icon-wrapper icon-${name} ${className}`;
    wrapper.setAttribute('data-lucide', iconName);
    wrapper.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: ${color};
    `;
    
    setTimeout(() => {
      if (wrapper.isConnected && typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons({ icons: { [iconName]: wrapper } });
      }
    }, 0);
    
    return wrapper;
  };
  
  const createIcon = createIconElement;
  
  const getLogo = (options = {}) => {
    const { className = '', width = 40, height = 40, alt = 'University of Ghana' } = options;
    const img = document.createElement('img');
    img.src = LOGO_PATH;
    img.alt = alt;
    img.className = `ug-logo-img ${className}`;
    img.style.cssText = `width: ${typeof width === 'number' ? width + 'px' : width}; height: ${typeof height === 'number' ? height + 'px' : height}; object-fit: contain;`;
    
    img.onerror = () => {
      img.style.display = 'none';
      const fallback = document.createElement('span');
      fallback.className = 'logo-fallback';
      fallback.textContent = 'UG';
      fallback.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #003087;
        color: #FCD116;
        font-weight: bold;
        font-size: 18px;
        border-radius: 8px;
        width: ${typeof width === 'number' ? width : 40}px;
        height: ${typeof height === 'number' ? height : 40}px;
      `;
      img.parentNode?.replaceChild(fallback, img);
    };
    
    return img;
  };
  
  // Target specific elements in YOUR website
  const replaceAllEmojis = async (container = document.body) => {
    console.log('[ICON] Replacing emojis in your website...');
    let count = 0;
    
    // Target specific selectors from your HTML
    const selectors = [
      '.role-card .role-icon',
      '.role-card .role-name',
      '.nav-item .nav-icon',
      '.nav-item span',
      '.tb-btn',
      '.btn',
      '.stat-label',
      '.course-code',
      '.badge',
      '.message-header',
      '.notification-title',
      '.sidebar-header h3',
      '.sidebar-header p',
      '.topbar .tb-title',
      '.land-title',
      '.auth-title',
      '.filter-bar label',
      '.modal-title',
      '.modal-msg',
      '.alert',
      '.strip',
      '.inner-panel h3',
      '.course-card .course-header',
      '.session-card',
      '.tab-content h2',
      '.tab-content h3',
      '.tab-content h4'
    ];
    
    const elements = container.querySelectorAll(selectors.join(','));
    
    for (const element of elements) {
      const text = element.textContent || '';
      let modified = false;
      
      for (const [emoji, iconName] of Object.entries(emojiToIcon)) {
        if (text.includes(emoji) && !element.querySelector('svg, .icon-wrapper')) {
          const newText = text.replace(new RegExp(emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '').trim();
          const size = element.classList.contains('role-icon') ? 48 : 
                      element.classList.contains('nav-icon') ? 20 : 16;
          const icon = await createIcon(iconName, { size: size });
          
          element.innerHTML = '';
          element.appendChild(icon);
          if (newText) {
            const textNode = document.createTextNode(' ' + newText);
            element.appendChild(textNode);
          }
          
          modified = true;
          count++;
          break;
        }
      }
    }
    
    // Handle role icons specifically (they have no text, just emoji)
    const roleIcons = container.querySelectorAll('.role-icon');
    for (const el of roleIcons) {
      const text = el.textContent || '';
      for (const [emoji, iconName] of Object.entries(emojiToIcon)) {
        if (text === emoji || text.includes(emoji)) {
          const icon = await createIcon(iconName, { size: 48 });
          el.innerHTML = '';
          el.appendChild(icon);
          count++;
          break;
        }
      }
    }
    
    // Handle topbar buttons
    const topbarBtns = container.querySelectorAll('.tb-btn');
    for (const btn of topbarBtns) {
      const text = btn.textContent || '';
      for (const [emoji, iconName] of Object.entries(emojiToIcon)) {
        if (text.includes(emoji) && !btn.querySelector('svg')) {
          const newText = text.replace(emoji, '').trim();
          const icon = await createIcon(iconName, { size: 14 });
          btn.insertBefore(icon, btn.firstChild);
          if (newText && btn.childNodes.length > 1) {
            // Keep the text
          }
          count++;
          break;
        }
      }
    }
    
    console.log(`[ICON] Replaced ${count} emoji instances on your site`);
  };
  
  const updateLogos = () => {
    // Topbar logo
    const topbarLogoContainers = document.querySelectorAll('.topbar-logo-container');
    for (const container of topbarLogoContainers) {
      const existingImg = container.querySelector('img');
      if (!existingImg || !existingImg.src?.includes('uo_ghana.png')) {
        container.innerHTML = '';
        container.appendChild(getLogo({ className: 'topbar-logo', width: 40, height: 40 }));
      }
    }
    
    // Auth page logos
    const authLogos = document.querySelectorAll('.auth-logo');
    for (const container of authLogos) {
      const existingImg = container.querySelector('img');
      if (!existingImg || !existingImg.src?.includes('uo_ghana.png')) {
        container.innerHTML = '';
        container.appendChild(getLogo({ className: 'auth-ug-logo', width: 80, height: 80 }));
      }
    }
    
    // Landing page logo
    const landingLogo = document.querySelector('.land-wrap .ug-logo');
    if (landingLogo && (!landingLogo.src || !landingLogo.src.includes('uo_ghana.png'))) {
      const newLogo = getLogo({ className: 'ug-logo', width: 86, height: 86 });
      landingLogo.parentNode?.replaceChild(newLogo, landingLogo);
    }
  };
  
  const addStyles = () => {
    if (document.getElementById('icon-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'icon-styles';
    style.textContent = `
      .ug-logo-img { object-fit: contain; display: block; }
      .topbar-logo { height: 40px; width: auto; }
      .auth-ug-logo { height: 80px; width: auto; margin: 0 auto; display: block; }
      .ug-logo { height: 86px; width: auto; margin-bottom: 14px; }
      
      .icon-wrapper { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .icon-wrapper svg { width: 100%; height: 100%; stroke-width: 2; stroke: currentColor; fill: none; }
      
      .nav-icon { width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; }
      .nav-icon .icon-wrapper { width: 20px; height: 20px; }
      
      .role-icon { width: 48px; height: 48px; margin: 0 auto 12px; display: flex; align-items: center; justify-content: center; }
      .role-icon .icon-wrapper { width: 48px; height: 48px; }
      
      .tb-btn .icon-wrapper { margin-right: 6px; }
      .btn .icon-wrapper { margin-right: 6px; }
      
      .icon-success { color: #1d9e75; }
      .icon-warning { color: #b8860b; }
      .icon-error { color: #d42b2b; }
      .icon-info { color: #003087; }
      
      .topbar-logo-container { display: flex; align-items: center; flex-shrink: 0; }
      .auth-logo { text-align: center; margin-bottom: 20px; }
      
      .logo-fallback, .icon-fallback { font-family: system-ui, sans-serif; }
    `;
    document.head.appendChild(style);
  };
  
  const init = async () => {
    console.log('[ICON] Initializing UG QR Attendance System icons...');
    addStyles();
    updateLogos();
    
    try {
      await loadLucide();
      console.log('[ICON] Lucide loaded, replacing emojis...');
      setTimeout(async () => {
        await replaceAllEmojis(document.body);
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
          lucide.createIcons();
        }
        console.log('[ICON] Your website now has professional icons!');
      }, 200);
    } catch (err) {
      console.warn('[ICON] Using emoji fallbacks');
    }
    
    const observer = new MutationObserver(async () => {
      setTimeout(async () => {
        await replaceAllEmojis(document.body);
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
          lucide.createIcons();
        }
      }, 100);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };
  
  const refresh = async () => {
    await replaceAllEmojis(document.body);
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
  };
  
  return {
    init,
    refresh,
    createIcon,
    getLogo,
    icons,
    emojiToIcon
  };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ICON.init());
} else {
  ICON.init();
}

window.ICON = ICON;
