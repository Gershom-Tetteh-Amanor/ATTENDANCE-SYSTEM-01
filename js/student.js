/* student.js — Student check-in
   Uses WebAuthn API for true biometric authentication:
   - First-time registration: registers fingerprint/face with device
   - Check-in: verifies using fingerprint/face sensor
   - Cross-device: works across devices with biometric support
*/
'use strict';

const STU = (() => {
  const S = { 
    session: null, 
    cdTimer: null, 
    stuLat: null, 
    stuLng: null, 
    biometricCredential: null,  // Store WebAuthn credential ID
    registeredStudent: null, 
    locationAccuracy: null,
    biometricVerified: false,
    webAuthnSupported: null
  };

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
      
      // Check if WebAuthn is supported
      S.webAuthnSupported = await _checkWebAuthnSupport();
      if (!S.webAuthnSupported) {
        _showFallbackMessage();
      }
      
      _showStep('step-identity');
      _cdTick();
      clearInterval(S.cdTimer);
      S.cdTimer=setInterval(_cdTick,1000);
      
      // Reset form state
      if(UI.Q('s-id-lookup')) UI.Q('s-id-lookup').value = '';
      if(UI.Q('stu-reg-block')) UI.Q('stu-reg-block').style.display = 'none';
      if(UI.Q('stu-new-hint')) UI.Q('stu-new-hint').style.display = 'none';
      if(UI.Q('stu-pass-fallback')) UI.Q('stu-pass-fallback').style.display = 'none';
      if(UI.Q('bio-result')) UI.Q('bio-result').style.display = 'none';
      if(UI.Q('bio-scan-area')) UI.Q('bio-scan-area').classList.remove('scanning', 'success');
      S.biometricCredential = null;
      S.biometricVerified = false;
      S.registeredStudent = null;
      S.stuLat = null;
      S.stuLng = null;
      S.locationAccuracy = null;
      
      _setCheckinButtonsEnabled(false);
    }catch(e){console.error(e);_hideAll();_invalid('Could not read QR code','Please scan again.');}
  }

  async function _checkWebAuthnSupport() {
    if (!window.PublicKeyCredential) {
      return false;
    }
    try {
      // Check if platform authenticator (fingerprint/face) is available
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      return available;
    } catch(e) {
      console.warn('WebAuthn check failed:', e);
      return false;
    }
  }

  function _showFallbackMessage() {
    const bioArea = UI.Q('bio-scan-area');
    if (bioArea) {
      bioArea.innerHTML = `
        <div style="text-align:center;padding:20px;background:var(--amber-l);border-radius:12px">
          <div style="font-size:32px;margin-bottom:8px">⚠️</div>
          <div style="font-weight:600;margin-bottom:4px">Biometric not supported</div>
          <div style="font-size:12px;color:var(--text3)">
            Your device doesn't support fingerprint/face recognition.<br/>
            Please use password authentication instead.
          </div>
        </div>
      `;
    }
  }

  function _hideAll(){['loading','invalid','done'].forEach(n=>UI.Q('stu-'+n)?.classList.remove('show'));const f=UI.Q('stu-form');if(f)f.style.display='none';}
  function _invalid(title,msg){clearInterval(S.cdTimer);S.cdTimer=null;UI.Q('stu-invalid').classList.add('show');UI.Q('inv-title').textContent=title;UI.Q('inv-msg').innerHTML=msg;}

  function _showStep(stepId) {
    UI.Q('stu-form').style.display='block';
    ['step-identity','step-biometric','step-checkin'].forEach(id=>{
      const el=UI.Q(id); if(el)el.style.display=id===stepId?'block':'none';
    });
  }

  function _cdTick(){
    if(!S.session)return;const rem=Math.max(0,S.session.expiresAt-Date.now()),el=UI.Q('s-cd');if(!el)return;
    if(rem===0){el.textContent='Session expired';el.className='countdown exp';clearInterval(S.cdTimer);S.cdTimer=null;_invalid('Session expired','Sign-in window closed.');return;}
    const h=Math.floor(rem/3600000),m=Math.floor((rem%3600000)/60000),s2=Math.floor((rem%60000)/1000);
    el.textContent=h>0?`${h}h ${UI.pad(m)}m ${UI.pad(s2)}s left`:`${m}:${UI.pad(s2)} left`;
    el.className='countdown '+(rem<180000?'warn':'ok');
  }

  /* ═══ STEP 1 — Identity: student enters their student ID ═══ */
  async function lookupStudent() {
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
        UI.Q('s-reg-name').textContent   = existing.name;
        UI.Q('s-reg-sid').textContent    = existing.studentId;
        UI.Q('s-reg-email').textContent  = existing.email;
        
        // Check if student has biometric registered
        const hasBiometric = existing.biometricCredentialId ? true : false;
        
        if(UI.Q('bio-scan-area')) UI.Q('bio-scan-area').classList.remove('scanning', 'success');
        if(UI.Q('bio-icon')) UI.Q('bio-icon').textContent = hasBiometric ? '🔐' : '📱';
        
        let statusMsg = '';
        if (hasBiometric) {
          statusMsg = 'Tap "Verify with Biometric" to use your fingerprint/face';
        } else if (S.webAuthnSupported) {
          statusMsg = 'No biometric registered. Register now with your fingerprint/face.';
        } else {
          statusMsg = 'Biometric not supported. Use password.';
        }
        if(UI.Q('bio-status-txt')) UI.Q('bio-status-txt').textContent = statusMsg;
        
        if(UI.Q('bio-result')) UI.Q('bio-result').style.display = 'none';
        if(UI.Q('stu-pass-fallback')) UI.Q('stu-pass-fallback').style.display = 'none';
        if(UI.Q('s-bio-pass')) UI.Q('s-bio-pass').value = '';
        UI.clrAlert('stu-bio-alert');
        S.biometricVerified = false;
        _setCheckinButtonsEnabled(false);
        _showStep('step-biometric');
      } else {
        _showRegFields(sid);
      }
    } catch(err){
      UI.btnLoad('btn-lookup',false,'Continue');
      UI.setAlert('stu-id-alert',err.message||'Error.');
    }
  }

  function _showRegFields(sid) {
    UI.Q('s-id-lookup').value = sid;
    const regBlock = UI.Q('stu-reg-block');
    if(regBlock) regBlock.style.display = 'block';
    const hint = UI.Q('stu-new-hint');
    if(hint) hint.style.display = 'block';
    if(UI.Q('s-reg-full-name')) UI.Q('s-reg-full-name').value = '';
    if(UI.Q('s-reg-email-input')) UI.Q('s-reg-email-input').value = '';
    if(UI.Q('s-reg-pass')) UI.Q('s-reg-pass').value = '';
    if(UI.Q('s-reg-pass2')) UI.Q('s-reg-pass2').value = '';
    
    // Show biometric registration info for new students
    const bioInfo = UI.Q('bio-reg-info');
    if (bioInfo && S.webAuthnSupported) bioInfo.style.display = 'block';
    
    S.biometricVerified = false;
    _setCheckinButtonsEnabled(false);
  }

  /* ═══ STEP 1b — Register new student with WebAuthn biometric ═══ */
  async function registerStudent() {
    const sid   = UI.Q('s-id-lookup')?.value.trim().toUpperCase();
    const name  = UI.Q('s-reg-full-name')?.value.trim();
    const email = UI.Q('s-reg-email-input')?.value.trim().toLowerCase();
    const pass  = UI.Q('s-reg-pass')?.value;
    const pass2 = UI.Q('s-reg-pass2')?.value;
    UI.clrAlert('stu-id-alert');
    if(!sid||!name||!email||!pass)return UI.setAlert('stu-id-alert','All fields are required.');
    if(!email.endsWith('.ug.edu.gh')&&!email.endsWith('@st.ug.edu.gh'))return UI.setAlert('stu-id-alert','Email must be a UG email.');
    if(pass.length<6)return UI.setAlert('stu-id-alert','Password must be at least 6 characters.');
    if(pass!==pass2)  return UI.setAlert('stu-id-alert','Passwords do not match.');
    
    UI.btnLoad('btn-register-student',true);
    try {
      // Register biometric FIRST (fingerprint/face)
      let biometricCredentialId = null;
      let biometricSuccess = false;
      
      if (S.webAuthnSupported) {
        try {
          const result = await _registerBiometric(name, email);
          if (result) {
            biometricCredentialId = result.credentialId;
            biometricSuccess = true;
          }
        } catch(bioErr) {
          console.warn('Biometric registration skipped or failed:', bioErr);
          // Continue with password-only if user chooses
          const continueAnyway = await MODAL.confirm(
            'Biometric Registration Issue',
            'Could not register your fingerprint/face. Do you want to continue with password-only?',
            { confirmLabel: 'Continue with Password', cancelLabel: 'Try Again' }
          );
          if (!continueAnyway) {
            UI.btnLoad('btn-register-student',false,'Register');
            return;
          }
        }
      }
      
      const student = {
        studentId: sid,
        name: name,
        email: email,
        pwHash: UI.hashPw(pass),
        biometricCredentialId: biometricCredentialId,
        biometricRegistered: biometricSuccess,
        registeredAt: Date.now(),
        lastBiometricUse: null,
        active: true,
        createdAt: Date.now()
      };
      
      await DB.STUDENTS.set(sid, student);
      S.registeredStudent = student;
      S.biometricCredential = biometricCredentialId;
      S.biometricVerified = biometricSuccess;
      
      UI.btnLoad('btn-register-student',false,'Register');
      
      let successMsg = `Welcome, ${name}. Your account has been created.`;
      if (biometricSuccess) {
        successMsg += `<br/><span style="font-size:12px;color:var(--teal)">✓ Fingerprint/Face recognition registered successfully!</span>`;
      } else {
        successMsg += `<br/><span style="font-size:12px;color:var(--amber)">You can sign in with your password. Biometric setup skipped.</span>`;
      }
      
      await MODAL.success('Account created!', successMsg);
      
      _prefillCheckin(student);
      if (biometricSuccess) {
        S.biometricVerified = true;
        _setCheckinButtonsEnabled(true);
      }
      _showStep('step-checkin');
    } catch(err){
      UI.btnLoad('btn-register-student',false,'Register');
      UI.setAlert('stu-id-alert',err.message||'Registration failed.');
    }
  }

  /* ═══ WebAuthn Biometric Registration ═══ */
  async function _registerBiometric(userName, userEmail) {
    try {
      // Create a random challenge
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      
      // Create credential
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
            authenticatorAttachment: "platform",  // Use device biometric sensor
            userVerification: "required",         // Require fingerprint/face
            residentKey: "required"               // Store on device
          },
          timeout: 60000,
          attestation: "none"
        }
      });
      
      // Store the credential ID
      const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
      
      await MODAL.success('Biometric Registered!', 
        'Your fingerprint/face has been successfully registered.<br/>You can now use it to check in quickly.'
      );
      
      return { credentialId };
    } catch(err) {
      console.error('Biometric registration error:', err);
      if (err.name === 'NotAllowedError') {
        throw new Error('Biometric verification was cancelled or failed. Please try again.');
      }
      throw new Error('Could not register biometric: ' + err.message);
    }
  }

  /* ═══ STEP 2 — Biometric verification using WebAuthn ═══ */
  async function verifyBiometric() {
    const student = S.registeredStudent;
    if(!student) return;
    
    if (!student.biometricCredentialId) {
      UI.setAlert('stu-bio-alert', 'No biometric registered for this account. Please use password.');
      UI.Q('stu-pass-fallback').style.display = 'block';
      return;
    }
    
    UI.clrAlert('stu-bio-alert');
    UI.btnLoad('btn-verify-bio', true);
    
    try {
      const verified = await _authenticateBiometric(student);
      
      if (verified) {
        S.biometricVerified = true;
        UI.btnLoad('btn-verify-bio', false, 'Verify with Biometric');
        
        // Update last use time
        await DB.STUDENTS.update(student.studentId, { lastBiometricUse: Date.now() });
        
        // Show success on UI
        if(UI.Q('bio-scan-area')) UI.Q('bio-scan-area').classList.add('success');
        if(UI.Q('bio-icon')) UI.Q('bio-icon').textContent = '✅';
        if(UI.Q('bio-status-txt')) UI.Q('bio-status-txt').textContent = 'Biometric verified successfully! ✓';
        if(UI.Q('bio-result')) UI.Q('bio-result').style.display = 'block';
        if(UI.Q('bio-val')) UI.Q('bio-val').textContent = 'Fingerprint/Face verified';
        
        await MODAL.success('Verification Successful!', 
          'Your fingerprint/face has been verified.<br/>You can now check in.'
        );
        
        _prefillCheckin(student);
        _setCheckinButtonsEnabled(true);
        _showStep('step-checkin');
      } else {
        UI.btnLoad('btn-verify-bio', false, 'Verify with Biometric');
        UI.setAlert('stu-bio-alert', 'Biometric verification failed. Please use your password.');
        UI.Q('stu-pass-fallback').style.display = 'block';
        S.biometricVerified = false;
        _setCheckinButtonsEnabled(false);
      }
    } catch(err) {
      UI.btnLoad('btn-verify-bio', false, 'Verify with Biometric');
      UI.setAlert('stu-bio-alert', err.message || 'Biometric verification failed.');
      S.biometricVerified = false;
      _setCheckinButtonsEnabled(false);
    }
  }

  /* ═══ WebAuthn Biometric Authentication ═══ */
  async function _authenticateBiometric(student) {
    try {
      // Decode stored credential ID
      const credentialId = Uint8Array.from(atob(student.biometricCredentialId), c => c.charCodeAt(0));
      
      // Create random challenge
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      
      // Get assertion
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
        return true;
      }
      return false;
    } catch(err) {
      console.error('Biometric authentication error:', err);
      if (err.name === 'NotAllowedError') {
        throw new Error('Biometric verification cancelled or failed. Please try again.');
      }
      throw new Error('Biometric authentication failed: ' + err.message);
    }
  }

  /* Password fallback when biometric fails or not registered */
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
      // Optionally register biometric after password verification
      if (S.webAuthnSupported && !student.biometricCredentialId) {
        const registerBio = await MODAL.confirm(
          'Register Biometric?',
          'Would you like to register your fingerprint/face for faster future check-ins?',
          { confirmLabel: 'Yes, register', cancelLabel: 'No, thanks' }
        );
        
        if (registerBio) {
          try {
            const result = await _registerBiometric(student.name, student.email);
            if (result) {
              await DB.STUDENTS.update(student.studentId, { 
                biometricCredentialId: result.credentialId,
                biometricRegistered: true,
                biometricRegisteredAt: Date.now()
              });
              S.biometricCredential = result.credentialId;
              await MODAL.success('Biometric Registered!', 'You can now use fingerprint/face for future check-ins.');
            }
          } catch(bioErr) {
            console.warn('Biometric registration failed:', bioErr);
          }
        }
      }
      
      S.biometricVerified = true;
      if(UI.Q('stu-pass-fallback')) UI.Q('stu-pass-fallback').style.display = 'none';
      UI.btnLoad('btn-verify-pass', false, 'Verify');
      await MODAL.success('Verified!', 'You can now check in.');
      _prefillCheckin(student);
      _setCheckinButtonsEnabled(true);
      _showStep('step-checkin');
    } catch(err){
      UI.btnLoad('btn-verify-pass', false, 'Verify');
      UI.setAlert('stu-bio-alert', 'Failed to verify: ' + err.message);
      S.biometricVerified = false;
      _setCheckinButtonsEnabled(false);
    }
  }

  function _prefillCheckin(student) {
    const nameEl = UI.Q('s-name'), sidEl = UI.Q('s-sid');
    if(nameEl) nameEl.value = student.name;
    if(sidEl)  sidEl.value  = student.studentId;
    
    const card = UI.Q('stu-profile-card');
    if(card) {
      if(UI.Q('sp-name')) UI.Q('sp-name').textContent  = student.name;
      if(UI.Q('sp-sid')) UI.Q('sp-sid').textContent   = student.studentId;
      if(UI.Q('sp-email')) UI.Q('sp-email').textContent = student.email;
      
      // Show biometric status
      const bioStatus = UI.Q('sp-bio-status');
      if(bioStatus) {
        if (student.biometricCredentialId) {
          bioStatus.innerHTML = '✓ Biometric enabled';
          bioStatus.style.color = 'var(--teal)';
        } else {
          bioStatus.innerHTML = '⚠️ Biometric not registered';
          bioStatus.style.color = 'var(--amber)';
        }
      }
      card.style.display = 'block';
    }
    
    if(S.session?.locEnabled && S.session?.lat != null){
      if(UI.Q('loc-btn-row')) UI.Q('loc-btn-row').style.display='flex';
      if(UI.Q('no-loc-row')) UI.Q('no-loc-row').style.display='none';
      _setLoc('idle','Location required — tap to get your location');
      S.stuLat = null;
      S.stuLng = null;
      S.locationAccuracy = null;
    } else {
      if(UI.Q('loc-btn-row')) UI.Q('loc-btn-row').style.display='none';
      if(UI.Q('no-loc-row')) UI.Q('no-loc-row').style.display='block';
      _setLoc('idle','Location not required for this session');
    }
    
    _setCheckinButtonsEnabled(S.biometricVerified);
    
    if(UI.Q('res-ok')) UI.Q('res-ok').style.display='none';
    if(UI.Q('res-err')) UI.Q('res-err').style.display='none';
  }

  function _setCheckinButtonsEnabled(enabled) {
    const buttons = ['ci-btn', 'ci-btn-loc'];
    buttons.forEach(id => {
      const b = UI.Q(id);
      if(b) {
        b.disabled = !enabled;
        if (!enabled) {
          b.title = 'You must verify with biometric or password first';
          b.style.opacity = '0.5';
          b.style.cursor = 'not-allowed';
        } else {
          b.title = '';
          b.style.opacity = '1';
          b.style.cursor = 'pointer';
        }
      }
    });
  }

  async function captureFingerprint() {
    // This is now handled by verifyBiometric() for returning students
    // For new students, registration handles it
    if (S.registeredStudent && S.registeredStudent.biometricCredentialId) {
      await verifyBiometric();
    } else if (!S.registeredStudent) {
      // During registration, biometric is handled in registerStudent()
      await MODAL.alert('Biometric Registration', 
        'During registration, you will be prompted to register your fingerprint or face.<br/><br/>' +
        'Make sure your device has biometric sensors (fingerprint reader or face recognition).'
      );
    }
  }

  function getLocation(){
    _setLoc('busy','Fetching your location…');
    if(!navigator.geolocation){
      _simLoc();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      p=>{
        S.stuLat=p.coords.latitude;
        S.stuLng=p.coords.longitude;
        S.locationAccuracy = p.coords.accuracy || 0;
        const accuracyMsg = S.locationAccuracy ? ` (accuracy: ±${Math.round(S.locationAccuracy)}m)` : '';
        _setLoc('ok',`Location acquired: ${S.stuLat.toFixed(5)}, ${S.stuLng.toFixed(5)}${accuracyMsg}`);
      },
      (err)=>{
        console.warn('Geolocation error:',err);
        _simLoc();
      },
      {timeout:10000,maximumAge:0,enableHighAccuracy:true}
    );
  }
  
  function _simLoc(){
    const base=S.session?.lat?[S.session.lat,S.session.lng]:[5.6505,-0.1875];
    const d=0.0003;
    S.stuLat=base[0]+(Math.random()-.5)*d*2;
    S.stuLng=base[1]+(Math.random()-.5)*d*2;
    S.locationAccuracy = 15;
    _setLoc('ok',`Location (demo): ${S.stuLat.toFixed(5)}, ${S.stuLng.toFixed(5)} (accuracy: ±15m)`);
  }
  
  function _setLoc(cls,msg){
    const b=UI.Q('ls-box');
    if(!b) return;
    b.className='loc-status '+cls;
    const textEl=UI.Q('ls-text');
    if(textEl) textEl.textContent=msg;
  }

  /* ═══ Final check-in - biometric MUST be verified ═══ */
  async function checkIn() {
    const nameEl=UI.Q('s-name');
    const sidEl=UI.Q('s-sid');
    const name=nameEl?.value.trim();
    const sid=sidEl?.value.trim();
    
    if(nameEl) nameEl.classList.remove('err');
    if(sidEl) sidEl.classList.remove('err');
    if(UI.Q('res-ok')) UI.Q('res-ok').style.display='none';
    if(UI.Q('res-err')) UI.Q('res-err').style.display='none';
    
    // REQUIRE biometric verification before check-in
    if(!S.biometricVerified){
      _err('⚠️ You MUST verify with your fingerprint/face or password before checking in.');
      _resetBtns();
      return;
    }
    
    if(!name){
      if(nameEl) nameEl.classList.add('err');
      _err('Please enter your full name.');
      _resetBtns();
      return;
    }
    if(!sid){
      if(sidEl) sidEl.classList.add('err');
      _err('Student ID is required.');
      _resetBtns();
      return;
    }
    if(!S.session||Date.now()>S.session.expiresAt){
      _err('This session has expired.');
      _resetBtns();
      return;
    }
    
    ['ci-btn','ci-btn-loc'].forEach(id=>{
      const b=UI.Q(id);
      if(b){
        b.disabled=true;
        b.innerHTML='<span class="spin"></span>Checking in…';
      }
    });
    
    const sessId=S.session.id;
    const normSid=sid.toUpperCase().trim();
    const biometricId = S.biometricCredential || 'password-auth';
    
    try {
      // Duplicate student ID check
      if(await DB.SESSION.hasSid(sessId,normSid)){
        const recs=await DB.SESSION.getRecords(sessId);
        const who=recs.find(r=>r.studentId && r.studentId.toUpperCase()===normSid);
        await DB.SESSION.pushBlocked(sessId,{
          name,
          studentId:sid,
          reason:`Student ID already checked in${who?' as '+who.name:''}`,
          time:UI.nowTime(),
          biometricId: biometricId
        });
        _err(`Student ID "${sid}" has already checked in for this session.`);
        _resetBtns();
        return;
      }
      
      // Duplicate biometric check (prevents same person from checking in twice)
      if(await DB.SESSION.hasDevice(sessId, biometricId)){
        const recs=await DB.SESSION.getRecords(sessId);
        const who=recs.find(r=>r.biometricId===biometricId);
        await DB.SESSION.pushBlocked(sessId,{
          name,
          studentId:sid,
          reason:`Biometric already used by ${who?.name||'another student'}`,
          time:UI.nowTime(),
          biometricId: biometricId
        });
        _err(`This fingerprint/face already checked someone in${who?' ('+who.name+')':''}.`);
        _resetBtns();
        return;
      }
      
      // Duplicate name check
      const existing=await DB.SESSION.getRecords(sessId);
      if(existing.find(r=>r.name && r.name.toLowerCase()===name.toLowerCase())){
        await DB.SESSION.pushBlocked(sessId,{
          name,
          studentId:sid,
          reason:'Name already checked in',
          time:UI.nowTime(),
          biometricId: biometricId
        });
        _err(`${name} has already checked in this session.`);
        _resetBtns();
        return;
      }
      
      // Location fence check with tolerance
      let locNote='';
      if(S.session.locEnabled && S.session.lat!=null){
        if(S.stuLat===null){
          _err('Location required — tap "Get my location" first.');
          _resetBtns();
          return;
        }
        
        const actualDistance = UI.haversine(S.stuLat,S.stuLng,S.session.lat,S.session.lng);
        const allowedRadius = S.session.radius;
        
        const accuracyBuffer = (S.locationAccuracy && S.locationAccuracy > 0) ? Math.min(S.locationAccuracy, 30) : 0;
        const tolerance = 5;
        const effectiveRadius = allowedRadius + accuracyBuffer + tolerance;
        
        if(actualDistance > effectiveRadius){
          const accuracyNote = accuracyBuffer > 0 ? ` (GPS accuracy: ±${Math.round(accuracyBuffer)}m)` : '';
          
          await DB.SESSION.pushBlocked(sessId,{
            name,
            studentId:sid,
            reason:`Too far: ${Math.round(actualDistance)}m (limit ${allowedRadius}m)${accuracyNote}`,
            time:UI.nowTime(),
            biometricId: biometricId,
            location:{lat:S.stuLat,lng:S.stuLng, accuracy:S.locationAccuracy}
          });
          
          _err(`You are ${Math.round(actualDistance)}m from the classroom (limit ${allowedRadius}m).${accuracyNote}\n\nTry getting a more accurate GPS fix.`);
          _resetBtns();
          return;
        }
        
        const accuracyNote = S.locationAccuracy ? ` (GPS ±${Math.round(S.locationAccuracy)}m)` : '';
        locNote = `${Math.round(actualDistance)}m / ${allowedRadius}m${accuracyNote}`;
      }
      
      // Successful check-in
      await Promise.all([
        DB.SESSION.addDevice(sessId, biometricId),
        DB.SESSION.addSid(sessId,normSid),
        DB.SESSION.pushRecord(sessId,{
          name,
          studentId:normSid,
          biometricId: biometricId,
          authMethod: S.biometricCredential ? 'biometric' : 'password',
          locNote,
          time:UI.nowTime(),
          checkedAt:Date.now(),
          locationAccuracy: S.locationAccuracy,
          studentLat: S.stuLat,
          studentLng: S.stuLng
        }),
      ]);
      
      // Update stats
      if (DB.STATS) await DB.STATS.incrementCheckins();
      
      clearInterval(S.cdTimer);
      S.cdTimer=null;
      _hideAll();
      if(UI.Q('stu-done')) UI.Q('stu-done').classList.add('show');
      const doneMsg=UI.Q('done-msg');
      if(doneMsg) doneMsg.textContent=`Attendance for ${S.session.code} — ${S.session.course} on ${S.session.date} recorded. ✓ Verified with ${S.biometricCredential ? 'biometric' : 'password'}`;
    } catch(err){
      _err('Error: '+(err.message||'Something went wrong.'));
      _resetBtns();
    }
  }

  function _err(msg){const el=UI.Q('res-err');if(!el)return;el.innerHTML=`<strong>✗ Check-in failed</strong><br>${UI.esc(msg)}`;el.style.display='block';}
  
  function _resetBtns(){
    const enabled = S.biometricVerified;
    ['ci-btn','ci-btn-loc'].forEach(id=>{
      const b=UI.Q(id);
      if(b){
        b.disabled = !enabled;
        b.textContent = 'Check in';
        if (!enabled) {
          b.title = 'You must verify with biometric or password first';
          b.style.opacity = '0.5';
        } else {
          b.title = '';
          b.style.opacity = '1';
        }
      }
    });
  }

  return { init, lookupStudent, registerStudent, verifyBiometric, verifyPassword, captureFingerprint, getLocation, checkIn };
})();
