/* student.js — Student Check-in with WebAuthn Biometrics and Location Validation */
'use strict';

const STU = (() => {
  const S = { 
    session: null, 
    cdTimer: null, 
    stuLat: null, 
    stuLng: null, 
    registeredStudent: null, 
    locationAccuracy: null,
    biometricVerified: false,
    biometricVerifiedAt: null,
    isNewRegistration: false,
    deviceFingerprint: null,
    checkInAttempts: 0,
    lastAttemptTime: null,
    webAuthnSupported: false,
    webAuthnCredentialId: null,
    webAuthnData: null
  };

  const MAX_CHECKIN_ATTEMPTS = 3;
  const ATTEMPT_WINDOW_MS = 60000;

  // Haversine formula to calculate distance between two coordinates in meters
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in meters
  }

  async function init(ciParam) {
    try {
      const data = JSON.parse(UI.b64d(decodeURIComponent(ciParam)));
      _hideAll();
      if(!data?.id||!data?.token){_invalid('Invalid QR code','Malformed QR. Ask your lecturer for a new one.');return;}
      if(Date.now()>data.expiresAt){_invalid('Session expired',`The sign-in window for <strong>${UI.esc(data.code)}</strong> has closed.`);return;}
      
      S.session=data;
      UI.Q('s-code').textContent=data.code;
      UI.Q('s-course').textContent=data.course;
      UI.Q('s-date').textContent=data.date;
      
      S.webAuthnSupported = await _checkWebAuthnSupport();
      S.deviceFingerprint = await _generateDeviceFingerprint();
      
      _resetState();
      _showStep('step-identity');
      _cdTick();
      clearInterval(S.cdTimer);
      S.cdTimer=setInterval(_cdTick,1000);
      
      S.checkInAttempts = 0;
      S.lastAttemptTime = null;
      
    } catch(e){console.error(e);_hideAll();_invalid('Could not read QR code','Please scan again.');}
  }

  async function _checkWebAuthnSupport() {
    if (!window.PublicKeyCredential) return false;
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch(e) {
      return false;
    }
  }

  async function _generateDeviceFingerprint() {
    const components = [
      navigator.userAgent, navigator.language,
      screen.width + 'x' + screen.height + 'x' + screen.colorDepth,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || 0,
      navigator.deviceMemory || 0,
      navigator.platform || ''
    ];
    const str = components.join('|||');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }

  function _resetState() {
    if(UI.Q('s-id-lookup')) UI.Q('s-id-lookup').value = '';
    if(UI.Q('stu-reg-block')) UI.Q('stu-reg-block').style.display = 'none';
    if(UI.Q('stu-new-hint')) UI.Q('stu-new-hint').style.display = 'none';
    if(UI.Q('bio-result')) UI.Q('bio-result').style.display = 'none';
    S.webAuthnCredentialId = null;
    S.webAuthnData = null;
    S.biometricVerified = false;
    S.biometricVerifiedAt = null;
    S.registeredStudent = null;
    S.isNewRegistration = false;
    S.stuLat = null;
    S.stuLng = null;
    S.locationAccuracy = null;
    _setCheckinButtonsEnabled(false);
  }

  function _hideAll(){['loading','invalid','done'].forEach(n=>UI.Q('stu-'+n)?.classList.remove('show'));const f=UI.Q('stu-form');if(f)f.style.display='none';}
  function _invalid(title,msg){clearInterval(S.cdTimer);S.cdTimer=null;UI.Q('stu-invalid').classList.add('show');UI.Q('inv-title').textContent=title;UI.Q('inv-msg').innerHTML=msg;}
  function _showStep(stepId) { UI.Q('stu-form').style.display='block'; ['step-identity','step-biometric','step-checkin'].forEach(id=>{ const el=UI.Q(id); if(el)el.style.display=id===stepId?'block':'none'; }); }
  
  function _cdTick(){ 
    if(!S.session)return;const rem=Math.max(0,S.session.expiresAt-Date.now()),el=UI.Q('s-cd');if(!el)return; 
    if(rem===0){el.textContent='Session expired';el.className='countdown exp';clearInterval(S.cdTimer);S.cdTimer=null;_invalid('Session expired','Sign-in window closed.');return;} 
    const h=Math.floor(rem/3600000),m=Math.floor((rem%3600000)/60000),s2=Math.floor((rem%60000)/1000); 
    el.textContent=h>0?`${h}h ${UI.pad(m)}m ${UI.pad(s2)}s left`:`${m}:${UI.pad(s2)} left`; 
    el.className='countdown '+(rem<180000?'warn':'ok'); 
  }

  function _isRateLimited() {
    const now = Date.now();
    if (S.lastAttemptTime && (now - S.lastAttemptTime) > ATTEMPT_WINDOW_MS) {
      S.checkInAttempts = 0;
    }
    S.lastAttemptTime = now;
    S.checkInAttempts++;
    return S.checkInAttempts > MAX_CHECKIN_ATTEMPTS;
  }

  async function lookupStudent() {
    if(_isRateLimited()) {
      UI.setAlert('stu-id-alert','Too many attempts. Please wait a moment.');
      return;
    }
    
    const sid = UI.Q('s-id-lookup')?.value.trim().toUpperCase();
    UI.clrAlert('stu-id-alert');
    if(!sid){UI.Q('s-id-lookup')?.classList.add('err');return UI.setAlert('stu-id-alert','Enter your Student ID.');}
    UI.Q('s-id-lookup').classList.remove('err');
    UI.btnLoad('btn-lookup',true);
    try {
      const existing = await DB.STUDENTS.byStudentId(sid);
      UI.btnLoad('btn-lookup',false,'Continue');
      if(existing){
        S.registeredStudent = existing; 
        S.isNewRegistration = false;
        UI.Q('s-reg-name').textContent = existing.name; 
        UI.Q('s-reg-sid').textContent = existing.studentId; 
        UI.Q('s-reg-email').textContent = existing.email;
        
        const hasWebAuthn = existing.webAuthnCredentialId ? true : false;
        
        if(UI.Q('webAuthn-status')) {
          UI.Q('webAuthn-status').innerHTML = hasWebAuthn ? 
            '✓ Biometric registered' : 
            '⚠️ No biometric registered. Please verify with password.';
          UI.Q('webAuthn-status').style.display = 'block';
        }
        
        S.biometricVerified = false;
        _setCheckinButtonsEnabled(false);
        _showStep('step-biometric');
      } else { 
        S.isNewRegistration = true; 
        _showRegFields(sid); 
      }
    } catch(err){ UI.btnLoad('btn-lookup',false,'Continue'); UI.setAlert('stu-id-alert',err.message||'Error.'); }
  }

  function _showRegFields(sid) {
    UI.Q('s-id-lookup').value = sid;
    if(UI.Q('stu-reg-block')) UI.Q('stu-reg-block').style.display = 'block';
    if(UI.Q('stu-new-hint')) UI.Q('stu-new-hint').style.display = 'block';
    if(UI.Q('s-reg-full-name')) UI.Q('s-reg-full-name').value = '';
    if(UI.Q('s-reg-email-input')) UI.Q('s-reg-email-input').value = '';
    if(UI.Q('s-reg-pass')) UI.Q('s-reg-pass').value = '';
    if(UI.Q('s-reg-pass2')) UI.Q('s-reg-pass2').value = '';
    if(UI.Q('bio-reg-info') && S.webAuthnSupported) UI.Q('bio-reg-info').style.display = 'block';
    
    S.biometricVerified = false;
    _setCheckinButtonsEnabled(false);
  }

  // ============ WEBAUTHN (FIDO2) BIOMETRIC REGISTRATION ============
  async function registerWebAuthn() {
    if (!S.webAuthnSupported) {
      await MODAL.error('Not Supported', 
        'Your device does not support WebAuthn (FaceID/TouchID/Windows Hello).<br/>' +
        'Please use password verification instead.'
      );
      return false;
    }
    
    const status = UI.Q('webauthn-reg-status');
    if(status) status.textContent = 'Please scan your fingerprint/face when prompted...';
    
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userEmail = UI.Q('s-reg-email-input')?.value.trim().toLowerCase();
      const userName = UI.Q('s-reg-full-name')?.value.trim();
      
      if (!userEmail || !userName) {
        throw new Error('Please enter your email and name first.');
      }
      
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: challenge,
          rp: {
            name: "UG QR Attendance System",
            id: window.location.hostname
          },
          user: {
            id: new TextEncoder().encode(userEmail),
            name: userEmail,
            displayName: userName
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" },  // ES256
            { alg: -257, type: "public-key" } // RS256
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
      
      S.webAuthnCredentialId = credentialId;
      S.webAuthnData = { credentialId, clientDataJSON, attestationObject };
      
      if(status) status.textContent = '✓ Biometric registered successfully!';
      
      await MODAL.success('Biometric Registered!', 
        'Your fingerprint/face has been registered using WebAuthn.<br/>' +
        'You can now complete your registration.'
      );
      
      return true;
      
    } catch(err) {
      console.error('WebAuthn registration error:', err);
      if(status) status.textContent = '❌ Registration failed. Please try again.';
      
      if (err.name === 'NotAllowedError') {
        await MODAL.error('Registration Cancelled', 'You cancelled the biometric prompt. Please try again.');
      } else {
        await MODAL.error('Registration Failed', err.message || 'Could not register biometric.');
      }
      return false;
    }
  }

  // ============ WEBAUTHN BIOMETRIC VERIFICATION ============
  async function verifyWebAuthn() {
    if (!S.webAuthnSupported) {
      await MODAL.error('Not Supported', 'Your device does not support WebAuthn.');
      return;
    }
    
    const student = S.registeredStudent;
    if (!student || !student.webAuthnCredentialId) {
      UI.Q('stu-pass-fallback').style.display = 'block';
      return;
    }
    
    const btn = UI.Q('btn-verify-webauthn');
    const status = UI.Q('webauthn-verify-status');
    
    if(btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Waiting for biometric...'; }
    if(status) { status.style.display = 'block'; status.textContent = 'Please scan your fingerprint/face when prompted...'; }
    
    try {
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
        S.biometricVerified = true;
        S.biometricVerifiedAt = Date.now();
        
        if(status) status.textContent = '✓ Biometric verified successfully!';
        if(btn) { btn.disabled = false; btn.innerHTML = '✅ Verified'; }
        
        await MODAL.success('Verification Successful!', 
          'Your fingerprint/face has been verified.<br/>You can now check in.'
        );
        
        await DB.STUDENTS.update(student.studentId, { 
          lastBiometricUse: Date.now(),
          lastVerificationMethod: 'webauthn'
        });
        
        _setCheckinButtonsEnabled(true);
        _prefillCheckin(student);
        _showStep('step-checkin');
      } else {
        throw new Error('Verification failed');
      }
      
    } catch(err) {
      console.error('WebAuthn verification error:', err);
      if(status) status.textContent = '❌ Verification failed. Please use password.';
      if(btn) { btn.disabled = false; btn.innerHTML = '🔐 Verify with Biometric'; }
      S.biometricVerified = false;
      UI.Q('stu-pass-fallback').style.display = 'block';
    }
  }

  // ============ PASSWORD VERIFICATION (FALLBACK) ============
  async function verifyPassword() {
    const pass = UI.Q('s-bio-pass')?.value;
    const student = S.registeredStudent;
    UI.clrAlert('stu-bio-alert');
    if(!pass||!student) return;
    if(UI.hashPw(pass) !== student.pwHash) {
      return UI.setAlert('stu-bio-alert','Incorrect password.');
    }
    
    UI.btnLoad('btn-verify-pass', true);
    try {
      S.biometricVerified = true;
      S.biometricVerifiedAt = Date.now();
      
      if(UI.Q('stu-pass-fallback')) UI.Q('stu-pass-fallback').style.display = 'none';
      UI.btnLoad('btn-verify-pass', false, 'Verify');
      
      // Offer to register biometric after password verification
      if (S.webAuthnSupported && !student.webAuthnCredentialId) {
        const registerBio = await MODAL.confirm(
          'Register Biometric?',
          'Would you like to register your fingerprint/face for faster future check-ins?',
          { confirmLabel: 'Yes, register', cancelLabel: 'No, thanks' }
        );
        
        if (registerBio) {
          try {
            const challenge = crypto.getRandomValues(new Uint8Array(32));
            const credential = await navigator.credentials.create({
              publicKey: {
                challenge: challenge,
                rp: { name: "UG QR Attendance System", id: window.location.hostname },
                user: { id: new TextEncoder().encode(student.email), name: student.email, displayName: student.name },
                pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
                authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "required" },
                timeout: 60000,
                attestation: "none"
              }
            });
            
            const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
            await DB.STUDENTS.update(student.studentId, { 
              webAuthnCredentialId: credentialId,
              webAuthnRegisteredAt: Date.now()
            });
            await MODAL.success('Biometric Registered!', 'You can now use biometric for future check-ins.');
          } catch(bioErr) {
            console.warn('Biometric registration failed:', bioErr);
          }
        }
      }
      
      _setCheckinButtonsEnabled(true);
      _prefillCheckin(student);
      _showStep('step-checkin');
    } catch(err){
      UI.btnLoad('btn-verify-pass', false, 'Verify');
      UI.setAlert('stu-bio-alert', 'Failed: ' + err.message);
      S.biometricVerified = false;
      _setCheckinButtonsEnabled(false);
    }
  }

  // ============ REGISTER NEW STUDENT ============
  async function registerStudent() {
    const sid = UI.Q('s-id-lookup')?.value.trim().toUpperCase();
    const name = UI.Q('s-reg-full-name')?.value.trim();
    const email = UI.Q('s-reg-email-input')?.value.trim().toLowerCase();
    const pass = UI.Q('s-reg-pass')?.value;
    const pass2 = UI.Q('s-reg-pass2')?.value;
    
    UI.clrAlert('stu-id-alert');
    if(!sid||!name||!email||!pass) {
      return UI.setAlert('stu-id-alert','All fields are required.');
    }
    if(!email.endsWith('.ug.edu.gh') && !email.endsWith('@st.ug.edu.gh')) {
      return UI.setAlert('stu-id-alert','Email must be a UG email (@st.ug.edu.gh or @ug.edu.gh)');
    }
    if(pass.length<6) {
      return UI.setAlert('stu-id-alert','Password must be at least 6 characters.');
    }
    if(pass!==pass2) {
      return UI.setAlert('stu-id-alert','Passwords do not match.');
    }
    
    const existing = await DB.STUDENTS.byStudentId(sid);
    if (existing) {
      return UI.setAlert('stu-id-alert', 'A student with this ID already exists.');
    }
    
    UI.btnLoad('btn-register-student', true);
    
    try {
      // Force biometric registration first
      let biometricSuccess = false;
      
      const shouldRegisterBio = await MODAL.confirm(
        '🔐 Biometric Security Required',
        `To prevent impersonation, you MUST register your fingerprint or face.<br/><br/>
         This will be used for ALL future check-ins.<br/><br/>
         Click "Register Now" to set up your biometric.`,
        { confirmLabel: 'Register Now', cancelLabel: 'Cancel', confirmCls: 'btn-ug' }
      );
      
      if (!shouldRegisterBio) {
        UI.btnLoad('btn-register-student', false, 'Register');
        return UI.setAlert('stu-id-alert', 'Biometric registration is required to prevent impersonation.');
      }
      
      biometricSuccess = await registerWebAuthn();
      
      if (!biometricSuccess) {
        UI.btnLoad('btn-register-student', false, 'Register');
        return UI.setAlert('stu-id-alert', 'Biometric registration failed. Please try again or use a device with fingerprint/face recognition.');
      }
      
      const student = {
        studentId: sid,
        name: name,
        email: email,
        pwHash: UI.hashPw(pass),
        webAuthnCredentialId: S.webAuthnCredentialId || null,
        webAuthnData: S.webAuthnData || null,
        faceImage: null,
        devices: {},
        registeredAt: Date.now(),
        lastBiometricUse: Date.now(),
        lastVerificationMethod: 'webauthn',
        active: true,
        createdAt: Date.now()
      };
      
      student.devices[S.deviceFingerprint] = {
        registeredAt: Date.now(),
        lastUsed: Date.now(),
        userAgent: navigator.userAgent
      };
      
      await DB.STUDENTS.set(sid, student);
      S.registeredStudent = student;
      S.isNewRegistration = false;
      S.biometricVerified = biometricSuccess;
      S.biometricVerifiedAt = Date.now();
      
      UI.btnLoad('btn-register-student', false, 'Register');
      
      await MODAL.success('Registration Complete!', 
        `✅ Account created with biometric security!<br/><br/>
         Your fingerprint/face is now registered.<br/>
         All future check-ins will require biometric verification.`
      );
      
      _prefillCheckin(student);
      _setCheckinButtonsEnabled(true);
      _showStep('step-checkin');
      
    } catch(err){
      UI.btnLoad('btn-register-student', false, 'Register');
      UI.setAlert('stu-id-alert', err.message || 'Registration failed.');
    }
  }

  function _prefillCheckin(student) {
    if(UI.Q('s-name')) UI.Q('s-name').value = student.name;
    if(UI.Q('s-sid')) UI.Q('s-sid').value = student.studentId;
    
    const card = UI.Q('stu-profile-card');
    if(card) {
      if(UI.Q('sp-name')) UI.Q('sp-name').textContent = student.name;
      if(UI.Q('sp-sid')) UI.Q('sp-sid').textContent = student.studentId;
      if(UI.Q('sp-email')) UI.Q('sp-email').textContent = student.email;
      card.style.display = 'block';
    }
    
    if(S.session?.locEnabled && S.session?.lat != null){
      if(UI.Q('loc-btn-row')) UI.Q('loc-btn-row').style.display='flex';
      if(UI.Q('no-loc-row')) UI.Q('no-loc-row').style.display='none';
      _autoGetLocation();
    } else {
      if(UI.Q('loc-btn-row')) UI.Q('loc-btn-row').style.display='none';
      if(UI.Q('no-loc-row')) UI.Q('no-loc-row').style.display='block';
      _setLoc('idle','Location not required');
    }
    _setCheckinButtonsEnabled(S.biometricVerified);
  }

  function _setCheckinButtonsEnabled(enabled) {
    ['ci-btn', 'ci-btn-loc'].forEach(id => { 
      const b = UI.Q(id); 
      if(b) { 
        b.disabled = !enabled; 
        b.title = enabled ? '' : 'You MUST verify your identity first'; 
        b.style.opacity = enabled ? '1' : '0.5'; 
      } 
    });
  }

  // FIXED: Auto-get location with proper distance calculation
  async function _autoGetLocation() {
    _setLoc('busy','Getting your location automatically...');
    if(!navigator.geolocation){ 
      _simLoc(); 
      return; 
    }
    
    navigator.geolocation.getCurrentPosition(
      p => { 
        S.stuLat = p.coords.latitude; 
        S.stuLng = p.coords.longitude; 
        S.locationAccuracy = p.coords.accuracy || 0; 
        
        // Calculate distance if session has location
        let msg = `📍 Location: ${S.stuLat.toFixed(5)}, ${S.stuLng.toFixed(5)} (accuracy: ±${Math.round(S.locationAccuracy)}m)`;
        
        if(S.session?.lat && S.session?.lng){ 
          const dist = calculateDistance(S.stuLat, S.stuLng, S.session.lat, S.session.lng);
          const radius = S.session.radius || 100;
          const buffer = Math.min(S.locationAccuracy || 0, 30);
          const effectiveRadius = radius;
          
          msg += `<br/>📏 Distance to class: ${Math.round(dist)}m (Limit: ${radius}m)`;
          
          if(dist <= effectiveRadius) {
            msg += `<br/><span style="color:var(--teal)">✓ Within range - You can check in!</span>`;
            _setLoc('ok', msg);
          } else {
            msg += `<br/><span style="color:var(--danger)">⚠️ Outside range - You are ${Math.round(dist - radius)}m too far from the classroom!</span>`;
            _setLoc('err', msg);
          }
        } else {
          _setLoc('ok', msg);
        }
      }, 
      (err) => {
        console.warn('Geolocation error:', err);
        _simLoc();
      }, 
      { timeout: 10000, enableHighAccuracy: true, maximumAge: 5000 }
    );
  }
  
  function _simLoc(){
    if(S.session?.lat && S.session?.lng){ 
      // Simulate location within range for demo
      const radius = S.session.radius || 100;
      const radiusInDeg = radius / 111000; // Rough conversion
      const angle = Math.random() * Math.PI * 2;
      const offset = (Math.random() * radiusInDeg * 0.8);
      S.stuLat = S.session.lat + Math.cos(angle) * offset;
      S.stuLng = S.session.lng + Math.sin(angle) * offset;
    } else { 
      S.stuLat = 5.6505 + (Math.random() - .5) * 0.001; 
      S.stuLng = -0.1875 + (Math.random() - .5) * 0.001; 
    }
    S.locationAccuracy = 10;
    
    let msg = `📍 Location (demo): ${S.stuLat.toFixed(5)}, ${S.stuLng.toFixed(5)} (accuracy: ±10m)`;
    if(S.session?.lat && S.session?.lng){ 
      const dist = calculateDistance(S.stuLat, S.stuLng, S.session.lat, S.session.lng);
      const radius = S.session.radius || 100;
      msg += `<br/>📏 Distance: ${Math.round(dist)}m (Limit: ${radius}m)`;
      if(dist <= radius) {
        msg += `<br/><span style="color:var(--teal)">✓ Within range</span>`;
        _setLoc('ok', msg);
      } else {
        msg += `<br/><span style="color:var(--danger)">⚠️ Outside range</span>`;
        _setLoc('err', msg);
      }
    } else {
      _setLoc('ok', msg);
    }
  }
  
  function _setLoc(cls, msg){ 
    const b = UI.Q('ls-box'); 
    if(!b) return; 
    b.className = 'loc-status ' + cls; 
    const te = UI.Q('ls-text'); 
    if(te) te.innerHTML = msg; 
  }

  async function _autoEnrollInCourse(studentId, courseCode, courseName) {
    try { 
      const period = DB.getCurrentAcademicPeriod(); 
      const myId = S.session?.lecFbId;
      if (!(await DB.ENROLLMENT.isEnrolled(studentId, myId, courseCode))) {
        await DB.ENROLLMENT.enroll(studentId, myId, courseCode, courseName, period.semester, period.year); 
      }
    } catch(e) { console.warn(e); }
  }

  // FIXED: Check-in with proper location validation
  async function checkIn() {
    if(_isRateLimited()) {
      _err('Too many attempts. Please wait.');
      _resetBtns();
      return;
    }
    
    const name = UI.Q('s-name')?.value.trim(), sid = UI.Q('s-sid')?.value.trim();
    if(UI.Q('s-name')) UI.Q('s-name').classList.remove('err'); 
    if(UI.Q('s-sid')) UI.Q('s-sid').classList.remove('err');
    if(UI.Q('res-ok')) UI.Q('res-ok').style.display='none'; 
    if(UI.Q('res-err')) UI.Q('res-err').style.display='none';
    
    // Biometric verification check
    if(!S.biometricVerified){
      _err('⚠️ BIOMETRIC VERIFICATION REQUIRED - You must verify your fingerprint/face before checking in.');
      _resetBtns(); 
      return;
    }
    
    // Verification expires after 5 minutes
    if(S.biometricVerifiedAt && (Date.now()-S.biometricVerifiedAt)>300000){
      S.biometricVerified=false; 
      _err('⚠️ Verification expired. Please verify your fingerprint/face again.'); 
      _resetBtns(); 
      _showStep('step-biometric'); 
      return;
    }
    
    if(!name){ if(UI.Q('s-name')) UI.Q('s-name').classList.add('err'); _err('Please enter your name.'); _resetBtns(); return; }
    if(!sid){ if(UI.Q('s-sid')) UI.Q('s-sid').classList.add('err'); _err('Student ID is required.'); _resetBtns(); return; }
    if(!S.session||Date.now()>S.session.expiresAt){ _err('This session has expired.'); _resetBtns(); return; }
    
    ['ci-btn','ci-btn-loc'].forEach(id=>{ const b=UI.Q(id); if(b){ b.disabled=true; b.innerHTML='<span class="spin"></span>Checking in…'; } });
    
    const sessId=S.session.id, normSid=sid.toUpperCase().trim();
    const biometricId = S.webAuthnCredentialId || S.deviceFingerprint;
    
    try {
      // Check if course is still active
      const courseRecord = await DB.COURSE.get(S.session.lecFbId, S.session.courseCode, S.session.year, S.session.semester);
      if (courseRecord && courseRecord.active === false) { 
        _err(`This course (${S.session.courseCode}) has been ended for the semester.`); 
        _resetBtns(); 
        return; 
      }
      
      // Check if already checked in
      if(await DB.SESSION.hasSid(sessId,normSid)){
        await DB.SESSION.pushBlocked(sessId,{name,studentId:sid,reason:`Student ID already checked in`,time:UI.nowTime(),biometricId});
        _err(`Student ID "${sid}" has already checked in.`); 
        _resetBtns(); 
        return;
      }
      
      // Check if biometric already used
      if(await DB.SESSION.hasDevice(sessId,biometricId)){
        await DB.SESSION.pushBlocked(sessId,{name,studentId:sid,reason:`Biometric already used for this session`,time:UI.nowTime(),biometricId});
        _err(`You have already checked in to this session.`); 
        _resetBtns(); 
        return;
      }
      
      // LOCATION VALIDATION - FIXED
      let locNote='';
      if(S.session.locEnabled && S.session.lat!=null){
        // Wait for location if not available
        if(S.stuLat===null){ 
          _err('Getting location... Please wait.'); 
          _autoGetLocation(); 
          setTimeout(() => checkIn(), 3000); 
          _resetBtns(); 
          return; 
        }
        
        // Calculate exact distance in meters
        const dist = calculateDistance(S.stuLat, S.stuLng, S.session.lat, S.session.lng);
        const radius = S.session.radius || 100; // Radius in meters
        
        console.log(`[STU] Distance: ${Math.round(dist)}m, Radius: ${radius}m, Within: ${dist <= radius}`);
        
        if(dist > radius){ 
          await DB.SESSION.pushBlocked(sessId,{
            name, 
            studentId:sid,
            reason:`Too far: ${Math.round(dist)}m (limit ${radius}m) - Student location: ${S.stuLat.toFixed(5)},${S.stuLng.toFixed(5)} - Class location: ${S.session.lat},${S.session.lng}`,
            time:UI.nowTime(),
            biometricId
          }); 
          _err(`You are ${Math.round(dist)}m away from the classroom (limit ${radius}m). Please move closer to the lecture venue.`); 
          _resetBtns(); 
          return; 
        }
        locNote = `${Math.round(dist)}m/${radius}m`;
      }
      
      // Record check-in
      await Promise.all([
        DB.SESSION.addDevice(sessId, biometricId),
        DB.SESSION.addSid(sessId, normSid),
        DB.SESSION.pushRecord(sessId,{
          name, 
          studentId:normSid, 
          biometricId, 
          authMethod: S.webAuthnCredentialId ? 'webauthn' : 'password_fallback',
          webAuthnRegistered: !!S.webAuthnCredentialId,
          verificationTimestamp: S.biometricVerifiedAt,
          locNote, 
          time:UI.nowTime(), 
          checkedAt:Date.now(),
          locationAccuracy:S.locationAccuracy, 
          studentLat:S.stuLat, 
          studentLng:S.stuLng,
          classroomLat: S.session.lat,
          classroomLng: S.session.lng,
          distanceMeters: S.session.lat ? Math.round(calculateDistance(S.stuLat, S.stuLng, S.session.lat, S.session.lng)) : null,
          deviceFingerprint: S.deviceFingerprint,
          userAgent: navigator.userAgent
        }),
      ]);
      
      await _autoEnrollInCourse(normSid, S.session.courseCode, S.session.courseName);
      
      S.checkInAttempts = 0;
      
      clearInterval(S.cdTimer); S.cdTimer=null;
      _hideAll();
      if(UI.Q('stu-done')) UI.Q('stu-done').classList.add('show');
      const doneMsg=UI.Q('done-msg');
      if(doneMsg) doneMsg.innerHTML = `✅ Attendance recorded!<br/><span style="font-size:12px">✓ Verified with ${S.webAuthnCredentialId ? 'Biometric (FaceID/TouchID)' : 'Password'}<br/>✓ Distance: ${locNote || 'N/A'}</span>`;
      
    } catch(err){
      console.error('Check-in error:', err);
      _err('Error: '+(err.message||'Something went wrong.'));
      _resetBtns();
    }
  }

  function _err(msg){ const el=UI.Q('res-err'); if(!el)return; el.innerHTML=`<strong>✗ Check-in failed</strong><br>${UI.esc(msg).replace(/\n/g,'<br>')}`; el.style.display='block'; }
  
  function _resetBtns(){ 
    const en = S.biometricVerified; 
    ['ci-btn','ci-btn-loc'].forEach(id=>{ 
      const b=UI.Q(id); 
      if(b){ 
        b.disabled=!en; 
        b.textContent='Check in'; 
        b.title=en?'':'Verify your identity first'; 
        b.style.opacity=en?'1':'0.5'; 
      } 
    }); 
  }

  // Manual location retry
  function getLocation() {
    _autoGetLocation();
  }

  return { 
    init, 
    lookupStudent, 
    registerStudent,
    registerWebAuthn, 
    verifyWebAuthn, 
    verifyPassword,
    getLocation, 
    checkIn 
  };
})();
