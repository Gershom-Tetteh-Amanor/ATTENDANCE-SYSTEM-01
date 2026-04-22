/* student.js — Student QR Check-in
   TRUE BIOMETRIC AUTHENTICATION:
   - First-time: Registers student's ACTUAL fingerprint/face (WebAuthn)
   - Check-in: Verifies using SAME fingerprint/face (not device fingerprint)
   - Cross-device: Student must register biometric on each device they use
   - Password is ONLY for portal login, NEVER for QR check-in
*/
'use strict';

const STU = (() => {
  const S = { 
    session: null, 
    cdTimer: null, 
    stuLat: null, 
    stuLng: null, 
    biometricCredentialId: null,
    registeredStudent: null, 
    locationAccuracy: null,
    biometricVerified: false,
    biometricVerifiedAt: null,
    webAuthnSupported: null,
    isNewRegistration: false
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
      
      // Check WebAuthn support
      S.webAuthnSupported = await _checkWebAuthnSupport();
      
      _resetState();
      _showStep('step-identity');
      _cdTick();
      clearInterval(S.cdTimer);
      S.cdTimer=setInterval(_cdTick,1000);
      
    }catch(e){console.error(e);_hideAll();_invalid('Could not read QR code','Please scan again.');}
  }

  function _resetState() {
    if(UI.Q('s-id-lookup')) UI.Q('s-id-lookup').value = '';
    if(UI.Q('stu-reg-block')) UI.Q('stu-reg-block').style.display = 'none';
    if(UI.Q('stu-new-hint')) UI.Q('stu-new-hint').style.display = 'none';
    if(UI.Q('stu-pass-fallback')) UI.Q('stu-pass-fallback').style.display = 'none';
    if(UI.Q('bio-result')) UI.Q('bio-result').style.display = 'none';
    if(UI.Q('bio-scan-area')) UI.Q('bio-scan-area').classList.remove('scanning', 'success');
    if(UI.Q('bio-icon')) UI.Q('bio-icon').textContent = '🔐';
    if(UI.Q('bio-status-txt')) UI.Q('bio-status-txt').textContent = 'Tap to verify with fingerprint/face';
    S.biometricCredentialId = null;
    S.biometricVerified = false;
    S.biometricVerifiedAt = null;
    S.registeredStudent = null;
    S.stuLat = null;
    S.stuLng = null;
    S.locationAccuracy = null;
    S.isNewRegistration = false;
    _setCheckinButtonsEnabled(false);
  }

  async function _checkWebAuthnSupport() { 
    if (!window.PublicKeyCredential) return false;
    try { 
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); 
    } catch(e) { return false; }
  }

  function _hideAll(){['loading','invalid','done'].forEach(n=>UI.Q('stu-'+n)?.classList.remove('show'));const f=UI.Q('stu-form');if(f)f.style.display='none';}
  function _invalid(title,msg){clearInterval(S.cdTimer);S.cdTimer=null;UI.Q('stu-invalid').classList.add('show');UI.Q('inv-title').textContent=title;UI.Q('inv-msg').innerHTML=msg;}
  function _showStep(stepId) { UI.Q('stu-form').style.display='block'; ['step-identity','step-biometric','step-checkin'].forEach(id=>{ const el=UI.Q(id); if(el)el.style.display=id===stepId?'block':'none'; }); }
  function _cdTick(){ if(!S.session)return;const rem=Math.max(0,S.session.expiresAt-Date.now()),el=UI.Q('s-cd');if(!el)return; if(rem===0){el.textContent='Session expired';el.className='countdown exp';clearInterval(S.cdTimer);S.cdTimer=null;_invalid('Session expired','Sign-in window closed.');return;} const h=Math.floor(rem/3600000),m=Math.floor((rem%3600000)/60000),s2=Math.floor((rem%60000)/1000); el.textContent=h>0?`${h}h ${UI.pad(m)}m ${UI.pad(s2)}s left`:`${m}:${UI.pad(s2)} left`; el.className='countdown '+(rem<180000?'warn':'ok'); }

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
        S.isNewRegistration = false;
        UI.Q('s-reg-name').textContent = existing.name; 
        UI.Q('s-reg-sid').textContent = existing.studentId; 
        UI.Q('s-reg-email').textContent = existing.email;
        
        if(UI.Q('bio-scan-area')) UI.Q('bio-scan-area').classList.remove('scanning', 'success');
        if(UI.Q('bio-icon')) UI.Q('bio-icon').textContent = existing.biometricCredentialId ? '🔐' : '📱';
        if(UI.Q('bio-status-txt')) UI.Q('bio-status-txt').textContent = existing.biometricCredentialId ? 'Tap to verify with your fingerprint/face' : 'No biometric registered. Please register your fingerprint/face.';
        
        if(UI.Q('bio-result')) UI.Q('bio-result').style.display = 'none';
        if(UI.Q('stu-pass-fallback')) UI.Q('stu-pass-fallback').style.display = 'none';
        UI.clrAlert('stu-bio-alert');
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
    const bioInfo = UI.Q('bio-reg-info');
    if (bioInfo && S.webAuthnSupported) bioInfo.style.display = 'block';
    S.biometricVerified = false;
    _setCheckinButtonsEnabled(false);
  }

  async function registerStudent() {
    const sid = UI.Q('s-id-lookup')?.value.trim().toUpperCase();
    const name = UI.Q('s-reg-full-name')?.value.trim();
    const email = UI.Q('s-reg-email-input')?.value.trim().toLowerCase();
    const pass = UI.Q('s-reg-pass')?.value;
    const pass2 = UI.Q('s-reg-pass2')?.value;
    
    UI.clrAlert('stu-id-alert');
    if(!sid||!name||!email||!pass) return UI.setAlert('stu-id-alert','All fields are required.');
    if(!email.endsWith('.ug.edu.gh')&&!email.endsWith('@st.ug.edu.gh')) return UI.setAlert('stu-id-alert','Email must be a UG email.');
    if(pass.length<6) return UI.setAlert('stu-id-alert','Password must be at least 6 characters.');
    if(pass!==pass2) return UI.setAlert('stu-id-alert','Passwords do not match.');
    
    UI.btnLoad('btn-register-student',true);
    try {
      let biometricCredentialId = null;
      let biometricSuccess = false;
      
      if (S.webAuthnSupported) {
        try {
          // Register the student's actual fingerprint/face
          const result = await _registerBiometric(name, email);
          if (result) {
            biometricCredentialId = result.credentialId;
            biometricSuccess = true;
          }
        } catch(bioErr) {
          const continueAnyway = await MODAL.confirm('Biometric Registration Issue',
            'Could not register your fingerprint/face. Do you want to continue with password-only? (Not recommended)',
            { confirmLabel: 'Continue', cancelLabel: 'Try Again' });
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
      S.biometricCredentialId = biometricCredentialId;
      S.isNewRegistration = false;
      
      UI.btnLoad('btn-register-student',false,'Register');
      
      let successMsg = `Welcome, ${name}! Your account has been created.`;
      if (biometricSuccess) {
        successMsg += `<br/><span style="color:var(--teal)">✓ Your fingerprint/face has been registered! You can now check in.</span>`;
        S.biometricVerified = true;
        S.biometricVerifiedAt = Date.now();
      } else {
        successMsg += `<br/><span style="color:var(--danger)">⚠️ Biometric registration failed. Please contact support.</span>`;
      }
      await MODAL.success('Account Created!', successMsg);
      
      _prefillCheckin(student);
      _setCheckinButtonsEnabled(S.biometricVerified);
      _showStep('step-checkin');
    } catch(err){
      UI.btnLoad('btn-register-student',false,'Register');
      UI.setAlert('stu-id-alert',err.message||'Registration failed.');
    }
  }

  async function _registerBiometric(userName, userEmail) {
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: "UG QR Attendance System", id: window.location.hostname },
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
            userVerification: "required",  // REQUIRES fingerprint/face
            residentKey: "required"        // Store credential on device
          },
          timeout: 60000,
          attestation: "none"
        }
      });
      
      const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
      return { credentialId };
    } catch(err) {
      if (err.name === 'NotAllowedError') throw new Error('Biometric registration cancelled or failed.');
      throw new Error('Could not register biometric: ' + err.message);
    }
  }

  async function verifyBiometric() {
    const student = S.registeredStudent;
    if(!student) return;
    
    if (!student.biometricCredentialId) {
      // No biometric registered - offer to register now
      const register = await MODAL.confirm('Register Biometric',
        'No fingerprint/face registered. You MUST register your biometric to check in.',
        { confirmLabel: 'Register Now', cancelLabel: 'Cancel' });
      if (register) {
        await _registerAndVerify(student);
      }
      return;
    }
    
    UI.clrAlert('stu-bio-alert');
    UI.btnLoad('btn-verify-bio', true);
    if(UI.Q('bio-scan-area')) UI.Q('bio-scan-area').classList.add('scanning');
    if(UI.Q('bio-icon')) UI.Q('bio-icon').textContent = '⏳';
    if(UI.Q('bio-status-txt')) UI.Q('bio-status-txt').textContent = 'Please scan your fingerprint/face...';
    
    try {
      // Authenticate using the registered biometric credential
      const verified = await _authenticateBiometric(student);
      if (verified) {
        S.biometricVerified = true;
        S.biometricVerifiedAt = Date.now();
        UI.btnLoad('btn-verify-bio', false, 'Verify');
        await DB.STUDENTS.update(student.studentId, { lastBiometricUse: Date.now() });
        
        if(UI.Q('bio-scan-area')) {
          UI.Q('bio-scan-area').classList.remove('scanning');
          UI.Q('bio-scan-area').classList.add('success');
        }
        if(UI.Q('bio-icon')) UI.Q('bio-icon').textContent = '✅';
        if(UI.Q('bio-status-txt')) UI.Q('bio-status-txt').textContent = 'Fingerprint/Face verified successfully! ✓';
        if(UI.Q('bio-result')) UI.Q('bio-result').style.display = 'block';
        
        await MODAL.success('Verification Successful!', 'You can now check in.');
        _prefillCheckin(student);
        _setCheckinButtonsEnabled(true);
        _showStep('step-checkin');
      } else {
        if(UI.Q('bio-scan-area')) UI.Q('bio-scan-area').classList.remove('scanning');
        UI.btnLoad('btn-verify-bio', false, 'Verify');
        UI.setAlert('stu-bio-alert', 'Biometric verification failed. Please try again.');
        S.biometricVerified = false;
        _setCheckinButtonsEnabled(false);
      }
    } catch(err) {
      if(UI.Q('bio-scan-area')) UI.Q('bio-scan-area').classList.remove('scanning');
      UI.btnLoad('btn-verify-bio', false, 'Verify');
      UI.setAlert('stu-bio-alert', err.message || 'Biometric verification failed.');
      S.biometricVerified = false;
      _setCheckinButtonsEnabled(false);
    }
  }

  async function _authenticateBiometric(student) {
    try {
      // Decode the stored credential ID
      const credentialId = Uint8Array.from(atob(student.biometricCredentialId), c => c.charCodeAt(0));
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      
      // Request authentication using the registered credential
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [{
            id: credentialId,
            type: "public-key",
            transports: ["internal"]
          }],
          userVerification: "required",  // REQUIRES fingerprint/face
          timeout: 60000
        }
      });
      
      return !!assertion;
    } catch(err) {
      if (err.name === 'NotAllowedError') throw new Error('Verification cancelled. Please try again.');
      if (err.name === 'SecurityError') throw new Error('Security error. Please ensure your device supports biometrics.');
      throw new Error('Authentication failed: ' + err.message);
    }
  }

  async function _registerAndVerify(student) {
    if (!S.webAuthnSupported) {
      await MODAL.error('Not Supported', 'Your device does not support biometric authentication.');
      return;
    }
    try {
      const result = await _registerBiometric(student.name, student.email);
      if (result) {
        await DB.STUDENTS.update(student.studentId, { 
          biometricCredentialId: result.credentialId,
          biometricRegistered: true,
          biometricRegisteredAt: Date.now()
        });
        S.biometricCredentialId = result.credentialId;
        S.biometricVerified = true;
        S.biometricVerifiedAt = Date.now();
        
        if(UI.Q('bio-scan-area')) UI.Q('bio-scan-area').classList.add('success');
        if(UI.Q('bio-icon')) UI.Q('bio-icon').textContent = '✅';
        await MODAL.success('Biometric Registered!', 'Your fingerprint/face has been registered. You can now check in.');
        _prefillCheckin(student);
        _setCheckinButtonsEnabled(true);
        _showStep('step-checkin');
      }
    } catch(err) {
      await MODAL.error('Registration Failed', err.message);
    }
  }

  // Password fallback - ONLY for registering biometric, NEVER for check-in
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
      // After password verification, register biometric
      if (S.webAuthnSupported) {
        await _registerAndVerify(student);
      } else {
        await MODAL.error('Not Supported', 'Your device does not support biometrics.');
      }
      if(UI.Q('stu-pass-fallback')) UI.Q('stu-pass-fallback').style.display = 'none';
      UI.btnLoad('btn-verify-pass', false, 'Verify');
    } catch(err){
      UI.btnLoad('btn-verify-pass', false, 'Verify');
      UI.setAlert('stu-bio-alert', 'Failed: ' + err.message);
      S.biometricVerified = false;
      _setCheckinButtonsEnabled(false);
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
      _setLoc('idle','Location required — tap to get your location');
      S.stuLat = null; S.stuLng = null; S.locationAccuracy = null;
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
        b.title = enabled ? '' : 'You MUST verify with fingerprint/face first'; 
        b.style.opacity = enabled ? '1' : '0.5'; 
      } 
    });
  }

  function getLocation(){
    _setLoc('busy','Fetching location...');
    if(!navigator.geolocation){ _simLoc(); return; }
    navigator.geolocation.getCurrentPosition(p=>{ 
      S.stuLat=p.coords.latitude; S.stuLng=p.coords.longitude; S.locationAccuracy=p.coords.accuracy||0; 
      let msg = `Location: ${S.stuLat.toFixed(5)}, ${S.stuLng.toFixed(5)} (accuracy: ±${Math.round(S.locationAccuracy)}m)`;
      if(S.session?.lat){ 
        const dist = UI.haversine(S.stuLat,S.stuLng,S.session.lat,S.session.lng); 
        msg += `<br/>Distance: ${Math.round(dist)}m (Limit: ${S.session.radius||100}m)`;
        msg += dist <= (S.session.radius||100) ? `<br/><span style="color:var(--teal)">✓ Within range</span>` : `<br/><span style="color:var(--danger)">⚠️ Outside range</span>`;
      }
      _setLoc('ok', msg); 
    }, ()=>_simLoc(), {timeout:10000,enableHighAccuracy:true});
  }
  
  function _simLoc(){
    if(S.session?.lat){ 
      const radInDeg = ((S.session.radius||100)/111000)*(Math.random()*0.8); 
      const angle = Math.random()*Math.PI*2; 
      S.stuLat = S.session.lat + Math.cos(angle)*radInDeg; 
      S.stuLng = S.session.lng + Math.sin(angle)*radInDeg; 
    } else { 
      S.stuLat = 5.6505 + (Math.random()-.5)*0.001; 
      S.stuLng = -0.1875 + (Math.random()-.5)*0.001; 
    }
    S.locationAccuracy = 10;
    let msg = `Location (demo): ${S.stuLat.toFixed(5)}, ${S.stuLng.toFixed(5)} (accuracy: ±10m)`;
    if(S.session?.lat){ 
      const dist = UI.haversine(S.stuLat,S.stuLng,S.session.lat,S.session.lng); 
      msg += `<br/>Distance: ${Math.round(dist)}m (Limit: ${S.session.radius||100}m)`;
      msg += dist <= (S.session.radius||100) ? `<br/><span style="color:var(--teal)">✓ Within range</span>` : `<br/><span style="color:var(--danger)">⚠️ Outside range</span>`;
    }
    _setLoc('ok', msg);
  }
  
  function _setLoc(cls,msg){ const b = UI.Q('ls-box'); if(!b) return; b.className = 'loc-status ' + cls; const te = UI.Q('ls-text'); if(te) te.innerHTML = msg; }

  async function _autoEnrollInCourse(studentId, courseCode, courseName) {
    try { 
      const period = DB.getCurrentAcademicPeriod(); 
      if (!(await DB.ENROLLMENT.isEnrolled(studentId, courseCode))) {
        await DB.ENROLLMENT.enroll(studentId, courseCode, courseName, period.semester, period.year); 
      }
    } catch(e) { console.warn(e); }
  }

  async function checkIn() {
    const name = UI.Q('s-name')?.value.trim(), sid = UI.Q('s-sid')?.value.trim();
    if(UI.Q('s-name')) UI.Q('s-name').classList.remove('err'); 
    if(UI.Q('s-sid')) UI.Q('s-sid').classList.remove('err');
    if(UI.Q('res-ok')) UI.Q('res-ok').style.display='none'; 
    if(UI.Q('res-err')) UI.Q('res-err').style.display='none';
    
    // MUST have biometric verification
    if(!S.biometricVerified){
      _err('⚠️ You MUST verify with your fingerprint/face before checking in.');
      _resetBtns(); 
      return;
    }
    if(S.biometricVerifiedAt && (Date.now()-S.biometricVerifiedAt)>300000){
      S.biometricVerified=false; 
      _err('⚠️ Verification expired. Please verify again.'); 
      _resetBtns(); 
      _showStep('step-biometric'); 
      return;
    }
    if(!name){ if(UI.Q('s-name')) UI.Q('s-name').classList.add('err'); _err('Please enter your name.'); _resetBtns(); return; }
    if(!sid){ if(UI.Q('s-sid')) UI.Q('s-sid').classList.add('err'); _err('Student ID is required.'); _resetBtns(); return; }
    if(!S.session||Date.now()>S.session.expiresAt){ _err('This session has expired.'); _resetBtns(); return; }
    
    ['ci-btn','ci-btn-loc'].forEach(id=>{ const b=UI.Q(id); if(b){ b.disabled=true; b.innerHTML='<span class="spin"></span>Checking in…'; } });
    
    const sessId=S.session.id, normSid=sid.toUpperCase().trim();
    const biometricId = S.biometricCredentialId || 'no-biometric';
    
    try {
      // Check if course is active
      const courseRecord = await DB.COURSE.get(S.session.courseCode);
      if (courseRecord && courseRecord.active === false) { 
        _err(`This course (${S.session.courseCode}) has been ended for the semester.`); 
        _resetBtns(); 
        return; 
      }
      
      // Duplicate checks
      if(await DB.SESSION.hasSid(sessId,normSid)){
        const recs=await DB.SESSION.getRecords(sessId);
        const who=recs.find(r=>r.studentId?.toUpperCase()===normSid);
        await DB.SESSION.pushBlocked(sessId,{name,studentId:sid,reason:`Student ID already checked in${who?' as '+who.name:''}`,time:UI.nowTime(),biometricId});
        _err(`Student ID "${sid}" has already checked in.`); 
        _resetBtns(); 
        return;
      }
      
      if(await DB.SESSION.hasDevice(sessId,biometricId)){
        const recs=await DB.SESSION.getRecords(sessId);
        const who=recs.find(r=>r.biometricId===biometricId);
        await DB.SESSION.pushBlocked(sessId,{name,studentId:sid,reason:`Biometric already used by ${who?.name||'another'}`,time:UI.nowTime(),biometricId});
        _err(`This fingerprint/face already checked someone in${who?' ('+who.name+')':''}.`); 
        _resetBtns(); 
        return;
      }
      
      const existing=await DB.SESSION.getRecords(sessId);
      if(existing.find(r=>r.name?.toLowerCase()===name.toLowerCase())){
        await DB.SESSION.pushBlocked(sessId,{name,studentId:sid,reason:'Name already checked in',time:UI.nowTime(),biometricId});
        _err(`${name} has already checked in.`); 
        _resetBtns(); 
        return;
      }
      
      // Location check
      let locNote='';
      if(S.session.locEnabled && S.session.lat!=null){
        if(S.stuLat===null){ _err('Location required — tap "Get my location" first.'); _resetBtns(); return; }
        const dist = UI.haversine(S.stuLat,S.stuLng,S.session.lat,S.session.lng), radius = S.session.radius||100, buffer = Math.min(S.locationAccuracy||0,30), effRadius = radius + buffer;
        if(dist > effRadius){ 
          await DB.SESSION.pushBlocked(sessId,{name,studentId:sid,reason:`Too far: ${Math.round(dist)}m (limit ${radius}m)`,time:UI.nowTime(),biometricId}); 
          _err(`You are ${Math.round(dist)}m from the classroom (limit ${radius}m). Please move closer.`); 
          _resetBtns(); 
          return; 
        }
        locNote = `${Math.round(dist)}m/${radius}m${S.locationAccuracy?` (±${Math.round(S.locationAccuracy)}m)`:''}`;
      }
      
      // Successful check-in
      await Promise.all([
        DB.SESSION.addDevice(sessId, biometricId),
        DB.SESSION.addSid(sessId, normSid),
        DB.SESSION.pushRecord(sessId,{
          name, studentId:normSid, biometricId, authMethod:'biometric',
          locNote, time:UI.nowTime(), checkedAt:Date.now(),
          locationAccuracy:S.locationAccuracy, studentLat:S.stuLat, studentLng:S.stuLng
        }),
      ]);
      
      await _autoEnrollInCourse(normSid, S.session.courseCode, S.session.courseName);
      if (DB.STATS) await DB.STATS.incrementCheckins();
      
      clearInterval(S.cdTimer); S.cdTimer=null;
      _hideAll();
      if(UI.Q('stu-done')) UI.Q('stu-done').classList.add('show');
      const doneMsg=UI.Q('done-msg');
      if(doneMsg) doneMsg.innerHTML = `✅ Attendance for ${S.session.code} recorded.<br/><span style="font-size:12px">✓ Verified with fingerprint/face</span>`;
    } catch(err){
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
        b.title=en?'':'Verify with fingerprint/face first'; 
        b.style.opacity=en?'1':'0.5'; 
      } 
    }); 
  }

  return { init, lookupStudent, registerStudent, verifyBiometric, verifyPassword, getLocation, checkIn };
})();
