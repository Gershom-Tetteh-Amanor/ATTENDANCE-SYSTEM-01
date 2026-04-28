/* ============================================
   smtp-email.js — Send emails via SMTP server
   Uses a backend proxy to handle SMTP
   Supports unlimited emails via university SMTP
   ============================================ */
'use strict';

const SMTP_EMAIL = (() => {
  
  // ============================================
  // CONFIGURATION - Update with your SMTP settings
  // ============================================
  
  // For University of Ghana SMTP Server
  const SMTP_CONFIG = {
    // UG SMTP Server (confirm with IT department)
    host: 'smtp.ug.edu.gh',  // Or 'mail.ug.edu.gh'
    port: 587,                // 587 for TLS, 465 for SSL
    secure: false,           // true for port 465, false for 587
    auth: {
      user: 'your-email@ug.edu.gh',  // Your UG email
      pass: 'your-password'           // Your UG email password
    },
    from: 'noreply@ug.edu.gh',        // Sender email
    fromName: 'UG QR Attendance System'
  };
  
  // Alternative: Gmail SMTP (if using Google Workspace)
  // const SMTP_CONFIG = {
  //   host: 'smtp.gmail.com',
  //   port: 587,
  //   secure: false,
  //   auth: {
  //     user: 'your-email@gmail.com',
  //     pass: 'your-app-password'  // Generate at myaccount.google.com/apppasswords
  //   },
  //   from: 'your-email@gmail.com',
  //   fromName: 'UG QR Attendance System'
  // };
  
  // ============================================
  // Email queue management
  // ============================================
  let emailQueue = [];
  let isSending = false;
  let lastSendTime = 0;
  const MIN_DELAY_MS = 1000; // 1 second between emails to avoid rate limiting
  
  async function processQueue() {
    if (isSending || emailQueue.length === 0) return;
    
    isSending = true;
    
    while (emailQueue.length > 0) {
      const email = emailQueue.shift();
      
      // Respect rate limiting
      const now = Date.now();
      const timeSinceLast = now - lastSendTime;
      if (timeSinceLast < MIN_DELAY_MS) {
        await new Promise(resolve => setTimeout(resolve, MIN_DELAY_MS - timeSinceLast));
      }
      
      try {
        await sendEmailViaProxy(email);
        lastSendTime = Date.now();
        console.log(`[SMTP] Email sent to: ${email.to}`);
      } catch (err) {
        console.error(`[SMTP] Failed to send to ${email.to}:`, err);
        // Don't throw, continue with next email
      }
    }
    
    isSending = false;
  }
  
  async function sendEmailViaProxy(emailData) {
    // Since browsers can't send SMTP directly, we'll use a simple backend
    // For now, show modal for manual sending
    // In production, you'd call your backend API here
    
    // Check if we have a backend endpoint configured
    const BACKEND_URL = localStorage.getItem('smtp_backend_url');
    
    if (BACKEND_URL) {
      // Send via backend API
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailData)
      });
      
      if (!response.ok) throw new Error('Backend error');
      return await response.json();
    } else {
      // No backend - show modal for manual sending
      await showManualSendModal(emailData);
      return { success: true, manual: true };
    }
  }
  
  async function showManualSendModal(emailData) {
    const { to, subject, html } = emailData;
    const plainText = html.replace(/<[^>]*>/g, '');
    
    const modalContent = `
      <div style="text-align: left;">
        <div class="strip strip-amber" style="margin-bottom: 15px;">
          <strong>📧 Send Email to: ${escapeHtml(to)}</strong><br>
          Subject: ${escapeHtml(subject)}
        </div>
        
        <div style="margin: 15px 0; display: flex; gap: 10px; flex-wrap: wrap;">
          <button onclick="SMTP_EMAIL.copyToClipboard('${escapeHtml(plainText).replace(/'/g, "\\'")}')" 
                  class="btn btn-ug" style="flex: 1;">
            📋 Copy to Clipboard
          </button>
          <button onclick="SMTP_EMAIL.openMailTo('${escapeHtml(to)}', '${escapeHtml(subject).replace(/'/g, "\\'")}', \`${escapeHtml(plainText).replace(/`/g, '\\`')}\`)" 
                  class="btn btn-secondary" style="flex: 1;">
            📧 Open Email Client
          </button>
          <button onclick="SMTP_EMAIL.configureBackend()" 
                  class="btn btn-outline" style="flex: 1;">
            ⚙️ Configure Auto-Send
          </button>
        </div>
        
        <div style="background: var(--surface2); padding: 15px; border-radius: 8px; max-height: 400px; overflow-y: auto;">
          <pre style="white-space: pre-wrap; font-family: monospace; font-size: 12px; margin: 0;">${escapeHtml(plainText)}</pre>
        </div>
      </div>
    `;
    
    await MODAL.alert('Send Email', modalContent, {
      icon: '📧',
      btnLabel: 'Close',
      width: '650px'
    });
  }
  
  function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
  
  async function configureBackend() {
    const backendUrl = await MODAL.prompt(
      'Configure Auto-Send',
      'Enter your backend API URL (optional):\n\nLeave empty to use manual mode.\n\nExample: https://your-server.com/send-email',
      { 
        icon: '⚙️', 
        placeholder: 'https://your-backend.com/send-email',
        defVal: localStorage.getItem('smtp_backend_url') || '',
        confirmLabel: 'Save',
        cancelLabel: 'Clear'
      }
    );
    
    if (backendUrl === null) {
      localStorage.removeItem('smtp_backend_url');
      await MODAL.success('Auto-Send Disabled', 'Switched to manual email mode.');
    } else if (backendUrl) {
      localStorage.setItem('smtp_backend_url', backendUrl);
      await MODAL.success('Auto-Send Enabled', `Emails will be sent to: ${backendUrl}`);
    }
  }
  
  // ============================================
  // Beautiful HTML Email Templates
  // ============================================
  
  function generateInviteHTML(toName, code, role, department, lecturerName, signupLink) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>UG QR Attendance Invitation</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f0f2f5; }
          .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
          .header { background: linear-gradient(135deg, #003087 0%, #001f5c 100%); padding: 30px; text-align: center; }
          .header h1 { color: #fcd116; margin: 0; font-size: 28px; }
          .header p { color: rgba(255,255,255,0.9); margin: 10px 0 0; }
          .content { padding: 30px; }
          .greeting { font-size: 16px; color: #333; margin-bottom: 20px; }
          .details { background: #f8f9fa; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #fcd116; }
          .code-box { background: linear-gradient(135deg, #003087 0%, #001f5c 100%); padding: 25px; text-align: center; border-radius: 12px; margin: 25px 0; }
          .code { font-size: 36px; font-weight: bold; font-family: 'Courier New', monospace; letter-spacing: 5px; background: white; padding: 15px 25px; border-radius: 8px; color: #003087; display: inline-block; }
          .btn { display: inline-block; background: #003087; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 15px 0; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #e0e0e0; }
          .warning { background: #fff3cd; border-left: 4px solid #fcd116; padding: 15px; margin: 20px 0; border-radius: 8px; }
          .label { font-weight: bold; color: #003087; }
          hr { border: none; border-top: 1px solid #e0e0e0; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏫 University of Ghana</h1>
            <p>QR Code Attendance System</p>
          </div>
          <div class="content">
            <div class="greeting">
              <strong>Dear ${escapeHtml(toName)},</strong>
            </div>
            
            <p>You have been invited to join the UG QR Attendance System as a <strong>${escapeHtml(role)}</strong>.</p>
            
            <div class="details">
              <p><span class="label">📋 Invitation Details:</span></p>
              <p>• <strong>Role:</strong> ${escapeHtml(role)}<br>
              • <strong>Department:</strong> ${escapeHtml(department)}<br>
              • <strong>Invited by:</strong> ${escapeHtml(lecturerName)}</p>
            </div>
            
            <div class="code-box">
              <p style="color: #fcd116; margin: 0 0 10px; font-size: 14px;">🔑 Your Registration Code</p>
              <div class="code">${escapeHtml(code)}</div>
              <p style="color: rgba(255,255,255,0.8); margin: 10px 0 0; font-size: 12px;">Valid for 7 days</p>
            </div>
            
            <div style="text-align: center;">
              <a href="${escapeHtml(signupLink)}" class="btn">🔗 Complete Registration</a>
            </div>
            
            <div class="warning">
              <strong>📝 Important Notes:</strong>
              <ul style="margin: 10px 0 0 20px;">
                <li>This code is for <strong>ONE-TIME</strong> use only</li>
                <li>Registration link expires in <strong>7 days</strong></li>
                <li>Keep your code confidential - do not share</li>
                <li>After registration, you can access the system anytime</li>
              </ul>
            </div>
          </div>
          <div class="footer">
            <p><strong>UG QR Attendance Team</strong><br>
            University of Ghana, Legon<br>
            © ${new Date().getFullYear()} All Rights Reserved</p>
            <p style="margin-top: 10px; font-size: 10px;">This is an automated message. Please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
  
  function generateResetHTML(resetCode, validMinutes = 30) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Password Reset</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f0f2f5; }
          .container { max-width: 500px; margin: 20px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
          .header { background: linear-gradient(135deg, #003087 0%, #001f5c 100%); padding: 25px; text-align: center; }
          .header h1 { color: #fcd116; margin: 0; font-size: 24px; }
          .content { padding: 30px; }
          .code-box { background: linear-gradient(135deg, #003087 0%, #001f5c 100%); padding: 25px; text-align: center; border-radius: 12px; margin: 20px 0; }
          .code { font-size: 42px; font-weight: bold; font-family: 'Courier New', monospace; letter-spacing: 8px; background: white; padding: 20px; border-radius: 8px; color: #003087; }
          .warning { background: #fff3cd; border-left: 4px solid #fcd116; padding: 15px; margin: 20px 0; border-radius: 8px; }
          .footer { background: #f8f9fa; padding: 15px; text-align: center; font-size: 11px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Password Reset Request</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>We received a request to reset your password for the UG QR Attendance System.</p>
            
            <div class="code-box">
              <p style="color: #fcd116; margin: 0 0 10px;">Your Verification Code</p>
              <div class="code">${escapeHtml(resetCode)}</div>
              <p style="color: rgba(255,255,255,0.8); margin: 10px 0 0;">Valid for ${validMinutes} minutes</p>
            </div>
            
            <div class="warning">
              <strong>⚠️ Security Notice:</strong>
              <ul style="margin: 8px 0 0 20px;">
                <li>Never share this code with anyone</li>
                <li>This code expires after ${validMinutes} minutes</li>
                <li>If you didn't request this, please ignore this email</li>
              </ul>
            </div>
            
            <p>Enter this code on the password reset page to create a new password.</p>
          </div>
          <div class="footer">
            <p>University of Ghana, Legon</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
  
  function generateBiometricResetHTML(toName, resetLink, lecturerName, validDays = 7) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Passkey Reset</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f0f2f5; }
          .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
          .header { background: linear-gradient(135deg, #003087 0%, #001f5c 100%); padding: 25px; text-align: center; }
          .header h1 { color: #fcd116; margin: 0; font-size: 24px; }
          .content { padding: 30px; }
          .notice { background: #fff3cd; border-left: 4px solid #fcd116; padding: 15px; margin: 20px 0; border-radius: 8px; }
          .info { background: #f8f9fa; padding: 20px; border-radius: 12px; margin: 20px 0; }
          .link-box { background: linear-gradient(135deg, #003087 0%, #001f5c 100%); padding: 25px; text-align: center; border-radius: 12px; margin: 20px 0; }
          .link { color: #fcd116; word-break: break-all; font-size: 12px; }
          .footer { background: #f8f9fa; padding: 15px; text-align: center; font-size: 11px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Passkey Reset Request</h1>
          </div>
          <div class="content">
            <h2>Register Your New Device</h2>
            <p>Dear <strong>${escapeHtml(toName)}</strong>,</p>
            
            <div class="notice">
              <strong>📱 Device Change Detected</strong><br>
              Your lecturer has initiated a passkey reset for your account to allow registration on a new device.
            </div>
            
            <div class="info">
              <p><strong>Why is this needed?</strong> For security, your passkey is bound to your specific device.</p>
              <p><strong>What happens next?</strong></p>
              <ul>
                <li>Your old device will be unregistered</li>
                <li>You can register your new device</li>
                <li>All your attendance records remain intact</li>
              </ul>
            </div>
            
            <div class="link-box">
              <p style="color: #fcd116; margin: 0 0 10px;">🔗 Click below to register your passkey</p>
              <a href="${escapeHtml(resetLink)}" class="link" target="_blank">${escapeHtml(resetLink)}</a>
              <p style="color: rgba(255,255,255,0.8); margin: 10px 0 0;">Valid for ${validDays} days</p>
            </div>
          </div>
          <div class="footer">
            <p>Best regards,<br><strong>${escapeHtml(lecturerName)}</strong><br>University of Ghana, Legon</p>
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
    
    const emailData = { to: toEmail, subject, html };
    emailQueue.push(emailData);
    processQueue();
    return true;
  }
  
  async function sendResetCodeEmail(toEmail, resetCode, validMinutes = 30) {
    const subject = '[UG QR Attendance] Password Reset Code';
    const html = generateResetHTML(resetCode, validMinutes);
    
    const emailData = { to: toEmail, subject, html };
    emailQueue.push(emailData);
    processQueue();
    return true;
  }
  
  async function sendBiometricResetEmail(toEmail, toName, resetLink, lecturerName, validDays = 7) {
    const subject = '[UG QR Attendance] Passkey Reset for New Device';
    const html = generateBiometricResetHTML(toName, resetLink, lecturerName, validDays);
    
    const emailData = { to: toEmail, subject, html };
    emailQueue.push(emailData);
    processQueue();
    return true;
  }
  
  return {
    sendInviteEmail,
    sendResetCodeEmail,
    sendBiometricResetEmail,
    copyToClipboard,
    openMailTo,
    configureBackend
  };
})();

window.SMTP_EMAIL = SMTP_EMAIL;
