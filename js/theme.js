/* ============================================
   theme.js — Dark/light mode, persisted
   ============================================ */
'use strict';

const THEME = (() => {
  const HTML = document.documentElement;
  function apply(t) {
    HTML.setAttribute('data-theme', t);
    localStorage.setItem(CONFIG.KEYS.THEME, t);
    const icon = t === 'dark' ? '☀️' : '🌙';
    document.querySelectorAll('.theme-btn,.theme-fab').forEach(b => { if (b.textContent.trim().length <= 2) b.textContent = icon; });
    const meta = document.getElementById('theme-color-meta');
    if (meta) meta.content = t === 'dark' ? '#18181b' : '#006b3f';
  }
  function init() {
    const saved = localStorage.getItem(CONFIG.KEYS.THEME);
    const pref  = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    apply(saved || pref);
  }
  return {
    init,
    toggle: () => apply(HTML.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'),
    set:    t  => apply(t),
    get:    () => HTML.getAttribute('data-theme') || 'light',
  };
})();
