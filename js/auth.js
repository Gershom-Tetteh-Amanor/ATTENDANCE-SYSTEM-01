/* auth.js — Authentication for all roles
   Includes email sending for UIDs and password reset via EmailJS
*/
'use strict';

const AUTH = (() => {
  const saveSession = u => localStorage.setItem(CONFIG.KEYS.USER, JSON.stringify(u));
  const getSession = () => { try{return JSON.parse(localStorage.getItem(CONFIG.KEYS.USER));}catch{return null;} };
  const clearSession = () => localStorage.removeItem(CONFIG.KEYS.USER);
  
  const LOCK_KEY = 'ugqr7_lock';
  const MAX_ATTEMPTS = 5;
  const LOCK_MINUTES = 15;

  function getLockData(email) {
    try { const d = JSON.parse(localStorage.getItem(LOCK_KEY)||'{}'); return d[email]||{attempts:0,lockUntil:0}; } catch { return {attempts:0,lockUntil:0}; }
  }
  function setLockData(email, data) {
    try { const d = JSON.parse(localStorage.getItem(LOCK_KEY)||'{}'); d[email]=data; localStorage.setItem(LOCK_KEY,JSON.stringify(d)); } catch {}
  }
  function recordFailed(email) {
    const d = getLockData(email);
    d.attempts = (d.attempts||0) + 1;
    if (d.attempts >= MAX_ATTEMPTS) d.lockUntil = Date.now() + LOCK_MINUTES * 60000;
    setLockData(email, d);
    return d;
  }
  function clearLock(email) { setLockData(email, {attempts:0,lockUntil:0}); }
  function checkLocked(email) {
    const d = getLockData(email);
    if (d.lockUntil > Date.now()) {
      const mins = Math.ceil((d.lockUntil - Date.now()) / 60000);
      return `Account locked. Too many failed attempts. Try again in ${mins} minute${mins!==1?'s':''}.`;
    }
    if (d.lockUntil > 0 && d.lockUntil <= Date.now()) clearLock(email);
    return null;
  }

  /* ══ EmailJS Helper Functions ══ */
  async function _sendUIDEmail(uid, lecturerName, lecturerEmail, department) {
    if (!CONFIG.EMAILJS || !CONFIG.EMAILJS.PUBLIC_KEY || CONFIG.EMAILJS.PUBLIC_KEY.startsWith('YOUR_')) {
      console.warn('[UG-QR] EmailJS not configured for UID email');
      return false;
    }
    try {
      const signupLink = `${CONFIG.SITE_URL}#lec-signup`;
      const templateParams = {
        to_name: lecturerName,
        to_email: lecturerEmail,
        unique_id: uid,
        department: department || 'Not specified',
        signup_link: signupLink,
        site_url: CONFIG.SITE_URL
      };
      const response = await emailjs.send(
        CONFIG.EMAILJS.SERVICE_ID,
        'template_uid_email',
        templateParams
      );
      console.log('[UG-QR] UID email sent:', response);
      return response.status === 200;
    } catch(err) {
      console.error('[UG-QR] UID email send failed:', err);
      return false;
    }
  }

  async function _sendResetCodeEmail(email, code) {
    if (!CONFIG.EMAILJS || !CONFIG.EMAILJS.PUBLIC_KEY || CONFIG.EMAILJS.PUBLIC_KEY.startsWith('YOUR_')) {
      console.warn('[UG-QR] EmailJS not configured for reset email');
      return false;
    }
    try {
      const templateParams = {
        to_email: email,
        reset_code: code,
        valid_minutes: 30,
        site_url: CONFIG.SITE_URL
      };
      const response = await emailjs.send(
        CONFIG.EMAILJS.SERVICE_ID,
        'template_reset_email',
        templateParams
      );
      console.log('[UG-QR] Reset email sent:', response);
      return response.status === 200;
    } catch(err) {
      console.error('[UG-QR] Reset email send failed:', err);
      return false;
    }
  }

  /* ══ Super admin setup (one-time) ══ */
  async function setupSuperAdmin() {
    const name=UI.Q('sa-name')?.value.trim(), email=UI.Q('sa-email')?.value.trim().toLowerCase();
    const pass=UI.Q('sa-pass')?.value, pass2=UI.Q('sa-pass2')?.value;
    UI.clrAlert('al-alert');
    if(!name||!email||!pass)return UI.setAlert('al-alert','All fields are required.');
    if(pass.length<8)        return UI.setAlert('al-alert','Password must be at least 8 characters.');
    if(pass!==pass2)         return UI.setAlert('al-alert','Passwords do not match.');
    UI.btnLoad('sa-btn',true);
    try {
      if(await DB.SA.exists()){UI.btnLoad('sa-btn',false,'Create admin account');return UI.setAlert('al-alert','An admin account already exists. Please sign in.');}
      await DB.SA.set({id:UI.makeToken(),name,email,pwHash:UI.hashPw(pass),createdAt:Date.now()});
      UI.btnLoad('sa-btn',false,'Create admin account');
      await MODAL.success('Admin account created!',`Welcome, ${name}. You can now sign in.`);
      APP._refreshAdminLogin();
    } catch(err){UI.btnLoad('sa-btn',false,'Create admin account');UI.setAlert('al-alert',err.message||'Something went wrong.');}
  }

  /* ══ Admin login ══ */
  async function adminLogin() {
    const email=UI.Q('al-email')?.value.trim().toLowerCase(), pass=UI.Q('al-pass')?.value;
    UI.clrAlert('al-alert');
    if(!email||!pass)return UI.setAlert('al-alert','Enter your email and password.');
    const locked = checkLocked(email);
    if(locked) return UI.setAlert('al-alert',locked);
    UI.btnLoad('al-btn',true);
    try {
      const hash=UI.hashPw(pass);
      const sa=await DB.SA.get();
      if(sa&&sa.email===email&&sa.pwHash===hash){clearLock(email);saveSession({...sa,role:'superAdmin'});UI.btnLoad('al-btn',false,'Sign in');await APP.activateAdmin({...sa,role:'superAdmin'});return;}
      const cas=await DB.CA.getAll(),ca=cas.find(c=>c.email===email&&c.pwHash===hash);
      if(ca){
        if(ca.status==='pending'){UI.btnLoad('al-btn',false,'Sign in');return UI.setAlert('al-alert','Your application is pending approval.');}
        if(ca.status==='revoked'){UI.btnLoad('al-btn',false,'Sign in');return UI.setAlert('al-alert','Your access has been revoked.');}
        clearLock(email);saveSession({...ca,role:'coAdmin'});UI.btnLoad('al-btn',false,'Sign in');await APP.activateAdmin({...ca,role:'coAdmin'});return;
      }
      const d=recordFailed(email);
      const remaining=MAX_ATTEMPTS-d.attempts;
      UI.btnLoad('al-btn',false,'Sign in');
      if(remaining<=0)UI.setAlert('al-alert',`Account locked for ${LOCK_MINUTES} minutes after too many failed attempts.`);
      else UI.setAlert('al-alert',`Invalid email or password. ${remaining} attempt${remaining!==1?'s':''} remaining before lockout.`);
    }catch(err){UI.btnLoad('al-btn',false,'Sign in');UI.setAlert('al-alert',err.message||'Login failed.');}
  }

  const adminLogout = () => { clearSession(); APP.goTo('landing'); };

  /* ══ Co-admin application ══ */
  async function coAdminApply() {
    const name=UI.Q('ca-name')?.value.trim(), email=UI.Q('ca-email')?.value.trim().toLowerCase();
    const dept=UI.Q('ca-dept')?.value, pass=UI.Q('ca-pass')?.value, pass2=UI.Q('ca-pass2')?.value;
    UI.clrAlert('ca-alert');
    if(!name||!email||!dept||!pass)return UI.setAlert('ca-alert','All fields are required.');
    if(pass.length<8)return UI.setAlert('ca-alert','Password must be at least 8 characters.');
    if(pass!==pass2) return UI.setAlert('ca-alert','Passwords do not match.');
    UI.btnLoad('ca-btn',true);
    try {
      if(await DB.CA.byEmail(email)){UI.btnLoad('ca-btn',false,'Submit application');return UI.setAlert('ca-alert','An application with this email already exists.');}
      const id=UI.makeToken();
      await DB.CA.set(id,{id,name,email,department:dept,pwHash:UI.hashPw(pass),status:'pending',createdAt:Date.now()});
      UI.btnLoad('ca-btn',false,'Submit application');
      await MODAL.success('Application submitted!','The administrator will review your request.');
      APP.goTo('admin-login');
    }catch(err){UI.btnLoad('ca-btn',false,'Submit application');UI.setAlert('ca-alert',err.message||'Submission failed.');}
  }

  /* ══ Lecturer login ══ */
  async function lecLogin() {
    const email=UI.Q('ll-email')?.value.trim().toLowerCase(), pass=UI.Q('ll-pass')?.value;
    UI.clrAlert('ll-alert');
    if(!email||!pass)        return UI.setAlert('ll-alert','Enter your email and password.');
    if(!UI.isLecEmail(email))return UI.setAlert('ll-alert','Email must end with .ug.edu.gh');
    const locked=checkLocked(email);
    if(locked)return UI.setAlert('ll-alert',locked);
    UI.btnLoad('ll-btn',true);
    try {
      const lec=await DB.LEC.byEmail(email);
      if(!lec||lec.pwHash!==UI.hashPw(pass)){const d=recordFailed(email);const rem=MAX_ATTEMPTS-d.attempts;UI.btnLoad('ll-btn',false,'Sign in');return UI.setAlert('ll-alert',rem<=0?`Account locked for ${LOCK_MINUTES} minutes.`:`Invalid email or password. ${rem} attempt${rem!==1?'s':''} remaining.`);}
      clearLock(email);saveSession({...lec,role:'lecturer'});UI.btnLoad('ll-btn',false,'Sign in');
      await APP.activateLecturer({...lec,role:'lecturer'});
    }catch(err){UI.btnLoad('ll-btn',false,'Sign in');UI.setAlert('ll-alert',err.message||'Login failed.');}
  }

  /* ══ Lecturer signup ══ */
  async function lecSignup() {
    const uid=UI.Q('ls-uid')?.value.trim().toUpperCase(), name=UI.Q('ls-name')?.value.trim();
    const email=UI.Q('ls-email')?.value.trim().toLowerCase(), dept=UI.Q('ls-dept')?.value;
    const pass=UI.Q('ls-pass')?.value, pass2=UI.Q('ls-pass2')?.value;
    UI.clrAlert('ls-alert');
    if(!uid||!name||!email||!dept||!pass)return UI.setAlert('ls-alert','All fields are required.');
    if(!UI.isLecEmail(email))return UI.setAlert('ls-alert','Email must end with .ug.edu.gh');
    if(pass.length<8)return UI.setAlert('ls-alert','Password must be at least 8 characters.');
    if(pass!==pass2) return UI.setAlert('ls-alert','Passwords do not match.');
    UI.btnLoad('ls-btn',true);
    try {
      const uidData=await DB.UID.get(uid);
      if(!uidData||uidData.status!=='available'){UI.btnLoad('ls-btn',false,'Create account');return UI.setAlert('ls-alert','Invalid, already used, or revoked Unique ID.');}
      if(await DB.LEC.byEmail(email)){UI.btnLoad('ls-btn',false,'Create account');return UI.setAlert('ls-alert','An account with this email already exists.');}
      const fbId=UI.makeToken();
      await DB.UID.update(uid,{status:'assigned',assignedTo:email,assignedAt:Date.now()});
      const lec={id:fbId,lecId:uid,name,email,department:dept,pwHash:UI.hashPw(pass),createdAt:Date.now()};
      await DB.LEC.set(fbId,lec);saveSession({...lec,role:'lecturer'});UI.btnLoad('ls-btn',false,'Create account');
      await MODAL.success('Account created!',`Welcome, ${name}. Your Lecturer ID: <strong>${uid}</strong>`);
      await APP.activateLecturer({...lec,role:'lecturer'});
    }catch(err){UI.btnLoad('ls-btn',false,'Create account');UI.setAlert('ls-alert',err.message||'Registration failed.');}
  }

  const lecLogout = () => { if(window.LEC && LEC.stopTimers) LEC.stopTimers(); clearSession(); APP.goTo('landing'); };

  /* ══ TA login — shows lecturer selection if multiple lecturers ══ */
  async function taLogin() {
    const email=UI.Q('tl-email')?.value.trim().toLowerCase(), pass=UI.Q('tl-pass')?.value;
    UI.clrAlert('tl-alert');
    if(!email||!pass)       return UI.setAlert('tl-alert','Enter your email and password.');
    if(!UI.isTAEmail(email))return UI.setAlert('tl-alert','Email must end with @st.ug.edu.gh');
    const locked=checkLocked(email);
    if(locked)return UI.setAlert('tl-alert',locked);
    UI.btnLoad('tl-btn',true);
    try {
      const ta=await DB.TA.byEmail(email);
      if(!ta||ta.pwHash!==UI.hashPw(pass)){const d=recordFailed(email);const rem=MAX_ATTEMPTS-d.attempts;UI.btnLoad('tl-btn',false,'Sign in');return UI.setAlert('tl-alert',rem<=0?`Account locked for ${LOCK_MINUTES} minutes.`:`Invalid email or password. ${rem} attempt${rem!==1?'s':''} remaining.`);}
      if(ta.status!=='active'){UI.btnLoad('tl-btn',false,'Sign in');return UI.setAlert('tl-alert','TA account is not active. Contact your lecturer.');}
      clearLock(email);
      UI.btnLoad('tl-btn',false,'Sign in');

      const lecIds = ta.lecturers || [];
      if(lecIds.length > 1) {
        const selected = await _pickLecturer(lecIds);
        if(!selected) return;
        saveSession({...ta,role:'ta',activeLecturerId:selected.id});
        await APP.activateLecturer({...ta,role:'ta',activeLecturerId:selected.id});
      } else {
        saveSession({...ta,role:'ta',activeLecturerId:lecIds[0]||null});
        await APP.activateLecturer({...ta,role:'ta',activeLecturerId:lecIds[0]||null});
      }
    }catch(err){UI.btnLoad('tl-btn',false,'Sign in');UI.setAlert('tl-alert',err.message||'Login failed.');}
  }

  async function _pickLecturer(lecIds) {
    const lecs = await Promise.all(lecIds.map(id => DB.LEC.get(id)));
    const valid = lecs.filter(Boolean);
    if(!valid.length) return null;

    const options = valid.map((l,i) => `
      <div class="lec-pick-item" data-idx="${i}" onclick="AUTH._selectLec(${i})" style="
        padding:14px 16px;border:2px solid var(--border);border-radius:10px;cursor:pointer;
        margin-bottom:8px;transition:border-color .15s;background:var(--surface)">
        <div style="font-weight:600;color:var(--ug)">${UI.esc(l.name)}</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px">${UI.esc(l.department||'—')} · ${UI.esc(l.email)}</div>
      </div>`).join('');

    return new Promise(resolve => {
      window._lecPickResolve = idx => {
        delete window._lecPickResolve;
        MODAL.close();
        resolve(valid[idx] || null);
      };
      MODAL.alert(
        'Which lecturer are you assisting today?',
        `<div style="text-align:left;margin-top:4px">${options}</div>
         <div style="font-size:12px;color:var(--text3);margin-top:10px;text-align:center">
           You can switch later by signing out and signing back in.
         </div>`,
        { icon: '🎓', btnLabel: 'Cancel', btnCls: 'btn-secondary' }
      ).then(() => resolve(null));
    });
  }

  function _selectLec(idx) {
    if(window._lecPickResolve) window._lecPickResolve(idx);
  }

  /* ══ TA signup ══ */
  async function taSignup() {
    const code=UI.Q('ts-code')?.value.trim().toUpperCase(), name=UI.Q('ts-name')?.value.trim();
    const email=UI.Q('ts-email')?.value.trim().toLowerCase(), pass=UI.Q('ts-pass')?.value, pass2=UI.Q('ts-pass2')?.value;
    UI.clrAlert('ts-alert');
    if(!code||!name||!email||!pass)return UI.setAlert('ts-alert','All fields are required.');
    if(!UI.isTAEmail(email))         return UI.setAlert('ts-alert','Email must end with @st.ug.edu.gh');
    if(pass.length<8)                return UI.setAlert('ts-alert','Password must be at least 8 characters.');
    if(pass!==pass2)                 return UI.setAlert('ts-alert','Passwords do not match.');
    UI.btnLoad('ts-btn',true);
    try {
      const entry=await DB.TA.inviteByCode(code);
      if(!entry){UI.btnLoad('ts-btn',false,'Create TA account');return UI.setAlert('ts-alert','Invalid invite code.');}
      const [invKey,inv]=entry;
      if(inv.usedAt)              {UI.btnLoad('ts-btn',false,'Create TA account');return UI.setAlert('ts-alert','This invite code has already been used.');}
      if(inv.expiresAt<Date.now()){UI.btnLoad('ts-btn',false,'Create TA account');return UI.setAlert('ts-alert','Code expired. Ask your lecturer for a new invite.');}
      if(inv.toEmail.toLowerCase()!==email){UI.btnLoad('ts-btn',false,'Create TA account');return UI.setAlert('ts-alert','This code was issued for a different email.');}
      const existing=await DB.TA.byEmail(email);let uid;
      if(existing){uid=existing.id;const lecs=existing.lecturers||[];if(!lecs.includes(inv.lecturerId))await DB.TA.update(uid,{lecturers:[...lecs,inv.lecturerId]});}
      else{uid=UI.makeToken();await DB.TA.set(uid,{id:uid,name,email,pwHash:UI.hashPw(pass),lecturers:[inv.lecturerId],status:'active',createdAt:Date.now()});}
      await DB.TA.updateInvite(invKey,{usedAt:Date.now(),taId:uid});
      const ta=await DB.TA.get(uid);saveSession({...ta,id:uid,role:'ta',activeLecturerId:inv.lecturerId});
      UI.btnLoad('ts-btn',false,'Create TA account');
      await MODAL.success('TA account created!',`Welcome, ${name}!`);
      await APP.activateLecturer({...ta,id:uid,role:'ta',activeLecturerId:inv.lecturerId});
    }catch(err){UI.btnLoad('ts-btn',false,'Create TA account');UI.setAlert('ts-alert',err.message||'Registration failed.');}
  }

  /* ══ Student Login ══ */
  async function studentLogin() {
    const studentId = UI.Q('sl-id')?.value.trim().toUpperCase();
    const pass = UI.Q('sl-pass')?.value;
    UI.clrAlert('sl-alert');
    if(!studentId||!pass) return UI.setAlert('sl-alert','Enter your Student ID and password.');
    UI.btnLoad('sl-btn', true);
    try {
      const student = await DB.STUDENTS.byStudentId(studentId);
      if(!student || student.pwHash !== UI.hashPw(pass)) {
        UI.btnLoad('sl-btn', false, 'Sign in');
        return UI.setAlert('sl-alert','Invalid Student ID or password.');
      }
      saveSession({...student, role:'student'});
      UI.btnLoad('sl-btn', false, 'Sign in');
      await APP.activateStudent({...student, role:'student'});
    } catch(err) {
      UI.btnLoad('sl-btn', false, 'Sign in');
      UI.setAlert('sl-alert', err.message || 'Login failed.');
    }
  }

  /* ══ Student Signup ══ */
  async function studentSignup() {
    const studentId = UI.Q('ss-id')?.value.trim().toUpperCase();
    const name = UI.Q('ss-name')?.value.trim();
    const email = UI.Q('ss-email')?.value.trim().toLowerCase();
    const pass = UI.Q('ss-pass')?.value;
    const pass2 = UI.Q('ss-pass2')?.value;
    UI.clrAlert('ss-alert');
    if(!studentId||!name||!email||!pass) return UI.setAlert('ss-alert','All fields are required.');
    if(!email.endsWith('.ug.edu.gh')&&!email.endsWith('@st.ug.edu.gh')) return UI.setAlert('ss-alert','Email must be a UG email (@st.ug.edu.gh or @ug.edu.gh)');
    if(pass.length<6) return UI.setAlert('ss-alert','Password must be at least 6 characters.');
    if(pass!==pass2) return UI.setAlert('ss-alert','Passwords do not match.');
    UI.btnLoad('ss-btn', true);
    try {
      const existing = await DB.STUDENTS.byStudentId(studentId);
      if(existing) {
        UI.btnLoad('ss-btn', false, 'Create account');
        return UI.setAlert('ss-alert','A student with this ID already exists.');
      }
      const student = {
        studentId: studentId,
        name: name,
        email: email,
        pwHash: UI.hashPw(pass),
        registeredAt: Date.now(),
        active: true,
        createdAt: Date.now()
      };
      await DB.STUDENTS.set(studentId, student);
      saveSession({...student, role:'student'});
      UI.btnLoad('ss-btn', false, 'Create account');
      await MODAL.success('Account created!', `Welcome, ${name}! You can now check in to courses.`);
      await APP.activateStudent({...student, role:'student'});
    } catch(err) {
      UI.btnLoad('ss-btn', false, 'Create account');
      UI.setAlert('ss-alert', err.message || 'Registration failed.');
    }
  }

  /* ══ Forgot password with email ══ */
  async function showForgotPassword(alertId) {
    const email = await MODAL.prompt(
      'Reset your password',
      'Enter the email address linked to your account. We will send a reset code.',
      { icon:'🔑', placeholder:'your@email.com', confirmLabel:'Send reset code' }
    );
    if(!email || !email.trim()) return;
    const e = email.trim().toLowerCase();

    try {
      /* Check the account exists across all roles */
      let found = false;
      let accountType = null;
      
      const sa = await DB.SA.get();
      if(sa && sa.email === e) { found = true; accountType = 'admin'; }
      if(!found){ const lec = await DB.LEC.byEmail(e); if(lec) { found = true; accountType = 'lecturer'; } }
      if(!found){ const cas = await DB.CA.getAll(); if(cas.find(c => c.email === e)) { found = true; accountType = 'coadmin'; } }
      if(!found){ const ta = await DB.TA.byEmail(e); if(ta) { found = true; accountType = 'ta'; } }
      if(!found){ const student = await DB.STUDENTS.byEmail(e); if(student) { found = true; accountType = 'student'; } }

      if(!found){
        await MODAL.error('Email not found','No account is registered with that email address.');
        return;
      }

      /* Generate a 6-digit reset code, valid 30 minutes */
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Date.now() + 30 * 60 * 1000;
      await DB.RESET.set(e, { code, expiresAt, used: false, accountType });

      /* Send email via EmailJS */
      const emailSent = await _sendResetCodeEmail(e, code);
      
      if(emailSent) {
        await MODAL.success('Reset code sent!', 
          `A 6-digit reset code has been sent to <strong>${UI.esc(e)}</strong>.<br/>
           <span style="font-size:12px;color:var(--text3)">Check your inbox (and spam folder). Valid for 30 minutes.</span>`
        );
      } else {
        /* Fallback for demo mode or email failure */
        await MODAL.alert('Your reset code (Email not configured)',
          `<div style="margin-bottom:10px;color:var(--text3);font-size:13px">
             (EmailJS not configured — in production this would be sent to your email)
           </div>
           <div style="background:var(--ug);color:var(--gold);font-family:monospace;font-size:32px;
                       font-weight:700;letter-spacing:.2em;text-align:center;padding:16px;border-radius:10px">
             ${code}
           </div>
           <div style="font-size:12px;color:var(--text3);text-align:center;margin-top:8px">
             Valid for 30 minutes
           </div>`,
          { icon:'📧', btnLabel:'I have the code' }
        );
      }

      /* Ask for code + new password */
      await _enterResetCode(e);

    } catch(err) {
      console.error('Forgot password error:', err);
      await MODAL.error('Error', err.message || 'Could not send reset code.');
    }
  }

  async function _enterResetCode(email) {
    const code = await MODAL.prompt('Enter reset code',
      `Enter the 6-digit code sent to ${UI.esc(email)}:`,
      { icon:'🔢', placeholder:'123456', confirmLabel:'Verify code' }
    );
    if(!code) return;

    const stored = await DB.RESET.get(email);
    if(!stored || stored.used) { await MODAL.error('Invalid code','This code is no longer valid.'); return; }
    if(stored.expiresAt < Date.now()) { await MODAL.error('Code expired','The reset code has expired. Please request a new one.'); return; }
    if(stored.code !== code.trim()) { await MODAL.error('Wrong code','That code is incorrect. Please try again.'); return; }

    const newPass = await MODAL.prompt('Set new password',
      'Enter your new password (at least 8 characters):',
      { icon:'🔒', placeholder:'New password', inpType:'password', confirmLabel:'Set password' }
    );
    if(!newPass || newPass.length < 8) { await MODAL.error('Too short','Password must be at least 8 characters.'); return; }

    /* Update password across all roles */
    const hash = UI.hashPw(newPass);
    
    const sa = await DB.SA.get();
    if(sa && sa.email === email) await DB.SA.update({ pwHash: hash });
    
    const lec = await DB.LEC.byEmail(email);
    if(lec) { const a = await DB.LEC.get(lec.id) || lec; await DB.LEC.set(a.id, { ...a, pwHash: hash }); }
    
    const cas = await DB.CA.getAll();
    const ca = cas.find(c => c.email === email);
    if(ca) await DB.CA.update(ca.id, { pwHash: hash });
    
    const ta = await DB.TA.byEmail(email);
    if(ta) await DB.TA.update(ta.id, { pwHash: hash });
    
    const student = await DB.STUDENTS.byEmail(email);
    if(student) await DB.STUDENTS.update(student.studentId, { pwHash: hash });

    /* Mark code used */
    await DB.RESET.set(email, { ...stored, used: true });
    /* Clear lockout */
    clearLock(email);

    await MODAL.success('Password updated!', 'Your password has been changed. You can now sign in.');
  }

  return {
    setupSuperAdmin,
    adminLogin,
    adminLogout,
    coAdminApply,
    lecLogin,
    lecSignup,
    lecLogout,
    taLogin,
    taSignup,
    studentLogin,
    studentSignup,
    showForgotPassword,
    _selectLec,
    _sendUIDEmail,
    _sendResetCodeEmail,
    getSession,
    saveSession,
    clearSession,
  };
})();
