/* ============================================
   theme.js — Dark/light mode, persisted
   FIXED: Removed MutationObserver that caused freezing
   ============================================ */
'use strict';

const THEME = (() => {
  const HTML = document.documentElement;
  
  function apply(t) {
    HTML.setAttribute('data-theme', t);
    localStorage.setItem(CONFIG.KEYS.THEME, t);
    
    // Update all theme toggle buttons (both theme-btn and theme-fab)
    const icon = t === 'dark' ? '☀️' : '🌙';
    const allThemeButtons = document.querySelectorAll('.theme-btn, .theme-fab');
    allThemeButtons.forEach(btn => { 
      // Only update if the button has default text (🌙 or ☀️) or is empty/short
      const btnText = btn.textContent.trim();
      if (btnText === '🌙' || btnText === '☀️' || btnText.length <= 2) {
        btn.textContent = icon;
      }
    });
    
    // Update meta theme color for browser UI
    const meta = document.getElementById('theme-color-meta');
    if (meta) {
      meta.content = t === 'dark' ? '#0d1117' : '#003087';
    }
    
    console.log('[THEME] Applied theme:', t);
  }
  
  function init() {
    const saved = localStorage.getItem(CONFIG.KEYS.THEME);
    const pref = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const themeToApply = saved || pref;
    apply(themeToApply);
  }
  
  function toggle() {
    const current = HTML.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    apply(next);
  }
  
  function set(t) {
    apply(t);
  }
  
  function get() {
    return HTML.getAttribute('data-theme') || 'light';
  }
  
  return {
    init,
    toggle,
    set,
    get,
  };
})();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => THEME.init());
} else {
  THEME.init();
}
