/* ============================================
   theme.js — Dark/light mode
   SIMPLIFIED VERSION - No freezing
   ============================================ */

(function() {
  'use strict';
  
  // Get the HTML element
  const htmlElement = document.documentElement;
  
  // Function to apply theme
  function applyTheme(theme) {
    if (theme === 'dark') {
      htmlElement.setAttribute('data-theme', 'dark');
    } else {
      htmlElement.setAttribute('data-theme', 'light');
    }
    
    // Save to localStorage
    localStorage.setItem('ugqr7_theme', theme);
    
    // Update all theme buttons on the page
    const buttons = document.querySelectorAll('.theme-btn, .theme-fab');
    const icon = theme === 'dark' ? '☀️' : '🌙';
    
    buttons.forEach(function(btn) {
      btn.textContent = icon;
    });
    
    // Update meta theme color
    const meta = document.getElementById('theme-color-meta');
    if (meta) {
      meta.content = theme === 'dark' ? '#0d1117' : '#003087';
    }
    
    console.log('[THEME] Theme set to:', theme);
  }
  
  // Function to toggle theme
  function toggleTheme() {
    const currentTheme = htmlElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
  }
  
  // Initialize theme on page load
  function initTheme() {
    // Check for saved theme
    let savedTheme = localStorage.getItem('ugqr7_theme');
    
    // If no saved theme, check system preference
    if (!savedTheme) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      savedTheme = prefersDark ? 'dark' : 'light';
    }
    
    // Apply the theme
    applyTheme(savedTheme);
  }
  
  // Make toggle function available globally
  window.THEME = {
    toggle: toggleTheme,
    init: initTheme,
    set: applyTheme,
    get: function() { return htmlElement.getAttribute('data-theme') || 'light'; }
  };
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTheme);
  } else {
    initTheme();
  }
})();
