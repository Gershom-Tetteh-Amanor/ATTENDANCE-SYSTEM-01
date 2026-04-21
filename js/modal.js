/* ============================================
   modal.js — Custom pop-up system
   Replaces ALL browser alert / confirm / prompt.
   Uses CSS .open class (never inline style).
   ============================================ */
'use strict';

const MODAL = (() => {
  const $ = id => document.getElementById(id);
  let _esc = null;

  function _show({ icon='', title='', msg='', actions=[], inp=false, placeholder='', defVal='', inpType='text' }) {
    $('modal-icon').innerHTML   = icon;
    $('modal-title').textContent = title;
    $('modal-msg').innerHTML    = msg;
    $('modal-actions').innerHTML = '';
    const el = $('modal-input');
    if (inp) { el.type=inpType; el.placeholder=placeholder; el.value=defVal; el.style.display='block'; setTimeout(()=>el.focus(),80); }
    else { el.style.display='none'; }
    actions.forEach(({ label, cls, cb }) => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (cls || 'btn-secondary');
      btn.textContent = label;
      btn.onclick = cb;
      $('modal-actions').appendChild(btn);
    });
    $('modal-overlay').classList.add('open');
    $('modal-overlay').setAttribute('aria-hidden','false');
    $('modal-overlay').onclick = e => { if (e.target === $('modal-overlay')) close(); };
    if (_esc) document.removeEventListener('keydown', _esc);
    _esc = e => { if (e.key==='Escape') close(); };
    document.addEventListener('keydown', _esc);
    const first = $('modal-actions').querySelector('button');
    if (first) setTimeout(()=>first.focus(),120);
  }

  function close() {
    $('modal-overlay').classList.remove('open');
    $('modal-overlay').setAttribute('aria-hidden','true');
    if (_esc) { document.removeEventListener('keydown',_esc); _esc=null; }
  }

  const alert = (title, msg='', { icon='ℹ️', btnLabel='OK', btnCls='btn-ug' }={}) =>
    new Promise(res => _show({ icon, title, msg, actions:[{ label:btnLabel, cls:btnCls, cb:()=>{ close(); res(); } }] }));

  const success = (title, msg='') => alert(title, msg, { icon:'✅', btnLabel:'Got it!', btnCls:'btn-ug' });
  const error   = (title, msg='') => alert(title, msg, { icon:'❌', btnLabel:'OK',      btnCls:'btn-danger' });

  const confirm = (title, msg='', { icon='⚠️', confirmLabel='Confirm', cancelLabel='Cancel', confirmCls='btn-danger' }={}) =>
    new Promise(res => _show({ icon, title, msg, actions:[
      { label:cancelLabel,  cls:'btn-secondary', cb:()=>{ close(); res(false); } },
      { label:confirmLabel, cls:confirmCls,       cb:()=>{ close(); res(true);  } },
    ]}));

  const prompt = (title, msg='', { icon='📝', placeholder='', defVal='', confirmLabel='Submit', cancelLabel='Cancel', inpType='text' }={}) =>
    new Promise(res => {
      _show({ icon, title, msg, inp:true, placeholder, defVal, inpType, actions:[
        { label:cancelLabel,  cls:'btn-secondary', cb:()=>{ close(); res(null); } },
        { label:confirmLabel, cls:'btn-ug',         cb:()=>{ const v=$('modal-input')?.value?.trim()||''; close(); res(v); } },
      ]});
      $('modal-input').onkeydown = e => { if (e.key==='Enter') { const v=e.target.value.trim(); close(); res(v); } };
    });

  function loading(msg='Please wait…') {
    _show({ icon:'<span style="display:inline-block;width:32px;height:32px;border:3px solid rgba(0,107,63,.25);border-top-color:var(--ug);border-radius:50%;animation:spin .7s linear infinite"></span>', title:msg, msg:'', actions:[] });
  }

  return { alert, success, error, confirm, prompt, loading, close };
})();
