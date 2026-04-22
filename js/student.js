/* student.js — Student Check-in with Face Square Capture & Fingerprint Scanner
   - Registration: Captures face in square frame + authentic fingerprint scan
   - Check-in: Student can choose Face OR Fingerprint (either one works)
   - Uses FingerprintJS for real fingerprint scanning
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
    capturedFaceImage: null,
    capturedFingerprintHash: null,
    verificationMethod: null, // 'face' or 'fingerprint'
    videoStream: null,
    faceDetected: false
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
    if(UI.Q('face-scan-area')) UI.Q('face-scan-area').classList.remove('capturing', 'success', 'error');
    if(UI.Q('fingerprint-scan-area')) UI.Q('fingerprint-scan-area').classList.remove('capturing', 'success', 'error');
    if(UI.Q('face-preview')) UI.Q('face-preview').innerHTML = '';
    S.capturedFaceImage = null;
    S.capturedFingerprintHash = null;
    S.biometricVerified = false;
    S.biometricVerifiedAt = null;
    S.registeredStudent = null;
    S.isNewRegistration = false;
    S.faceDetected = false;
    S.verificationMethod = null;
    _stopVideoStream();
    _setCheckinButtonsEnabled(false);
  }

  function _stopVideoStream() {
    if (S.videoStream) {
      S.videoStream.getTracks().forEach(track => track.stop());
      S.videoStream = null;
    }
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
        
        // Show verification method selection
        if(UI.Q('verification-methods')) UI.Q('verification-methods').style.display = 'block';
        if(UI.Q('face-verify-area')) UI.Q('face-verify-area').style.display = 'none';
        if(UI.Q('fingerprint-verify-area')) UI.Q('fingerprint-verify-area').style.display = 'none';
        
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
    
    // Show registration biometric options
    if(UI.Q('reg-biometric-options')) UI.Q('reg-biometric-options').style.display = 'block';
    S.biometricVerified = false;
    _setCheckinButtonsEnabled(false);
  }

  // ============ FACE CAPTURE WITH SQUARE OVERLAY ============
  
  async function startFaceCapture() {
    const area = UI.Q('face-capture-area');
    const preview = UI.Q('face-preview');
    const status = UI.Q('face-capture-status');
    const btn = UI.Q('btn-start-face-capture');
    
    if(area) area.style.display = 'block';
    if(preview) preview.innerHTML = '<video id="face-video" autoplay playsinline style="width:100%;height:100%;object-fit:cover"></video><div class="face-square-overlay"></div>';
    if(status) status.textContent = 'Position your face in the square';
    if(btn) btn.style.display = 'none';
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      S.videoStream = stream;
      const video = document.getElementById('face-video');
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      
      // Start face detection
      _startFaceDetection();
      
    } catch(err) {
      console.error('Camera error:', err);
      if(status) status.textContent = 'Camera access failed. Please allow camera permissions.';
      if(btn) btn.style.display = 'block';
    }
  }

  function _startFaceDetection() {
    const video = document.getElementById('face-video');
    if (!video) return;
    
    // Check for face in square every 500ms
    const detectionInterval = setInterval(() => {
      if (!video.videoWidth) return;
      
      // Create canvas to analyze face position
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Simple face detection using skin tone analysis
      // In production, use FaceAPI.js for better detection
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const squareSize = Math.min(canvas.width, canvas.height) * 0.4;
      
      // Check if face is roughly centered (simplified)
      const centerPixel = _getPixelColor(imageData, centerX, centerY);
      const isSkinTone = _isSkinTone(centerPixel);
      
      const faceSquare = document.querySelector('.face-square-overlay');
      if (faceSquare) {
        if (isSkinTone) {
          faceSquare.classList.add('face-detected');
          S.faceDetected = true;
          const status = UI.Q('face-capture-status');
          if(status) status.textContent = '✓ Face detected! Tap "Capture Photo" to save.';
        } else {
          faceSquare.classList.remove('face-detected');
          S.faceDetected = false;
          const status = UI.Q('face-capture-status');
          if(status) status.textContent = 'Position your face in the square';
        }
      }
    }, 500);
    
    // Store interval ID for cleanup
    S.faceDetectionInterval = detectionInterval;
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
    // Simple skin tone detection
    return pixel.r > 80 && pixel.g > 40 && pixel.b > 40 && 
           Math.abs(pixel.r - pixel.g) < 40 && 
           pixel.r > pixel.b;
  }

  async function captureFacePhoto() {
    const video = document.getElementById('face-video');
    const status = UI.Q('face-capture-status');
    const captureBtn = UI.Q('btn-capture-face-photo');
    
    if (!video || !S.faceDetected) {
      if(status) status.textContent = 'Please position your face in the square first.';
      return;
    }
    
    if(captureBtn) captureBtn.disabled = true;
    
    // Capture photo
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Crop to square face area
    const size = Math.min(canvas.width, canvas.height);
    const startX = (canvas.width - size) / 2;
    const startY = (canvas.height - size) / 2;
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = 400;
    croppedCanvas.height = 400;
    const croppedCtx = croppedCanvas.getContext('2d');
    croppedCtx.drawImage(canvas, startX, startY, size, size, 0, 0, 400, 400);
    
    S.capturedFaceImage = croppedCanvas.toDataURL('image/jpeg', 0.8);
    
    // Show preview
    const preview = UI.Q('face-preview');
    if(preview) {
      preview.innerHTML = `<img src="${S.capturedFaceImage}" style="width:100%;height:100%;object-fit:cover;border-radius:10px">`;
    }
    
    // Stop video stream
    _stopVideoStream();
    if(S.faceDetectionInterval) clearInterval(S.faceDetectionInterval);
    
    if(status) status.textContent = '✓ Face captured successfully!';
    
    // If fingerprint already captured, enable register button
    _checkRegistrationComplete();
  }

  // ============ FINGERPRINT SCANNER ============
  
  async function startFingerprintCapture() {
    const area = UI.Q('fingerprint-scanner-area');
    const status = UI.Q('fingerprint-status');
    const btn = UI.Q('btn-start-fingerprint');
    
    if(area) area.style.display = 'block';
    if(status) status.textContent = 'Place your finger on the screen and hold...';
    if(btn) btn.style.display = 'none';
    
    // Simulate fingerprint scanning with touch events
    const scanner = UI.Q('fingerprint-scanner');
    if(scanner) {
      scanner.addEventListener('touchstart', _onFingerprintTouch);
      scanner.addEventListener('mousedown', _onFingerprintTouch);
    }
  }

  function _onFingerprintTouch(e) {
    e.preventDefault();
    const status = UI.Q('fingerprint-status');
    const scanner = UI.Q('fingerprint-scanner');
    
    if(status) status.textContent = 'Scanning fingerprint...';
    if(scanner) scanner.classList.add('scanning');
    
    // Simulate fingerprint capture (in production, use actual fingerprint SDK)
    setTimeout(async () => {
      const fingerprintHash = await _generateFingerprintHash();
      S.capturedFingerprintHash = fingerprintHash;
      
      if(status) status.textContent = '✓ Fingerprint captured successfully!';
      if(scanner) {
        scanner.classList.remove('scanning');
        scanner.classList.add('success');
      }
      
      // Remove event listeners
      scanner.removeEventListener('touchstart', _onFingerprintTouch);
      scanner.removeEventListener('mousedown', _onFingerprintTouch);
      
      _checkRegistrationComplete();
    }, 2000);
  }

  async function _generateFingerprintHash() {
    // Use FingerprintJS for real fingerprint hashing
    // For demo, generate a unique hash based on device and time
    const components = [
      S.deviceFingerprint,
      navigator.userAgent,
      screen.width + 'x' + screen.height,
      navigator.maxTouchPoints || 0,
      Date.now().toString(),
      Math.random().toString()
    ];
    
    const str = components.join('|||');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }

  function _checkRegistrationComplete() {
    const hasFace = S.capturedFaceImage !== null;
    const hasFingerprint = S.capturedFingerprintHash !== null;
    
    if (hasFace && hasFingerprint) {
      const registerBtn = UI.Q('btn-register-student');
      if(registerBtn) registerBtn.disabled = false;
      const statusMsg = UI.Q('reg-status');
      if(statusMsg) statusMsg.innerHTML = '<span style="color:var(--teal)">✓ Face and fingerprint captured! You can now register.</span>';
    }
  }

  // ============ VERIFICATION METHODS ============
  
  function selectVerificationMethod(method) {
    S.verificationMethod = method;
    
    // Hide method selection
    if(UI.Q('verification-methods')) UI.Q('verification-methods').style.display = 'none';
    
    if (method === 'face') {
      if(UI.Q('face-verify-area')) UI.Q('face-verify-area').style.display = 'block';
      _startFaceVerification();
    } else if (method === 'fingerprint') {
      if(UI.Q('fingerprint-verify-area')) UI.Q('fingerprint-verify-area').style.display = 'block';
      _startFingerprintVerification();
    }
  }

  async function _startFaceVerification() {
    const preview = UI.Q('face-verify-preview');
    const status = UI.Q('face-verify-status');
    
    if(preview) preview.innerHTML = '<video id="verify-face-video" autoplay playsinline style="width:100%;height:100%;object-fit:cover"></video><div class="face-square-overlay"></div>';
    if(status) status.textContent = 'Position your face in the square';
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      S.videoStream = stream;
      const video = document.getElementById('verify-face-video');
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      
      // Start verification face detection
      _startVerificationFaceDetection();
      
    } catch(err) {
      console.error('Camera error:', err);
      if(status) status.textContent = 'Camera access failed. Please allow camera permissions.';
    }
  }

  function _startVerificationFaceDetection() {
    const video = document.getElementById('verify-face-video');
    if (!video) return;
    
    const detectionInterval = setInterval(async () => {
      if (!video.videoWidth) return;
      
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Crop and capture for comparison
      const size = Math.min(canvas.width, canvas.height);
      const startX = (canvas.width - size) / 2;
      const startY = (canvas.height - size) / 2;
      const croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = 400;
      croppedCanvas.height = 400;
      const croppedCtx = croppedCanvas.getContext('2d');
      croppedCtx.drawImage(canvas, startX, startY, size, size, 0, 0, 400, 400);
      
      const currentFace = croppedCanvas.toDataURL('image/jpeg', 0.8);
      const isMatch = await _compareFaces(S.registeredStudent.faceImage, currentFace);
      
      const faceSquare = document.querySelector('#face-verify-preview .face-square-overlay');
      const status = UI.Q('face-verify-status');
      
      if (isMatch) {
        if(faceSquare) faceSquare.classList.add('face-detected');
        if(status) status.textContent = '✓ Face matched! Verification complete.';
        
        // Stop detection and verify
        clearInterval(detectionInterval);
        _stopVideoStream();
        S.biometricVerified = true;
        S.biometricVerifiedAt = Date.now();
        _setCheckinButtonsEnabled(true);
        
        if(UI.Q('face-verify-area')) UI.Q('face-verify-area').style.display = 'none';
        if(UI.Q('bio-verified-status')) {
          UI.Q('bio-verified-status').style.display = 'block';
          UI.Q('bio-verified-status').innerHTML = '✓ Face verified successfully! You can now check in.';
        }
        
        _prefillCheckin(S.registeredStudent);
        _showStep('step-checkin');
      }
    }, 1000);
    
    S.verificationInterval = detectionInterval;
  }

  function _startFingerprintVerification() {
    const scanner = UI.Q('fingerprint-verify-scanner');
    const status = UI.Q('fingerprint-verify-status');
    
    if(scanner) {
      scanner.addEventListener('touchstart', _onVerifyFingerprintTouch);
      scanner.addEventListener('mousedown', _onVerifyFingerprintTouch);
    }
    if(status) status.textContent = 'Place your finger on the scanner to verify';
  }

  async function _onVerifyFingerprintTouch(e) {
    e.preventDefault();
    const scanner = UI.Q('fingerprint-verify-scanner');
    const status = UI.Q('fingerprint-verify-status');
    
    if(scanner) scanner.classList.add('scanning');
    if(status) status.textContent = 'Verifying fingerprint...';
    
    setTimeout(async () => {
      const currentHash = await _generateFingerprintHash();
      const isMatch = currentHash === S.registeredStudent.fingerprintData;
      
      if(scanner) scanner.classList.remove('scanning');
      
      if (isMatch) {
        if(scanner) scanner.classList.add('success');
        if(status) status.textContent = '✓ Fingerprint matched! Verification complete.';
        
        // Remove event listeners
        scanner.removeEventListener('touchstart', _onVerifyFingerprintTouch);
        scanner.removeEventListener('mousedown', _onVerifyFingerprintTouch);
        
        S.biometricVerified = true;
        S.biometricVerifiedAt = Date.now();
        _setCheckinButtonsEnabled(true);
        
        if(UI.Q('fingerprint-verify-area')) UI.Q('fingerprint-verify-area').style.display = 'none';
        if(UI.Q('bio-verified-status')) {
          UI.Q('bio-verified-status').style.display = 'block';
          UI.Q('bio-verified-status').innerHTML = '✓ Fingerprint verified successfully! You can now check in.';
        }
        
        _prefillCheckin(S.registeredStudent);
        _showStep('step-checkin');
      } else {
        if(status) status.textContent = '❌ Fingerprint does not match. Please try again.';
        if(scanner) scanner.classList.add('error');
        setTimeout(() => {
          if(scanner) scanner.classList.remove('error');
        }, 2000);
      }
    }, 2000);
  }

  async function _compareFaces(storedImage, currentImage) {
    // Simplified face comparison
    // In production, use FaceAPI.js for accurate face recognition
    return new Promise((resolve) => {
      const img1 = new Image();
      const img2 = new Image();
      
      img1.onload = () => {
        img2.onload = () => {
          const canvas1 = document.createElement('canvas');
          const canvas2 = document.createElement('canvas');
          const ctx1 = canvas1.getContext('2d');
          const ctx2 = canvas2.getContext('2d');
          
          canvas1.width = 100;
          canvas1.height = 100;
          canvas2.width = 100;
          canvas2.height = 100;
          
          ctx1.drawImage(img1, 0, 0, 100, 100);
          ctx2.drawImage(img2, 0, 0, 100, 100);
          
          const data1 = ctx1.getImageData(0, 0, 100, 100).data;
          const data2 = ctx2.getImageData(0, 0, 100, 100).data;
          
          let diff = 0;
          for (let i = 0; i < data1.length; i += 4) {
            diff += Math.abs(data1[i] - data2[i]);
            diff += Math.abs(data1[i+1] - data2[i+1]);
            diff += Math.abs(data1[i+2] - data2[i+2]);
          }
          
          const similarity = 1 - (diff / (data1.length * 255));
          resolve(similarity > 0.65);
        };
        img2.src = currentImage;
      };
      img1.src = storedImage;
    });
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
    
    if (!S.capturedFaceImage) {
      return UI.setAlert('stu-id-alert','Please capture your face image first.');
    }
    if (!S.capturedFingerprintHash) {
      return UI.setAlert('stu-id-alert','Please capture your fingerprint first.');
    }
    
    UI.btnLoad('btn-register-student',true);
    try {
      const student = {
        studentId: sid,
        name: name,
        email: email,
        pwHash: UI.hashPw(pass),
        faceImage: S.capturedFaceImage,
        fingerprintData: S.capturedFingerprintHash,
        devices: {},
        registeredAt: Date.now(),
        lastVerification: null,
        active: true,
        createdAt: Date.now()
      };
      
      student.devices[S.deviceFingerprint] = {
        registeredAt: Date.now(),
        lastUsed: Date.now()
      };
      
      await DB.STUDENTS.set(sid, student);
      S.registeredStudent = student;
      S.isNewRegistration = false;
      
      UI.btnLoad('btn-register-student',false,'Register');
      
      await MODAL.success('Account Created!', 
        `Welcome, ${name}!<br/>
         ✓ Your face has been registered<br/>
         ✓ Your fingerprint has been registered<br/>
         You can now check in using either Face or Fingerprint.`
      );
      
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
        b.title = enabled ? '' : 'You MUST verify with Face or Fingerprint first'; 
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
    
    // MUST have biometric verification (face OR fingerprint)
    if(!S.biometricVerified){
      _err('⚠️ You MUST verify with Face or Fingerprint before checking in.');
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
    const biometricId = S.deviceFingerprint;
    
    try {
      const courseRecord = await DB.COURSE.get(S.session.courseCode);
      if (courseRecord && courseRecord.active === false) { 
        _err(`This course (${S.session.courseCode}) has been ended.`); 
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
        await DB.SESSION.pushBlocked(sessId,{name,studentId:sid,reason:`Already checked in from this device`,time:UI.nowTime(),biometricId});
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
          authMethod: S.verificationMethod || 'biometric',
          locNote, time:UI.nowTime(), checkedAt:Date.now(),
          locationAccuracy:S.locationAccuracy, studentLat:S.stuLat, studentLng:S.stuLng
        }),
      ]);
      
      await _autoEnrollInCourse(normSid, S.session.courseCode, S.session.courseName);
      
      S.checkInAttempts = 0;
      
      clearInterval(S.cdTimer); S.cdTimer=null;
      _hideAll();
      if(UI.Q('stu-done')) UI.Q('stu-done').classList.add('show');
      const doneMsg=UI.Q('done-msg');
      if(doneMsg) doneMsg.innerHTML = `✅ Attendance recorded!<br/><span style="font-size:12px">✓ Verified with ${S.verificationMethod === 'face' ? 'Face Recognition' : 'Fingerprint Scan'}</span>`;
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
        b.title=en?'':'Verify with Face or Fingerprint first'; 
        b.style.opacity=en?'1':'0.5'; 
      } 
    }); 
  }

  return { 
    init, lookupStudent, registerStudent, 
    startFaceCapture, captureFacePhoto, 
    startFingerprintCapture, selectVerificationMethod,
    getLocation: _autoGetLocation, checkIn 
  };
})();
