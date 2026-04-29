/* ============================================
   ui.js — DOM helpers, shared utilities, and hamburger menu
   ============================================ */
'use strict';

const UI = (() => {
  const Q = id => document.getElementById(id);

  function setAlert(id, msg, type='err') { const el=Q(id); if(!el)return; el.innerHTML=msg; el.className=`alert alert-${type} show`; }
  const clrAlert = id => { const el=Q(id); if(el) el.className='alert'; };

  function btnLoad(id, loading, label) {
    const b=Q(id); if(!b)return; b.disabled=loading;
    if(loading){b.dataset.orig=b.textContent;b.innerHTML='<span class="spin"></span>Please wait…';}
    else{b.textContent=label||b.dataset.orig||'Submit';}
  }

  function tgEye(inputId, btn) { const el=Q(inputId); if(!el)return; el.type=el.type==='password'?'text':'password'; btn.textContent=el.type==='password'?'👁':'🙈'; }

  function fillDeptSelect(selId) {
    const sel=Q(selId); if(!sel)return;
    sel.innerHTML='<option value="">Select department…</option>'+CONFIG.DEPARTMENTS.map(d=>`<option value="${d}">${d}</option>`).join('');
  }

  function fmtDur(m) { if(m<60)return`${m} min`; const h=Math.floor(m/60),r=m%60; return r?`${h}h ${r}min`:`${h}h`; }
  const todayStr = () => new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  const nowTime  = () => new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const pad      = n  => String(n).padStart(2,'0');
  const esc      = s  => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const b64e = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  const b64d = s => { s=s.replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4)s+='='; return decodeURIComponent(escape(atob(s))); };

  function hashPw(pw) {
    let h1=0x811c9dc5,h2=0x6b3a9559;
    for(let i=0;i<pw.length;i++){const c=pw.charCodeAt(i);h1^=c;h1=Math.imul(h1,0x01000193)>>>0;h2^=c;h2=Math.imul(h2,0x00000193)>>>0;}
    for(let i=pw.length-1;i>=0;i--){const c=pw.charCodeAt(i);h1^=(c<<5)^h2;h1=Math.imul(h1,0x01000193)>>>0;h2^=(c<<3)^h1;h2=Math.imul(h2,0x00000193)>>>0;}
    return(h1>>>0).toString(16).padStart(8,'0')+(h2>>>0).toString(16).padStart(8,'0');
  }

  function makeToken(len=16) { const b=crypto.getRandomValues(new Uint8Array(len)); return Array.from(b).map(x=>x.toString(16).padStart(2,'0')).join(''); }
  function makeCode() { const C='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',b=crypto.getRandomValues(new Uint8Array(6)); return Array.from(b).map(x=>C[x%C.length]).join(''); }
  function makeLecUID() { const C='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',b=crypto.getRandomValues(new Uint8Array(10)); return 'LEC-'+Array.from(b).map(x=>C[x%32]).join(''); }

  function haversine(lat1,lng1,lat2,lng2) {
    const R=6371000,dLt=(lat2-lat1)*Math.PI/180,dLg=(lng2-lng1)*Math.PI/180;
    const a=Math.sin(dLt/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLg/2)**2;
    return Math.round(R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)));
  }

  function dlCSV(rows, filename) {
    const csv=rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    a.download=filename.replace(/[^a-zA-Z0-9_-]/g,'_')+'.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  const isLecEmail = e => e.endsWith('.ug.edu.gh') || e.endsWith('@ug.edu.gh');
  const isTAEmail  = e => e.endsWith('@st.ug.edu.gh');

  function sanitizeKey(str) {
    return String(str).replace(/[.#$[\]/]/g, '_');
  }

  // Hamburger menu functionality
  let sidebarOpen = true;
  
  function initHamburger() {
    // Create hamburger button if not exists
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
    
    // Add responsive styles
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
      
      // Save state
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
  
  // Mobile sidebar open
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

  return { 
    Q, setAlert, clrAlert, btnLoad, tgEye, fillDeptSelect, fmtDur, 
    todayStr, nowTime, pad, esc, b64e, b64d, hashPw, makeToken, 
    makeCode, makeLecUID, haversine, dlCSV, isLecEmail, isTAEmail, 
    sanitizeKey, initHamburger, toggleSidebar, restoreSidebarState,
    mobileOpenSidebar, mobileCloseSidebar
  };
})();
