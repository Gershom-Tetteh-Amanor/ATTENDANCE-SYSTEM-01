/* ============================================
   modal.js — Custom pop-up system
   Replaces ALL browser alert / confirm / prompt.
   Uses CSS .open class (never inline style).
   ============================================ */
'use strict';

const MODAL = (() => {
  const $ = id => document.getElementById(id);
  let _esc = null;
  let _previousFocus = null;

  function _show({ icon='', title='', msg='', actions=[], inp=false, placeholder='', defVal='', inpType='text', width='420px' }) {
    // Store previously focused element
    _previousFocus = document.activeElement;
    
    $('modal-icon').innerHTML   = icon;
    $('modal-title').textContent = title;
    $('modal-msg').innerHTML    = msg;
    $('modal-actions').innerHTML = '';
    
    // Set modal width
    const modalBox = document.querySelector('.modal-box');
    if (modalBox) modalBox.style.maxWidth = width;
    
    const el = $('modal-input');
    if (inp) { 
      el.type = inpType; 
      el.placeholder = placeholder; 
      el.value = defVal; 
      el.style.display = 'block'; 
      setTimeout(() => {
        el.focus();
        el.select();
      }, 80);
    } else { 
      el.style.display = 'none'; 
    }
    
    actions.forEach(({ label, cls, cb }) => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (cls || 'btn-secondary');
      btn.textContent = label;
      btn.onclick = () => {
        cb();
        close();
      };
      $('modal-actions').appendChild(btn);
    });
    
    const overlay = $('modal-overlay');
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    
    // Handle click outside to close
    overlay.onclick = e => { 
      if (e.target === overlay) close(); 
    };
    
    // Handle Escape key
    if (_esc) document.removeEventListener('keydown', _esc);
    _esc = e => { 
      if (e.key === 'Escape') close(); 
    };
    document.addEventListener('keydown', _esc);
    
    // Focus the first button or input
    const firstFocusable = inp ? el : $('modal-actions').querySelector('button');
    if (firstFocusable) {
      setTimeout(() => firstFocusable.focus(), 100);
    }
  }

  function close() {
    const overlay = $('modal-overlay');
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    
    if (_esc) { 
      document.removeEventListener('keydown', _esc); 
      _esc = null; 
    }
    
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
