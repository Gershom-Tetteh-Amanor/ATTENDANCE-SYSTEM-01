/* auth.js — Authentication for all roles */
'use strict';

const AUTH = (() => {
  const saveSession = u => localStorage.setItem(CONFIG.KEYS.USER, JSON.stringify(u));
  const getSession = () => { try{return JSON.parse(localStorage.getItem(CONFIG.KEYS.USER));}catch{return null;} };
  const clearSession = () => localStorage.removeItem(CONFIG.KEYS.USER);
  const LOCK_KEY = 'ugqr7_lock', MAX_ATTEMPTS = 5, LOCK_MINUTES = 15;
  function getLockData(e) { try{return JSON.parse(localStorage.getItem(LOCK_KEY)||'{}')[e]||{attempts:0,lockUntil:0};}catch{return{attempts:0,lockUntil:0};} }
  function setLockData(e,d) { try{const o=JSON.parse(localStorage.getItem(LOCK_KEY)||'{}'); o[e]=d; localStorage.setItem(LOCK_KEY,JSON.stringify(o));}catch{} }
  function recordFailed(e) { const d=getLockData(e); d.attempts++; if(d.attempts>=MAX_ATTEMPTS) d.lockUntil=Date.now()+LOCK_MINUTES*60000; setLockData(e,d); return d; }
  function clearLock(e) { setLockData(e,{attempts:0,lockUntil:0}); }
  function checkLocked(e) { const d=getLockData(e); if(d.lockUntil>Date.now()) return `Locked. Try again in ${Math.ceil((d.lockUntil-Date.now())/60000)} min.`; if(d.lockUntil>0&&d.lockUntil<=Date.now()) clearLock(e); return null; }

  async function setupSuperAdmin() { const n=UI.Q('sa-name')?.value.trim(), e=UI.Q('sa-email')?.value.trim().toLowerCase(), p=UI.Q('sa-pass')?.value, p2=UI.Q('sa-pass2')?.value; UI.clrAlert('al-alert'); if(!n||!e||!p) return UI.setAlert('al-alert','All fields required.'); if(p.length<8) return UI.setAlert('al-alert','Password min 8 chars.'); if(p!==p2) return UI.setAlert('al-alert','Passwords mismatch.'); UI.btnLoad('sa-btn',true); try{ if(await DB.SA.exists()){ UI.btnLoad('sa-btn',false); return UI.setAlert('al-alert','Admin exists.'); } await DB.SA.set({id:UI.makeToken(),name:n,email:e,pwHash:UI.hashPw(p),createdAt:Date.now()}); UI.btnLoad('sa-btn',false); await MODAL.success('Created!','You can now sign in.'); APP._refreshAdminLogin(); } catch(err){ UI.btnLoad('sa-btn',false); UI.setAlert('al-alert',err.message); } }

  async function adminLogin() { const e=UI.Q('al-email')?.value.trim().toLowerCase(), p=UI.Q('al-pass')?.value; UI.clrAlert('al-alert'); if(!e||!p) return UI.setAlert('al-alert','Enter email and password.'); const locked=checkLocked(e); if(locked) return UI.setAlert('al-alert',locked); UI.btnLoad('al-btn',true); try{ const h=UI.hashPw(p); const sa=await DB.SA.get(); if(sa&&sa.email===e&&sa.pwHash===h){ clearLock(e); saveSession({...sa,role:'superAdmin'}); UI.btnLoad('al-btn',false); await APP.activateAdmin({...sa,role:'superAdmin'}); return; } const cas=await DB.CA.getAll(), ca=cas.find(c=>c.email===e&&c.pwHash===h); if(ca){ if(ca.status==='pending'){ UI.btnLoad('al-btn',false); return UI.setAlert('al-alert','Pending approval.'); } if(ca.status==='revoked'){ UI.btnLoad('al-btn',false); return UI.setAlert('al-alert','Revoked.'); } clearLock(e); saveSession({...ca,role:'coAdmin'}); UI.btnLoad('al-btn',false); await APP.activateAdmin({...ca,role:'coAdmin'}); return; } const d=recordFailed(e); const rem=MAX_ATTEMPTS-d.attempts; UI.btnLoad('al-btn',false); if(rem<=0) UI.setAlert('al-alert',`Locked for ${LOCK_MINUTES} min.`); else UI.setAlert('al-alert',`Invalid. ${rem} attempt${rem!==1?'s':''} left.`); }catch(err){ UI.btnLoad('al-btn',false); UI.setAlert('al-alert',err.message); } }
  const adminLogout = () => { clearSession(); APP.goTo('landing'); };

  async function coAdminApply() { const n=UI.Q('ca-name')?.value.trim(), e=UI.Q('ca-email')?.value.trim().toLowerCase(), d=UI.Q('ca-dept')?.value, p=UI.Q('ca-pass')?.value, p2=UI.Q('ca-pass2')?.value; UI.clrAlert('ca-alert'); if(!n||!e||!d||!p) return UI.setAlert('ca-alert','All fields required.'); if(p.length<8) return UI.setAlert('ca-alert','Password min 8 chars.'); if(p!==p2) return UI.setAlert('ca-alert','Passwords mismatch.'); UI.btnLoad('ca-btn',true); try{ if(await DB.CA.byEmail(e)){ UI.btnLoad('ca-btn',false); return UI.setAlert('ca-alert','Application exists.'); } const id=UI.makeToken(); await DB.CA.set(id,{id,name:n,email:e,department:d,pwHash:UI.hashPw(p),status:'pending',createdAt:Date.now()}); UI.btnLoad('ca-btn',false); await MODAL.success('Submitted!','Admin will review.'); APP.goTo('admin-login'); }catch(err){ UI.btnLoad('ca-btn',false); UI.setAlert('ca-alert',err.message); } }

  async function lecLogin() { const e=UI.Q('ll-email')?.value.trim().toLowerCase(), p=UI.Q('ll-pass')?.value; UI.clrAlert('ll-alert'); if(!e||!p) return UI.setAlert('ll-alert','Enter email and password.'); if(!UI.isLecEmail(e)) return UI.setAlert('ll-alert','Must end with .ug.edu.gh'); const locked=checkLocked(e); if(locked) return UI.setAlert('ll-alert',locked); UI.btnLoad('ll-btn',true); try{ const lec=await DB.LEC.byEmail(e); if(!lec||lec.pwHash!==UI.hashPw(p)){ const d=recordFailed(e), rem=MAX_ATTEMPTS-d.attempts; UI.btnLoad('ll-btn',false); if(rem<=0) UI.setAlert('ll-alert',`Locked for ${LOCK_MINUTES} min.`); else UI.setAlert('ll-alert',`Invalid. ${rem} attempt${rem!==1?'s':''} left.`); return; } clearLock(e); saveSession({...lec,role:'lecturer'}); UI.btnLoad('ll-btn',false); await APP.activateLecturer({...lec,role:'lecturer'}); }catch(err){ UI.btnLoad('ll-btn',false); UI.setAlert('ll-alert',err.message); } }

  async function lecSignup() { const uid=UI.Q('ls-uid')?.value.trim().toUpperCase(), n=UI.Q('ls-name')?.value.trim(), e=UI.Q('ls-email')?.value.trim().toLowerCase(), d=UI.Q('ls-dept')?.value, p=UI.Q('ls-pass')?.value, p2=UI.Q('ls-pass2')?.value; UI.clrAlert('ls-alert'); if(!uid||!n||!e||!d||!p) return UI.setAlert('ls-alert','All fields required.'); if(!UI.isLecEmail(e)) return UI.setAlert('ls-alert','Email must end with .ug.edu.gh'); if(p.length<8) return UI.setAlert('ls-alert','Password min 8 chars.'); if(p!==p2) return UI.setAlert('ls-alert','Passwords mismatch.'); UI.btnLoad('ls-btn',true); try{ const uidData=await DB.UID.get(uid); if(!uidData||uidData.status!=='available'){ UI.btnLoad('ls-btn',false); return UI.setAlert('ls-alert','Invalid or used ID.'); } if(await DB.LEC.byEmail(e)){ UI.btnLoad('ls-btn',false); return UI.setAlert('ls-alert','Email exists.'); } const fbId=UI.makeToken(); await DB.UID.update(uid,{status:'assigned',assignedTo:e,assignedAt:Date.now()}); const lec={id:fbId,lecId:uid,name:n,email:e,department:d,pwHash:UI.hashPw(p),createdAt:Date.now()}; await DB.LEC.set(fbId,lec); saveSession({...lec,role:'lecturer'}); UI.btnLoad('ls-btn',false); await MODAL.success('Created!',`Welcome, ${n}. ID: ${uid}`); await APP.activateLecturer({...lec,role:'lecturer'}); }catch(err){ UI.btnLoad('ls-btn',false); UI.setAlert('ls-alert',err.message); } }
  const lecLogout = () => { if(window.LEC) LEC.stopTimers(); clearSession(); APP.goTo('landing'); };

  async function taLogin() { const e=UI.Q('tl-email')?.value.trim().toLowerCase(), p=UI.Q('tl-pass')?.value; UI.clrAlert('tl-alert'); if(!e||!p) return UI.setAlert('tl-alert','Enter email and password.'); if(!UI.isTAEmail(e)) return UI.setAlert('tl-alert','Must end with @st.ug.edu.gh'); const locked=checkLocked(e); if(locked) return UI.setAlert('tl-alert',locked); UI.btnLoad('tl-btn',true); try{ const ta=await DB.TA.byEmail(e); if(!ta||ta.pwHash!==UI.hashPw(p)){ const d=recordFailed(e), rem=MAX_ATTEMPTS-d.attempts; UI.btnLoad('tl-btn',false); if(rem<=0) UI.setAlert('tl-alert',`Locked for ${LOCK_MINUTES} min.`); else UI.setAlert('tl-alert',`Invalid. ${rem} attempt${rem!==1?'s':''} left.`); return; } if(ta.status!=='active'){ UI.btnLoad('tl-btn',false); return UI.setAlert('tl-alert','Account inactive.'); } clearLock(e); UI.btnLoad('tl-btn',false); const lecIds=ta.lecturers||[]; if(lecIds.length>1){ const selected=await _pickLecturer(lecIds); if(!selected) return; saveSession({...ta,role:'ta',activeLecturerId:selected.id}); await APP.activateLecturer({...ta,role:'ta',activeLecturerId:selected.id}); } else { saveSession({...ta,role:'ta',activeLecturerId:lecIds[0]||null}); await APP.activateLecturer({...ta,role:'ta',activeLecturerId:lecIds[0]||null}); } }catch(err){ UI.btnLoad('tl-btn',false); UI.setAlert('tl-alert',err.message); } }

  async function _pickLecturer(lecIds) { const lecs=(await Promise.all(lecIds.map(id=>DB.LEC.get(id)))).filter(Boolean); if(!lecs.length) return null; const options=lecs.map((l,i)=>`<div class="lec-pick-item" data-idx="${i}" onclick="AUTH._selectLec(${i})" style="padding:14px;border:2px solid var(--border);border-radius:10px;margin-bottom:8px;cursor:pointer;background:var(--surface)"><div style="font-weight:600;color:var(--ug)">${UI.esc(l.name)}</div><div style="font-size:12px">${UI.esc(l.department||'—')}</div></div>`).join(''); return new Promise(resolve=>{ window._lecPickResolve=idx=>{ delete window._lecPickResolve; MODAL.close(); resolve(lecs[idx]||null); }; MODAL.alert('Select Lecturer', `<div>${options}</div><div style="font-size:12px;text-align:center;margin-top:10px">You can switch by signing out.</div>`, {icon:'🎓',btnLabel:'Cancel',btnCls:'btn-secondary'}).then(()=>resolve(null)); }); }
  function _selectLec(idx){ if(window._lecPickResolve) window._lecPickResolve(idx); }

  async function taSignup() { const code=UI.Q('ts-code')?.value.trim().toUpperCase(), n=UI.Q('ts-name')?.value.trim(), e=UI.Q('ts-email')?.value.trim().toLowerCase(), p=UI.Q('ts-pass')?.value, p2=UI.Q('ts-pass2')?.value; UI.clrAlert('ts-alert'); if(!code||!n||!e||!p) return UI.setAlert('ts-alert','All fields required.'); if(!UI.isTAEmail(e)) return UI.setAlert('ts-alert','Must end with @st.ug.edu.gh'); if(p.length<8) return UI.setAlert('ts-alert','Password min 8 chars.'); if(p!==p2) return UI.setAlert('ts-alert','Passwords mismatch.'); UI.btnLoad('ts-btn',true); try{ const entry=await DB.TA.inviteByCode(code); if(!entry){ UI.btnLoad('ts-btn',false); return UI.setAlert('ts-alert','Invalid code.'); } const [invKey,inv]=entry; if(inv.usedAt){ UI.btnLoad('ts-btn',false); return UI.setAlert('ts-alert','Code already used.'); } if(inv.expiresAt<Date.now()){ UI.btnLoad('ts-btn',false); return UI.setAlert('ts-alert','Code expired.'); } if(inv.toEmail.toLowerCase()!==e){ UI.btnLoad('ts-btn',false); return UI.setAlert('ts-alert','Wrong email for this code.'); } let existing=await DB.TA.byEmail(e), uid; if(existing){ uid=existing.id; const lecs=existing.lecturers||[]; if(!lecs.includes(inv.lecturerId)) await DB.TA.update(uid,{lecturers:[...lecs,inv.lecturerId]}); } else { uid=UI.makeToken(); await DB.TA.set(uid,{id:uid,name:n,email:e,pwHash:UI.hashPw(p),lecturers:[inv.lecturerId],status:'active',createdAt:Date.now()}); } await DB.TA.updateInvite(invKey,{usedAt:Date.now(),taId:uid}); const ta=await DB.TA.get(uid); saveSession({...ta,id:uid,role:'ta',activeLecturerId:inv.lecturerId}); UI.btnLoad('ts-btn',false); await MODAL.success('Created!',`Welcome, ${n}!`); await APP.activateLecturer({...ta,role:'ta',activeLecturerId:inv.lecturerId}); }catch(err){ UI.btnLoad('ts-btn',false); UI.setAlert('ts-alert',err.message); } }

  async function studentLogin() { const sid=UI.Q('sl-id')?.value.trim().toUpperCase(), p=UI.Q('sl-pass')?.value; UI.clrAlert('sl-alert'); if(!sid||!p) return UI.setAlert('sl-alert','Enter Student ID and password.'); UI.btnLoad('sl-btn',true); try{ const student=await DB.STUDENTS.byStudentId(sid); if(!student||student.pwHash!==UI.hashPw(p)){ UI.btnLoad('sl-btn',false); return UI.setAlert('sl-alert','Invalid ID or password.'); } saveSession({...student,role:'student'}); UI.btnLoad('sl-btn',false); await APP.activateStudent({...student,role:'student'}); }catch(err){ UI.btnLoad('sl-btn',false); UI.setAlert('sl-alert',err.message); } }

  async function studentSignup() { const sid=UI.Q('ss-id')?.value.trim().toUpperCase(), n=UI.Q('ss-name')?.value.trim(), e=UI.Q('ss-email')?.value.trim().toLowerCase(), p=UI.Q('ss-pass')?.value, p2=UI.Q('ss-pass2')?.value; UI.clrAlert('ss-alert'); if(!sid||!n||!e||!p) return UI.setAlert('ss-alert','All fields required.'); if(!e.endsWith('.ug.edu.gh')&&!e.endsWith('@st.ug.edu.gh')) return UI.setAlert('ss-alert','UG email required.'); if(p.length<6) return UI.setAlert('ss-alert','Password min 6 chars.'); if(p!==p2) return UI.setAlert('ss-alert','Passwords mismatch.'); UI.btnLoad('ss-btn',true); try{ if(await DB.STUDENTS.byStudentId(sid)){ UI.btnLoad('ss-btn',false); return UI.setAlert('ss-alert','ID already exists.'); } const student={studentId:sid,name:n,email:e,pwHash:UI.hashPw(p),registeredAt:Date.now(),active:true,createdAt:Date.now()}; await DB.STUDENTS.set(sid,student); saveSession({...student,role:'student'}); UI.btnLoad('ss-btn',false); await MODAL.success('Created!',`Welcome, ${n}!`); await APP.activateStudent({...student,role:'student'}); }catch(err){ UI.btnLoad('ss-btn',false); UI.setAlert('ss-alert',err.message); } }

  async function showForgotPassword(alertId) {
    const email=await MODAL.prompt('Reset Password','Enter your email:',{icon:'🔑',placeholder:'email@ug.edu.gh',confirmLabel:'Send Code'});
    if(!email||!email.trim()) return;
    const e=email.trim().toLowerCase();
    try{
      let found=false;
      if((await DB.SA.get())?.email===e) found=true;
      if(!found && await DB.LEC.byEmail(e)) found=true;
      if(!found && (await DB.CA.getAll()).find(c=>c.email===e)) found=true;
      if(!found && await DB.TA.byEmail(e)) found=true;
      if(!found && await DB.STUDENTS.byEmail(e)) found=true;
      if(!found){ await MODAL.error('Not Found','No account with that email.'); return; }
      const code=Math.floor(100000+Math.random()*900000).toString(), expiresAt=Date.now()+30*60*1000;
      await DB.RESET.set(e,{code,expiresAt,used:false});
      if(!window._db) await MODAL.alert('Reset Code',`<div style="background:var(--ug);color:var(--gold);font-size:32px;padding:16px;text-align:center;border-radius:10px">${code}</div><div style="font-size:12px;margin-top:8px">Valid 30 min</div>`,{icon:'📧'});
      else await MODAL.success('Code Sent',`Reset code sent to ${UI.esc(e)}`);
      await _enterResetCode(e);
    }catch(err){ await MODAL.error('Error',err.message); }
  }

  async function _enterResetCode(email){
    const code=await MODAL.prompt('Enter Code','6-digit code:',{icon:'🔢',placeholder:'123456',confirmLabel:'Verify'});
    if(!code) return;
    const stored=await DB.RESET.get(email);
    if(!stored||stored.used){ await MODAL.error('Invalid','Code no longer valid.'); return; }
    if(stored.expiresAt<Date.now()){ await MODAL.error('Expired','Code expired.'); return; }
    if(stored.code!==code.trim()){ await MODAL.error('Wrong','Incorrect code.'); return; }
    const newPass=await MODAL.prompt('New Password','Min 8 characters:',{icon:'🔒',placeholder:'New password',inpType:'password',confirmLabel:'Set Password'});
    if(!newPass||newPass.length<8){ await MODAL.error('Too Short','Min 8 characters.'); return; }
    const hash=UI.hashPw(newPass);
    const sa=await DB.SA.get(); if(sa&&sa.email===email) await DB.SA.update({pwHash:hash});
    const lec=await DB.LEC.byEmail(email); if(lec){ const a=await DB.LEC.get(lec.id); await DB.LEC.set(a.id,{...a,pwHash:hash}); }
    const cas=(await DB.CA.getAll()).find(c=>c.email===email); if(cas) await DB.CA.update(cas.id,{pwHash:hash});
    const ta=await DB.TA.byEmail(email); if(ta) await DB.TA.update(ta.id,{pwHash:hash});
    const student=await DB.STUDENTS.byEmail(email); if(student) await DB.STUDENTS.update(student.studentId,{pwHash:hash});
    await DB.RESET.set(email,{...stored,used:true});
    clearLock(email);
    await MODAL.success('Updated!','Password changed. You can now sign in.');
  }

  return { setupSuperAdmin, adminLogin, adminLogout, coAdminApply, lecLogin, lecSignup, lecLogout, taLogin, taSignup, studentLogin, studentSignup, showForgotPassword, _selectLec, getSession, saveSession, clearSession };
})();
