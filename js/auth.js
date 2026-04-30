/* auth.js — Authentication for all roles with complete fixes */
'use strict';

const AUTH = (() => {
  const SESSION_EXPIRY_DAYS = 7;
  
  const saveSession = u => {
    const sessionWithExpiry = {
      ...u,
      expiresAt: Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
      loggedInAt: Date.now()
    };
    localStorage.setItem(CONFIG.KEYS.USER, JSON.stringify(sessionWithExpiry));
    console.log('[AUTH] Session saved for user:', u.email);
  };
  
  const getSession = () => { 
    try {
      const session = JSON.parse(localStorage.getItem(CONFIG.KEYS.USER));
      if (!session) return null;
      
      if (session.expiresAt && session.expiresAt < Date.now()) {
        console.log('[AUTH] Session expired, clearing');
        clearSession();
        return null;
      }
      return session;
    } catch {
      return null;
    } 
  };
  
  const clearSession = () => {
    localStorage.removeItem(CONFIG.KEYS.USER);
    sessionStorage.removeItem('current_view');
    sessionStorage.removeItem('selected_course_code');
    sessionStorage.removeItem('selected_course_name');
    sessionStorage.removeItem('starting_course_code');
    sessionStorage.removeItem('starting_course_name');
    sessionStorage.removeItem('active_lecturer_id');
    console.log('[AUTH] Session cleared');
  };
  
  const LOCK_KEY = 'ugqr7_lock';
  const MAX_ATTEMPTS = 5;
  const LOCK_MINUTES = 15;

  function getLockData(email) {
    try { 
      const d = JSON.parse(localStorage.getItem(LOCK_KEY)||'{}'); 
      return d[email]||{attempts:0,lockUntil:0}; 
    } catch { 
      return {attempts:0,lockUntil:0}; 
    }
  }
  
  function setLockData(email, data) {
    try { 
      const d = JSON.parse(localStorage.getItem(LOCK_KEY)||'{}'); 
      d[email]=data; 
      localStorage.setItem(LOCK_KEY,JSON.stringify(d)); 
    } catch {}
  }
  
  function recordFailed(email) {
    const d = getLockData(email);
    d.attempts = (d.attempts||0) + 1;
    if (d.attempts >= MAX_ATTEMPTS) d.lockUntil = Date.now() + LOCK_MINUTES * 60000;
    setLockData(email, d);
    return d;
  }
  
  function clearLock(email) { 
    setLockData(email, {attempts:0,lockUntil:0}); 
  }
  
  function checkLocked(email) {
    const d = getLockData(email);
    if (d.lockUntil > Date.now()) {
      const mins = Math.ceil((d.lockUntil - Date.now()) / 60000);
      return `Account locked. Try again in ${mins} minute${mins!==1?'s':''}.`;
    }
    if (d.lockUntil > 0 && d.lockUntil <= Date.now()) clearLock(email);
    return null;
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ══ HELPER: Safe getElement ══ */
  function getElem(id) {
    return document.getElementById(id);
  }

  /* ══ EMAIL FUNCTIONS USING MAILTO (No API Required) ══ */
  
  async function _sendInviteEmail(params) {
    // Fallback: show modal with code
    const modalContent = `
      <div style="text-align:center">
        <div class="strip-amber" style="margin-bottom:15px;">
          <strong>📧 Share this invitation with ${escapeHtml(params.name)}</strong>
        </div>
        <div style="background:var(--surface2); padding:20px; border-radius:10px; margin:15px 0;">
          <p><strong>📧 Recipient:</strong> ${escapeHtml(params.to_email)}</p>
          <p><strong>🔑 Registration Code:</strong></p>
          <div style="font-size:32px; font-family:monospace; background:var(--ug); color:var(--gold); padding:15px; border-radius:8px; margin:10px 0;">
            ${escapeHtml(params.code)}
          </div>
          <p><strong>🔗 Registration Link:</strong></p>
          <div style="word-break:break-all;">
            <a href="${escapeHtml(params.signup_link)}" target="_blank">${escapeHtml(params.signup_link)}</a>
          </div>
        </div>
        <button onclick="navigator.clipboard.writeText('Code: ${escapeHtml(params.code)}\\nLink: ${escapeHtml(params.signup_link)}')" 
                class="btn btn-ug" style="margin:5px;">
          📋 Copy to Clipboard
        </button>
        <button onclick="window.location.href='mailto:${escapeHtml(params.to_email)}?subject=UG QR Invitation&body=Code: ${escapeHtml(params.code)}%0ALink: ${escapeHtml(params.signup_link)}'" 
                class="btn btn-secondary" style="margin:5px;">
          📧 Open Email Client
        </button>
      </div>
    `;
    
    await MODAL.alert(`Share Invitation for ${escapeHtml(params.name)}`, modalContent, {
      icon: '📧',
      btnLabel: 'Close',
      width: '500px'
    });
    return true;
  }

  async function _sendUIDEmail(uid, lecturerName, lecturerEmail, department) {
    return await _sendInviteEmail({
      to_email: lecturerEmail,
      name: lecturerName,
      code: uid,
      role: 'Lecturer',
      signup_link: `${CONFIG.SITE_URL}#lec-signup`,
      department: department,
      lecturer_name: 'Administrator'
    });
  }

  async function _sendTAInviteEmail(email, name, code, signupLink, lecturerName) {
    return await _sendInviteEmail({
      to_email: email,
      name: name || 'Teaching Assistant',
      code: code,
      role: 'Teaching Assistant',
      signup_link: signupLink || `${CONFIG.SITE_URL}#ta-signup`,
      lecturer_name: lecturerName || 'Your Lecturer',
      department: ''
    });
  }

  async function _sendBiometricResetEmail(email, name, resetLink, lecturerName) {
    await MODAL.alert(
      'Passkey Reset Link',
      `<div style="text-align:center">
         <div class="strip-amber">🔗 Share this link with ${escapeHtml(name)}:</div>
         <div style="background:var(--surface2); padding:15px; border-radius:8px; margin:10px 0; word-break:break-all">
           <a href="${escapeHtml(resetLink)}" target="_blank">${escapeHtml(resetLink)}</a>
         </div>
         <button onclick="navigator.clipboard.writeText('${escapeHtml(resetLink)}')" class="btn btn-ug">📋 Copy Link</button>
       </div>`,
      { icon: '🔗', btnLabel: 'Close' }
    );
    return true;
  }

  async function _sendResetCodeEmail(email, code) {
    await MODAL.alert(
      'Password Reset Code',
      `<div style="text-align:center">
         <div style="font-size:36px; font-family:monospace; background:var(--ug); color:var(--gold); padding:20px; border-radius:10px; margin:15px 0;">
           ${escapeHtml(code)}
         </div>
         <p class="note">Valid for 30 minutes</p>
       </div>`,
      { icon: '🔑', btnLabel: 'Close' }
    );
    return true;
  }

  /* ══ Super admin setup ══ */
  async function setupSuperAdmin() {
    const name = getElem('sa-name')?.value.trim();
    const email = getElem('sa-email')?.value.trim().toLowerCase();
    const pass = getElem('sa-pass')?.value;
    const pass2 = getElem('sa-pass2')?.value;
    
    const alertEl = getElem('al-alert');
    if (alertEl) UI.clrAlert('al-alert');
    if(!name||!email||!pass) return UI.setAlert('al-alert','All fields are required.');
    if(pass.length<8) return UI.setAlert('al-alert','Password must be at least 8 characters.');
    if(pass!==pass2) return UI.setAlert('al-alert','Passwords do not match.');
    
    UI.btnLoad('sa-btn',true);
    try {
      if(await DB.SA.exists()) {
        UI.btnLoad('sa-btn',false,'Create admin account');
        return UI.setAlert('al-alert','An admin account already exists.');
      }
      await DB.SA.set({
        id: Math.random().toString(36).substring(2, 15),
        name,
        email,
        pwHash: UI.hashPw(pass),
        createdAt: Date.now()
      });
      UI.btnLoad('sa-btn',false,'Create admin account');
      await MODAL.success('Admin account created!', `Welcome, ${escapeHtml(name)}. You can now sign in.`);
      if (typeof APP !== 'undefined' && APP._refreshAdminLogin) {
        APP._refreshAdminLogin();
      }
    } catch(err) {
      UI.btnLoad('sa-btn',false,'Create admin account');
      UI.setAlert('al-alert',err.message||'Something went wrong.');
    }
  }

  /* ══ Admin login ══ */
  async function adminLogin() {
    const email = getElem('al-email')?.value.trim().toLowerCase();
    const pass = getElem('al-pass')?.value;
    UI.clrAlert('al-alert');
    if(!email||!pass) return UI.setAlert('al-alert','Enter your email and password.');
    
    const locked = checkLocked(email);
    if(locked) return UI.setAlert('al-alert',locked);
    
    UI.btnLoad('al-btn',true);
    try {
      const hash = UI.hashPw(pass);
      const sa = await DB.SA.get();
      
      if(sa && sa.email === email && sa.pwHash === hash) {
        clearLock(email);
        saveSession({...sa, role: 'superAdmin'});
        UI.btnLoad('al-btn',false,'Sign in');
        if (typeof APP !== 'undefined' && APP.activateAdmin) {
          await APP.activateAdmin({...sa, role: 'superAdmin'});
        }
        return;
      }
      
      const cas = await DB.CA.getAll();
      const ca = cas.find(c => c.email === email && c.pwHash === hash);
      
      if(ca) {
        if(ca.status === 'pending') {
          UI.btnLoad('al-btn',false,'Sign in');
          return UI.setAlert('al-alert','Your application is pending approval.');
        }
        if(ca.status === 'revoked') {
          UI.btnLoad('al-btn',false,'Sign in');
          return UI.setAlert('al-alert','Your access has been revoked.');
        }
        clearLock(email);
        saveSession({...ca, role: 'coAdmin'});
        UI.btnLoad('al-btn',false,'Sign in');
        if (typeof APP !== 'undefined' && APP.activateAdmin) {
          await APP.activateAdmin({...ca, role: 'coAdmin'});
        }
        return;
      }
      
      const d = recordFailed(email);
      const remaining = MAX_ATTEMPTS - d.attempts;
      UI.btnLoad('al-btn',false,'Sign in');
      if(remaining <= 0) UI.setAlert('al-alert',`Account locked for ${LOCK_MINUTES} minutes.`);
      else UI.setAlert('al-alert',`Invalid email or password. ${remaining} attempt${remaining!==1?'s':''} remaining.`);
    } catch(err) {
      UI.btnLoad('al-btn',false,'Sign in');
      UI.setAlert('al-alert',err.message||'Login failed.');
    }
  }

  const adminLogout = () => { 
    clearSession(); 
    if (typeof APP !== 'undefined') APP.goTo('landing'); 
  };

  /* ══ Co-admin application ══ */
  async function coAdminApply() {
    const name = getElem('ca-name')?.value.trim();
    const email = getElem('ca-email')?.value.trim().toLowerCase();
    const dept = getElem('ca-dept')?.value;
    const pass = getElem('ca-pass')?.value;
    const pass2 = getElem('ca-pass2')?.value;
    
    UI.clrAlert('ca-alert');
    if(!name||!email||!dept||!pass) return UI.setAlert('ca-alert','All fields are required.');
    if(pass.length<8) return UI.setAlert('ca-alert','Password must be at least 8 characters.');
    if(pass!==pass2) return UI.setAlert('ca-alert','Passwords do not match.');
    
    UI.btnLoad('ca-btn',true);
    try {
      if(await DB.CA.byEmail(email)) {
        UI.btnLoad('ca-btn',false,'Submit application');
        return UI.setAlert('ca-alert','An application with this email already exists.');
      }
      const id = Math.random().toString(36).substring(2, 15);
      await DB.CA.set(id, {
        id,
        name,
        email,
        department: dept,
        pwHash: UI.hashPw(pass),
        status: 'pending',
        createdAt: Date.now()
      });
      UI.btnLoad('ca-btn',false,'Submit application');
      await MODAL.success('Application submitted!', 'The administrator will review your request.');
      if (typeof APP !== 'undefined') APP.goTo('admin-login');
    } catch(err) {
      UI.btnLoad('ca-btn',false,'Submit application');
      UI.setAlert('ca-alert',err.message||'Submission failed.');
    }
  }

  /* ══ Lecturer login ══ */
  async function lecLogin() {
    const email = getElem('ll-email')?.value.trim().toLowerCase();
    const pass = getElem('ll-pass')?.value;
    UI.clrAlert('ll-alert');
    if(!email||!pass) return UI.setAlert('ll-alert','Enter your email and password.');
    
    const locked = checkLocked(email);
    if(locked) return UI.setAlert('ll-alert',locked);
    
    UI.btnLoad('ll-btn',true);
    try {
      const lec = await DB.LEC.byEmail(email);
      if(!lec || lec.pwHash !== UI.hashPw(pass)) {
        const d = recordFailed(email);
        const rem = MAX_ATTEMPTS - d.attempts;
        UI.btnLoad('ll-btn',false,'Sign in');
        return UI.setAlert('ll-alert',rem<=0?`Account locked for ${LOCK_MINUTES} minutes.`:`Invalid email or password. ${rem} attempt${rem!==1?'s':''} remaining.`);
      }
      clearLock(email);
      saveSession({...lec, role: 'lecturer'});
      UI.btnLoad('ll-btn',false,'Sign in');
      if (typeof APP !== 'undefined' && APP.activateLecturer) {
        await APP.activateLecturer({...lec, role: 'lecturer'});
      }
    } catch(err) {
      UI.btnLoad('ll-btn',false,'Sign in');
      UI.setAlert('ll-alert',err.message||'Login failed.');
    }
  }

  /* ══ Lecturer signup ══ */
  async function lecSignup() {
    const uid = getElem('ls-uid')?.value.trim().toUpperCase();
    const name = getElem('ls-name')?.value.trim();
    const email = getElem('ls-email')?.value.trim().toLowerCase();
    const dept = getElem('ls-dept')?.value;
    const pass = getElem('ls-pass')?.value;
    const pass2 = getElem('ls-pass2')?.value;
    
    UI.clrAlert('ls-alert');
    if(!uid||!name||!email||!dept||!pass) return UI.setAlert('ls-alert','All fields are required.');
    if(pass.length<8) return UI.setAlert('ls-alert','Password must be at least 8 characters.');
    if(pass!==pass2) return UI.setAlert('ls-alert','Passwords do not match.');
    
    UI.btnLoad('ls-btn',true);
    try {
      const uidData = await DB.UID.get(uid);
      if(!uidData || uidData.status !== 'available') {
        UI.btnLoad('ls-btn',false,'Create account');
        return UI.setAlert('ls-alert','Invalid, already used, or revoked Unique ID.');
      }
      if(await DB.LEC.byEmail(email)) {
        UI.btnLoad('ls-btn',false,'Create account');
        return UI.setAlert('ls-alert','An account with this email already exists.');
      }
      
      const fbId = Math.random().toString(36).substring(2, 15);
      await DB.UID.update(uid, { status: 'assigned', assignedTo: email, assignedAt: Date.now() });
      
      const lec = {
        id: fbId,
        lecId: uid,
        name,
        email,
        department: dept,
        pwHash: UI.hashPw(pass),
        createdAt: Date.now()
      };
      await DB.LEC.set(fbId, lec);
      saveSession({...lec, role: 'lecturer'});
      UI.btnLoad('ls-btn',false,'Create account');
      await MODAL.success('Account created!', `Welcome, ${escapeHtml(name)}. Your Lecturer ID: <strong>${escapeHtml(uid)}</strong>`);
      if (typeof APP !== 'undefined' && APP.activateLecturer) {
        await APP.activateLecturer({...lec, role: 'lecturer'});
      }
    } catch(err) {
      UI.btnLoad('ls-btn',false,'Create account');
      UI.setAlert('ls-alert',err.message||'Registration failed.');
    }
  }

  const lecLogout = () => { 
    if(window.LEC && LEC.stopTimers) LEC.stopTimers(); 
    clearSession(); 
    if (typeof APP !== 'undefined') APP.goTo('landing'); 
  };

  /* ══ TA login ══ */
  async function taLogin() {
    const email = getElem('tl-email')?.value.trim().toLowerCase();
    const pass = getElem('tl-pass')?.value;
    UI.clrAlert('tl-alert');
    if (!email || !pass) return UI.setAlert('tl-alert', 'Enter your email and password.');
    
    UI.btnLoad('tl-btn', true);
    try {
      const ta = await DB.TA.byEmail(email);
      if (!ta || ta.pwHash !== UI.hashPw(pass)) {
        UI.btnLoad('tl-btn', false, 'Sign in');
        return UI.setAlert('tl-alert', 'Invalid email or password.');
      }
      
      if (ta.active === false) {
        UI.btnLoad('tl-btn', false, 'Sign in');
        return UI.setAlert('tl-alert', 'Your account has been deactivated. Contact your lecturer.');
      }
      
      const lecturers = ta.lecturers || [];
      const activeLecturers = [];
      const endedTenures = ta.endedTenures || {};
      
      for (const lecId of lecturers) {
        if (!endedTenures[lecId]) {
          const lecturer = await DB.LEC.get(lecId);
          if (lecturer && lecturer.active !== false && lecturer.status !== 'suspended') {
            activeLecturers.push({
              id: lecturer.id,
              name: lecturer.name,
              email: lecturer.email,
              department: lecturer.department
            });
          }
        }
      }
      
      if (activeLecturers.length === 0) {
        UI.btnLoad('tl-btn', false, 'Sign in');
        return UI.setAlert('tl-alert', 'You have no active lecturer assignments. Contact your lecturer.');
      }
      
      if (activeLecturers.length === 1) {
        const selected = activeLecturers[0];
        saveSession({ ...ta, role: 'ta', activeLecturerId: selected.id, activeLecturer: selected });
        sessionStorage.setItem('active_lecturer_id', selected.id);
        UI.btnLoad('tl-btn', false, 'Sign in');
        if (typeof APP !== 'undefined' && APP.activateLecturer) {
          await APP.activateLecturer({ ...ta, role: 'ta', activeLecturerId: selected.id });
        }
      } else {
        const selected = await _selectLecturerModal(activeLecturers);
        if (!selected) {
          UI.btnLoad('tl-btn', false, 'Sign in');
          return;
        }
        saveSession({ ...ta, role: 'ta', activeLecturerId: selected.id, activeLecturer: selected });
        sessionStorage.setItem('active_lecturer_id', selected.id);
        UI.btnLoad('tl-btn', false, 'Sign in');
        if (typeof APP !== 'undefined' && APP.activateLecturer) {
          await APP.activateLecturer({ ...ta, role: 'ta', activeLecturerId: selected.id });
        }
      }
    } catch(err) {
      UI.btnLoad('tl-btn', false, 'Sign in');
      console.error('TA login error:', err);
      UI.setAlert('tl-alert', err.message || 'Login failed.');
    }
  }

  async function _selectLecturerModal(lecturers) {
    return new Promise((resolve) => {
      const options = lecturers.map((l, i) => `
        <div onclick="AUTH._selectLecturerCallback(${i})" style="
          padding:15px; 
          border:2px solid var(--border); 
          border-radius:10px; 
          margin-bottom:10px; 
          cursor:pointer;
          background:var(--surface);
          transition:all 0.2s"
          onmouseover="this.style.borderColor='var(--ug)'"
          onmouseout="this.style.borderColor='var(--border)'">
          <div style="font-weight:700; color:var(--ug); font-size:16px">${escapeHtml(l.name)}</div>
          <div style="font-size:12px; color:var(--text3); margin-top:5px">${escapeHtml(l.department || 'Department')} · ${escapeHtml(l.email)}</div>
        </div>
      `).join('');
      
      MODAL.alert(
        'Select Lecturer Dashboard',
        `<div style="text-align:center; margin-bottom:15px">
           <div style="font-size:48px; margin-bottom:10px">👥</div>
           <p>You are assigned as TA to multiple lecturers.</p>
           <p style="font-size:13px; color:var(--text3); margin-bottom:15px">Please select which dashboard to access:</p>
         </div>
         ${options}`,
        { icon: '', btnLabel: 'Cancel' }
      ).then(() => resolve(null));
      
      window._selectLecturerCallback = (index) => {
        MODAL.close();
        resolve(lecturers[index]);
        delete window._selectLecturerCallback;
      };
    });
  }

  function _selectLecturerCallback(index) {
    if (window._selectLecturerCallback) window._selectLecturerCallback(index);
  }

  /* ══ TA signup ══ */
  async function taSignup() {
    const code = getElem('ts-code')?.value.trim().toUpperCase();
    const name = getElem('ts-name')?.value.trim();
    const email = getElem('ts-email')?.value.trim().toLowerCase();
    const pass = getElem('ts-pass')?.value;
    const pass2 = getElem('ts-pass2')?.value;
    
    UI.clrAlert('ts-alert');
    if (!code || !name || !email || !pass) return UI.setAlert('ts-alert', 'All fields are required.');
    if (pass.length < 8) return UI.setAlert('ts-alert', 'Password must be at least 8 characters.');
    if (pass !== pass2) return UI.setAlert('ts-alert', 'Passwords do not match.');
    
    UI.btnLoad('ts-btn', true);
    try {
      const entry = await DB.TA.inviteByCode(code);
      if (!entry) {
        UI.btnLoad('ts-btn', false, 'Create TA account');
        return UI.setAlert('ts-alert', 'Invalid invite code.');
      }
      
      const [invKey, inv] = entry;
      if (inv.usedAt) {
        UI.btnLoad('ts-btn', false, 'Create TA account');
        return UI.setAlert('ts-alert', 'This invite code has already been used.');
      }
      if (inv.expiresAt < Date.now()) {
        UI.btnLoad('ts-btn', false, 'Create TA account');
        return UI.setAlert('ts-alert', 'Code expired. Ask your lecturer for a new invite.');
      }
      if (inv.toEmail.toLowerCase() !== email) {
        UI.btnLoad('ts-btn', false, 'Create TA account');
        return UI.setAlert('ts-alert', 'This code was issued for a different email.');
      }
      
      const existing = await DB.TA.byEmail(email);
      let uid;
      
      if (existing) {
        uid = existing.id;
        const lecs = existing.lecturers || [];
        if (!lecs.includes(inv.lecturerId)) {
          await DB.TA.update(uid, { 
            lecturers: [...lecs, inv.lecturerId],
            name: name,
            status: 'active'
          });
        }
      } else {
        uid = Math.random().toString(36).substring(2, 15);
        await DB.TA.set(uid, {
          id: uid,
          name: name,
          email: email,
          pwHash: UI.hashPw(pass),
          lecturers: [inv.lecturerId],
          status: 'active',
          active: true,
          createdAt: Date.now(),
          endedTenures: {}
        });
      }
      
      await DB.TA.updateInvite(invKey, { usedAt: Date.now(), taId: uid });
      const ta = await DB.TA.get(uid);
      
      saveSession({ ...ta, role: 'ta', activeLecturerId: inv.lecturerId });
      UI.btnLoad('ts-btn', false, 'Create TA account');
      await MODAL.success('TA account created!', `Welcome, ${escapeHtml(name)}! You can now sign in.`);
      if (typeof APP !== 'undefined' && APP.activateLecturer) {
        await APP.activateLecturer({ ...ta, role: 'ta', activeLecturerId: inv.lecturerId });
      }
    } catch(err) {
      UI.btnLoad('ts-btn', false, 'Create TA account');
      UI.setAlert('ts-alert', err.message || 'Registration failed.');
    }
  }

  /* ══ Student Login (Password OR Biometric) ══ */
  async function studentLogin() {
    const studentId = getElem('sl-id')?.value.trim().toUpperCase();
    const pass = getElem('sl-pass')?.value;
    UI.clrAlert('sl-alert');
    if(!studentId) return UI.setAlert('sl-alert','Enter your Student ID.');
    
    UI.btnLoad('sl-btn', true);
    try {
      const student = await DB.STUDENTS.byStudentId(studentId);
      if(!student) {
        UI.btnLoad('sl-btn', false, 'Sign in');
        return UI.setAlert('sl-alert','Invalid Student ID or password.');
      }
      
      // Check if biometric login is available
      const hasBiometric = student.webAuthnCredentialId ? true : false;
      
      if (hasBiometric && window.PublicKeyCredential) {
        // Offer biometric login first
        const useBiometric = await MODAL.confirm(
          '🔐 Biometric Login Available',
          `Welcome back, ${escapeHtml(student.name)}!<br/><br/>Would you like to sign in with your fingerprint/face?`,
          { confirmLabel: 'Use Biometric', cancelLabel: 'Use Password', confirmCls: 'btn-ug' }
        );
        
        if (useBiometric) {
          const success = await _studentBiometricLogin(student);
          if (success) {
            UI.btnLoad('sl-btn', false, 'Sign in');
            return;
          }
          // Fall through to password if biometric fails
        }
      }
      
      // Password login
      if (!pass) {
        UI.btnLoad('sl-btn', false, 'Sign in');
        return UI.setAlert('sl-alert','Enter your password.');
      }
      
      if(student.pwHash !== UI.hashPw(pass)) {
        UI.btnLoad('sl-btn', false, 'Sign in');
        return UI.setAlert('sl-alert','Invalid Student ID or password.');
      }
      
      saveSession({...student, role:'student'});
      UI.btnLoad('sl-btn', false, 'Sign in');
      if (typeof APP !== 'undefined' && APP.activateStudent) {
        await APP.activateStudent({...student, role:'student'});
      }
      
    } catch(err) {
      UI.btnLoad('sl-btn', false, 'Sign in');
      UI.setAlert('sl-alert', err.message || 'Login failed.');
    }
  }

  async function _studentBiometricLogin(student) {
    try {
      if (!window.PublicKeyCredential) return false;
      
      const credentialId = Uint8Array.from(atob(student.webAuthnCredentialId), c => c.charCodeAt(0));
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: challenge,
          allowCredentials: [{
            id: credentialId,
            type: "public-key",
            transports: ["internal"]
          }],
          userVerification: "required",
          timeout: 60000
        }
      });
      
      if (assertion) {
        saveSession({...student, role:'student'});
        await DB.STUDENTS.update(student.studentId, { lastBiometricUse: Date.now() });
        if (typeof APP !== 'undefined' && APP.activateStudent) {
          await APP.activateStudent({...student, role:'student'});
        }
        await MODAL.success('Biometric Login', 'Welcome back!');
        return true;
      }
      return false;
    } catch(err) {
      console.error('Biometric login error:', err);
      return false;
    }
  }

  /* ══ Student Signup ══ */
  async function studentSignup() {
    const studentId = getElem('ss-id')?.value.trim().toUpperCase();
    const name = getElem('ss-name')?.value.trim();
    const email = getElem('ss-email')?.value.trim().toLowerCase();
    const pass = getElem('ss-pass')?.value;
    const pass2 = getElem('ss-pass2')?.value;
    
    UI.clrAlert('ss-alert');
    if(!studentId||!name||!email||!pass) return UI.setAlert('ss-alert','All fields are required.');
    if(!email.endsWith('.ug.edu.gh') && !email.endsWith('@st.ug.edu.gh')) {
      return UI.setAlert('ss-alert','Students must use a UG email (@st.ug.edu.gh or @ug.edu.gh)');
    }
    if(pass.length<6) return UI.setAlert('ss-alert','Password must be at least 6 characters.');
    if(pass!==pass2) return UI.setAlert('ss-alert','Passwords do not match.');
    
    UI.btnLoad('ss-btn', true);
    try {
      const existing = await DB.STUDENTS.byStudentId(studentId);
      if(existing) {
        UI.btnLoad('ss-btn', false, 'Create account');
        return UI.setAlert('ss-alert','A student with this ID already exists.');
      }
      
      // Offer biometric registration during signup
      let webAuthnCredentialId = null;
      let webAuthnData = null;
      
      if (window.PublicKeyCredential) {
        const registerBio = await MODAL.confirm(
          '🔐 Set Up Biometric Login',
          `Would you like to register your fingerprint/face for faster and more secure login?<br/><br/>
           This is optional but recommended for future logins.`,
          { confirmLabel: 'Yes, Set Up', cancelLabel: 'Skip for Now', confirmCls: 'btn-ug' }
        );
        
        if (registerBio) {
          const result = await _registerStudentBiometric(studentId, name, email);
          if (result) {
            webAuthnCredentialId = result.credentialId;
            webAuthnData = result.webAuthnData;
          }
        }
      }
      
      const student = {
        studentId: studentId,
        name: name,
        email: email,
        pwHash: UI.hashPw(pass),
        webAuthnCredentialId: webAuthnCredentialId,
        webAuthnData: webAuthnData,
        registeredAt: Date.now(),
        active: true,
        createdAt: Date.now()
      };
      
      await DB.STUDENTS.set(studentId, student);
      saveSession({...student, role:'student'});
      UI.btnLoad('ss-btn', false, 'Create account');
      
      if (webAuthnCredentialId) {
        await MODAL.success('Account created!', `Welcome, ${escapeHtml(name)}! Your biometric has been registered. You can now sign in with fingerprint/face.`);
      } else {
        await MODAL.success('Account created!', `Welcome, ${escapeHtml(name)}! You can now check in to courses.`);
      }
      
      if (typeof APP !== 'undefined' && APP.activateStudent) {
        await APP.activateStudent({...student, role:'student'});
      }
    } catch(err) {
      UI.btnLoad('ss-btn', false, 'Create account');
      UI.setAlert('ss-alert', err.message || 'Registration failed.');
    }
  }

  async function _registerStudentBiometric(studentId, name, email) {
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: challenge,
          rp: {
            name: "UG QR Attendance System",
            id: window.location.hostname
          },
          user: {
            id: new TextEncoder().encode(email),
            name: email,
            displayName: name
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" },
            { alg: -257, type: "public-key" }
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
            residentKey: "required"
          },
          timeout: 60000,
          attestation: "none"
        }
      });
      
      const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
      const clientDataJSON = btoa(String.fromCharCode(...new Uint8Array(credential.response.clientDataJSON)));
      const attestationObject = btoa(String.fromCharCode(...new Uint8Array(credential.response.attestationObject)));
      
      return {
        credentialId: credentialId,
        webAuthnData: { credentialId, clientDataJSON, attestationObject }
      };
    } catch(err) {
      console.error('Biometric registration error:', err);
      return null;
    }
  }

  /* ══ Forgot password ══ */
  async function showForgotPassword(alertId) {
    const email = await MODAL.prompt(
      'Reset your password',
      'Enter the email address linked to your account.',
      { icon:'🔑', placeholder:'your@email.com', confirmLabel:'Send reset code' }
    );
    if(!email || !email.trim()) return;
    const e = email.trim().toLowerCase();

    try {
      let found = false;
      
      const sa = await DB.SA.get();
      if(sa && sa.email === e) found = true;
      if(!found){ const lec = await DB.LEC.byEmail(e); if(lec) found = true; }
      if(!found){ const cas = await DB.CA.getAll(); if(cas.find(c => c.email === e)) found = true; }
      if(!found){ const ta = await DB.TA.byEmail(e); if(ta) found = true; }
      if(!found){ const student = await DB.STUDENTS.byEmail(e); if(student) found = true; }

      if(!found){
        await MODAL.error('Email not found','No account is registered with that email address.');
        return;
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Date.now() + 30 * 60 * 1000;
      await DB.RESET.set(e, { code, expiresAt, used: false });

      await MODAL.alert(
        'Verification Code',
        `<div style="text-align:center">
           <div style="font-size:14px; margin-bottom:15px;">Your password reset code is:</div>
           <div style="background:var(--ug); color:var(--gold); font-family:monospace; font-size:48px;
                      font-weight:700; letter-spacing:8px; padding:20px; border-radius:12px; margin:10px 0">
             ${escapeHtml(code)}
           </div>
           <div style="font-size:12px; color:var(--text3); margin-top:10px">
             Valid for 30 minutes
           </div>
           <div style="margin-top:15px; font-size:11px; color:var(--text3)">
             A copy has also been sent to ${escapeHtml(e)} (check your email)
           </div>
         </div>`,
        { icon: '🔑', btnLabel: 'Continue' }
      );
      
      _sendResetCodeEmail(e, code).catch(console.warn);
      
      await _enterResetCode(e);
    } catch(err) {
      console.error('Forgot password error:', err);
      await MODAL.error('Error', err.message || 'Could not process request.');
    }
  }

  async function _enterResetCode(email) {
    const code = await MODAL.prompt('Enter reset code',
      `Enter the 6-digit reset code:`,
      { icon:'🔢', placeholder:'123456', confirmLabel:'Verify code' }
    );
    if(!code) return;

    const stored = await DB.RESET.get(email);
    if(!stored || stored.used) { await MODAL.error('Invalid code','This code is no longer valid.'); return; }
    if(stored.expiresAt < Date.now()) { await MODAL.error('Code expired','The reset code has expired.'); return; }
    if(stored.code !== code.trim()) { await MODAL.error('Wrong code','That code is incorrect.'); return; }

    const newPass = await MODAL.prompt('Set new password',
      'Enter your new password (at least 8 characters):',
      { icon:'🔒', placeholder:'New password', inpType:'password', confirmLabel:'Set password' }
    );
    if(!newPass || newPass.length < 8) { await MODAL.error('Too short','Password must be at least 8 characters.'); return; }

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

    await DB.RESET.set(email, { ...stored, used: true });
    clearLock(email);

    await MODAL.success('Password updated!', 'Your password has been changed. You can now sign in.');
  }

  function _selectLec(idx) {
    if(window._lecPickResolve) window._lecPickResolve(idx);
  }

  // Debug function to test auth
  async function testAuth() {
    console.log('[AUTH] Testing authentication system...');
    console.log('[AUTH] Session:', getSession());
    return true;
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
    _selectLecturerCallback,
    _sendUIDEmail,
    _sendResetCodeEmail,
    _sendTAInviteEmail,
    _sendInviteEmail,
    _sendBiometricResetEmail,
    testAuth,
    getSession,
    saveSession,
    clearSession,
  };
})();

// Make _selectLecturerCallback available globally
window.AUTH_selectLecturerCallback = AUTH._selectLecturerCallback;
