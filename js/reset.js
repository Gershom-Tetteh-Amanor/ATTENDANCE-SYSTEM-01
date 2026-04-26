/* reset.js — Dedicated Biometric Reset Page */
'use strict';

const RESET = (() => {
  let resetToken = null;
  let resetRequest = null;
  let deviceFingerprint = null;
  let webAuthnSupported = false;

  async function init() {
    console.log('[RESET] Initializing biometric reset page');
    
    // Get token from URL
    const urlParams = new URLSearchParams(window.location.search);
    resetToken = urlParams.get('reset');
    
    // Also check hash for token
    if (!resetToken && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.split('?')[1]);
      resetToken = hashParams.get('reset');
    }
    
    console.log('[RESET] Reset token:', resetToken);
    
    if (!resetToken) {
      showInvalid('No Reset Link', 'No reset link provided. Please use the link sent by your lecturer.');
      return;
    }
    
    // Check WebAuthn support
    webAuthnSupported = await checkWebAuthnSupport();
    deviceFingerprint = await generateDeviceFingerprint();
    
    // Validate token
    await validateToken();
  }

  async function checkWebAuthnSupport() {
    if (!window.PublicKeyCredential) return false;
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch(e) {
      return false;
    }
  }

  async function generateDeviceFingerprint() {
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

  async function validateToken() {
    try {
      const request = await DB.BIOMETRIC_RESET.get(resetToken);
      console.log('[RESET] Reset request:', request);
      
      if (!request) {
        showInvalid('Invalid Reset Link', 'This passkey reset link is invalid. Please contact your lecturer for a new link.');
        return;
      }
      
      if (request.expiresAt < Date.now()) {
        showInvalid('Reset Link Expired', 'This reset link has expired. Please contact your lecturer for a new reset link.');
        return;
      }
      
      if (request.used) {
        showInvalid('Reset Link Already Used', 'This reset link has already been used. If you need to reset again, please contact your lecturer.');
        return;
      }
      
      resetRequest = request;
      showResetForm();
      
    } catch(err) {
      console.error('[RESET] Validation error:', err);
      showInvalid('Error', 'Something went wrong. Please try again or contact your lecturer.');
    }
  }

  function showInvalid(title, msg) {
    document.getElementById('reset-loading')?.classList.remove('show');
    document.getElementById('reset-invalid')?.classList.add('show');
    document.getElementById('reset-invalid-title').textContent = title;
    document.getElementById('reset-invalid-msg').innerHTML = msg;
  }

  function showResetForm() {
    document.getElementById('reset-loading')?.classList.remove('show');
    document.getElementById('reset-form').style.display = 'block';
    
    // Show student name
    const nameEl = document.getElementById('reset-student-name');
    if (nameEl && resetRequest) {
      nameEl.innerHTML = `<strong>${UI.esc(resetRequest.studentName)}</strong><br/>ID: ${UI.esc(resetRequest.studentId)}`;
    }
    
    // Attach button event
    const btn = document.getElementById('btn-reset-passkey');
    if (btn) {
      btn.onclick = registerPasskey;
    }
  }

  async function registerPasskey() {
    if (!webAuthnSupported) {
      await MODAL.error('Not Supported', 
        'Your device does not support WebAuthn (FaceID/TouchID/Windows Hello).<br/>' +
        'Please use a device with biometric capabilities.'
      );
      return;
    }
    
    const status = document.getElementById('reset-status');
    const btn = document.getElementById('btn-reset-passkey');
    
    if(status) {
      status.textContent = 'Please scan your fingerprint/face when prompted...';
      status.style.color = 'var(--teal)';
    }
    if(btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spin"></span> Registering...';
    }
    
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const student = resetRequest;
      
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: challenge,
          rp: {
            name: "UG QR Attendance System",
            id: window.location.hostname
          },
          user: {
            id: new TextEncoder().encode(student.studentEmail || student.studentId),
            name: student.studentEmail || student.studentId,
            displayName: student.studentName
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
      
      // Update student's biometric and register new device
      await DB.STUDENTS.update(student.studentId, {
        webAuthnCredentialId: credentialId,
        webAuthnData: { credentialId, clientDataJSON, attestationObject },
        lastBiometricReset: Date.now(),
        biometricResetReason: 'device_change'
      });
      
      // Register the new device
      await DB.DEVICE_REGISTRATION.registerDevice(student.studentId, deviceFingerprint, {
        userAgent: navigator.userAgent,
        deviceName: navigator.platform
      });
      
      // Mark reset request as used
      await DB.BIOMETRIC_RESET.update(resetToken, { 
        used: true, 
        usedAt: Date.now(),
        newCredentialId: credentialId,
        newDeviceFingerprint: deviceFingerprint
      });
      
      if(status) {
        status.textContent = '✓ Passkey registered successfully!';
        status.style.color = 'var(--teal)';
      }
      
      // Show success
      document.getElementById('reset-form').style.display = 'none';
      document.getElementById('reset-success').classList.add('show');
      
    } catch(err) {
      console.error('[RESET] Registration error:', err);
      if(status) {
        status.textContent = '❌ Registration failed. Please try again.';
        status.style.color = 'var(--danger)';
      }
      if(btn) {
        btn.disabled = false;
        btn.innerHTML = '🔐 Register Passkey (FaceID/TouchID)';
      }
      
      if (err.name === 'NotAllowedError') {
        await MODAL.error('Registration Cancelled', 'You cancelled the passkey prompt. Please try again.');
      } else {
        await MODAL.error('Registration Failed', err.message || 'Could not register passkey. Please try again.');
      }
    }
  }

  return { init };
})();
