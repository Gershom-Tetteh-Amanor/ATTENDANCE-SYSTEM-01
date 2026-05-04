/* ui.js — DOM helpers, shared utilities, hamburger menu, and performance optimizations */
'use strict';

const UI = (() => {
  const Q = id => document.getElementById(id);

  function setAlert(id, msg, type='err') { 
    const el=Q(id); 
    if(!el)return; 
    el.innerHTML=msg; 
    el.className=`alert alert-${type} show`; 
  }
  
  const clrAlert = id => { 
    const el=Q(id); 
    if(el) el.className='alert'; 
  };

  function btnLoad(id, loading, label) {
    const b=Q(id); 
    if(!b)return; 
    b.disabled=loading;
    if(loading){
      b.dataset.orig=b.textContent;
      b.innerHTML='<span class="spin"></span>Please wait…';
    } else {
      b.textContent=label||b.dataset.orig||'Submit';
    }
  }

  function tgEye(inputId, btn) { 
    const el=Q(inputId); 
    if(!el)return; 
    el.type=el.type==='password'?'text':'password'; 
    btn.textContent=el.type==='password'?'👁':'🙈'; 
  }

  function fillDeptSelect(selId) {
    const sel=Q(selId); 
    if(!sel)return;
    sel.innerHTML='<option value="">Select department…</option>'+CONFIG.DEPARTMENTS.map(d=>`<option value="${d}">${d}</option>`).join('');
  }

  function fmtDur(m) { 
    if(m<60) return `${m} min`; 
    const h=Math.floor(m/60),r=m%60; 
    return r?`${h}h ${r}min`:`${h}h`; 
  }
  
  const todayStr = () => new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  const nowTime  = () => new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const pad      = n  => String(n).padStart(2,'0');
  const esc      = s  => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const b64e = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  const b64d = s => { 
    s=s.replace(/-/g,'+').replace(/_/g,'/'); 
    while(s.length%4)s+='='; 
    return decodeURIComponent(escape(atob(s))); 
  };

  function hashPw(pw) {
    let h1=0x811c9dc5,h2=0x6b3a9559;
    for(let i=0;i<pw.length;i++){const c=pw.charCodeAt(i);h1^=c;h1=Math.imul(h1,0x01000193)>>>0;h2^=c;h2=Math.imul(h2,0x00000193)>>>0;}
    for(let i=pw.length-1;i>=0;i--){const c=pw.charCodeAt(i);h1^=(c<<5)^h2;h1=Math.imul(h1,0x01000193)>>>0;h2^=(c<<3)^h1;h2=Math.imul(h2,0x00000193)>>>0;}
    return(h1>>>0).toString(16).padStart(8,'0')+(h2>>>0).toString(16).padStart(8,'0');
  }

  function makeToken(len=16) { 
    const b=crypto.getRandomValues(new Uint8Array(len)); 
    return Array.from(b).map(x=>x.toString(16).padStart(2,'0')).join(''); 
  }
  
  function makeCode() { 
    const C='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',b=crypto.getRandomValues(new Uint8Array(6)); 
    return Array.from(b).map(x=>C[x%C.length]).join(''); 
  }
  
  function makeLecUID() { 
    const C='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',b=crypto.getRandomValues(new Uint8Array(10)); 
    return 'LEC-'+Array.from(b).map(x=>C[x%32]).join(''); 
  }

  function haversine(lat1,lng1,lat2,lng2) {
    const R=6371000,dLt=(lat2-lat1)*Math.PI/180,dLg=(lng2-lng1)*Math.PI/180;
    const a=Math.sin(dLt/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLg/2)**2;
    return Math.round(R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)));
  }

  function dlCSV(rows, filename) {
    const csv=rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const a=document.createElement('a'); 
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    a.download=filename.replace(/[^a-zA-Z0-9_-]/g,'_')+'.csv'; 
    a.click(); 
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  const isLecEmail = e => e.endsWith('.ug.edu.gh') || e.endsWith('@ug.edu.gh');
  const isTAEmail  = e => e.endsWith('@st.ug.edu.gh');

  function sanitizeKey(str) {
    return String(str).replace(/[.#$[\]/]/g, '_');
  }

  // ==================== PERFORMANCE UTILITIES ====================
  
  // Debounce function for search inputs and frequent events
  function debounce(func, wait, immediate = false) {
    let timeout;
    return function executedFunction(...args) {
      const context = this;
      const later = () => {
        timeout = null;
        if (!immediate) func.apply(context, args);
      };
      const callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) func.apply(context, args);
    };
  }
  
  // Throttle function for scroll and resize events
  function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
  
  // Rate limiter for API calls
  class RateLimiter {
    constructor(maxRequests = 20, timeWindow = 60000) {
      this.maxRequests = maxRequests;
      this.timeWindow = timeWindow;
      this.requests = [];
    }
    
    canMakeRequest() {
      const now = Date.now();
      this.requests = this.requests.filter(timestamp => now - timestamp < this.timeWindow);
      
      if (this.requests.length < this.maxRequests) {
        this.requests.push(now);
        return true;
      }
      return false;
    }
    
    async execute(fn, fallbackValue = null) {
      if (this.canMakeRequest()) {
        return await fn();
      }
      console.warn('[RateLimiter] Rate limit exceeded');
      return fallbackValue;
    }
    
    reset() {
      this.requests = [];
    }
  }
  
  // Create global rate limiters
  const rateLimiters = {
    search: new RateLimiter(10, 60000),    // 10 searches per minute
    export: new RateLimiter(5, 60000),     // 5 exports per minute
    filter: new RateLimiter(30, 60000),    // 30 filters per minute
    checkin: new RateLimiter(3, 60000)     // 3 check-ins per minute
  };
  
  // Loading skeleton generator
  function showSkeleton(container, type = 'card', count = 3) {
    if (!container) return;
    
    const skeletons = {
      card: `
        <div class="skeleton-card" style="background: var(--surface); border-radius: 16px; padding: 20px; border: 1px solid var(--border);">
          <div class="skeleton" style="height: 20px; width: 60%; margin-bottom: 12px;"></div>
          <div class="skeleton" style="height: 14px; width: 40%; margin-bottom: 8px;"></div>
          <div class="skeleton" style="height: 14px; width: 80%;"></div>
        </div>
      `,
      table: `
        <div class="skeleton-table" style="width: 100%;">
          <div class="skeleton" style="height: 40px; width: 100%; margin-bottom: 8px;"></div>
          ${Array(5).fill().map(() => `<div class="skeleton" style="height: 30px; width: 100%; margin-bottom: 4px;"></div>`).join('')}
        </div>
      `,
      list: `
        <div class="skeleton-list">
          ${Array(count).fill().map(() => `
            <div style="display: flex; gap: 12px; padding: 12px; border-bottom: 1px solid var(--border);">
              <div class="skeleton" style="width: 40px; height: 40px; border-radius: 50%;"></div>
              <div style="flex: 1;">
                <div class="skeleton" style="height: 16px; width: 60%; margin-bottom: 8px;"></div>
                <div class="skeleton" style="height: 12px; width: 80%;"></div>
              </div>
            </div>
          `).join('')}
        </div>
      `,
      stats: `
        <div class="stats-grid" style="margin-bottom: 20px;">
          ${Array(4).fill().map(() => `
            <div class="stat-card">
              <div class="skeleton" style="height: 32px; width: 50%; margin: 0 auto;"></div>
              <div class="skeleton" style="height: 12px; width: 70%; margin: 8px auto 0;"></div>
            </div>
          `).join('')}
        </div>
      `
    };
    
    const skeletonHtml = skeletons[type] || skeletons.card;
    container.innerHTML = `<div class="skeleton-wrapper">${Array(count).fill(skeletonHtml).join('')}</div>`;
  }
  
  function hideSkeleton(container) {
    if (container && container.classList) {
      container.classList.add('skeleton-hidden');
    }
  }
  
  // Add skeleton styles to document if not already present
  function addSkeletonStyles() {
    if (document.getElementById('skeleton-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'skeleton-styles';
    style.textContent = `
      .skeleton {
        background: linear-gradient(90deg, var(--surface2) 25%, var(--surface) 50%, var(--surface2) 75%);
        background-size: 200% 100%;
        animation: skeleton-loading 1.5s infinite;
        border-radius: 4px;
      }
      
      [data-theme="dark"] .skeleton {
        background: linear-gradient(90deg, #2a2a2a 25%, #3a3a3a 50%, #2a2a2a 75%);
        background-size: 200% 100%;
      }
      
      @keyframes skeleton-loading {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      
      .skeleton-wrapper {
        opacity: 1;
        transition: opacity 0.3s ease;
      }
      
      .skeleton-hidden {
        opacity: 0;
      }
      
      .skeleton-card, .skeleton-table, .skeleton-list {
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }
  
  // Toast notification (lightweight alternative to modal for non-critical messages)
  function showToast(message, type = 'info', duration = 3000) {
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-icon">${type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️')}</span>
        <span class="toast-message">${message}</span>
      </div>
    `;
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 10000;
      background: var(--surface);
      border-radius: 8px;
      padding: 12px 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      border-left: 4px solid ${type === 'success' ? 'var(--teal)' : (type === 'error' ? 'var(--danger)' : 'var(--ug)')};
      animation: slideInRight 0.3s ease;
      max-width: 350px;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideOutRight 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
  
  // Add toast animations to document
  function addToastStyles() {
    if (document.getElementById('toast-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
      @keyframes slideInRight {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      
      @keyframes slideOutRight {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(100%);
          opacity: 0;
        }
      }
      
      .toast-notification {
        font-family: system-ui, -apple-system, sans-serif;
      }
      
      .toast-content {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .toast-icon {
        font-size: 16px;
      }
      
      .toast-message {
        font-size: 13px;
        color: var(--text);
      }
    `;
    document.head.appendChild(style);
  }
  
  // Lazy load images
  function lazyLoadImages() {
    const images = document.querySelectorAll('img[data-src]');
    const imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          observer.unobserve(img);
        }
      });
    });
    
    images.forEach(img => imageObserver.observe(img));
  }
  
  // Virtual scroll helper for large lists
  class VirtualScroll {
    constructor(container, items, renderItem, itemHeight = 80, buffer = 5) {
      this.container = container;
      this.items = items;
      this.renderItem = renderItem;
      this.itemHeight = itemHeight;
      this.buffer = buffer;
      this.scrollTop = 0;
      this.containerHeight = container.clientHeight;
      this.visibleCount = Math.ceil(this.containerHeight / itemHeight) + buffer * 2;
      
      this.container.addEventListener('scroll', throttle(() => this.onScroll(), 16));
      window.addEventListener('resize', throttle(() => this.onResize(), 100));
      this.render();
    }
    
    onScroll() {
      this.scrollTop = this.container.scrollTop;
      this.render();
    }
    
    onResize() {
      this.containerHeight = this.container.clientHeight;
      this.visibleCount = Math.ceil(this.containerHeight / this.itemHeight) + this.buffer * 2;
      this.render();
    }
    
    render() {
      const startIndex = Math.max(0, Math.floor(this.scrollTop / this.itemHeight) - this.buffer);
      const endIndex = Math.min(this.items.length, startIndex + this.visibleCount);
      const visibleItems = this.items.slice(startIndex, endIndex);
      const offsetY = startIndex * this.itemHeight;
      
      this.container.innerHTML = `
        <div style="height: ${this.items.length * this.itemHeight}px; position: relative;">
          <div style="transform: translateY(${offsetY}px);">
            ${visibleItems.map((item, i) => this.renderItem(item, startIndex + i)).join('')}
          </div>
        </div>
      `;
    }
    
    updateItems(newItems) {
      this.items = newItems;
      this.render();
    }
  }

  // ==================== HAMBURGER MENU ====================
  let sidebarOpen = true;
  
  function initHamburger() {
    addSkeletonStyles();
    addToastStyles();
    
    if (!document.querySelector('.hamburger-btn')) {
      const topbar = document.querySelector('.topbar');
      if (topbar) {
        const hamburger = document.createElement('button');
        hamburger.className = 'hamburger-btn';
        hamburger.innerHTML = '☰';
        hamburger.onclick = toggleSidebar;
        const logoContainer = topbar.querySelector('.topbar-logo-container');
        if (logoContainer) {
          topbar.insertBefore(hamburger, logoContainer.nextSibling);
        } else {
          topbar.insertBefore(hamburger, topbar.firstChild);
        }
      }
    }
    
    addResponsiveStyles();
  }
  
  function toggleSidebar() {
    const sidebar = document.querySelector('.dashboard-grid .sidebar');
    const mainContent = document.querySelector('.dashboard-grid .main-content');
    const hamburger = document.querySelector('.hamburger-btn');
    
    if (sidebar) {
      sidebarOpen = !sidebarOpen;
      
      if (sidebarOpen) {
        sidebar.style.display = 'block';
        if (mainContent) mainContent.style.marginLeft = '0';
        if (hamburger) hamburger.innerHTML = '☰';
      } else {
        sidebar.style.display = 'none';
        if (mainContent) mainContent.style.marginLeft = '0';
        if (hamburger) hamburger.innerHTML = '☰';
      }
      
      localStorage.setItem('sidebar_open', sidebarOpen);
    }
  }
  
  function restoreSidebarState() {
    const saved = localStorage.getItem('sidebar_open');
    if (saved !== null) {
      sidebarOpen = saved === 'true';
      const sidebar = document.querySelector('.dashboard-grid .sidebar');
      const hamburger = document.querySelector('.hamburger-btn');
      
      if (sidebar && !sidebarOpen) {
        sidebar.style.display = 'none';
        if (hamburger) hamburger.innerHTML = '☰';
      }
    }
  }
  
  function addResponsiveStyles() {
    if (document.getElementById('responsive-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'responsive-styles';
    style.textContent = `
      .hamburger-btn {
        display: none;
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: white;
        padding: 8px 12px;
        border-radius: 8px;
        transition: background 0.2s;
      }
      .hamburger-btn:hover {
        background: rgba(255,255,255,0.15);
      }
      @media (max-width: 768px) {
        .hamburger-btn {
          display: block;
        }
        .dashboard-grid {
          grid-template-columns: 1fr !important;
        }
        .dashboard-grid .sidebar {
          position: fixed;
          left: 0;
          top: 60px;
          width: 280px;
          height: calc(100vh - 60px);
          z-index: 1000;
          transform: translateX(-100%);
          transition: transform 0.3s ease;
          display: block !important;
        }
        .dashboard-grid .sidebar.open {
          transform: translateX(0);
        }
        .dashboard-grid .main-content {
          width: 100%;
          padding: 16px;
        }
        .stats-grid {
          grid-template-columns: repeat(2, 1fr) !important;
          gap: 12px !important;
        }
        .courses-grid {
          grid-template-columns: 1fr !important;
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  function mobileOpenSidebar() {
    const sidebar = document.querySelector('.dashboard-grid .sidebar');
    if (sidebar && window.innerWidth <= 768) {
      sidebar.classList.add('open');
    }
  }
  
  function mobileCloseSidebar() {
    const sidebar = document.querySelector('.dashboard-grid .sidebar');
    if (sidebar && window.innerWidth <= 768) {
      sidebar.classList.remove('open');
    }
  }
  
  // Performance: Batch DOM updates
  function batchDOMUpdates(updates) {
    // Use requestAnimationFrame to batch DOM updates
    requestAnimationFrame(() => {
      updates.forEach(update => update());
    });
  }
  
  // Performance: Cache DOM queries
  class DOMCache {
    constructor() {
      this.cache = new Map();
    }
    
    get(selector, parent = document) {
      if (!this.cache.has(selector)) {
        this.cache.set(selector, parent.querySelector(selector));
      }
      return this.cache.get(selector);
    }
    
    getAll(selector, parent = document) {
      const key = `all_${selector}`;
      if (!this.cache.has(key)) {
        this.cache.set(key, parent.querySelectorAll(selector));
      }
      return this.cache.get(key);
    }
    
    invalidate(selector) {
      this.cache.delete(selector);
      this.cache.delete(`all_${selector}`);
    }
    
    clear() {
      this.cache.clear();
    }
  }
  
  const domCache = new DOMCache();
  
  // Preload critical assets
  function preloadAssets(assets) {
    assets.forEach(asset => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = asset.type;
      link.href = asset.url;
      document.head.appendChild(link);
    });
  }
  
  // Monitor performance
  function monitorPerformance() {
    if (typeof performance !== 'undefined') {
      const navigationTiming = performance.getEntriesByType('navigation')[0];
      if (navigationTiming) {
        console.log(`[Performance] Page load: ${navigationTiming.loadEventEnd - navigationTiming.fetchStart}ms`);
      }
      
      // Log Firebase operations if being monitored
      if (typeof DB !== 'undefined') {
        const originalGet = DB.get;
        DB.get = async function(...args) {
          const start = performance.now();
          const result = await originalGet.apply(this, args);
          const end = performance.now();
          if (end - start > 1000) {
            console.warn(`[Performance] Slow DB.get: ${end - start}ms for ${args[0]}`);
          }
          return result;
        };
      }
    }
  }
  
  // Initialize performance monitoring on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', monitorPerformance);
  } else {
    monitorPerformance();
  }

  return { 
    Q, 
    setAlert, 
    clrAlert, 
    btnLoad, 
    tgEye, 
    fillDeptSelect, 
    fmtDur, 
    todayStr, 
    nowTime, 
    pad, 
    esc, 
    b64e, 
    b64d, 
    hashPw, 
    makeToken, 
    makeCode, 
    makeLecUID, 
    haversine, 
    dlCSV, 
    isLecEmail, 
    isTAEmail, 
    sanitizeKey, 
    initHamburger, 
    toggleSidebar, 
    restoreSidebarState,
    mobileOpenSidebar, 
    mobileCloseSidebar,
    // New performance utilities
    debounce,
    throttle,
    rateLimiters,
    showSkeleton,
    hideSkeleton,
    showToast,
    lazyLoadImages,
    VirtualScroll,
    batchDOMUpdates,
    domCache,
    preloadAssets
  };
})();

// Make globally available
window.UI = UI;
console.log('[UI] Loaded with performance optimizations');
