/* ============================================
   modal.js — Custom pop-up system
   Replaces ALL browser alert / confirm / prompt.
   Uses CSS .open class (never inline style).
   FIXED: Scrollable content for desktop and mobile
   ============================================ */
'use strict';

const MODAL = (() => {
  const $ = id => document.getElementById(id);
  let _esc = null;
  let _previousFocus = null;

  // Add modal scroll styles to document
  function addModalStyles() {
    if (document.getElementById('modal-scroll-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'modal-scroll-styles';
    style.textContent = `
      /* Modal base styles */
      .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.55);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        backdrop-filter: blur(3px);
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
      }
      
      /* Scrollable content area */
      .modal-scroll-content {
        overflow-y: auto;
        overflow-x: hidden;
        flex: 1;
        padding-right: 8px;
        margin-bottom: 16px;
        -webkit-overflow-scrolling: touch;
      }
      
      /* Custom scrollbar for webkit browsers */
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
      
      .modal-scroll-content::-webkit-scrollbar-thumb:hover {
        background: var(--ug-d);
      }
      
      /* Modal header stays fixed */
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
      
      /* Input styling */
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
      
      /* Actions stay at bottom */
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
      
      /* Responsive adjustments */
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
          margin-bottom: 8px;
        }
        
        .modal-title {
          font-size: 16px;
          margin-bottom: 10px;
        }
        
        .modal-actions .btn {
          min-width: 80px;
          padding: 10px;
        }
      }
      
      @media (max-width: 480px) {
        .modal-box {
          padding: 16px 12px;
          max-height: 80vh;
        }
        
        .modal-actions {
          gap: 8px;
        }
        
        .modal-actions .btn {
          min-width: 70px;
          font-size: 13px;
          padding: 8px;
        }
      }
      
      /* Animation */
      @keyframes slideUp {
        from {
          transform: translateY(14px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
      
      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function _show({ icon='', title='', msg='', actions=[], inp=false, placeholder='', defVal='', inpType='text', width='420px' }) {
    // Add styles if not already added
    addModalStyles();
    
    // Store previously focused element
    _previousFocus = document.activeElement;
    
    // Set modal icon
    const iconEl = $('modal-icon');
    if (iconEl) iconEl.innerHTML = icon;
    
    // Set modal title
    const titleEl = $('modal-title');
    if (titleEl) titleEl.textContent = title;
    
    // Create scrollable content wrapper
    const msgEl = $('modal-msg');
    if (msgEl) {
      // Clear existing content
      msgEl.innerHTML = '';
      
      // Create scrollable container
      const scrollContainer = document.createElement('div');
      scrollContainer.className = 'modal-scroll-content';
      scrollContainer.innerHTML = msg;
      
      // Append to modal message container
      msgEl.appendChild(scrollContainer);
    }
    
    // Clear and rebuild actions
    const actionsEl = $('modal-actions');
    if (actionsEl) actionsEl.innerHTML = '';
    
    // Set modal width
    const modalBox = document.querySelector('.modal-box');
    if (modalBox) modalBox.style.maxWidth = width;
    
    // Handle input field
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
    
    // Add action buttons
    if (actionsEl) {
      actions.forEach(({ label, cls, cb }) => {
        const btn = document.createElement('button');
        btn.className = 'btn ' + (cls || 'btn-secondary');
        btn.textContent = label;
        btn.onclick = () => {
          cb();
          close();
        };
        actionsEl.appendChild(btn);
      });
    }
    
    // Show overlay
    const overlay = $('modal-overlay');
    if (overlay) {
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
    }
    
    // Handle click outside to close
    if (overlay) {
      overlay.onclick = e => { 
        if (e.target === overlay) close(); 
      };
    }
    
    // Handle Escape key
    if (_esc) document.removeEventListener('keydown', _esc);
    _esc = e => { 
      if (e.key === 'Escape') close(); 
    };
    document.addEventListener('keydown', _esc);
    
    // Focus the first button or input
    const firstFocusable = inp ? inputEl : actionsEl?.querySelector('button');
    if (firstFocusable) {
      setTimeout(() => firstFocusable.focus(), 100);
    }
  }

  function close() {
    const overlay = $('modal-overlay');
    if (overlay) {
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
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
    
    // Restore focus to previously focused element
    if (_previousFocus && _previousFocus.focus) {
      setTimeout(() => {
        _previousFocus.focus();
        _previousFocus = null;
      }, 50);
    }
  }

  const alert = (title, msg='', { icon='ℹ️', btnLabel='OK', btnCls='btn-ug', width='420px' }={}) =>
    new Promise(res => _show({ icon, title, msg, width, actions:[{ label:btnLabel, cls:btnCls, cb:()=>{ res(); } }] }));

  const success = (title, msg='') => alert(title, msg, { icon:'✅', btnLabel:'Got it!', btnCls:'btn-ug', width:'400px' });
  const error   = (title, msg='') => alert(title, msg, { icon:'❌', btnLabel:'OK', btnCls:'btn-danger', width:'400px' });

  const confirm = (title, msg='', { icon='⚠️', confirmLabel='Confirm', cancelLabel='Cancel', confirmCls='btn-danger', width='450px' }={}) =>
    new Promise(res => _show({ icon, title, msg, width, actions:[
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
      actions:[] 
    });
  }

  return { alert, success, error, confirm, prompt, loading, close };
})();
