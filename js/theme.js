/* ============================================
   theme.js — Dark/light mode, persisted
   Fixed: Ensures theme buttons work on all dashboards
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
      // Only update if the button doesn't have custom text
      if (btn.textContent.trim().length <= 2 || btn.textContent.trim() === '🌙' || btn.textContent.trim() === '☀️') {
        btn.textContent = icon;
      }
    });
    
    // Update meta theme color
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
    
    // Set up observer to catch dynamically added theme buttons
    setupThemeButtonObserver();
  }
  
  function setupThemeButtonObserver() {
    // Watch for new theme buttons that might be added dynamically
    const observer = new MutationObserver(() => {
      const currentTheme = HTML.getAttribute('data-theme') || 'light';
      const icon = currentTheme === 'dark' ? '☀️' : '🌙';
      const buttons = document.querySelectorAll('.theme-btn, .theme-fab');
      buttons.forEach(btn => {
        if (btn.textContent.trim().length <= 2 || btn.textContent.trim() === '🌙' || btn.textContent.trim() === '☀️') {
          btn.textContent = icon;
        }
      });
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
  }
  
  function toggle() {
    const current = HTML.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    apply(next);
    
    // Show feedback to user
    console.log('[THEME] Toggled to:', next);
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

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => THEME.init());
} else {
  THEME.init();
}
