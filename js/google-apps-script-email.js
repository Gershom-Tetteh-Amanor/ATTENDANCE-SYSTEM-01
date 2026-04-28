/* ============================================
   google-apps-script-email.js
   Send emails via Google Apps Script
   Free, scalable, no API keys needed in frontend
   ============================================ */
'use strict';

const GS_EMAIL = (() => {
  
  // ============================================
  // CONFIGURATION - REPLACE WITH YOUR URL!
  // ============================================
  // After deploying your Google Apps Script, paste the URL here:
  const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxqo2l5ECkZu03h7cEdNDvZkM8drixdIut7wnKxpdPwEBjYj-ID6bjR4BHgJ7e9x9zqHg/exec';
  
  // ============================================
  // Core send function
  // ============================================
  async function sendEmail(toEmail, subject, htmlContent, textContent = null) {
    if (!WEB_APP_URL || WEB_APP_URL.includes('YOUR_SCRIPT_ID')) {
      console.error('[GS_EMAIL] Please configure your Google Apps Script URL');
      await showManualCopy(toEmail, subject, htmlContent, textContent);
      return false;
    }
    
    try {
      // Show loading indicator
      const loadingToast = await MODAL.alert(
        'Sending Email',
        '<div style="text-align:center"><div class="spin-ug"></div> Sending email, please wait...</div>',
        { icon: '📧', btnLabel: null, width: '300px' }
      );
      
      const response = await fetch(WEB_APP_URL, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: toEmail,
          subject: subject,
          html: htmlContent,
          text: textContent || htmlContent.replace(/<[^>]*>/g, '')
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        console.log('[GS_EMAIL] Email sent successfully to:', toEmail);
        await MODAL.success('Email Sent!', `The email has been sent to ${toEmail}.`);
        return true;
      } else {
        throw new Error(result.error || 'Failed to send');
      }
      
    } catch (err) {
      console.error('[GS_EMAIL] Error:', err);
      await showManualCopy(toEmail, subject, htmlContent, textContent);
      return false;
    }
  }
  
  async function showManualCopy(toEmail, subject, htmlContent, textContent) {
    const plainText = textContent || htmlContent.replace(/<[^>]*>/g, '');
    
    const modalContent = `
      <div style="text-align: left;">
        <div class="strip strip-amber" style="margin-bottom: 15px;">
          <strong>⚠️ Could not send automatically</strong><br>
          Please copy the information below and send it manually to <strong>${escapeHtml(toEmail)}</strong>
        </div>
        
        <p><strong>📧 To:</strong> ${escapeHtml(toEmail)}</p>
        <p><strong>📝 Subject:</strong> ${escapeHtml(subject)}</p>
        
        <div style="margin: 15px 0;">
          <button onclick="GS_EMAIL.copyToClipboard('${escapeHtml(plainText).replace(/'/g, "\\'")}')" 
                  class="btn btn-ug" style="width: auto; margin-right: 10px;">
            📋 Copy Email Content
          </button>
          <button onclick="GS_EMAIL.openMailTo('${escapeHtml(toEmail)}', '${escapeHtml(subject).replace(/'/g, "\\'")}', \`${escapeHtml(plainText).replace(/`/g, '\\`')}\`)" 
                  class="btn btn-secondary" style="width: auto;">
            📧 Open Email Client
          </button>
        </div>
        
        <div style="background: var(--surface2); padding: 15px; border-radius: 8px; max-height: 400px; overflow-y: auto; margin-top: 15px;">
          <pre style="white-space: pre-wrap; font-family: monospace; font-size: 12px; margin: 0;">${escapeHtml(plainText)}</pre>
        </div>
      </div>
    `;
    
    await MODAL.alert('Send Email Manually', modalContent, {
      icon: '📧',
      btnLabel: 'Close',
      width: '600px'
    });
  }
  
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      await MODAL.success('Copied!', 'Email content copied to clipboard.');
    } catch (err) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      await MODAL.success('Copied!', 'Email content copied to clipboard.');
    }
  }
  
  function openMailTo(toEmail, subject, body) {
    const encodedSubject = encodeURIComponent(subject);
    const encodedBody = encodeURIComponent(body);
    window.location.href = `mailto:${toEmail}?subject=${encodedSubject}&body=${encodedBody}`;
  }
  
  function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  
  // ============================================
  // Template Functions (Beautiful HTML Emails)
  // ============================================
  function generateInviteHTML(toName, code, role, department, lecturerName, signupLink) {
    return `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"></head>
      <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f7;">
        <div style="max-width: 600px; margin: 20px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <div style="background: #003087; padding: 30px; text-align: center;">
            <h1 style="color: #fcd116; margin: 0; font-size: 28px;">🏫 University of Ghana</h1>
            <p style="color: white; margin: 10px 0 0;">QR Code Attendance System</p>
          </div>
          <div style="padding: 30px;">
            <h2 style="color: #003087;">Welcome to UG QR Attendance!</h2>
            <p>Dear <strong>${escapeHtml(toName)}</strong>,</p>
            <p>You have been invited to join the UG QR Attendance System as a <strong>${escapeHtml(role)}</strong>.</p>
            
            <div style="background: #f5f5f7; padding: 20px; border-radius: 12px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px;">📋 Invitation Details</h3>
              <p style="margin: 5px 0;"><strong>Role:</strong> ${escapeHtml(role)}</p>
              <p style="margin: 5px 0;"><strong>Department:</strong> ${escapeHtml(department)}</p>
              <p style="margin: 5px 0;"><strong>Invited by:</strong> ${escapeHtml(lecturerName)}</p>
            </div>
            
            <div style="background: linear-gradient(135deg, #003087, #001f5c); padding: 30px; text-align: center; border-radius: 12px; margin: 25px 0;">
              <p style="color: #fcd116; margin: 0 0 10px;">🔑 Your Registration Code</p>
              <div style="font-size: 36px; font-weight: bold; font-family: monospace; letter-spacing: 5px; background: white; padding: 15px; border-radius: 8px; color: #003087; display: inline-block;">${escapeHtml(code)}</div>
              <p style="color: rgba(255,255,255,0.8); margin: 10px 0 0;">Valid for 7 days</p>
            </div>
            
            <div style="text-align: center; margin: 25px 0;">
              <a href="${escapeHtml(signupLink)}" style="background: #003087; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; display: inline-block;">🔗 Complete Registration</a>
            </div>
            
            <div style="background: #fff3cd; border-left: 4px solid #fcd116; padding: 15px; margin: 20px 0; border-radius: 8px;">
              <strong>📝 Important Notes:</strong>
              <ul style="margin: 10px 0 0 20px;">
                <li>This code is for ONE-TIME use only</li>
                <li>Registration link expires in 7 days</li>
                <li>Keep your code confidential</li>
              </ul>
            </div>
          </div>
          <div style="background: #f5f5f7; padding: 20px; text-align: center; font-size: 12px; color: #666;">
            <p>UG QR Attendance Team<br>University of Ghana, Legon<br>© ${new Date().getFullYear()} All Rights Reserved</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
  
  function generateResetHTML(resetCode, validMinutes = 30) {
    const currentYear = new Date().getFullYear();
    return `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"></head>
      <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f7;">
        <div style="max-width: 500px; margin: 20px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <div style="background: #003087; padding: 25px; text-align: center;">
            <h1 style="color: #fcd116; margin: 0;">🔐 Password Reset</h1>
          </div>
          <div style="padding: 30px;">
            <p>Hello,</p>
            <p>We received a request to reset your password for the UG QR Attendance System.</p>
            
            <div style="background: linear-gradient(135deg, #003087, #001f5c); padding: 30px; text-align: center; border-radius: 12px; margin: 25px 0;">
              <p style="color: #fcd116; margin: 0 0 10px;">Your Verification Code</p>
              <div style="font-size: 42px; font-weight: bold; font-family: monospace; letter-spacing: 8px; background: white; padding: 20px; border-radius: 8px; color: #003087;">${escapeHtml(resetCode)}</div>
              <p style="color: rgba(255,255,255,0.8); margin: 10px 0 0;">Valid for ${validMinutes} minutes</p>
            </div>
            
            <div style="background: #fff3cd; border-left: 4px solid #fcd116; padding: 15px; margin: 20px 0; border-radius: 8px;">
              <strong>⚠️ Security Notice:</strong>
              <ul style="margin: 10px 0 0 20px;">
                <li>Never share this code with anyone</li>
                <li>This code expires after ${validMinutes} minutes</li>
                <li>If you didn't request this, please ignore this email</li>
              </ul>
            </div>
            
            <p>Enter this code on the password reset page to create a new password.</p>
          </div>
          <div style="background: #f5f5f7; padding: 15px; text-align: center; font-size: 11px; color: #666;">
            <p>University of Ghana, Legon | © ${currentYear}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
  
  function generateBiometricResetHTML(toName, resetLink, lecturerName, validDays = 7) {
    const currentYear = new Date().getFullYear();
    return `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"></head>
      <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f7;">
        <div style="max-width: 600px; margin: 20px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <div style="background: #003087; padding: 25px; text-align: center;">
            <h1 style="color: #fcd116; margin: 0;">🔐 Passkey Reset Request</h1>
          </div>
          <div style="padding: 30px;">
            <h2 style="color: #003087;">Register Your New Device</h2>
            <p>Dear <strong>${escapeHtml(toName)}</strong>,</p>
            
            <div style="background: #fff3cd; border-left: 4px solid #fcd116; padding: 15px; margin: 20px 0; border-radius: 8px;">
              <strong>📱 Device Change Detected</strong><br>
              Your lecturer has initiated a passkey reset for your account to allow registration on a new device.
            </div>
            
            <div style="background: #f5f5f7; padding: 20px; border-radius: 12px; margin: 20px 0;">
              <p><strong>Why is this needed?</strong> For security, your passkey is bound to your specific device.</p>
              <p><strong>What happens next?</strong></p>
              <ul>
                <li>Your old device will be unregistered</li>
                <li>You can register your new device</li>
                <li>All your attendance records remain intact</li>
              </ul>
            </div>
            
            <div style="background: linear-gradient(135deg, #003087, #001f5c); padding: 25px; text-align: center; border-radius: 12px; margin: 25px 0;">
              <p style="color: #fcd116; margin: 0 0 10px;">🔗 Click below to register your passkey</p>
              <a href="${escapeHtml(resetLink)}" style="color: #fcd116; word-break: break-all;" target="_blank">${escapeHtml(resetLink)}</a>
              <p style="color: rgba(255,255,255,0.8); margin: 10px 0 0;">Valid for ${validDays} days</p>
            </div>
          </div>
          <div style="background: #f5f5f7; padding: 15px; text-align: center; font-size: 11px; color: #666;">
            <p>Best regards,<br><strong>${escapeHtml(lecturerName)}</strong><br>University of Ghana, Legon | © ${currentYear}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
  
  // ============================================
  // Public API
  // ============================================
  async function sendInviteEmail(toEmail, toName, code, role, department, lecturerName, signupLink) {
    const subject = `[UG QR Attendance] Invitation to join ${role} Portal`;
    const html = generateInviteHTML(toName, code, role, department, lecturerName, signupLink);
    const text = `Invitation Code: ${code}\nLink: ${signupLink}\nRole: ${role}\nDepartment: ${department}`;
    return await sendEmail(toEmail, subject, html, text);
  }
  
  async function sendResetCodeEmail(toEmail, resetCode, validMinutes = 30) {
    const subject = '[UG QR Attendance] Password Reset Code';
    const html = generateResetHTML(resetCode, validMinutes);
    const text = `Your password reset code is: ${resetCode}\nValid for ${validMinutes} minutes`;
    return await sendEmail(toEmail, subject, html, text);
  }
  
  async function sendBiometricResetEmail(toEmail, toName, resetLink, lecturerName, validDays = 7) {
    const subject = '[UG QR Attendance] Passkey Reset for New Device';
    const html = generateBiometricResetHTML(toName, resetLink, lecturerName, validDays);
    const text = `Passkey reset link: ${resetLink}\nValid for ${validDays} days\nLecturer: ${lecturerName}`;
    return await sendEmail(toEmail, subject, html, text);
  }
  
  return {
    sendInviteEmail,
    sendResetCodeEmail,
    sendBiometricResetEmail,
    copyToClipboard,
    openMailTo
  };
})();

// Make global
window.GS_EMAIL = GS_EMAIL;
