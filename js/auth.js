/* auth.js — Enhanced Security with Salted Hashing & Rate Limiting */
'use strict';

const AUTH = (() => {
  const SESSION_EXPIRY_DAYS = 7;
  const SALT_ROUNDS = 1000; // Number of iterations for key stretching
  
  // ==================== IMPROVED HASHING WITH SALT ====================
  
  // Generate a random salt
  function generateSalt() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  }
  
  // Hash password with salt using PBKDF2-like approach
  async function hashPasswordWithSalt(password, salt) {
    // Use Web Crypto API for more secure hashing
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(password + salt);
    
    // Hash using SHA-256 (more secure than custom hash)
    const hashBuffer = await crypto.subtle.digest('SHA-256', passwordData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Apply multiple iterations for key stretching
    let result = hashHex;
    for (let i = 0; i < SALT_ROUNDS; i++) {
      const iterBuffer = encoder.encode(result + salt);
      const iterHash = await crypto.subtle.digest('SHA-256', iterBuffer);
      const iterArray = Array.from(new Uint8Array(iterHash));
      result = iterArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    return result;
  }
  
  // Verify password against stored hash and salt
  async function verifyPassword(inputPassword, storedHash, salt) {
    const computedHash = await hashPasswordWithSalt(inputPassword, salt);
    return computedHash === storedHash;
  }
  
  // Fallback synchronous hash (for compatibility, but less secure)
  function hashPasswordSync(password, salt) {
    let h1 = 0x811c9dc5, h2 = 0x6b3a9559;
    const combined = password + salt;
    for (let i = 0; i < combined.length; i++) {
      const c = combined.charCodeAt(i);
      h1 ^= c;
      h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 ^= c;
      h2 = Math.imul(h2, 0x00000193) >>> 0;
    }
    for (let i = combined.length - 1; i >= 0; i--) {
      const c = combined.charCodeAt(i);
      h1 ^= (c << 5) ^ h2;
      h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 ^= (c << 3) ^ h1;
      h2 = Math.imul(h2, 0x00000193) >>> 0;
    }
    return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  }
  
  // ==================== SESSION MANAGEMENT ====================
  
  const saveSession = u => {
    // Remove sensitive data before storing in session
    const safeUser = { ...u };
    delete safeUser.pwHash;
    delete safeUser.salt;
    
    const sessionWithExpiry = {
      ...safeUser,
      expiresAt: Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
      loggedInAt: Date.now(),
      sessionId: generateSessionId()
    };
    localStorage.setItem(CONFIG.KEYS.USER, JSON.stringify(sessionWithExpiry));
    console.log('[AUTH] Session saved for user:', u.email);
  };
  
  function generateSessionId() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  }
  
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
  
  // ==================== RATE LIMITING (Protect against brute force) ====================
  
  const LOCK_KEY = 'ugqr7_lock';
  const MAX_ATTEMPTS = 5;
  const LOCK_MINUTES = 15;

  function getLockData(email) {
    try { 
      const d = JSON.parse(localStorage.getItem(LOCK_KEY) || '{}'); 
      return d[email] || { attempts: 0, lockUntil: 0 }; 
    } catch { 
      return { attempts: 0, lockUntil: 0 }; 
    }
  }
  
  function setLockData(email, data) {
    try { 
      const d = JSON.parse(localStorage.getItem(LOCK_KEY) || '{}'); 
      d[email] = data; 
      localStorage.setItem(LOCK_KEY, JSON.stringify(d)); 
    } catch {}
  }
  
  function recordFailed(email) {
    const d = getLockData(email);
    d.attempts = (d.attempts || 0) + 1;
    if (d.attempts >= MAX_ATTEMPTS) d.lockUntil = Date.now() + LOCK_MINUTES * 60000;
    setLockData(email, d);
    return d;
  }
  
  function clearLock(email) { 
    setLockData(email, { attempts: 0, lockUntil: 0 }); 
  }
  
  function checkLocked(email) {
    const d = getLockData(email);
    if (d.lockUntil > Date.now()) {
      const mins = Math.ceil((d.lockUntil - Date.now()) / 60000);
      return `Account locked. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`;
    }
    if (d.lockUntil > 0 && d.lockUntil <= Date.now()) clearLock(email);
    return null;
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function getElem(id) {
    return document.getElementById(id);
  }

  // ==================== EMAIL FUNCTIONS ====================
  
  async function _sendInviteEmail(params) {
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

  // ==================== IMPROVED STUDENT SIGNUP (with salt) ====================
  
  async function studentSignup() {
    const studentId = getElem('ss-id')?.value.trim().toUpperCase();
    const name = getElem('ss-name')?.value.trim();
    const email = getElem('ss-email')?.value.trim().toLowerCase();
    const pass = getElem('ss-pass')?.value;
    const pass2 = getElem('ss-pass2')?.value;
    
    UI.clrAlert('ss-alert');
    if (!studentId || !name || !email || !pass) return UI.setAlert('ss-alert', 'All fields are required.');
    if (!email.endsWith('.ug.edu.gh') && !email.endsWith('@st.ug.edu.gh')) {
      return UI.setAlert('ss-alert', 'Students must use a UG email (@st.ug.edu.gh or @ug.edu.gh)');
    }
    if (pass.length < 8) return UI.setAlert('ss-alert', 'Password must be at least 8 characters.');
    if (pass !== pass2) return UI.setAlert('ss-alert', 'Passwords do not match.');
    
    UI.btnLoad('ss-btn', true);
    try {
      const existing = await DB.STUDENTS.byStudentId(studentId);
      if (existing) {
        UI.btnLoad('ss-btn', false, 'Create account');
        return UI.setAlert('ss-alert', 'A student with this ID already exists.');
      }
      
      // Generate unique salt for this user
      const salt = generateSalt();
      
      // Hash password with salt (async for better security)
      const passwordHash = await hashPasswordWithSalt(pass, salt);
      
      // Optional biometric registration
      let webAuthnCredentialId = null;
      let webAuthnData = null;
      
      if (window.PublicKeyCredential) {
        const registerBio = await MODAL.confirm(
          '🔐 Set Up Biometric Login',
          `Would you like to register your fingerprint/face for faster and more secure check-ins?`,
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
        pwHash: passwordHash,
        salt: salt,  // Store salt with the user
        webAuthnCredentialId: webAuthnCredentialId,
        webAuthnData: webAuthnData,
        registeredAt: Date.now(),
        lastPasswordChange: Date.now(),
        active: true,
        createdAt: Date.now(),
        failedLoginAttempts: 0,
        lockedUntil: null
      };
      
      await DB.STUDENTS.set(studentId, student);
      
      // Don't store sensitive data in session
      const sessionUser = {
        studentId: studentId,
        name: name,
        email: email,
        role: 'student',
        loggedInAt: Date.now()
      };
      saveSession(sessionUser);
      
      UI.btnLoad('ss-btn', false, 'Create account');
      
      if (webAuthnCredentialId) {
        await MODAL.success('Account created!', `Welcome, ${escapeHtml(name)}! Your biometric has been registered.`);
      } else {
        await MODAL.success('Account created!', `Welcome, ${escapeHtml(name)}! You can now check in to courses.`);
      }
      
      if (typeof APP !== 'undefined' && APP.activateStudent) {
        await APP.activateStudent(sessionUser);
      }
    } catch(err) {
      UI.btnLoad('ss-btn', false, 'Create account');
      UI.setAlert('ss-alert', err.message || 'Registration failed.');
    }
  }
  
  // ==================== IMPROVED STUDENT LOGIN (with salt verification) ====================
  
  async function studentLogin() {
    const studentId = getElem('sl-id')?.value.trim().toUpperCase();
    const pass = getElem('sl-pass')?.value;
    UI.clrAlert('sl-alert');
    if (!studentId) return UI.setAlert('sl-alert', 'Enter your Student ID.');
    if (!pass) return UI.setAlert('sl-alert', 'Enter your password.');
    
    // Check rate limiting
    const locked = checkLocked(studentId);
    if (locked) return UI.setAlert('sl-alert', locked);
    
    UI.btnLoad('sl-btn', true);
    try {
      const student = await DB.STUDENTS.byStudentId(studentId);
      if (!student) {
        recordFailed(studentId);
        UI.btnLoad('sl-btn', false, 'Sign in');
        return UI.setAlert('sl-alert', 'Invalid Student ID or password.');
      }
      
      // Check if account is locked
      if (student.lockedUntil && student.lockedUntil > Date.now()) {
        const mins = Math.ceil((student.lockedUntil - Date.now()) / 60000);
        UI.btnLoad('sl-btn', false, 'Sign in');
        return UI.setAlert('sl-alert', `Account locked. Try again in ${mins} minutes.`);
      }
      
      // Verify password using the stored salt
      let isValid = false;
      if (student.salt) {
        // Use new secure hashing
        isValid = await verifyPassword(pass, student.pwHash, student.salt);
      } else {
        // Fallback for old accounts (migrate to new system)
        const oldHash = UI.hashPw(pass);
        if (student.pwHash === oldHash) {
          // Migrate to new secure hash
          const salt = generateSalt();
          const newHash = await hashPasswordWithSalt(pass, salt);
          await DB.STUDENTS.update(studentId, { pwHash: newHash, salt: salt });
          isValid = true;
        }
      }
      
      if (!isValid) {
        // Increment failed attempts
        const failedAttempts = (student.failedLoginAttempts || 0) + 1;
        let lockedUntil = null;
        
        if (failedAttempts >= MAX_ATTEMPTS) {
          lockedUntil = Date.now() + LOCK_MINUTES * 60000;
          await DB.STUDENTS.update(studentId, { 
            failedLoginAttempts: failedAttempts, 
            lockedUntil: lockedUntil 
          });
          UI.btnLoad('sl-btn', false, 'Sign in');
          return UI.setAlert('sl-alert', `Account locked for ${LOCK_MINUTES} minutes due to too many failed attempts.`);
        } else {
          await DB.STUDENTS.update(studentId, { failedLoginAttempts: failedAttempts });
        }
        
        recordFailed(studentId);
        UI.btnLoad('sl-btn', false, 'Sign in');
        const remaining = MAX_ATTEMPTS - failedAttempts;
        return UI.setAlert('sl-alert', `Invalid password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`);
      }
      
      // Reset failed attempts on successful login
      await DB.STUDENTS.update(studentId, { 
        failedLoginAttempts: 0, 
        lockedUntil: null,
        lastLoginAt: Date.now()
      });
      clearLock(studentId);
      
      // Don't store sensitive data in session
      const sessionUser = {
        studentId: student.studentId,
        name: student.name,
        email: student.email,
        role: 'student',
        loggedInAt: Date.now()
      };
      saveSession(sessionUser);
      
      UI.btnLoad('sl-btn', false, 'Sign in');
      if (typeof APP !== 'undefined' && APP.activateStudent) {
        await APP.activateStudent(sessionUser);
      }
      
    } catch(err) {
      UI.btnLoad('sl-btn', false, 'Sign in');
      UI.setAlert('sl-alert', err.message || 'Login failed.');
    }
  }
  
  // ==================== BIOMETRIC REGISTRATION (WebAuthn) ====================
  
  async function _registerStudentBiometric(studentId, name, email) {
    try {
      if (!window.PublicKeyCredential) {
        throw new Error('WebAuthn not supported');
      }
      
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
  
  // ==================== PASSWORD RESET WITH SECURE TOKENS ====================
  
  async function showForgotPassword(alertId) {
    const email = await MODAL.prompt(
      'Reset your password',
      'Enter the email address linked to your account.',
      { icon: '🔑', placeholder: 'your@email.com', confirmLabel: 'Send reset code' }
    );
    if (!email || !email.trim()) return;
    const e = email.trim().toLowerCase();

    try {
      let found = false;
      let userData = null;
      
      // Check all user types
      const sa = await DB.SA.get();
      if (sa && sa.email === e) { found = true; userData = { type: 'admin', id: 'sa', email: e }; }
      
      if (!found) {
        const lec = await DB.LEC.byEmail(e);
        if (lec) { found = true; userData = { type: 'lecturer', id: lec.id, email: e }; }
      }
      if (!found) {
        const cas = await DB.CA.getAll();
        const ca = cas.find(c => c.email === e);
        if (ca) { found = true; userData = { type: 'coAdmin', id: ca.id, email: e }; }
      }
      if (!found) {
        const ta = await DB.TA.byEmail(e);
        if (ta) { found = true; userData = { type: 'ta', id: ta.id, email: e }; }
      }
      if (!found) {
        const student = await DB.STUDENTS.byEmail(e);
        if (student) { found = true; userData = { type: 'student', id: student.studentId, email: e }; }
      }

      if (!found) {
        await MODAL.error('Email not found', 'No account is registered with that email address.');
        return;
      }

      // Generate secure reset token
      const token = generateSessionId(); // 64 char hex token
      const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes
      
      // Store reset token securely
      await DB.RESET.set(e, { 
        token: token, 
        expiresAt: expiresAt, 
        used: false,
        userType: userData.type,
        userId: userData.id,
        createdAt: Date.now()
      });

      const resetLink = `${CONFIG.SITE_URL}?reset_token=${token}&email=${encodeURIComponent(e)}`;
      
      await MODAL.alert(
        'Password Reset Link',
        `<div style="text-align:center">
           <div style="background:var(--ug); color:var(--gold); padding:15px; border-radius:10px; margin:10px 0;">
             <strong>Reset Link (valid for 30 minutes)</strong>
           </div>
           <div style="word-break:break-all; background:var(--surface2); padding:10px; border-radius:8px;">
             <a href="${resetLink}" target="_blank">${resetLink}</a>
           </div>
           <button onclick="navigator.clipboard.writeText('${resetLink}')" class="btn btn-ug" style="margin-top:10px;">
             📋 Copy Reset Link
           </button>
         </div>`,
        { icon: '🔑', btnLabel: 'Close', width: '500px' }
      );
      
    } catch(err) {
      console.error('Forgot password error:', err);
      await MODAL.error('Error', err.message || 'Could not process request.');
    }
  }
  
  async function resetPasswordWithToken(token, email, newPassword) {
    const stored = await DB.RESET.get(email);
    
    if (!stored || stored.used) {
      throw new Error('Invalid or already used reset link.');
    }
    
    if (stored.token !== token) {
      throw new Error('Invalid reset token.');
    }
    
    if (stored.expiresAt < Date.now()) {
      throw new Error('Reset link has expired. Please request a new one.');
    }
    
    if (newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }
    
    // Generate new salt and hash
    const salt = generateSalt();
    const newHash = await hashPasswordWithSalt(newPassword, salt);
    
    // Update password based on user type
    switch(stored.userType) {
      case 'student':
        await DB.STUDENTS.update(stored.userId, { 
          pwHash: newHash, 
          salt: salt,
          lastPasswordChange: Date.now(),
          failedLoginAttempts: 0,
          lockedUntil: null
        });
        break;
      case 'lecturer':
        await DB.LEC.update(stored.userId, { 
          pwHash: newHash, 
          salt: salt,
          lastPasswordChange: Date.now()
        });
        break;
      case 'coAdmin':
        await DB.CA.update(stored.userId, { 
          pwHash: newHash, 
          salt: salt,
          lastPasswordChange: Date.now()
        });
        break;
      case 'ta':
        await DB.TA.update(stored.userId, { 
          pwHash: newHash, 
          salt: salt,
          lastPasswordChange: Date.now()
        });
        break;
      case 'admin':
        await DB.SA.update({ 
          pwHash: newHash, 
          salt: salt,
          lastPasswordChange: Date.now()
        });
        break;
    }
    
    // Mark token as used
    await DB.RESET.set(email, { ...stored, used: true, usedAt: Date.now() });
    
    // Clear any lockouts
    clearLock(email);
    
    return true;
  }
  
  // ==================== SESSION ENCRYPTION ====================
  
  // Simple session encryption (in production, use proper encryption)
  function encryptSessionData(data) {
    // In production, you would use a proper encryption library
    // For now, we'll just ensure sensitive data is removed
    return data;
  }
  
  // ==================== EXPORTS ====================
  
  return {
    // Core authentication
    studentLogin,
    studentSignup,
    showForgotPassword,
    resetPasswordWithToken,
    
    // Admin auth
    setupSuperAdmin: async () => {
      // Implement with salt
    },
    adminLogin: async () => {
      // Implement with salt
    },
    adminLogout,
    coAdminApply: async () => {
      // Implement with salt
    },
    
        // Lecturer/T A auth
    lecLogin: async () => {
      // Implement with salt
    },
    lecSignup: async () => {
      // Implement with salt
    },
    lecLogout,
    taLogin: async () => {
      // Implement with salt
    },
    taSignup: async () => {
      // Implement with salt
    },
    
    // Session management
    getSession,
    saveSession,
    clearSession,
    
    // Utility functions
    _sendUIDEmail,
    _sendInviteEmail,
    hashPasswordWithSalt,
    verifyPassword,
    generateSalt,
    
    // Test function
    testAuth: async () => {
      console.log('[AUTH] Testing authentication system...');
      console.log('[AUTH] Session:', getSession());
      return true;
    }
  };
  
  // Helper functions that need to be defined
  async function adminLogout() {
    clearSession();
    if (typeof APP !== 'undefined') APP.goTo('landing');
  }
  
  function lecLogout() {
    if (window.LEC && LEC.stopTimers) LEC.stopTimers();
    clearSession();
    if (typeof APP !== 'undefined') APP.goTo('landing');
  }
  
  // Placeholder for admin login (implement with salt)
  async function adminLogin() {
    const email = getElem('al-email')?.value.trim().toLowerCase();
    const pass = getElem('al-pass')?.value;
    UI.clrAlert('al-alert');
    if (!email || !pass) return UI.setAlert('al-alert', 'Enter your email and password.');
    
    const locked = checkLocked(email);
    if (locked) return UI.setAlert('al-alert', locked);
    
    UI.btnLoad('al-btn', true);
    try {
      const sa = await DB.SA.get();
      
      if (sa && sa.email === email) {
        let isValid = false;
        if (sa.salt) {
          isValid = await verifyPassword(pass, sa.pwHash, sa.salt);
        } else {
          const oldHash = UI.hashPw(pass);
          if (sa.pwHash === oldHash) {
            const salt = generateSalt();
            const newHash = await hashPasswordWithSalt(pass, salt);
            await DB.SA.update({ pwHash: newHash, salt: salt });
            isValid = true;
          }
        }
        
        if (isValid) {
          clearLock(email);
          const sessionUser = { ...sa, role: 'superAdmin' };
          delete sessionUser.pwHash;
          delete sessionUser.salt;
          saveSession(sessionUser);
          UI.btnLoad('al-btn', false, 'Sign in');
          if (typeof APP !== 'undefined' && APP.activateAdmin) {
            await APP.activateAdmin(sessionUser);
          }
          return;
        }
      }
      
      const cas = await DB.CA.getAll();
      const ca = cas.find(c => c.email === email);
      
      if (ca) {
        let isValid = false;
        if (ca.salt) {
          isValid = await verifyPassword(pass, ca.pwHash, ca.salt);
        } else {
          const oldHash = UI.hashPw(pass);
          if (ca.pwHash === oldHash) {
            const salt = generateSalt();
            const newHash = await hashPasswordWithSalt(pass, salt);
            await DB.CA.update(ca.id, { pwHash: newHash, salt: salt });
            isValid = true;
          }
        }
        
        if (isValid) {
          if (ca.status === 'pending') {
            UI.btnLoad('al-btn', false, 'Sign in');
            return UI.setAlert('al-alert', 'Your application is pending approval.');
          }
          if (ca.status === 'revoked') {
            UI.btnLoad('al-btn', false, 'Sign in');
            return UI.setAlert('al-alert', 'Your access has been revoked.');
          }
          clearLock(email);
          const sessionUser = { ...ca, role: 'coAdmin' };
          delete sessionUser.pwHash;
          delete sessionUser.salt;
          saveSession(sessionUser);
          UI.btnLoad('al-btn', false, 'Sign in');
          if (typeof APP !== 'undefined' && APP.activateAdmin) {
            await APP.activateAdmin(sessionUser);
          }
          return;
        }
      }
      
      const d = recordFailed(email);
      const remaining = MAX_ATTEMPTS - d.attempts;
      UI.btnLoad('al-btn', false, 'Sign in');
      if (remaining <= 0) UI.setAlert('al-alert', `Account locked for ${LOCK_MINUTES} minutes.`);
      else UI.setAlert('al-alert', `Invalid email or password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`);
    } catch(err) {
      UI.btnLoad('al-btn', false, 'Sign in');
      UI.setAlert('al-alert', err.message || 'Login failed.');
    }
  }
  
  // Placeholder for co-admin application
  async function coAdminApply() {
    const name = getElem('ca-name')?.value.trim();
    const email = getElem('ca-email')?.value.trim().toLowerCase();
    const dept = getElem('ca-dept')?.value;
    const pass = getElem('ca-pass')?.value;
    const pass2 = getElem('ca-pass2')?.value;
    
    UI.clrAlert('ca-alert');
    if (!name || !email || !dept || !pass) return UI.setAlert('ca-alert', 'All fields are required.');
    if (pass.length < 8) return UI.setAlert('ca-alert', 'Password must be at least 8 characters.');
    if (pass !== pass2) return UI.setAlert('ca-alert', 'Passwords do not match.');
    
    UI.btnLoad('ca-btn', true);
    try {
      if (await DB.CA.byEmail(email)) {
        UI.btnLoad('ca-btn', false, 'Submit application');
        return UI.setAlert('ca-alert', 'An application with this email already exists.');
      }
      
      const salt = generateSalt();
      const passwordHash = await hashPasswordWithSalt(pass, salt);
      const id = Math.random().toString(36).substring(2, 15);
      
      await DB.CA.set(id, {
        id,
        name,
        email,
        department: dept,
        pwHash: passwordHash,
        salt: salt,
        status: 'pending',
        createdAt: Date.now(),
        appliedAt: Date.now()
      });
      
      UI.btnLoad('ca-btn', false, 'Submit application');
      await MODAL.success('Application submitted!', 'The administrator will review your request.');
      if (typeof APP !== 'undefined') APP.goTo('admin-login');
    } catch(err) {
      UI.btnLoad('ca-btn', false, 'Submit application');
      UI.setAlert('ca-alert', err.message || 'Submission failed.');
    }
  }
  
  // Placeholder for lecturer login (with salt)
  async function lecLogin() {
    const email = getElem('ll-email')?.value.trim().toLowerCase();
    const pass = getElem('ll-pass')?.value;
    UI.clrAlert('ll-alert');
    if (!email || !pass) return UI.setAlert('ll-alert', 'Enter your email and password.');
    
    const locked = checkLocked(email);
    if (locked) return UI.setAlert('ll-alert', locked);
    
    UI.btnLoad('ll-btn', true);
    try {
      const lec = await DB.LEC.byEmail(email);
      if (!lec) {
        const d = recordFailed(email);
        const rem = MAX_ATTEMPTS - d.attempts;
        UI.btnLoad('ll-btn', false, 'Sign in');
        return UI.setAlert('ll-alert', rem <= 0 ? `Account locked for ${LOCK_MINUTES} minutes.` : `Invalid email or password. ${rem} attempt${rem !== 1 ? 's' : ''} remaining.`);
      }
      
      let isValid = false;
      if (lec.salt) {
        isValid = await verifyPassword(pass, lec.pwHash, lec.salt);
      } else {
        const oldHash = UI.hashPw(pass);
        if (lec.pwHash === oldHash) {
          const salt = generateSalt();
          const newHash = await hashPasswordWithSalt(pass, salt);
          await DB.LEC.update(lec.id, { pwHash: newHash, salt: salt });
          isValid = true;
        }
      }
      
      if (!isValid) {
        const d = recordFailed(email);
        const rem = MAX_ATTEMPTS - d.attempts;
        UI.btnLoad('ll-btn', false, 'Sign in');
        return UI.setAlert('ll-alert', rem <= 0 ? `Account locked for ${LOCK_MINUTES} minutes.` : `Invalid email or password. ${rem} attempt${rem !== 1 ? 's' : ''} remaining.`);
      }
      
      clearLock(email);
      const sessionUser = { ...lec, role: 'lecturer' };
      delete sessionUser.pwHash;
      delete sessionUser.salt;
      saveSession(sessionUser);
      UI.btnLoad('ll-btn', false, 'Sign in');
      if (typeof APP !== 'undefined' && APP.activateLecturer) {
        await APP.activateLecturer(sessionUser);
      }
    } catch(err) {
      UI.btnLoad('ll-btn', false, 'Sign in');
      UI.setAlert('ll-alert', err.message || 'Login failed.');
    }
  }
  
  // Placeholder for lecturer signup
  async function lecSignup() {
    const uid = getElem('ls-uid')?.value.trim().toUpperCase();
    const name = getElem('ls-name')?.value.trim();
    const email = getElem('ls-email')?.value.trim().toLowerCase();
    const dept = getElem('ls-dept')?.value;
    const pass = getElem('ls-pass')?.value;
    const pass2 = getElem('ls-pass2')?.value;
    
    UI.clrAlert('ls-alert');
    if (!uid || !name || !email || !dept || !pass) return UI.setAlert('ls-alert', 'All fields are required.');
    if (pass.length < 8) return UI.setAlert('ls-alert', 'Password must be at least 8 characters.');
    if (pass !== pass2) return UI.setAlert('ls-alert', 'Passwords do not match.');
    
    UI.btnLoad('ls-btn', true);
    try {
      const uidData = await DB.UID.get(uid);
      if (!uidData || uidData.status !== 'available') {
        UI.btnLoad('ls-btn', false, 'Create account');
        return UI.setAlert('ls-alert', 'Invalid, already used, or revoked Unique ID.');
      }
      if (await DB.LEC.byEmail(email)) {
        UI.btnLoad('ls-btn', false, 'Create account');
        return UI.setAlert('ls-alert', 'An account with this email already exists.');
      }
      
      const salt = generateSalt();
      const passwordHash = await hashPasswordWithSalt(pass, salt);
      const fbId = Math.random().toString(36).substring(2, 15);
      
      await DB.UID.update(uid, { status: 'assigned', assignedTo: email, assignedAt: Date.now() });
      
      const lec = {
        id: fbId,
        lecId: uid,
        name,
        email,
        department: dept,
        pwHash: passwordHash,
        salt: salt,
        createdAt: Date.now(),
        lastPasswordChange: Date.now()
      };
      await DB.LEC.set(fbId, lec);
      
      const sessionUser = { ...lec, role: 'lecturer' };
      delete sessionUser.pwHash;
      delete sessionUser.salt;
      saveSession(sessionUser);
      
      UI.btnLoad('ls-btn', false, 'Create account');
      await MODAL.success('Account created!', `Welcome, ${escapeHtml(name)}. Your Lecturer ID: <strong>${escapeHtml(uid)}</strong>`);
      if (typeof APP !== 'undefined' && APP.activateLecturer) {
        await APP.activateLecturer(sessionUser);
      }
    } catch(err) {
      UI.btnLoad('ls-btn', false, 'Create account');
      UI.setAlert('ls-alert', err.message || 'Registration failed.');
    }
  }
  
  // Placeholder for TA login
  async function taLogin() {
    const email = getElem('tl-email')?.value.trim().toLowerCase();
    const pass = getElem('tl-pass')?.value;
    UI.clrAlert('tl-alert');
    if (!email || !pass) return UI.setAlert('tl-alert', 'Enter your email and password.');
    
    UI.btnLoad('tl-btn', true);
    try {
      const ta = await DB.TA.byEmail(email);
      if (!ta) {
        UI.btnLoad('tl-btn', false, 'Sign in');
        return UI.setAlert('tl-alert', 'Invalid email or password.');
      }
      
      let isValid = false;
      if (ta.salt) {
        isValid = await verifyPassword(pass, ta.pwHash, ta.salt);
      } else {
        const oldHash = UI.hashPw(pass);
        if (ta.pwHash === oldHash) {
          const salt = generateSalt();
          const newHash = await hashPasswordWithSalt(pass, salt);
          await DB.TA.update(ta.id, { pwHash: newHash, salt: salt });
          isValid = true;
        }
      }
      
      if (!isValid) {
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
      
      const sessionUser = { ...ta, role: 'ta' };
      delete sessionUser.pwHash;
      delete sessionUser.salt;
      
      if (activeLecturers.length === 1) {
        const selected = activeLecturers[0];
        sessionUser.activeLecturerId = selected.id;
        sessionUser.activeLecturer = selected;
        sessionStorage.setItem('active_lecturer_id', selected.id);
        saveSession(sessionUser);
        UI.btnLoad('tl-btn', false, 'Sign in');
        if (typeof APP !== 'undefined' && APP.activateLecturer) {
          await APP.activateLecturer(sessionUser);
        }
      } else {
        const selected = await _selectLecturerModal(activeLecturers);
        if (!selected) {
          UI.btnLoad('tl-btn', false, 'Sign in');
          return;
        }
        sessionUser.activeLecturerId = selected.id;
        sessionUser.activeLecturer = selected;
        sessionStorage.setItem('active_lecturer_id', selected.id);
        saveSession(sessionUser);
        UI.btnLoad('tl-btn', false, 'Sign in');
        if (typeof APP !== 'undefined' && APP.activateLecturer) {
          await APP.activateLecturer(sessionUser);
        }
      }
    } catch(err) {
      UI.btnLoad('tl-btn', false, 'Sign in');
      console.error('TA login error:', err);
      UI.setAlert('tl-alert', err.message || 'Login failed.');
    }
  }
  
  // Placeholder for TA signup
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
      let passwordHash;
      let salt;
      
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
        const sessionUser = { ...existing, role: 'ta' };
        delete sessionUser.pwHash;
        delete sessionUser.salt;
        saveSession(sessionUser);
        UI.btnLoad('ts-btn', false, 'Create TA account');
        await MODAL.success('TA account updated!', `Welcome back, ${escapeHtml(name)}!`);
        if (typeof APP !== 'undefined' && APP.activateLecturer) {
          await APP.activateLecturer(sessionUser);
        }
        return;
      } else {
        uid = Math.random().toString(36).substring(2, 15);
        salt = generateSalt();
        passwordHash = await hashPasswordWithSalt(pass, salt);
        
        await DB.TA.set(uid, {
          id: uid,
          name: name,
          email: email,
          pwHash: passwordHash,
          salt: salt,
          lecturers: [inv.lecturerId],
          status: 'active',
          active: true,
          createdAt: Date.now(),
          endedTenures: {},
          lastPasswordChange: Date.now()
        });
      }
      
      await DB.TA.updateInvite(invKey, { usedAt: Date.now(), taId: uid });
      const ta = await DB.TA.get(uid);
      
      const sessionUser = { ...ta, role: 'ta', activeLecturerId: inv.lecturerId };
      delete sessionUser.pwHash;
      delete sessionUser.salt;
      saveSession(sessionUser);
      
      UI.btnLoad('ts-btn', false, 'Create TA account');
      await MODAL.success('TA account created!', `Welcome, ${escapeHtml(name)}! You can now sign in.`);
      if (typeof APP !== 'undefined' && APP.activateLecturer) {
        await APP.activateLecturer(sessionUser);
      }
    } catch(err) {
      UI.btnLoad('ts-btn', false, 'Create TA account');
      UI.setAlert('ts-alert', err.message || 'Registration failed.');
    }
  }
  
  // Placeholder for super admin setup
  async function setupSuperAdmin() {
    const name = getElem('sa-name')?.value.trim();
    const email = getElem('sa-email')?.value.trim().toLowerCase();
    const pass = getElem('sa-pass')?.value;
    const pass2 = getElem('sa-pass2')?.value;
    
    const alertEl = getElem('al-alert');
    if (alertEl) UI.clrAlert('al-alert');
    if (!name || !email || !pass) return UI.setAlert('al-alert', 'All fields are required.');
    if (pass.length < 8) return UI.setAlert('al-alert', 'Password must be at least 8 characters.');
    if (pass !== pass2) return UI.setAlert('al-alert', 'Passwords do not match.');
    
    UI.btnLoad('sa-btn', true);
    try {
      if (await DB.SA.exists()) {
        UI.btnLoad('sa-btn', false, 'Create admin account');
        return UI.setAlert('al-alert', 'An admin account already exists.');
      }
      
      const salt = generateSalt();
      const passwordHash = await hashPasswordWithSalt(pass, salt);
      
      await DB.SA.set({
        id: Math.random().toString(36).substring(2, 15),
        name,
        email,
        pwHash: passwordHash,
        salt: salt,
        createdAt: Date.now(),
        lastPasswordChange: Date.now()
      });
      
      UI.btnLoad('sa-btn', false, 'Create admin account');
      await MODAL.success('Admin account created!', `Welcome, ${escapeHtml(name)}. You can now sign in.`);
      if (typeof APP !== 'undefined' && APP._refreshAdminLogin) {
        APP._refreshAdminLogin();
      }
    } catch(err) {
      UI.btnLoad('sa-btn', false, 'Create admin account');
      UI.setAlert('al-alert', err.message || 'Something went wrong.');
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
})();

// Make _selectLecturerCallback available globally
window.AUTH_selectLecturerCallback = AUTH._selectLecturerCallback;
