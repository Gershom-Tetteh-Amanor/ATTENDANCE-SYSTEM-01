/* user-account.js — Universal User Account Management & Help System */
'use strict';

const USER_ACCOUNT = (() => {
  let currentUser = null;

  async function init() {
    currentUser = AUTH.getSession();
    if (!currentUser) return;
    console.log('[USER_ACCOUNT] Initialized for user:', currentUser.role);
  }

  // ============ PROFILE MANAGEMENT ============
  async function showProfile() {
    if (!currentUser) {
      await MODAL.error('Not Logged In', 'Please log in to access your profile.');
      return;
    }

    const userData = await getUserData();
    
    const html = `
      <div style="text-align:center; margin-bottom:20px">
        <div style="font-size:64px; margin-bottom:10px">${getUserIcon(currentUser.role)}</div>
        <h3>${UI.esc(userData.name || currentUser.name)}</h3>
        <p class="sub" style="font-size:12px">${UI.esc(currentUser.email)} · ${getRoleName(currentUser.role)}</p>
      </div>
      <div style="max-height:400px; overflow-y:auto; padding-right:5px">
        <div class="field">
          <label class="fl">Full Name</label>
          <input type="text" id="profile-name" class="fi" value="${UI.esc(userData.name || currentUser.name)}">
        </div>
        <div class="field">
          <label class="fl">Email</label>
          <input type="email" class="fi" value="${UI.esc(currentUser.email)}" readonly>
          <p class="note">Email cannot be changed. Contact admin for assistance.</p>
        </div>
        <div class="field">
          <label class="fl">Role</label>
          <input type="text" class="fi" value="${getRoleName(currentUser.role)}" readonly>
        </div>
        ${currentUser.department ? `<div class="field"><label class="fl">Department</label><input type="text" class="fi" value="${UI.esc(currentUser.department)}" readonly></div>` : ''}
        <div class="field">
          <label class="fl">Member Since</label>
          <input type="text" class="fi" value="${new Date(userData.createdAt || currentUser.createdAt || Date.now()).toLocaleDateString()}" readonly>
        </div>
        <hr style="margin:15px 0">
        <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap">
          <button class="btn btn-ug" onclick="USER_ACCOUNT.updateProfile()" style="flex:1">💾 Save Changes</button>
          <button class="btn btn-secondary" onclick="USER_ACCOUNT.showChangePassword()" style="flex:1">🔑 Change Password</button>
          ${currentUser.role === 'student' ? `<button class="btn btn-outline" onclick="USER_ACCOUNT.showBiometricStatus()" style="flex:1">🔐 Biometric Status</button>` : ''}
        </div>
      </div>
    `;
    
    await MODAL.alert('My Profile', html, { icon: '', btnLabel: 'Close', width: '500px' });
  }

  async function getUserData() {
    try {
      if (currentUser.role === 'student') {
        return await DB.STUDENTS.get(currentUser.studentId) || currentUser;
      } else if (currentUser.role === 'lecturer' || currentUser.role === 'ta') {
        return await DB.LEC.get(currentUser.id) || currentUser;
      } else if (currentUser.role === 'superAdmin') {
        return await DB.SA.get() || currentUser;
      } else if (currentUser.role === 'coAdmin') {
        return await DB.CA.get(currentUser.id) || currentUser;
      }
      return currentUser;
    } catch(e) {
      return currentUser;
    }
  }

  async function updateProfile() {
    const newName = document.getElementById('profile-name')?.value.trim();
    if (!newName) {
      await MODAL.error('Error', 'Name cannot be empty.');
      return;
    }
    
    try {
      if (currentUser.role === 'student') {
        await DB.STUDENTS.update(currentUser.studentId, { name: newName });
        currentUser.name = newName;
        AUTH.saveSession(currentUser);
      } else if (currentUser.role === 'lecturer' || currentUser.role === 'ta') {
        await DB.LEC.update(currentUser.id, { name: newName });
        currentUser.name = newName;
        AUTH.saveSession(currentUser);
      } else if (currentUser.role === 'superAdmin') {
        const sa = await DB.SA.get();
        if (sa) await DB.SA.set({ ...sa, name: newName });
        currentUser.name = newName;
        AUTH.saveSession(currentUser);
      } else if (currentUser.role === 'coAdmin') {
        await DB.CA.update(currentUser.id, { name: newName });
        currentUser.name = newName;
        AUTH.saveSession(currentUser);
      }
      
      updateTopbarName(newName);
      await MODAL.success('Profile Updated', 'Your profile has been updated successfully.');
      MODAL.close();
    } catch(err) {
      await MODAL.error('Update Failed', err.message);
    }
  }

  function updateTopbarName(name) {
    const tbName = document.querySelector('.tb-user');
    if (tbName) tbName.textContent = name;
  }

  async function showChangePassword() {
    const html = `
      <div style="max-height:300px; overflow-y:auto; padding-right:5px">
        <div class="field">
          <label class="fl">Current Password</label>
          <div class="pw"><input type="password" id="current-password" class="fi" placeholder="Enter current password"><button class="eye" onclick="UI.tgEye('current-password',this)">👁</button></div>
        </div>
        <div class="field">
          <label class="fl">New Password</label>
          <div class="pw"><input type="password" id="new-password" class="fi" placeholder="Min 8 characters"><button class="eye" onclick="UI.tgEye('new-password',this)">👁</button></div>
        </div>
        <div class="field">
          <label class="fl">Confirm New Password</label>
          <div class="pw"><input type="password" id="confirm-password" class="fi" placeholder="Confirm new password"><button class="eye" onclick="UI.tgEye('confirm-password',this)">👁</button></div>
        </div>
      </div>
    `;
    
    const confirm = await MODAL.confirm('Change Password', html, { confirmLabel: 'Update Password', cancelLabel: 'Cancel', confirmCls: 'btn-ug' });
    if (!confirm) return;
    
    const currentPass = document.getElementById('current-password')?.value;
    const newPass = document.getElementById('new-password')?.value;
    const confirmPass = document.getElementById('confirm-password')?.value;
    
    if (!currentPass || !newPass) {
      await MODAL.error('Error', 'Please fill all fields.');
      return;
    }
    if (newPass.length < 8) {
      await MODAL.error('Error', 'New password must be at least 8 characters.');
      return;
    }
    if (newPass !== confirmPass) {
      await MODAL.error('Error', 'New passwords do not match.');
      return;
    }
    
    const hash = UI.hashPw(currentPass);
    let isValid = false;
    
    if (currentUser.role === 'student') {
      const student = await DB.STUDENTS.get(currentUser.studentId);
      isValid = student && student.pwHash === hash;
      if (isValid) await DB.STUDENTS.update(currentUser.studentId, { pwHash: UI.hashPw(newPass) });
    } else if (currentUser.role === 'lecturer' || currentUser.role === 'ta') {
      const lec = await DB.LEC.get(currentUser.id);
      isValid = lec && lec.pwHash === hash;
      if (isValid) await DB.LEC.update(currentUser.id, { pwHash: UI.hashPw(newPass) });
    } else if (currentUser.role === 'superAdmin') {
      const sa = await DB.SA.get();
      isValid = sa && sa.pwHash === hash;
      if (isValid) await DB.SA.update({ pwHash: UI.hashPw(newPass) });
    } else if (currentUser.role === 'coAdmin') {
      const ca = await DB.CA.get(currentUser.id);
      isValid = ca && ca.pwHash === hash;
      if (isValid) await DB.CA.update(currentUser.id, { pwHash: UI.hashPw(newPass) });
    }
    
    if (!isValid) {
      await MODAL.error('Error', 'Current password is incorrect.');
      return;
    }
    
    await MODAL.success('Password Updated', 'Your password has been changed successfully. Please log in again.');
    setTimeout(() => {
      AUTH.clearSession();
      APP.goTo('landing');
    }, 2000);
  }

  async function showBiometricStatus() {
    const student = await DB.STUDENTS.get(currentUser.studentId);
    const hasBiometric = !!(student?.webAuthnCredentialId);
    const lastUse = student?.lastBiometricUse ? new Date(student.lastBiometricUse).toLocaleString() : 'Never';
    const deviceCount = student?.devices ? Object.keys(student.devices).length : 0;
    
    const html = `
      <div style="text-align:center">
        <div style="font-size:48px; margin-bottom:10px">${hasBiometric ? '✅' : '⚠️'}</div>
        <p><strong>Biometric Status:</strong> ${hasBiometric ? 'Registered' : 'Not Registered'}</p>
        ${hasBiometric ? `<p><strong>Last Used:</strong> ${lastUse}</p>` : ''}
        <p><strong>Registered Devices:</strong> ${deviceCount}</p>
        <hr style="margin:15px 0">
        <p class="sub">Biometric (FaceID/TouchID/Windows Hello) is used for secure check-ins.</p>
        ${!hasBiometric ? `<p class="note">Please contact your lecturer to set up biometric for your account.</p>` : ''}
      </div>
    `;
    
    await MODAL.alert('Biometric Status', html, { icon: '', btnLabel: 'Close', width: '400px' });
  }

  // ============ HELP SYSTEM ============
  async function showHelp() {
    const userRole = currentUser?.role || 'guest';
    
    const html = `
      <div style="max-height:500px; overflow-y:auto; padding-right:5px">
        <div style="margin-bottom:20px">
          <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:15px">
            <button class="btn btn-sm btn-secondary" onclick="USER_ACCOUNT.showHelpTopic('getting-started')">🚀 Getting Started</button>
            <button class="btn btn-sm btn-secondary" onclick="USER_ACCOUNT.showHelpTopic('features')">⚙️ Features</button>
            <button class="btn btn-sm btn-secondary" onclick="USER_ACCOUNT.showHelpTopic('faq')">❓ FAQ</button>
            <button class="btn btn-sm btn-secondary" onclick="USER_ACCOUNT.showHelpTopic('contact')">📧 Contact Support</button>
          </div>
          <div class="inner-panel" id="help-topic-content" style="max-height:350px; overflow-y:auto">
            ${getHelpContent(userRole)}
          </div>
        </div>
      </div>
    `;
    
    await MODAL.alert(`Help Center - ${getRoleName(userRole)} Guide`, html, { icon: '❓', btnLabel: 'Close', width: '550px' });
  }

  function getHelpContent(role) {
    const roleSpecific = {
      student: `
        <h3>🎓 Student Guide</h3>
        <ul>
          <li><strong>Check In:</strong> Scan the QR code displayed by your lecturer to record attendance</li>
          <li><strong>Biometric Verification:</strong> Use FaceID/TouchID/Windows Hello for secure check-ins</li>
          <li><strong>View Attendance:</strong> Track your attendance history and statistics</li>
          <li><strong>Filter by Period:</strong> Select academic year and semester to view specific courses</li>
          <li><strong>Export Reports:</strong> Download your attendance records to Excel</li>
        </ul>
      `,
      lecturer: `
        <h3>👨‍🏫 Lecturer Guide</h3>
        <ul>
          <li><strong>My Courses:</strong> View and manage your courses by academic period</li>
          <li><strong>Start Session:</strong> Generate QR codes for attendance tracking</li>
          <li><strong>Active Sessions:</strong> Monitor live check-ins and end sessions</li>
          <li><strong>Records:</strong> View attendance history and export to Excel</li>
          <li><strong>Reports:</strong> Generate attendance reports with statistics</li>
          <li><strong>Course Management:</strong> Enable/disable courses by period</li>
          <li><strong>Bio Reset:</strong> Reset student passkeys when they change devices</li>
        </ul>
      `,
      superAdmin: `
        <h3>🔐 Administrator Guide</h3>
        <ul>
          <li><strong>Unique IDs:</strong> Generate and manage lecturer registration IDs</li>
          <li><strong>Lecturers:</strong> View, suspend, or remove lecturers</li>
          <li><strong>Co-Admins:</strong> Approve applications and add joint administrators (max 3)</li>
          <li><strong>Database:</strong> Generate system reports and manage backups</li>
          <li><strong>Settings:</strong> Delete data by year range or reset system (backups preserved)</li>
          <li><strong>Courses:</strong> View all courses grouped by year, semester, department</li>
        </ul>
      `,
      coAdmin: `
        <h3>🤝 Co-Administrator Guide</h3>
        <ul>
          <li><strong>Generate IDs:</strong> Create unique IDs for lecturers in your department only</li>
          <li><strong>Lecturers:</strong> View all lecturers in your department</li>
          <li><strong>Reports:</strong> Generate attendance reports for your department</li>
          <li><strong>Backup:</strong> Create and manage department data backups</li>
          <li><strong>Courses:</strong> View all courses in your department</li>
        </ul>
      `
    };
    
    const faq = `
      <h3>❓ Frequently Asked Questions</h3>
      <ul>
        <li><strong>Forgot password?</strong> Click "Forgot Password" on the login page to reset.</li>
        <li><strong>QR code not scanning?</strong> Ensure you have good lighting and hold steady.</li>
        <li><strong>Biometric not working?</strong> Contact your lecturer for a passkey reset.</li>
        <li><strong>Attendance not showing?</strong> Check that you're viewing the correct academic period.</li>
        <li><strong>Need to change device?</strong> Request a passkey reset from your lecturer.</li>
      </ul>
    `;
    
    const contact = `
      <h3>📧 Contact Support</h3>
      <p>For technical assistance:</p>
      <ul>
        <li>Email: <a href="mailto:support@ug.edu.gh">support@ug.edu.gh</a></li>
        <li>Phone: +233 (0) 30 123 4567</li>
        <li>Office Hours: Monday-Friday, 8:00 AM - 5:00 PM</li>
      </ul>
    `;
    
    return (roleSpecific[role] || '') + faq + contact;
  }

  async function showHelpTopic(topic) {
    const container = document.getElementById('help-topic-content');
    if (!container) return;
    
    let content = '';
    switch(topic) {
      case 'getting-started':
        content = `<h3>🚀 Getting Started</h3><p>Welcome to the UG QR Attendance System!</p><ul><li><strong>First Time Login:</strong> Use the credentials provided to you</li><li><strong>Dashboard:</strong> Navigate using the tabs at the top</li><li><strong>Profile:</strong> Click on "Account" to update your information</li><li><strong>Help:</strong> Return here anytime for assistance</li></ul>`;
        break;
      case 'features':
        content = `<h3>⚙️ Key Features</h3><ul><li><strong>QR Code Attendance:</strong> Quick and contactless check-ins</li><li><strong>Biometric Security:</strong> FaceID/TouchID/Windows Hello verification</li><li><strong>Real-time Tracking:</strong> Live attendance monitoring</li><li><strong>Comprehensive Reports:</strong> Export attendance data to Excel</li><li><strong>Multi-role Support:</strong> Students, Lecturers, TAs, and Admins</li></ul>`;
        break;
      case 'faq':
        content = `<h3>❓ Frequently Asked Questions</h3><ul><li><strong>How do I check in?</strong> Scan the QR code displayed by your lecturer.</li><li><strong>What if I miss a check-in?</strong> Manual check-ins can be done by your lecturer/TA.</li><li><strong>How to view my attendance?</strong> Go to Student Dashboard and select the academic period.</li><li><strong>Forgot password?</strong> Use "Forgot Password" on the login page.</li><li><strong>Biometric not working?</strong> Contact your lecturer for a passkey reset.</li></ul>`;
        break;
      case 'contact':
        content = `<h3>📧 Contact Support</h3><p><strong>UG IT Support Center</strong></p><ul><li>Email: <a href="mailto:support@ug.edu.gh">support@ug.edu.gh</a></li><li>Phone: +233 (0) 30 123 4567</li><li>WhatsApp: +233 (0) 50 123 4567</li></ul><p><strong>Hours:</strong> Monday - Friday, 8:00 AM - 5:00 PM</p>`;
        break;
      default:
        content = getHelpContent(currentUser?.role || 'guest');
    }
    container.innerHTML = content;
  }

  // ============ UTILITIES ============
  function getUserIcon(role) {
    switch(role) {
      case 'student': return '🎓';
      case 'lecturer': return '👨‍🏫';
      case 'ta': return '👥';
      case 'superAdmin': return '🔐';
      case 'coAdmin': return '🤝';
      default: return '👤';
    }
  }

  function getRoleName(role) {
    switch(role) {
      case 'student': return 'Student';
      case 'lecturer': return 'Lecturer';
      case 'ta': return 'Teaching Assistant';
      case 'superAdmin': return 'Super Administrator';
      case 'coAdmin': return 'Co-Administrator';
      default: return 'User';
    }
  }

  // Only add ONE account and ONE help button per topbar
  function addAccountButton() {
    const topbars = document.querySelectorAll('.topbar');
    topbars.forEach(topbar => {
      // Remove existing account/help buttons to avoid duplicates
      const existingAccount = topbar.querySelector('.account-btn');
      const existingHelp = topbar.querySelector('.help-btn');
      if (existingAccount) existingAccount.remove();
      if (existingHelp) existingHelp.remove();
      
      // Find the position to insert (before the last button which is usually sign out)
      const signOutBtn = topbar.querySelector('.tb-btn:last-child');
      
      const helpBtn = document.createElement('button');
      helpBtn.className = 'tb-btn help-btn';
      helpBtn.innerHTML = '❓ Help';
      helpBtn.onclick = () => showHelp();
      
      const accountBtn = document.createElement('button');
      accountBtn.className = 'tb-btn account-btn';
      accountBtn.innerHTML = '👤 Account';
      accountBtn.onclick = () => showProfile();
      
      // Insert help button first, then account button before sign out
      if (signOutBtn) {
        topbar.insertBefore(helpBtn, signOutBtn);
        topbar.insertBefore(accountBtn, signOutBtn);
      } else {
        topbar.appendChild(helpBtn);
        topbar.appendChild(accountBtn);
      }
    });
  }

  return {
    init,
    showProfile,
    showHelp,
    showHelpTopic,
    showChangePassword,
    showBiometricStatus,
    updateProfile,
    addAccountButton,
    getUserIcon,
    getRoleName
  };
})();
