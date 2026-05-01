/* ============================================
   modal.js — Custom pop-up system
   Replaces ALL browser alert / confirm / prompt.
   Uses CSS .open class (never inline style).
   FIXED: No focus errors, safe element handling, preserves events
   ============================================ */
'use strict';

const MODAL = (() => {
  const $ = id => document.getElementById(id);
  let _esc = null;
  let _previousFocus = null;
  let _isClosing = false;
  let _currentOpen = false;

  // Safe focus function to prevent errors
  function safeFocus(element) {
    if (!element) return;
    try {
      if (document.body.contains(element) && typeof element.focus === 'function') {
        element.focus();
      }
    } catch(e) {
      console.warn('[MODAL] Focus error:', e);
    }
  }

  function _show({ icon='', title='', msg='', actions=[], inp=false, placeholder='', defVal='', inpType='text', width='420px' }) {
    // Close any existing modal first
    if (_currentOpen) {
      close();
    }
    
    // Small delay to ensure previous modal is closed
    setTimeout(() => {
      _currentOpen = true;
      _isClosing = false;
      
      // Store previously focused element (only if valid)
      if (document.activeElement && document.activeElement !== document.body) {
        _previousFocus = document.activeElement;
      } else {
        _previousFocus = null;
      }
      
      // Get all modal elements
      const iconEl = $('modal-icon');
      const titleEl = $('modal-title');
      const msgEl = $('modal-msg');
      const actionsEl = $('modal-actions');
      const inputEl = $('modal-input');
      const modalBox = document.querySelector('.modal-box');
      const overlay = $('modal-overlay');
      
      // Set modal content
      if (iconEl) iconEl.innerHTML = icon;
      if (titleEl) titleEl.textContent = title;
      if (msgEl) {
        // Clear existing content
        msgEl.innerHTML = '';
        // Create scrollable container for message content
        const scrollContainer = document.createElement('div');
        scrollContainer.className = 'modal-scroll-content';
        scrollContainer.innerHTML = msg;
        msgEl.appendChild(scrollContainer);
      }
      if (actionsEl) actionsEl.innerHTML = '';
      
      // Set modal width
      if (modalBox) modalBox.style.maxWidth = width;
      
      // Handle input field
      if (inputEl) {
        if (inp) { 
          inputEl.type = inpType; 
          inputEl.placeholder = placeholder; 
          inputEl.value = defVal; 
          inputEl.style.display = 'block'; 
          setTimeout(() => {
            safeFocus(inputEl);
            if (inputEl.select) inputEl.select();
          }, 100);
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
          btn.onclick = (e) => {
            e.stopPropagation();
            try {
              if (cb) cb();
            } catch(err) {
              console.error('Modal callback error:', err);
            }
            close();
          };
          actionsEl.appendChild(btn);
        });
      }
      
      // Show overlay
      if (overlay) {
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden', 'false');
        
        // Handle click outside to close
        overlay.onclick = (e) => { 
          if (e.target === overlay && !_isClosing) {
            close();
          }
        };
      }
      
      // Handle Escape key
      if (_esc) document.removeEventListener('keydown', _esc);
      _esc = (e) => { 
        if (e.key === 'Escape' && !_isClosing) {
          close();
        }
      };
      document.addEventListener('keydown', _esc);
      
      // Focus the first button or input safely
      setTimeout(() => {
        const firstFocusable = inp ? inputEl : (actionsEl ? actionsEl.querySelector('button') : null);
        if (firstFocusable && document.body.contains(firstFocusable)) {
          safeFocus(firstFocusable);
        }
      }, 150);
      
    }, 50);
  }

  function close() {
    if (_isClosing) return;
    _isClosing = true;
    
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
    
    _currentOpen = false;
    
    // Clear modal content after animation
    setTimeout(() => {
      const msgEl = $('modal-msg');
      const actionsEl = $('modal-actions');
      const inputEl = $('modal-input');
      
      if (msgEl) msgEl.innerHTML = '';
      if (actionsEl) actionsEl.innerHTML = '';
      if (inputEl) {
        inputEl.value = '';
        inputEl.style.display = 'none';
      }
      
      _isClosing = false;
    }, 200);
    
    // Restore focus safely
    if (_previousFocus && document.body.contains(_previousFocus)) {
      setTimeout(() => {
        safeFocus(_previousFocus);
        _previousFocus = null;
      }, 100);
    } else {
      _previousFocus = null;
    }
  }

  // Alert modal
  const alert = (title, msg='', { icon='ℹ️', btnLabel='OK', btnCls='btn-ug', width='420px' }={}) =>
    new Promise(resolve => {
      _show({ 
        icon, 
        title, 
        msg, 
        width, 
        actions: [{ label: btnLabel, cls: btnCls, cb: () => resolve() }] 
      });
    });

  // Success modal
  const success = (title, msg='') => alert(title, msg, { icon:'✅', btnLabel:'Got it!', btnCls:'btn-ug', width:'400px' });
  
  // Error modal
  const error = (title, msg='') => alert(title, msg, { icon:'❌', btnLabel:'OK', btnCls:'btn-danger', width:'400px' });

  // Confirm modal
  const confirm = (title, msg='', { icon='⚠️', confirmLabel='Confirm', cancelLabel='Cancel', confirmCls='btn-danger', width='450px' }={}) =>
    new Promise(resolve => {
      _show({ 
        icon, 
        title, 
        msg, 
        width, 
        actions: [
          { label: cancelLabel, cls: 'btn-secondary', cb: () => resolve(false) },
          { label: confirmLabel, cls: confirmCls, cb: () => resolve(true) }
        ] 
      });
    });

  // Prompt modal
  const prompt = (title, msg='', { icon='📝', placeholder='', defVal='', confirmLabel='Submit', cancelLabel='Cancel', inpType='text', width='450px' }={}) =>
    new Promise(resolve => {
      _show({ 
        icon, 
        title, 
        msg, 
        inp: true, 
        placeholder, 
        defVal, 
        inpType, 
        width, 
        actions: [
          { label: cancelLabel, cls: 'btn-secondary', cb: () => resolve(null) },
          { label: confirmLabel, cls: 'btn-ug', cb: () => {
            const input = $('modal-input');
            const val = input?.value?.trim() || '';
            resolve(val);
          }}
        ]
      });
      
      setTimeout(() => {
        const input = $('modal-input');
        if (input) {
          input.onkeydown = (e) => { 
            if (e.key === 'Enter') { 
              e.preventDefault();
              const val = e.target.value.trim(); 
              close(); 
              resolve(val); 
            } 
          };
        }
      }, 100);
    });

  // Loading modal
  const loading = (msg='Please wait…', width='350px') => {
    _show({ 
      icon: '<div style="width:40px;height:40px;border:3px solid var(--border2);border-top-color:var(--ug);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto"></div>', 
      title: msg, 
      msg: '', 
      width,
      actions: [] 
    });
  };

  return { alert, success, error, confirm, prompt, loading, close };
})();
