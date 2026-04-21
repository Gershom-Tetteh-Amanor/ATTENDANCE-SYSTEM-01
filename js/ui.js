/* ============================================
   ui.js — DOM helpers and shared utilities
   CANONICAL NAMES — used everywhere:
     fillDeptSelect   (not fillDept)
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

  /* Populate a <select> with UG departments */
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

  return { Q, setAlert, clrAlert, btnLoad, tgEye, fillDeptSelect, fmtDur, todayStr, nowTime, pad, esc, b64e, b64d, hashPw, makeToken, makeCode, makeLecUID, haversine, dlCSV, isLecEmail, isTAEmail };
})();
