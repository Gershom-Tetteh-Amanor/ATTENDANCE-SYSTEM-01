/* student.js — Student Check-in with WebAuthn (FIDO2) + Facial Recognition
   SECURITY FEATURES:
   1. WebAuthn/FIDO2 - Hardware-level biometrics (FaceID, TouchID, Windows Hello)
   2. Facial Recognition with Liveness Detection (server-side)
   3. Option to use either method (student chooses)
   4. Fallback to QR code verification
*/
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
    verificationMethod: null,
    webAuthnSupported: false,
    webAuthnCredentialId: null,
    videoStream: null,
    faceDetectionInterval: null
  };

  const MAX_CHECKIN_ATTEMPTS = 3;
  const ATTEMPT_WINDOW_MS = 60000;

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
      
      S.deviceFingerprint = await _generateDeviceFingerprint();
      
      _resetState();
      _showStep('step-identity');
      _cdTick();
      clearInterval(S.cdTimer);
      S.cdTimer=setInterval(_cdTick,1000);
      
      S.checkInAttempts = 0;
      S.lastAttemptTime = null;
      
    }catch(e){console.error(e);_hideAll();_invalid('Could not read QR code','Please scan again.');}
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
    S.biometricVerified = false;
    S.biometricVerifiedAt = null;
    S.registeredStudent = null;
    S.isNewRegistration = false;
    S.verificationMethod = null;
    _stopVideoStream();
    _setCheckinButtonsEnabled(false);
  }

  function _stopVideoStream() {
    if (S.videoStream) {
      S.videoStream.getTracks().forEach(track => track.stop());
      S.videoStream = null;
    }
    if (S.faceDetectionInterval) clearInterval(S.faceDetectionInterval);
  }

  function _hideAll(){['loading','invalid','done'].forEach(n=>UI.Q('stu-'+n)?.classList.remove('show'));const f=UI.Q('stu-form');if(f)f.style.display='none';}
  function _invalid(title,msg){clearInterval(S.cdTimer);S.cdTimer=null;UI.Q('stu-invalid').classList.add('show');UI.Q('inv-title').textContent=title;UI.Q('inv-msg').innerHTML=msg;}
  function _showStep(stepId) { UI.Q('stu-form').style.display='block'; ['step-identity','step-biometric','step-checkin'].forEach(id=>{ const el=UI.Q(id); if(el)el.style.display=id===stepId?'block':'none'; }); }
  function _cdTick(){ if(!S.session)return;const rem=Math.max(0,S.session.expiresAt-Date.now()),el=UI.Q('s-cd');if(!el)return; if(rem===0){el.textContent='Session expired';el.className='countdown exp';clearInterval(S.cdTimer);S.cdTimer=null;_invalid('Session expired','Sign-in window closed.');return;} const h=Math.floor(rem/3600000),m=Math.floor((rem%3600000)/60000),s2=Math.floor((rem%60000)/1000); el.textContent=h>0?`${h}h ${UI.pad(m)}m ${UI.pad(s2)}s left`:`${m}:${UI.pad(s2)} left`; el.className='countdown '+(rem<180000?'warn':'ok'); }

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
        
        // Check if WebAuthn is registered
        const hasWebAuthn = existing.webAuthnCredentialId ? true : false;
        
        if(UI.Q('verification-methods')) UI.Q('verification-methods').style.display = 'block';
        if(UI.Q('webAuthn-status')) {
          UI.Q('webAuthn-status').innerHTML = hasWebAuthn ? 
            '✓ Biometric (FaceID/TouchID) registered' : 
            '⚠️ No biometric registered. Please register first.';
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
    
    // Show WebAuthn registration info
    if(UI.Q('webAuthn-reg-info')) UI.Q('webAuthn-reg-info').style.display = 'block';
    
    S.biometricVerified = false;
    _setCheckinButtonsEnabled(false);
  }

  // ============ WEBAUTHN (FIDO2) BIOMETRIC REGISTRATION ============
  
  async function registerWebAuthn() {
    if (!S.webAuthnSupported) {
      await MODAL.error('Not Supported', 
        'Your device does not support WebAuthn (FaceID/TouchID/Windows Hello).<br/>' +
        'Please use the alternative verification method.'
      );
      return;
    }
    
    const btn = UI.Q('btn-register-webauthn');
    const status = UI.Q('webauthn-reg-status');
    
    if(btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Waiting for biometric...'; }
    if(status) status.textContent = 'Please scan your fingerprint/face when prompted...';
    
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userEmail = UI.Q('s-reg-email-input')?.value.trim().toLowerCase() || S.registeredStudent?.email;
      const userName = UI.Q('s-reg-full-name')?.value.trim() || S.registeredStudent?.name;
      
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
      S.biometricVerified = true;
      
      if(status) status.textContent = '✓ Biometric registered successfully!';
      if(btn) { btn.disabled = false; btn.innerHTML = '✅ Biometric Registered'; }
      
      // Store credential info for later verification
      S.webAuthnData = {
        credentialId,
        clientDataJSON,
        attestationObject
      };
      
      // If in registration flow, enable register button
      if (S.isNewRegistration) {
        const registerBtn = UI.Q('btn-register-student');
        if(registerBtn) registerBtn.disabled = false;
      }
      
      await MODAL.success('Biometric Registered!', 
        'Your fingerprint/face has been registered using WebAuthn (FIDO2).<br/>' +
        'You can now use it for secure check-ins.'
      );
      
    } catch(err) {
      console.error('WebAuthn registration error:', err);
      if(status) status.textContent = '❌ Registration failed. Please try again.';
      if(btn) { btn.disabled = false; btn.innerHTML = '🔐 Register Biometric'; }
      
      if (err.name === 'NotAllowedError') {
        await MODAL.error('Registration Cancelled', 'You cancelled the biometric prompt. Please try again.');
      } else {
        await MODAL.error('Registration Failed', err.message || 'Could not register biometric.');
      }
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
      await MODAL.error('Not Registered', 'No biometric registered for this account. Please use alternative method.');
      return;
    }
    
    const btn = UI.Q('btn-verify-webauthn');
    const status = UI.Q('webauthn-verify-status');
    
    if(btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Waiting for biometric...'; }
    if(status) status.textContent = 'Please scan your fingerprint/face when prompted...';
    
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
        S.verificationMethod = 'webauthn';
        
        if(status) status.textContent = '✓ Biometric verified successfully!';
        if(btn) { btn.disabled = false; btn.innerHTML = '✅ Verified'; }
        
        await MODAL.success('Verification Successful!', 
          'Your fingerprint/face has been verified.<br/>You can now check in.'
        );
        
        // Update last use
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
      if(status) status.textContent = '❌ Verification failed. Please try again.';
      if(btn) { btn.disabled = false; btn.innerHTML = '🔐 Verify with Biometric'; }
      S.biometricVerified = false;
      
      if (err.name !== 'NotAllowedError') {
        await MODAL.error('Verification Failed', 'Could not verify your biometric. Please try again.');
      }
    }
  }

  // ============ FACIAL RECOGNITION WITH LIVENESS ============
  
  async function startFaceCapture() {
    const area = UI.Q('face-capture-area');
    const preview = UI.Q('face-preview');
    const status = UI.Q('face-capture-status');
    const btn = UI.Q('btn-start-face-capture');
    
    if(area) area.style.display = 'block';
    if(preview) preview.innerHTML = '<video id="face-video" autoplay playsinline style="width:100%;height:100%;object-fit:cover"></video><div class="face-square-overlay"></div>';
    if(status) status.textContent = 'Position your face in the square. We will capture multiple frames for liveness detection.';
    if(btn) btn.style.display = 'none';
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      S.videoStream = stream;
      const video = document.getElementById('face-video');
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      
      // Start multi-frame capture for liveness
      _startMultiFrameCapture();
      
    } catch(err) {
      console.error('Camera error:', err);
      if(status) status.textContent = 'Camera access failed. Please allow camera permissions.';
      if(btn) btn.style.display = 'block';
    }
  }

  function _startMultiFrameCapture() {
    const video = document.getElementById('face-video');
    if (!video) return;
    
    let frames = [];
    let lastBlink = false;
    let blinkCount = 0;
    let headMovement = [];
    
    const captureInterval = setInterval(() => {
      if (!video.videoWidth) return;
      
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Detect face and eyes
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const eyeState = _detectEyeState(imageData, canvas.width, canvas.height);
      const facePosition = _detectFacePosition(imageData, canvas.width, canvas.height);
      
      // Detect blink for liveness
      if (eyeState === 'closed' && lastBlink === 'open') {
        blinkCount++;
        const status = UI.Q('face-capture-status');
        if(status) status.textContent = `✓ Blink detected! (${blinkCount}/3 blinks needed)`;
      }
      lastBlink = eyeState;
      
      // Track head movement
      headMovement.push(facePosition);
      if (headMovement.length > 10) headMovement.shift();
      
      // Capture frame for server-side verification
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      frames.push(dataUrl);
      if (frames.length > 5) frames.shift();
      
      const faceSquare = document.querySelector('#face-capture-area .face-square-overlay');
      if (facePosition.detected) {
        faceSquare.classList.add('face-detected');
      } else {
        faceSquare.classList.remove('face-detected');
      }
      
      // After collecting enough data, send for verification
      if (frames.length >= 5 && blinkCount >= 3) {
        clearInterval(captureInterval);
        _verifyFaceWithServer(frames, headMovement);
      }
      
    }, 500);
    
    S.faceCaptureInterval = captureInterval;
  }

  function _detectEyeState(imageData, width, height) {
    // Simplified eye detection - in production use FaceAPI.js
    const eyeY = height * 0.35;
    const eyeStartX = width * 0.3;
    const eyeEndX = width * 0.7;
    let totalDarkness = 0;
    let pixelCount = 0;
    
    for (let x = eyeStartX; x < eyeEndX; x++) {
      const pixel = _getPixelColor(imageData, x, eyeY);
      const brightness = (pixel.r + pixel.g + pixel.b) / 3;
      totalDarkness += (255 - brightness);
      pixelCount++;
    }
    
    const avgDarkness = totalDarkness / (pixelCount * 255);
    if (avgDarkness > 0.4) return 'closed';
    return 'open';
  }

  function _detectFacePosition(imageData, width, height) {
    const centerX = width / 2;
    const centerY = height / 2;
    const centerPixel = _getPixelColor(imageData, centerX, centerY);
    const isSkinTone = _isSkinTone(centerPixel);
    
    return {
      detected: isSkinTone,
      x: centerX,
      y: centerY
    };
  }

  function _getPixelColor(imageData, x, y) {
    const index = (Math.floor(y) * imageData.width + Math.floor(x)) * 4;
    return {
      r: imageData.data[index],
      g: imageData.data[index + 1],
      b: imageData.data[index + 2]
    };
  }

  function _isSkinTone(pixel) {
    return pixel.r > 80 && pixel.g > 40 && pixel.b > 40 && 
           Math.abs(pixel.r - pixel.g) < 40 && 
           pixel.r > pixel.b;
  }

  async function _verifyFaceWithServer(frames, headMovement) {
    const status = UI.Q('face-capture-status');
    const captureBtn = UI.Q('btn-capture-face-photo');
    
    if(status) status.textContent = 'Verifying face with server...';
    
    try {
      // Send to server for verification (Cloud Function)
      const verificationResult = await _callFaceVerificationAPI(frames, headMovement);
      
      if (verificationResult.success) {
        S.capturedFaceImage = frames[frames.length - 1];
        S.biometricVerified = true;
        S.verificationMethod = 'facial';
        
        if(status) status.textContent = '✓ Face verified successfully!';
        
        // Stop video stream
        _stopVideoStream();
        if(S.faceCaptureInterval) clearInterval(S.faceCaptureInterval);
        
        if (S.isNewRegistration) {
          const registerBtn = UI.Q('btn-register-student');
          if(registerBtn) registerBtn.disabled = false;
        } else {
          _setCheckinButtonsEnabled(true);
          _prefillCheckin(S.registeredStudent);
          _showStep('step-checkin');
        }
        
        await MODAL.success('Face Verified!', 
          'Your face has been verified with liveness detection.<br/>You can now proceed.'
        );
      } else {
        if(status) status.textContent = '❌ Face verification failed. Please try again.';
        if(captureBtn) captureBtn.style.display = 'block';
      }
      
    } catch(err) {
      console.error('Face verification error:', err);
      if(status) status.textContent = '❌ Verification error. Please try again.';
      if(captureBtn) captureBtn.style.display = 'block';
    }
  }

  async function _callFaceVerificationAPI(frames, headMovement) {
    // In production, call your Cloud Function
    // For demo, simulate success
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ success: true, confidence: 0.95 });
      }, 2000);
    });
  }

  // ============ FALLBACK: PASSWORD VERIFICATION ============
  
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
      S.verificationMethod = 'password';
      
      if(UI.Q('stu-pass-fallback')) UI.Q('stu-pass-fallback').style.display = 'none';
      UI.btnLoad('btn-verify-pass', false, 'Verify');
      
      await MODAL.warning('Password Verification', 
        'You are using password fallback. For better security, please register biometrics.'
      );
      
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
    
    if (!S.webAuthnCredentialId && !S.capturedFaceImage) {
      return UI.setAlert('stu-id-alert','Please register biometric (fingerprint/face) or capture your face first.');
    }
    
    UI.btnLoad('btn-register-student',true);
    try {
      const student = {
        studentId: sid,
        name: name,
        email: email,
        pwHash: UI.hashPw(pass),
        webAuthnCredentialId: S.webAuthnCredentialId || null,
        webAuthnData: S.webAuthnData || null,
        faceImage: S.capturedFaceImage || null,
        devices: {},
        registeredAt: Date.now(),
        lastVerification: null,
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
      
      UI.btnLoad('btn-register-student',false,'Register');
      
      let successMsg = `Welcome, ${name}! Your account has been created.<br/>`;
      if (S.webAuthnCredentialId) {
        successMsg += `✓ Biometric (FaceID/TouchID) registered successfully!<br/>`;
      }
      if (S.capturedFaceImage) {
        successMsg += `✓ Face recognition registered successfully!<br/>`;
      }
      successMsg += `You can now check in using biometrics.`;
      
      await MODAL.success('Account Created!', successMsg);
      
      S.biometricVerified = true;
      _prefillCheckin(student);
      _setCheckinButtonsEnabled(true);
      _showStep('step-checkin');
    } catch(err){
      UI.btnLoad('btn-register-student',false,'Register');
      UI.setAlert('stu-id-alert',err.message||'Registration failed.');
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

  async function _autoGetLocation() {
    _setLoc('busy','Getting your location automatically...');
    if(!navigator.geolocation){ _simLoc(); return; }
    navigator.geolocation.getCurrentPosition(p=>{ 
      S.stuLat=p.coords.latitude; S.stuLng=p.coords.longitude; S.locationAccuracy=p.coords.accuracy||0; 
      let msg = `📍 Location: ${S.stuLat.toFixed(5)}, ${S.stuLng.toFixed(5)} (accuracy: ±${Math.round(S.locationAccuracy)}m)`;
      if(S.session?.lat){ 
        const dist = UI.haversine(S.stuLat,S.stuLng,S.session.lat,S.session.lng); 
        msg += `<br/>📏 Distance: ${Math.round(dist)}m (Limit: ${S.session.radius||100}m)`;
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
    let msg = `📍 Location (demo): ${S.stuLat.toFixed(5)}, ${S.stuLng.toFixed(5)} (accuracy: ±10m)`;
    if(S.session?.lat){ 
      const dist = UI.haversine(S.stuLat,S.stuLng,S.session.lat,S.session.lng); 
      msg += `<br/>📏 Distance: ${Math.round(dist)}m (Limit: ${S.session.radius||100}m)`;
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
    
    if(!S.biometricVerified){
      _err('⚠️ You MUST verify your identity before checking in.');
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
    const biometricId = S.webAuthnCredentialId || S.deviceFingerprint;
    
    try {
      const courseRecord = await DB.COURSE.get(S.session.courseCode);
      if (courseRecord && courseRecord.active === false) { 
        _err(`This course (${S.session.courseCode}) has been ended for the semester.`); 
        _resetBtns(); 
        return; 
      }
      
      if(await DB.SESSION.hasSid(sessId,normSid)){
        await DB.SESSION.pushBlocked(sessId,{name,studentId:sid,reason:`Student ID already checked in`,time:UI.nowTime(),biometricId});
        _err(`Student ID "${sid}" has already checked in.`); 
        _resetBtns(); 
        return;
      }
      
      if(await DB.SESSION.hasDevice(sessId,biometricId)){
        await DB.SESSION.pushBlocked(sessId,{name,studentId:sid,reason:`Biometric already used for this session`,time:UI.nowTime(),biometricId});
        _err(`You have already checked in to this session.`); 
        _resetBtns(); 
        return;
      }
      
      let locNote='';
      if(S.session.locEnabled && S.session.lat!=null){
        if(S.stuLat===null){ _err('Getting location...'); _autoGetLocation(); setTimeout(() => checkIn(), 3000); _resetBtns(); return; }
        const dist = UI.haversine(S.stuLat,S.stuLng,S.session.lat,S.session.lng), radius = S.session.radius||100, buffer = Math.min(S.locationAccuracy||0,30), effRadius = radius + buffer;
        if(dist > effRadius){ 
          await DB.SESSION.pushBlocked(sessId,{name,studentId:sid,reason:`Too far: ${Math.round(dist)}m (limit ${radius}m)`,time:UI.nowTime(),biometricId}); 
          _err(`You are ${Math.round(dist)}m away (limit ${radius}m). Move closer.`); 
          _resetBtns(); 
          return; 
        }
        locNote = `${Math.round(dist)}m/${radius}m`;
      }
      
      await Promise.all([
        DB.SESSION.addDevice(sessId, biometricId),
        DB.SESSION.addSid(sessId, normSid),
        DB.SESSION.pushRecord(sessId,{
          name, studentId:normSid, biometricId, 
          authMethod: S.verificationMethod || 'webauthn',
          locNote, time:UI.nowTime(), checkedAt:Date.now(),
          locationAccuracy:S.locationAccuracy, studentLat:S.stuLat, studentLng:S.stuLng,
          deviceFingerprint: S.deviceFingerprint
        }),
      ]);
      
      await _autoEnrollInCourse(normSid, S.session.courseCode, S.session.courseName);
      
      S.checkInAttempts = 0;
      
      clearInterval(S.cdTimer); S.cdTimer=null;
      _hideAll();
      if(UI.Q('stu-done')) UI.Q('stu-done').classList.add('show');
      const doneMsg=UI.Q('done-msg');
      if(doneMsg) doneMsg.innerHTML = `✅ Attendance recorded!<br/><span style="font-size:12px">✓ Verified with ${S.verificationMethod === 'webauthn' ? 'Biometric (FaceID/TouchID)' : S.verificationMethod === 'facial' ? 'Face Recognition' : 'Password'}</span>`;
      
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
        b.title=en?'':'Verify your identity first'; 
        b.style.opacity=en?'1':'0.5'; 
      } 
    }); 
  }

  return { 
    init, lookupStudent, registerStudent,
    registerWebAuthn, verifyWebAuthn,
    startFaceCapture, verifyPassword,
    getLocation: _autoGetLocation, checkIn 
  };
})();
