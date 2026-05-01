/* ============================================
   modal.js — Custom pop-up system
   Replaces ALL browser alert / confirm / prompt.
   FIXED: Close on outside click, Escape key, and auto-close for alerts
   ============================================ */
'use strict';

const MODAL = (() => {
  const $ = id => document.getElementById(id);
  let _esc = null;
  let _previousFocus = null;
  let _currentOverlay = null;
  let _autoCloseTimer = null;

  // Add modal scroll styles to document
  function addModalStyles() {
    if (document.getElementById('modal-scroll-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'modal-scroll-styles';
    style.textContent = `
      .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.55);
        z-index: 10000;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 20px;
        backdrop-filter: blur(3px);
        cursor: pointer;
      }
      
      .modal-overlay.open {
        display: flex;
        animation: fadeIn 0.15s ease;
      }
      
      .modal-box {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 24px 28px;
        max-width: 500px;
        width: 100%;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.22);
        animation: slideUp 0.18s ease;
        cursor: default;
      }
      
      .modal-scroll-content {
        overflow-y: auto;
        overflow-x: hidden;
        flex: 1;
        padding-right: 8px;
        margin-bottom: 16px;
        -webkit-overflow-scrolling: touch;
      }
      
      .modal-scroll-content::-webkit-scrollbar {
        width: 6px;
      }
      
      .modal-scroll-content::-webkit-scrollbar-track {
        background: var(--border2);
        border-radius: 3px;
      }
      
      .modal-scroll-content::-webkit-scrollbar-thumb {
        background: var(--ug);
        border-radius: 3px;
      }
      
      .modal-icon {
        font-size: 38px;
        text-align: center;
        margin-bottom: 10px;
        min-height: 46px;
        flex-shrink: 0;
      }
      
      .modal-title {
        font-size: 18px;
        font-weight: 600;
        text-align: center;
        margin-bottom: 12px;
        flex-shrink: 0;
      }
      
      .modal-inp {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid var(--border2);
        border-radius: 8px;
        font-size: 14px;
        background: var(--surface);
        color: var(--text);
        margin-bottom: 16px;
        flex-shrink: 0;
      }
      
      .modal-inp:focus {
        outline: none;
        border-color: var(--ug);
        box-shadow: 0 0 0 3px rgba(0, 107, 63, .1);
      }
      
      .modal-actions {
        display: flex;
        gap: 10px;
        justify-content: center;
        flex-wrap: wrap;
        flex-shrink: 0;
        margin-top: 8px;
      }
      
      .modal-actions .btn {
        flex: 1;
        min-width: 90px;
        max-width: 160px;
      }
      
      /* Success/Error animations */
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      @keyframes slideUp {
        from { transform: translateY(14px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      
      /* Responsive */
      @media (max-width: 768px) {
        .modal-box {
          padding: 20px 16px;
          max-height: 85vh;
        }
        
        .modal-scroll-content {
          max-height: calc(85vh - 140px);
        }
        
        .modal-icon {
          font-size: 32px;
        }
        
        .modal-title {
          font-size: 16px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function _show({ icon='', title='', msg='', actions=[], inp=false, placeholder='', defVal='', inpType='text', width='420px', autoClose = 0 }) {
    addModalStyles();
    
    // Clear any existing auto-close timer
    if (_autoCloseTimer) {
      clearTimeout(_autoCloseTimer);
      _autoCloseTimer = null;
    }
    
    _previousFocus = document.activeElement;
    
    const iconEl = $('modal-icon');
    if (iconEl) iconEl.innerHTML = icon;
    
    const titleEl = $('modal-title');
    if (titleEl) titleEl.textContent = title;
    
    const msgEl = $('modal-msg');
    if (msgEl) {
      msgEl.innerHTML = '';
      const scrollContainer = document.createElement('div');
      scrollContainer.className = 'modal-scroll-content';
      scrollContainer.innerHTML = msg;
      msgEl.appendChild(scrollContainer);
    }
    
    const actionsEl = $('modal-actions');
    if (actionsEl) actionsEl.innerHTML = '';
    
    const modalBox = document.querySelector('.modal-box');
    if (modalBox) modalBox.style.maxWidth = width;
    
    const inputEl = $('modal-input');
    if (inputEl) {
      if (inp) { 
        inputEl.type = inpType; 
        inputEl.placeholder = placeholder; 
        inputEl.value = defVal; 
        inputEl.style.display = 'block'; 
        setTimeout(() => {
          inputEl.focus();
          inputEl.select();
        }, 80);
      } else { 
        inputEl.style.display = 'none'; 
      }
    }
    
    if (actionsEl) {
      actions.forEach(({ label, cls, cb }) => {
        const btn = document.createElement('button');
        btn.className = 'btn ' + (cls || 'btn-secondary');
        btn.textContent = label;
        btn.onclick = (e) => {
          e.stopPropagation();
          if (cb) cb();
          close();
        };
        actionsEl.appendChild(btn);
      });
    }
    
    const overlay = $('modal-overlay');
    if (overlay) {
      _currentOverlay = overlay;
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
      
      // FIXED: Close when clicking on overlay background
      overlay.onclick = (e) => { 
        if (e.target === overlay) {
          console.log('[MODAL] Clicked outside - closing');
          close(); 
        } 
      };
    }
    
    // FIXED: Close on Escape key
    if (_esc) document.removeEventListener('keydown', _esc);
    _esc = (e) => { 
      if (e.key === 'Escape') {
        console.log('[MODAL] Escape key pressed - closing');
        close(); 
      } 
    };
    document.addEventListener('keydown', _esc);
    
    const firstFocusable = inp ? inputEl : actionsEl?.querySelector('button');
    if (firstFocusable) {
      setTimeout(() => firstFocusable.focus(), 100);
    }
    
    // Auto-close for success/error modals (3 seconds)
    if (autoClose > 0 && actions.length > 0) {
      console.log(`[MODAL] Auto-closing in ${autoClose/1000} seconds`);
      _autoCloseTimer = setTimeout(() => {
        console.log('[MODAL] Auto-closing modal');
        close();
      }, autoClose);
    }
  }

  function close() {
    console.log('[MODAL] Closing modal');
    
    // Clear auto-close timer
    if (_autoCloseTimer) {
      clearTimeout(_autoCloseTimer);
      _autoCloseTimer = null;
    }
    
    const overlay = $('modal-overlay');
    if (overlay) {
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.onclick = null;
    }
    
    if (_esc) { 
      document.removeEventListener('keydown', _esc); 
      _esc = null; 
    }
    
    // Clear modal content to prevent memory issues
    const msgEl = $('modal-msg');
    if (msgEl) msgEl.innerHTML = '';
    
    const actionsEl = $('modal-actions');
    if (actionsEl) actionsEl.innerHTML = '';
    
    const inputEl = $('modal-input');
    if (inputEl) inputEl.style.display = 'none';
    
    // Restore focus
    if (_previousFocus && _previousFocus.focus) {
      setTimeout(() => {
        try {
          _previousFocus.focus();
        } catch(e) {
          console.warn('[MODAL] Could not restore focus');
        }
        _previousFocus = null;
      }, 50);
    }
    
    _currentOverlay = null;
  }

  // Alert with auto-close
  const alert = (title, msg='', { icon='ℹ️', btnLabel='OK', btnCls='btn-ug', width='420px', autoClose = 3000 }={}) =>
    new Promise(res => _show({ 
      icon, title, msg, width, autoClose,
      actions:[{ label:btnLabel, cls:btnCls, cb:()=>{ res(); } }] 
    }));

  // Success - auto closes after 2 seconds
  const success = (title, msg='', autoCloseMs = 2000) => 
    alert(title, msg, { icon:'✅', btnLabel:'Got it!', btnCls:'btn-ug', width:'400px', autoClose: autoCloseMs });
  
  // Error - auto closes after 3 seconds
  const error = (title, msg='', autoCloseMs = 3000) => 
    alert(title, msg, { icon:'❌', btnLabel:'OK', btnCls:'btn-danger', width:'400px', autoClose: autoCloseMs });

  const confirm = (title, msg='', { icon='⚠️', confirmLabel='Confirm', cancelLabel='Cancel', confirmCls='btn-danger', width='450px', autoClose = 0 }={}) =>
    new Promise(res => _show({ icon, title, msg, width, autoClose, actions:[
      { label:cancelLabel,  cls:'btn-secondary', cb:()=>{ res(false); } },
      { label:confirmLabel, cls:confirmCls,       cb:()=>{ res(true);  } },
    ]}));

  const prompt = (title, msg='', { icon='📝', placeholder='', defVal='', confirmLabel='Submit', cancelLabel='Cancel', inpType='text', width='450px' }={}) =>
    new Promise(res => {
      _show({ icon, title, msg, inp:true, placeholder, defVal, inpType, width, actions:[
        { label:cancelLabel,  cls:'btn-secondary', cb:()=>{ res(null); } },
        { label:confirmLabel, cls:'btn-ug',         cb:()=>{ const v=$('modal-input')?.value?.trim()||''; res(v); } },
      ]});
      const input = $('modal-input');
      if (input) {
        input.onkeydown = e => { 
          if (e.key === 'Enter') { 
            const v = e.target.value.trim(); 
            close(); 
            res(v); 
          } 
        };
      }
    });

  function loading(msg='Please wait…', width='350px') {
    _show({ 
      icon:'<div style="width:40px;height:40px;border:3px solid var(--border2);border-top-color:var(--ug);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto"></div>', 
      title:msg, 
      msg:'', 
      width,
      actions:[],
      autoClose: 0
    });
  }

  // Force close any open modal (useful for error recovery)
  function forceClose() {
    console.log('[MODAL] Force closing any open modal');
    close();
  }

  return { alert, success, error, confirm, prompt, loading, close, forceClose };
})();
