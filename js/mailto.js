/* ============================================
   mailto.js — Simple email using mailto links
   No API key required! Opens default email client
   ============================================ */
'use strict';

const MAILTO = (() => {
  
  function sendViaMailto(to, subject, body) {
    const encodedSubject = encodeURIComponent(subject);
    const encodedBody = encodeURIComponent(body);
    window.location.href = `mailto:${to}?subject=${encodedSubject}&body=${encodedBody}`;
    return true;
  }

  function generateEmailBody(template, variables) {
    let body = template;
    for (const [key, value] of Object.entries(variables)) {
      body = body.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    return body;
  }

  // ============================================
  // TEMPLATE 1: Invite Email (Lecturers, TAs, Co-Admins)
  // ============================================
  const INVITE_TEMPLATE = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    UNIVERSITY OF GHANA
                 QR CODE ATTENDANCE SYSTEM
                        EST. 2024
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Dear {{name}},

You have been invited to join the UG QR Attendance System as a {{role}}.

┌─────────────────────────────────────────────────────────────┐
│                      INVITATION DETAILS                      │
├─────────────────────────────────────────────────────────────┤
│  Role:              {{role}}                                 │
│  Department:        {{department}}                           │
│  Invited by:        {{lecturer_name}}                        │
│  Valid for:         7 days                                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    YOUR REGISTRATION CODE                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                    🔑  {{code}}  🔑                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     REGISTRATION LINK                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  {{signup_link}}                                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                        INSTRUCTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 1: Click the registration link above (or copy it to your browser)

Step 2: Enter your unique registration code: {{code}}

Step 3: Create your account with:
        • Full name
        • Email address (this email)
        • A secure password (minimum 8 characters)

Step 4: Sign in using your email and password

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                      IMPORTANT NOTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ This code is for ONE-TIME use only
✓ Registration link expires in 7 days
✓ Keep your code confidential - do not share with others
✓ After registration, you can access the system anytime
✓ For security, never share your password

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                   NEED ASSISTANCE?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Contact the UG IT Support Center:
📧 Email: support@ug.edu.gh
📞 Phone: +233 (0) 30 123 4567
🌐 Website: https://www.ug.edu.gh

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Best regards,

The UG QR Attendance Team
University of Ghana, Legon

© {{year}} University of Ghana. All rights reserved.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This is an automated message. Please do not reply to this email.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `;

  // ============================================
  // TEMPLATE 2: Password Reset Email
  // ============================================
  const RESET_TEMPLATE = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    UNIVERSITY OF GHANA
                 QR CODE ATTENDANCE SYSTEM
                    PASSWORD RESET REQUEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Hello,

We received a request to reset your password for the UG QR Attendance System.

┌─────────────────────────────────────────────────────────────┐
│                   YOUR VERIFICATION CODE                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                    🔐  {{reset_code}}  🔐                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      CODE INFORMATION                        │
├─────────────────────────────────────────────────────────────┤
│  Valid for:         {{valid_minutes}} minutes               │
│  Requested at:      {{request_time}}                        │
│  Expires at:        {{expiry_time}}                         │
└─────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                      HOW TO RESET
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Go to the UG QR Attendance System login page
2. Click "Forgot Password"
3. Enter your email address
4. Enter the verification code above: {{reset_code}}
5. Create your new password (minimum 8 characters)
6. Sign in with your new password

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                     SECURITY NOTICE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  IMPORTANT SECURITY INFORMATION:

• NEVER share this code with anyone, including UG staff
• This code expires after {{valid_minutes}} minutes
• If you didn't request this reset, please ignore this email
• Your password will remain unchanged until you complete the reset
• For suspicious activity, contact support immediately

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                   NEED ASSISTANCE?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If you did not request this password reset:
• Someone may have entered your email by mistake
• Your account remains secure as long as you don't share the code
• No action is required on your part

For help, contact:
📧 support@ug.edu.gh
📞 +233 (0) 30 123 4567

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Best regards,

The UG QR Attendance Team
University of Ghana, Legon

© {{year}} University of Ghana. All rights reserved.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This is an automated message. Please do not reply to this email.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `;

  // ============================================
  // TEMPLATE 3: Biometric/Passkey Reset Email
  // ============================================
  const BIOMETRIC_RESET_TEMPLATE = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    UNIVERSITY OF GHANA
                 QR CODE ATTENDANCE SYSTEM
                    PASKEY RESET REQUEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Dear {{to_name}},

Your lecturer/TA has initiated a passkey reset for your account to register your new device.

┌─────────────────────────────────────────────────────────────┐
│                    DEVICE CHANGE DETECTED                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📱 Your account is being moved to a new device            │
│  🔐 Old device will be automatically unregistered          │
│  ✅ All attendance records will be preserved               │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      RESET LINK                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🔗  {{reset_link}}                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   LINK INFORMATION                           │
├─────────────────────────────────────────────────────────────┤
│  Valid for:         {{valid_days}} days                     │
│  Issued by:         {{lecturer_name}}                       │
│  Purpose:           Register new device passkey             │
└─────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                      INSTRUCTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1: On your NEW device, click the reset link above (or copy it to your browser)

STEP 2: When prompted, use your device's biometric sensor:
        • iPhone/iPad: Face ID or Touch ID
        • Android: Fingerprint scanner or Face Unlock
        • Windows: Windows Hello (fingerprint or face)
        • Mac: Touch ID

STEP 3: Follow the on-screen prompts to register your passkey

STEP 4: Once complete, you can check in to sessions using your biometric

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                   WHAT HAPPENS NEXT?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Your OLD DEVICE will be automatically unregistered
✓ Your NEW DEVICE will be bound to your account
✓ Your attendance history remains unchanged
✓ Future check-ins will work on your new device only
✓ The old device cannot be used for check-ins anymore

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                     SECURITY NOTICE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  IMPORTANT:

• This link is for ONE-TIME use only
• Link expires in {{valid_days}} days
• Only works for: {{to_name}}
• DO NOT share this link with anyone else
• If you didn't request this, contact your lecturer immediately

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                WHY IS THIS NECESSARY?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For security, your biometric passkey (FaceID/TouchID/Windows Hello)
is cryptographically bound to your specific device. When you get a
new device, you need to register a new passkey to prevent unauthorized
access from your old device.

This process:
• Prevents impersonation
• Ensures only YOU can check in
• Keeps your attendance records secure
• Unregisters lost or stolen devices

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                   NEED ASSISTANCE?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If you're having trouble with the passkey registration:

📧 Email your lecturer: {{lecturer_email}}
📞 Call UG IT Support: +233 (0) 30 123 4567
💬 Visit the IT Help Desk (Main Library, Level 2)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Best regards,

{{lecturer_name}}
Lecturer/Tutor
University of Ghana, Legon

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
© {{year}} University of Ghana. All rights reserved.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `;

  // ============================================
  // TEMPLATE 4: Welcome/Confirmation Email (Optional)
  // ============================================
  const WELCOME_TEMPLATE = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    UNIVERSITY OF GHANA
                 QR CODE ATTENDANCE SYSTEM
                    WELCOME ABOARD! 🎓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Dear {{name}},

Welcome to the UG QR Attendance System! Your account has been successfully created.

┌─────────────────────────────────────────────────────────────┐
│                    ACCOUNT DETAILS                           │
├─────────────────────────────────────────────────────────────┤
│  Name:           {{name}}                                    │
│  Role:           {{role}}                                    │
│  Email:          {{email}}                                   │
│  Registered:     {{registration_date}}                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   QUICK START GUIDE                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📱 FOR STUDENTS:                                           │
│     • Scan QR codes displayed by your lecturer              │
│     • Use FaceID/TouchID for secure check-in                │
│     • View your attendance history on the dashboard         │
│                                                             │
│  👨‍🏫 FOR LECTURERS:                                         │
│     • Start sessions and generate QR codes                  │
│     • Monitor live check-ins                                │
│     • Export attendance reports to Excel                    │
│                                                             │
│  👥 FOR TAs:                                                │
│     • Access assigned lecturer dashboards                   │
│     • Help manage sessions                                  │
│     • View attendance records                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    GETTING STARTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Log in to the system: {{site_url}}
2. Use your email and the password you created
3. Explore your personalized dashboard
4. Set up your profile (optional)

{{biometric_note}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                   NEED HELP?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📖 User Guide: {{site_url}}help
📧 Email Support: support@ug.edu.gh
📞 Phone Support: +233 (0) 30 123 4567
💬 Live Chat: Available on the help page

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

We're excited to have you on board!

The UG QR Attendance Team
University of Ghana, Legon

© {{year}} University of Ghana. All rights reserved.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `;

  // ============================================
  // TEMPLATE 5: Session Reminder Email (Optional)
  // ============================================
  const SESSION_REMINDER_TEMPLATE = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    UNIVERSITY OF GHANA
                 QR CODE ATTENDANCE SYSTEM
                    SESSION REMINDER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Dear {{student_name}},

This is a reminder about your upcoming class session.

┌─────────────────────────────────────────────────────────────┐
│                    SESSION DETAILS                           │
├─────────────────────────────────────────────────────────────┤
│  Course:         {{course_code}} - {{course_name}}          │
│  Date:           {{session_date}}                           │
│  Time:           {{session_time}}                           │
│  Venue:          {{venue}}                                   │
│  Lecturer:       {{lecturer_name}}                          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  ATTENDANCE INFORMATION                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ✓ QR code will be displayed at the start of class         │
│  ✓ Scan with your phone camera                             │
│  ✓ Verify with FaceID/TouchID                              │
│  ✓ Location-based verification ensures accuracy            │
│                                                             │
└─────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                   YOUR ATTENDANCE STATUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Current Attendance Rate: {{attendance_rate}}%
• Sessions Attended: {{sessions_attended}}/{{total_sessions}}
• Status: {{attendance_status}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                     REMINDER TIPS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 Make sure you:
• Have the QR code ready to scan
• Enable location services for accurate check-in
• Have FaceID/TouchID set up on your device
• Arrive on time (QR codes expire after the session duration)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Thank you for your attention to attendance!

Best regards,

The UG QR Attendance System
University of Ghana, Legon

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `;

  // ============================================
  // Public API Methods
  // ============================================
  
  async function sendInviteEmail(toEmail, toName, code, role, department, lecturerName, signupLink) {
    const currentTime = new Date();
    const requestTime = currentTime.toLocaleString();
    const expiryTime = new Date(currentTime.getTime() + 30 * 60000).toLocaleString();
    
    const body = generateEmailBody(INVITE_TEMPLATE, {
      name: toName,
      role: role,
      department: department || 'Not specified',
      lecturer_name: lecturerName || 'Administrator',
      code: code,
      signup_link: signupLink,
      year: new Date().getFullYear()
    });
    
    const subject = `[UG QR Attendance] Invitation to join ${role} Portal - Action Required`;
    return sendViaMailto(toEmail, subject, body);
  }

  async function sendResetCodeEmail(toEmail, resetCode, validMinutes = 30) {
    const currentTime = new Date();
    const requestTime = currentTime.toLocaleString();
    const expiryTime = new Date(currentTime.getTime() + validMinutes * 60000).toLocaleString();
    
    const body = generateEmailBody(RESET_TEMPLATE, {
      reset_code: resetCode,
      valid_minutes: validMinutes,
      request_time: requestTime,
      expiry_time: expiryTime,
      year: new Date().getFullYear()
    });
    
    const subject = '[UG QR Attendance] Password Reset Code - Do Not Share';
    return sendViaMailto(toEmail, subject, body);
  }

  async function sendBiometricResetEmail(toEmail, toName, resetLink, lecturerName, lecturerEmail = '', validDays = 7) {
    const body = generateEmailBody(BIOMETRIC_RESET_TEMPLATE, {
      to_name: toName,
      reset_link: resetLink,
      lecturer_name: lecturerName || 'Your Lecturer',
      lecturer_email: lecturerEmail || 'lecturer@ug.edu.gh',
      valid_days: validDays,
      year: new Date().getFullYear()
    });
    
    const subject = '[UG QR Attendance] Passkey Reset - Register Your New Device';
    return sendViaMailto(toEmail, subject, body);
  }

  async function sendWelcomeEmail(toEmail, toName, role, email, siteUrl, hasBiometric = false) {
    const biometricNote = hasBiometric ? 
      '✓ Your biometric (FaceID/TouchID) is already set up for quick check-ins' : 
      '⚠️ For faster check-ins, set up biometric authentication in your profile settings';
    
    const body = generateEmailBody(WELCOME_TEMPLATE, {
      name: toName,
      role: role,
      email: email,
      registration_date: new Date().toLocaleDateString(),
      site_url: siteUrl,
      biometric_note: biometricNote,
      year: new Date().getFullYear()
    });
    
    const subject = '[UG QR Attendance] Welcome to the System! 🎓';
    return sendViaMailto(toEmail, subject, body);
  }

  async function sendSessionReminder(toEmail, studentName, courseCode, courseName, sessionDate, sessionTime, venue, lecturerName, attendanceRate, sessionsAttended, totalSessions) {
    let attendanceStatus = '';
    const rate = parseInt(attendanceRate);
    if (rate >= 80) attendanceStatus = 'Good Standing ✅';
    else if (rate >= 60) attendanceStatus = 'At Risk ⚠️';
    else attendanceStatus = 'Critical ❌';
    
    const body = generateEmailBody(SESSION_REMINDER_TEMPLATE, {
      student_name: studentName,
      course_code: courseCode,
      course_name: courseName,
      session_date: sessionDate,
      session_time: sessionTime,
      venue: venue,
      lecturer_name: lecturerName,
      attendance_rate: attendanceRate,
      sessions_attended: sessionsAttended,
      total_sessions: totalSessions,
      attendance_status: attendanceStatus,
      year: new Date().getFullYear()
    });
    
    const subject = `[UG QR Attendance] Reminder: ${courseCode} Session Today at ${sessionTime}`;
    return sendViaMailto(toEmail, subject, body);
  }

  // Helper: Show email content in a modal instead of opening email client
  async function showEmailPreview(toEmail, subject, body) {
    const modalContent = `
      <div style="text-align: left;">
        <p><strong>📧 To:</strong> ${toEmail}</p>
        <p><strong>📝 Subject:</strong> ${subject}</p>
        <button onclick="MAILTO.sendDirectly('${toEmail.replace(/'/g, "\\'")}', '${subject.replace(/'/g, "\\'")}', \`${body.replace(/`/g, '\\`')}\`)" 
                class="btn btn-ug" style="margin: 10px 0; width: auto; padding: 8px 20px;">
          📧 Open Email Client
        </button>
        <div style="background: var(--surface2); padding: 15px; border-radius: 8px; max-height: 400px; overflow-y: auto; margin-top: 10px;">
          <pre style="white-space: pre-wrap; font-family: monospace; font-size: 11px; margin: 0;">${escapeHtml(body)}</pre>
        </div>
      </div>
    `;
    
    await MODAL.alert('Send Email', modalContent, { 
      icon: '📧', 
      btnLabel: 'Close',
      width: '600px'
    });
  }
  
  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  
  function sendDirectly(to, subject, body) {
    sendViaMailto(to, subject, body);
  }

  return {
    // Main email methods
    sendInviteEmail,
    sendResetCodeEmail,
    sendBiometricResetEmail,
    sendWelcomeEmail,
    sendSessionReminder,
    
    // Utilities
    sendViaMailto,
    showEmailPreview,
    sendDirectly
  };
})();

// Make available globally
window.MAILTO = MAILTO;
