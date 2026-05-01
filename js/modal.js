/* ============================================
   modal.js — Custom pop-up system
   Replaces ALL browser alert / confirm / prompt.
   FIXED: Modals close properly when clicking outside
   ============================================ */
'use strict';

const MODAL = (() => {
  const $ = id => document.getElementById(id);
  let _esc = null;
  let _previousFocus = null;
  let _currentOpenModal = false;
  let _isClosing = false;

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
      }
      
      .modal-overlay.open {
        display: flex;
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
    `;
    document.head.appendChild(style);
  }

  // Safe focus function
  function safeFocus(element) {
    if (element && element !== document.body && typeof element.focus === 'function') {
      try {
        element.focus();
      } catch(e) {
        console.warn('[MODAL] Focus error:', e);
      }
    }
  }

  // Close modal function - safe and reliable
  function close() {
    if (_isClosing) return;
    _isClosing = true;
    
    console.log('[MODAL] Closing modal');
    
    const overlay = document.getElementById('modal-overlay');
    if (overlay) {
      overlay.classList.remove('open');
      // Remove the onclick handler to prevent memory leaks
      overlay.onclick = null;
    }
    
    // Remove escape key listener
    if (_esc) { 
      document.removeEventListener('keydown', _esc); 
      _esc = null; 
    }
    
    _currentOpenModal = false;
    
    // Clear content after animation
    setTimeout(() => {
      const msgEl = document.getElementById('modal-msg');
      if (msgEl) msgEl.innerHTML = '';
      
      const actionsEl = document.getElementById('modal-actions');
      if (actionsEl) actionsEl.innerHTML = '';
      
      const inputEl = document.getElementById('modal-input');
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

  // Show modal function
  function _show({ icon = '', title = '', msg = '', actions = [], inp = false, placeholder = '', defVal = '', inpType = 'text', width = '420px' }) {
    // Close any existing modal first
    if (_currentOpenModal) {
      close();
    }
    
    // Small delay to ensure previous modal is fully closed
    setTimeout(() => {
      addModalStyles();
      
      // Store previous focus safely
      _previousFocus = document.activeElement;
      _currentOpenModal = true;
      _isClosing = false;
      
      console.log('[MODAL] Showing modal:', title);
      
      // Set content
      const iconEl = document.getElementById('modal-icon');
      if (iconEl) iconEl.innerHTML = icon;
      
      const titleEl = document.getElementById('modal-title');
      if (titleEl) titleEl.textContent = title;
      
      // Create scrollable content
      const msgEl = document.getElementById('modal-msg');
      if (msgEl) {
        msgEl.innerHTML = '';
        const scrollContainer = document.createElement('div');
        scrollContainer.className = 'modal-scroll-content';
        scrollContainer.innerHTML = msg;
        msgEl.appendChild(scrollContainer);
      }
      
      // Set width
      const modalBox = document.querySelector('.modal-box');
      if (modalBox) modalBox.style.maxWidth = width;
      
      // Handle input
      const inputEl = document.getElementById('modal-input');
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
      const actionsEl = document.getElementById('modal-actions');
      if (actionsEl) {
        actionsEl.innerHTML = '';
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
      const overlay = document.getElementById('modal-overlay');
      if (overlay) {
        overlay.classList.add('open');
        // Handle click outside - close modal
        overlay.onclick = function(e) {
          console.log('[MODAL] Overlay clicked, target:', e.target, 'overlay:', overlay);
          // Only close if clicking directly on the overlay (not on modal content)
          if (e.target === overlay && !_isClosing) {
            console.log('[MODAL] Closing modal due to outside click');
            close();
          }
        };
      }
      
      // Handle Escape key
      if (_esc) document.removeEventListener('keydown', _esc);
      _esc = function(e) {
        if (e.key === 'Escape' && !_isClosing) {
          console.log('[MODAL] Closing modal due to Escape key');
          close();
        }
      };
      document.addEventListener('keydown', _esc);
      
      // Focus first button or input safely
      const firstFocusable = inp ? inputEl : document.querySelector('#modal-actions .btn');
      if (firstFocusable) {
        setTimeout(() => {
          safeFocus(firstFocusable);
        }, 100);
      }
    }, 50);
  }

  // Alert modal
  const alert = (title, msg = '', { icon = 'ℹ️', btnLabel = 'OK', btnCls = 'btn-ug', width = '420px' } = {}) =>
    new Promise((resolve) => {
      _show({
        icon,
        title,
        msg,
        width,
        actions: [{ label: btnLabel, cls: btnCls, cb: () => resolve() }]
      });
    });

  // Success modal
  const success = (title, msg = '') => alert(title, msg, { icon: '✅', btnLabel: 'Got it!', btnCls: 'btn-ug', width: '400px' });

  // Error modal
  const error = (title, msg = '') => alert(title, msg, { icon: '❌', btnLabel: 'OK', btnCls: 'btn-danger', width: '400px' });

  // Confirm modal
  const confirm = (title, msg = '', { icon = '⚠️', confirmLabel = 'Confirm', cancelLabel = 'Cancel', confirmCls = 'btn-danger', width = '450px' } = {}) =>
    new Promise((resolve) => {
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
  const prompt = (title, msg = '', { icon = '📝', placeholder = '', defVal = '', confirmLabel = 'Submit', cancelLabel = 'Cancel', inpType = 'text', width = '450px' } = {}) =>
    new Promise((resolve) => {
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
            const input = document.getElementById('modal-input');
            const val = input?.value?.trim() || '';
            resolve(val);
          }}
        ]
      });
      
      setTimeout(() => {
        const input = document.getElementById('modal-input');
        if (input) {
          input.onkeydown = (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const val = input.value.trim();
              close();
              resolve(val);
            }
          };
        }
      }, 100);
    });

  // Loading modal
  const loading = (msg = 'Please wait…', width = '350px') => {
    _show({
      icon: '<div style="width:40px;height:40px;border:3px solid var(--border2);border-top-color:var(--ug);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto"></div>',
      title: msg,
      msg: '',
      width,
      actions: []
    });
  };

  return {
    alert,
    success,
    error,
    confirm,
    prompt,
    loading,
    close
  };
})();
