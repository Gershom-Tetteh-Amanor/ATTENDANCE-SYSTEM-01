/* icon-manager.js — Professional Icons using Lucide (Free & Open Source) */
'use strict';

const ICON = (() => {
  const LOGO_PATH = 'uo_ghana.png';
  
  // Lucide icon name mapping (https://lucide.dev/icons)
  const icons = {
    // Navigation
    dashboard: 'layout-dashboard',
    courses: 'book-open',
    sessions: 'clock',
    records: 'clipboard-list',
    reports: 'bar-chart-3',
    announcements: 'megaphone',
    settings: 'settings',
    help: 'help-circle',
    profile: 'user',
    logout: 'log-out',
    menu: 'menu',
    
    // Actions
    add: 'plus',
    edit: 'pencil',
    delete: 'trash-2',
    save: 'save',
    cancel: 'x',
    download: 'download',
    upload: 'upload',
    export: 'file-export',
    print: 'printer',
    refresh: 'refresh-cw',
    filter: 'filter',
    search: 'search',
    close: 'x',
    
    // Status
    success: 'check-circle',
    warning: 'alert-triangle',
    error: 'alert-circle',
    info: 'info',
    pending: 'clock',
    approved: 'check-circle-2',
    rejected: 'x-circle',
    active: 'activity',
    
    // Features
    qrCode: 'qr-code',
    location: 'map-pin',
    biometric: 'fingerprint',
    fingerprint: 'fingerprint',
    faceId: 'scan-face',
    calendar: 'calendar',
    clock: 'clock',
    checkIn: 'log-in',
    attendance: 'users',
    lecture: 'presentation',
    student: 'graduation-cap',
    admin: 'shield',
    ta: 'user-check',
    email: 'mail',
    
    // UI
    bell: 'bell',
    eye: 'eye',
    eyeOff: 'eye-off',
    lock: 'lock',
    unlock: 'unlock',
    sun: 'sun',
    moon: 'moon',
    arrowLeft: 'arrow-left',
    arrowRight: 'arrow-right',
    arrowUp: 'arrow-up',
    arrowDown: 'arrow-down',
    chevron: 'chevron-right',
    
    // Additional
    star: 'star',
    heart: 'heart',
    share: 'share-2',
    link: 'link',
    copy: 'copy',
    clipboard: 'clipboard',
    file: 'file',
    folder: 'folder',
    image: 'image',
    video: 'video',
    music: 'music',
    award: 'award',
    target: 'target',
    compass: 'compass',
    globe: 'globe',
    mail: 'mail',
    phone: 'phone',
    message: 'message-square',
    chat: 'message-circle',
    comment: 'message-circle',
    thumbsUp: 'thumbs-up',
    thumbsDown: 'thumbs-down',
    flag: 'flag',
    bookmark: 'bookmark'
  };
  
  // Lucide CDN URLs
  const LUCIDE_CDN = 'https://unpkg.com/lucide@latest/dist/umd/lucide.min.js';
  let lucideLoaded = false;
  let loadingPromise = null;
  
  // Load Lucide library
  const loadLucide = () => {
    if (lucideLoaded && typeof lucide !== 'undefined') {
      return Promise.resolve();
    }
    
    if (loadingPromise) {
      return loadingPromise;
    }
    
    loadingPromise = new Promise((resolve, reject) => {
      if (typeof lucide !== 'undefined') {
        lucideLoaded = true;
        resolve();
        return;
      }
      
      const script = document.createElement('script');
      script.src = LUCIDE_CDN;
      script.onload = () => {
        lucideLoaded = true;
        resolve();
      };
      script.onerror = () => {
        console.error('[ICON] Failed to load Lucide icons');
        reject(new Error('Failed to load Lucide icons'));
      };
      document.head.appendChild(script);
    });
    
    return loadingPromise;
  };
  
  // Create an icon element using Lucide
  const createIconElement = async (name, options = {}) => {
    const { className = '', size = 20, color = 'currentColor' } = options;
    
    const iconName = icons[name];
    if (!iconName) {
      console.warn(`[ICON] Icon mapping not found: ${name}`);
      return createFallbackIcon(name, className);
    }
    
    await loadLucide();
    
    const wrapper = document.createElement('span');
    wrapper.className = `icon-wrapper icon-${name} ${className}`;
    wrapper.setAttribute('data-lucide', iconName);
    wrapper.style.width = `${size}px`;
    wrapper.style.height = `${size}px`;
    wrapper.style.display = 'inline-flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.justifyContent = 'center';
    
    // Create the icon after DOM insertion
    setTimeout(() => {
      if (wrapper.isConnected && typeof lucide !== 'undefined' && lucide.createIcons) {
        const elements = wrapper.querySelectorAll('[data-lucide]');
        if (elements.length === 0) {
          wrapper.setAttribute('data-lucide', iconName);
        }
        lucide.createIcons({ icons: { [iconName]: wrapper } });
      }
    }, 0);
    
    return wrapper;
  };
  
  // Create fallback icon (emoji) when Lucide fails
  const createFallbackIcon = (name, className) => {
    const fallback = document.createElement('span');
    fallback.className = `icon-fallback ${className}`;
    fallback.textContent = getFallbackChar(name);
    fallback.style.fontSize = 'inherit';
    return fallback;
  };
  
  // Get fallback character for icon name
  const getFallbackChar = (name) => {
    const fallbacks = {
      dashboard: '📊', courses: '📚', sessions: '⏱️', records: '📋',
      reports: '📈', announcements: '📢', settings: '⚙️', help: '❓',
      profile: '👤', logout: '🚪', add: '➕', edit: '✏️', delete: '🗑️',
      save: '💾', download: '⬇️', upload: '⬆️', search: '🔍', close: '✕',
      success: '✓', warning: '⚠️', error: '✗', info: 'ℹ️', lock: '🔒',
      unlock: '🔓', sun: '☀️', moon: '🌙', bell: '🔔', calendar: '📅',
      location: '📍', qrCode: '◧', fingerprint: '🔑', lecture: '👨‍🏫',
      student: '🎓', admin: '🔐', ta: '👥', filter: '🔍', refresh: '🔄',
      export: '📤', print: '🖨️', email: '📧', phone: '📞', star: '⭐'
    };
    return fallbacks[name] || '●';
  };
  
  // Create an icon (alias for createIconElement)
  const createIcon = createIconElement;
  
  // Get UG logo as image element
  const getLogo = (options = {}) => {
    const { className = '', width = 40, height = 40, alt = 'University of Ghana' } = options;
    const img = document.createElement('img');
    img.src = LOGO_PATH;
    img.alt = alt;
    img.className = `ug-logo-img ${className}`;
    img.style.width = typeof width === 'number' ? `${width}px` : width;
    img.style.height = typeof height === 'number' ? `${height}px` : height;
    img.style.objectFit = 'contain';
    
    // Handle logo load error
    img.onerror = () => {
      console.warn('[ICON] Logo failed to load, using fallback');
      img.style.display = 'none';
      const fallback = document.createElement('span');
      fallback.className = 'logo-fallback';
      fallback.textContent = 'UG';
      fallback.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--ug, #003087);
        color: var(--gold, #FCD116);
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
  
  // Create an icon button
  const createIconButton = async (iconName, label, onClick, options = {}) => {
    const { className = '', disabled = false, title = '', variant = 'secondary' } = options;
    const button = document.createElement('button');
    button.className = `icon-btn icon-btn-${variant} ${className}`;
    button.disabled = disabled;
    if (title) button.title = title;
    button.setAttribute('aria-label', label);
    
    const icon = await createIcon(iconName, { size: 18 });
    button.appendChild(icon);
    
    if (label) {
      const span = document.createElement('span');
      span.className = 'btn-label';
      span.textContent = label;
      button.appendChild(span);
    }
    
    if (onClick) button.addEventListener('click', onClick);
    
    return button;
  };
  
  // Replace emojis with icons in existing DOM
  const replaceEmojis = async (container = document.body) => {
    const mapping = {
      '📚': 'courses', '📊': 'dashboard', '📋': 'records', '📈': 'reports',
      '📢': 'announcements', '⚙️': 'settings', '❓': 'help', '👤': 'profile',
      '🚪': 'logout', '➕': 'add', '✏️': 'edit', '🗑️': 'delete', '💾': 'save',
      '⬇️': 'download', '⬆️': 'upload', '🔍': 'search', '✕': 'close',
      '✅': 'success', '⚠️': 'warning', '❌': 'error', 'ℹ️': 'info',
      '🔒': 'lock', '🔓': 'unlock', '🌙': 'moon', '☀️': 'sun', '🔔': 'bell',
      '◧': 'qrCode', '📍': 'location', '🔑': 'fingerprint', '📅': 'calendar',
      '👨‍🏫': 'lecture', '🎓': 'student', '🔐': 'admin', '👥': 'ta',
      '⏱️': 'sessions', '🔄': 'refresh', '🔍': 'filter', '📤': 'export',
      '🖨️': 'print', '📧': 'email', '📞': 'phone', '⭐': 'star'
    };
    
    // Find elements with emojis
    const elements = container.querySelectorAll('.nav-icon, .role-icon, .tb-btn, .btn, .stat-label, .course-code, .badge, .nav-item, .sidebar-nav .nav-item span');
    
    for (const el of elements) {
      const text = el.textContent || '';
      let hasReplacement = false;
      
      for (const [emoji, iconName] of Object.entries(mapping)) {
        if (text.includes(emoji) && !el.querySelector('svg, .icon-wrapper')) {
          const newText = text.replace(new RegExp(emoji, 'g'), '').trim();
          const icon = await createIcon(iconName, { size: 16 });
          
          // Clear and rebuild
          el.innerHTML = '';
          el.appendChild(icon);
          if (newText) {
            const textNode = document.createTextNode(' ' + newText);
            el.appendChild(textNode);
          }
          hasReplacement = true;
          break;
        }
      }
      
      // If no emoji replacement but has text and no icon, add appropriate icon based on class
      if (!hasReplacement && !el.querySelector('svg, .icon-wrapper') && text.trim()) {
        const parentClass = el.closest('.nav-item')?.getAttribute('data-tab');
        if (parentClass && icons[parentClass]) {
          const icon = await createIcon(parentClass, { size: 16 });
          const textNode = document.createTextNode(' ' + text);
          el.innerHTML = '';
          el.appendChild(icon);
          el.appendChild(textNode);
        }
      }
    }
    
    // Replace role card emojis
    const roleIcons = container.querySelectorAll('.role-icon');
    const roleMapping = { '👨‍🏫': 'lecture', '🎓': 'student', '🔐': 'admin' };
    
    for (const el of roleIcons) {
      const text = el.textContent || '';
      for (const [emoji, iconName] of Object.entries(roleMapping)) {
        if (text === emoji || text.includes(emoji)) {
          el.innerHTML = '';
          const icon = await createIcon(iconName, { size: 48 });
          el.appendChild(icon);
          break;
        }
      }
    }
    
    // Update topbar buttons
    const topbarBtns = container.querySelectorAll('.tb-btn');
    for (const btn of topbarBtns) {
      const text = btn.textContent || '';
      if ((text === 'Sign out' || text === 'Logout') && !btn.querySelector('svg')) {
        const icon = await createIcon('logout', { size: 14 });
        btn.insertBefore(icon, btn.firstChild);
      }
    }
  };
  
  // Update all logos to use uo_ghana.png
  const updateLogos = () => {
    // Topbar logos
    document.querySelectorAll('.topbar-logo-container').forEach(container => {
      const existingImg = container.querySelector('img');
      if (!existingImg || !existingImg.src?.includes('uo_ghana.png')) {
        container.innerHTML = '';
        container.appendChild(getLogo({ className: 'topbar-logo', width: 40, height: 40 }));
      }
    });
    
    // Auth page logos
    document.querySelectorAll('.auth-logo').forEach(container => {
      const existingImg = container.querySelector('img');
      if (!existingImg || !existingImg.src?.includes('uo_ghana.png')) {
        container.innerHTML = '';
        container.appendChild(getLogo({ className: 'auth-ug-logo', width: 80, height: 80 }));
      }
    });
    
    // Landing page logo
    const landingLogo = document.querySelector('.land-wrap .ug-logo');
    if (landingLogo && (!landingLogo.src || !landingLogo.src.includes('uo_ghana.png'))) {
      const newLogo = getLogo({ className: 'ug-logo', width: 86, height: 86 });
      landingLogo.parentNode?.replaceChild(newLogo, landingLogo);
    }
  };
  
  // Add CSS styles
  const addStyles = () => {
    if (document.getElementById('icon-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'icon-styles';
    style.textContent = `
      /* Logo styles */
      .ug-logo-img {
        object-fit: contain;
        display: block;
      }
      .topbar-logo { height: 40px; width: auto; }
      .auth-ug-logo { height: 80px; width: auto; margin: 0 auto; display: block; }
      .ug-logo { height: 86px; width: auto; margin-bottom: 14px; }
      
      /* Icon wrapper styles */
      .icon-wrapper {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        vertical-align: middle;
        flex-shrink: 0;
      }
      
      .icon-wrapper svg {
        width: 100%;
        height: 100%;
        stroke-width: 2;
        stroke: currentColor;
        fill: none;
      }
      
      /* Navigation icon styles */
      .nav-icon {
        width: 24px;
        height: 24px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      
      .nav-icon .icon-wrapper {
        width: 20px;
        height: 20px;
      }
      
      /* Role card icon styles */
      .role-icon {
        width: 48px;
        height: 48px;
        margin: 0 auto 12px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .role-icon .icon-wrapper {
        width: 48px;
        height: 48px;
      }
      
      /* Icon button styles */
      .icon-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: none;
        border: none;
        cursor: pointer;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s ease;
      }
      
      .icon-btn-primary {
        background: var(--ug, #003087);
        color: white;
      }
      
      .icon-btn-primary:hover {
        background: var(--ug-d, #001f5c);
        opacity: 0.9;
      }
      
      .icon-btn-secondary {
        background: var(--surface2, #f0f2f5);
        color: var(--text, #0d1117);
      }
      
      .icon-btn-secondary:hover {
        background: var(--border, #dde1ea);
      }
      
      .icon-btn-danger {
        background: var(--danger-s, #fceaea);
        color: var(--danger, #d42b2b);
      }
      
      .icon-btn-danger:hover {
        background: var(--danger, #d42b2b);
        color: white;
      }
      
      .icon-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      .icon-btn .btn-label {
        margin: 0;
      }
      
      /* Status icon colors */
      .icon-success { color: var(--teal, #1d9e75); }
      .icon-warning { color: var(--amber, #b8860b); }
      .icon-error { color: var(--danger, #d42b2b); }
      .icon-info { color: var(--ug, #003087); }
      
      /* Fallback styles */
      .icon-fallback {
        font-family: system-ui, -apple-system, sans-serif;
        font-size: inherit;
      }
      
      .logo-fallback {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--ug, #003087);
        color: var(--gold, #FCD116);
        font-weight: bold;
        font-size: 18px;
        border-radius: 8px;
      }
      
      /* Topbar adjustments */
      .topbar-logo-container {
        display: flex;
        align-items: center;
        flex-shrink: 0;
      }
      
      .topbar-right {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      
      /* Auth card logo centering */
      .auth-logo {
        text-align: center;
        margin-bottom: 20px;
      }
    `;
    document.head.appendChild(style);
  };
  
  // Initialize the icon system
  const init = async () => {
    console.log('[ICON] Initializing with Lucide icons (https://lucide.dev)');
    addStyles();
    updateLogos();
    
    try {
      await loadLucide();
      console.log('[ICON] Lucide loaded successfully');
      
      // Small delay to ensure DOM is ready
      setTimeout(async () => {
        await replaceEmojis();
        
        // Create icons in any existing Lucide elements
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
          lucide.createIcons();
        }
      }, 100);
    } catch (err) {
      console.warn('[ICON] Lucide failed to load, using emoji fallbacks');
    }
    
    // Watch for dynamically added content
    const observer = new MutationObserver(async (mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              await replaceEmojis(node);
              updateLogos();
              
              // Create icons in new content
              if (typeof lucide !== 'undefined' && lucide.createIcons) {
                const svgElements = node.querySelectorAll ? node.querySelectorAll('[data-lucide]') : [];
                if (svgElements.length > 0) {
                  lucide.createIcons({ icons: svgElements });
                }
              }
            }
          }
        }
      }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
  };
  
  // Public API
  return {
    init,
    createIcon,
    createIconButton,
    getLogo,
    icons,
    loadLucide,
    replaceEmojis,
    updateLogos
  };
})();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ICON.init());
} else {
  ICON.init();
}

// Make globally available
window.ICON = ICON;
