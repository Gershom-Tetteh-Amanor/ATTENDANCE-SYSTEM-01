/* user-account.js — Universal User Account Management with Profile Pictures & Help System (FIXED) */
'use strict';

const USER_ACCOUNT = (() => {
  let currentUser = null;

  async function init() {
    currentUser = AUTH.getSession();
    if (!currentUser) return;
    console.log('[USER_ACCOUNT] Initialized for user:', currentUser.role);
    await loadProfilePicture();
  }

  // ==================== PROFILE PICTURE MANAGEMENT ====================
  async function loadProfilePicture() {
    const userData = await getUserData();
    const profilePicture = userData?.profilePicture || null;
    
    // Update all avatar elements
    document.querySelectorAll('.user-avatar').forEach(avatar => {
      if (profilePicture && profilePicture.startsWith('data:image')) {
        avatar.style.backgroundImage = `url(${profilePicture})`;
        avatar.style.backgroundSize = 'cover';
        avatar.style.backgroundPosition = 'center';
        avatar.style.backgroundColor = 'transparent';
        avatar.textContent = '';
      } else {
        avatar.style.backgroundImage = '';
        avatar.style.backgroundColor = '';
        avatar.textContent = getAvatarIcon(currentUser?.role);
      }
    });
  }

  function getAvatarIcon(role) {
    switch(role) {
      case 'student': return '🎓';
      case 'lecturer': return '👨‍🏫';
      case 'ta': return '👥';
      case 'superAdmin': return '🔐';
      case 'coAdmin': return '🤝';
      default: return '👤';
    }
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
      console.warn('[USER_ACCOUNT] Get user data error:', e);
      return currentUser;
    }
  }

  async function showProfile() {
    if (!currentUser) {
      await MODAL.error('Not Logged In', 'Please log in to access your profile.');
      return;
    }

    const userData = await getUserData();
    const profilePicture = userData?.profilePicture || null;
    const hasProfilePic = profilePicture && profilePicture.startsWith('data:image');
    
    const modalId = 'profile_modal_' + Date.now();
    
    const html = `
      <div id="${modalId}" style="text-align:center; margin-bottom:20px">
        <div style="position:relative; display:inline-block">
          <div id="profile-preview" style="width:100px; height:100px; border-radius:50%; background-size:cover; background-position:center; background-color:var(--surface2); display:flex; align-items:center; justify-content:center; font-size:40px; border:3px solid var(--ug); ${hasProfilePic ? `background-image:url('${profilePicture}');` : ''}">
            ${!hasProfilePic ? getAvatarIcon(currentUser?.role) : ''}
          </div>
          <label for="profile-upload" style="position:absolute; bottom:0; right:0; background:var(--ug); color:white; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:16px; border:2px solid white;">📷</label>
          <input type="file" id="profile-upload" accept="image/jpeg,image/png,image/jpg" style="display:none">
        </div>
        ${hasProfilePic ? `<button id="profile-delete-btn" style="margin-top:10px; width:auto; background:var(--danger); color:white; border:none; border-radius:6px; padding:6px 12px; cursor:pointer;">🗑️ Delete Picture</button>` : ''}
        <h3 style="margin-top:10px;">${escapeHtml(userData.name || currentUser.name)}</h3>
        <p class="sub" style="font-size:12px">${escapeHtml(currentUser.email)} · ${getRoleName(currentUser.role)}</p>
      </div>
      <div style="max-height:400px; overflow-y:auto; padding-right:5px">
        <div class="field">
          <label class="fl">👤 Full Name</label>
          <input type="text" id="profile-name" class="fi" value="${escapeHtml(userData.name || currentUser.name)}">
        </div>
        <div class="field">
          <label class="fl">📧 Email</label>
          <input type="email" class="fi" value="${escapeHtml(currentUser.email)}" readonly>
          <p class="note">Email cannot be changed. Contact admin for assistance.</p>
        </div>
        <div class="field">
          <label class="fl">🎭 Role</label>
          <input type="text" class="fi" value="${getRoleName(currentUser.role)}" readonly>
        </div>
        ${currentUser.department ? `<div class="field"><label class="fl">🏛️ Department</label><input type="text" class="fi" value="${escapeHtml(currentUser.department)}" readonly></div>` : ''}
        <div class="field">
          <label class="fl">📅 Member Since</label>
          <input type="text" class="fi" value="${new Date(userData.createdAt || currentUser.createdAt || Date.now()).toLocaleDateString()}" readonly>
        </div>
        <hr style="margin:15px 0">
        <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap">
          <button id="profile-save-btn" class="btn btn-ug" style="flex:1">💾 Save Changes</button>
          <button id="profile-changepwd-btn" class="btn btn-secondary" style="flex:1">🔑 Change Password</button>
          ${currentUser.role === 'student' ? `<button id="profile-biometric-btn" class="btn btn-outline" style="flex:1">🔐 Biometric Status</button>` : ''}
        </div>
      </div>
    `;
    
    await MODAL.alert('👤 My Profile', html, { icon: '', btnLabel: 'Close', width: '500px' });
    
    // Attach event listeners after modal is rendered
    setTimeout(() => {
      attachProfileEvents();
    }, 100);
  }
  
  function attachProfileEvents() {
    console.log('[USER_ACCOUNT] Attaching profile events');
    
    // File upload
    const uploadLabel = document.querySelector('label[for="profile-upload"]');
    const uploadInput = document.getElementById('profile-upload');
    if (uploadLabel && uploadInput) {
      uploadLabel.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadInput.click();
      };
      uploadInput.onchange = (e) => {
        if (e.target.files && e.target.files[0]) {
          uploadProfilePicture(e.target.files[0]);
        }
      };
    }
    
    // Delete button
    const deleteBtn = document.getElementById('profile-delete-btn');
    if (deleteBtn) {
      deleteBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        deleteProfilePicture();
      };
    }
    
    // Save button
    const saveBtn = document.getElementById('profile-save-btn');
    if (saveBtn) {
      saveBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        updateProfile();
      };
    }
    
    // Change password button
    const changePwdBtn = document.getElementById('profile-changepwd-btn');
    if (changePwdBtn) {
      changePwdBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        MODAL.close();
        setTimeout(() => showChangePassword(), 200);
      };
    }
    
    // Biometric button
    const bioBtn = document.getElementById('profile-biometric-btn');
    if (bioBtn) {
      bioBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        MODAL.close();
        setTimeout(() => showBiometricStatus(), 200);
      };
    }
  }

  async function uploadProfilePicture(file) {
    if (!file) return;
    
    console.log('[USER_ACCOUNT] Uploading profile picture:', file.name);
    
    if (!file.type.match('image.*')) {
      await MODAL.error('Invalid File', 'Please select an image file (JPEG, PNG).');
      return;
    }
    
    if (file.size > 2 * 1024 * 1024) {
      await MODAL.error('File Too Large', 'Profile picture must be less than 2MB.');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const imageData = e.target.result;
      
      // Update preview
      const preview = document.getElementById('profile-preview');
      if (preview) {
        preview.style.backgroundImage = `url(${imageData})`;
        preview.style.backgroundSize = 'cover';
        preview.style.backgroundPosition = 'center';
        preview.textContent = '';
      }
      
      // Save to database
      try {
        if (currentUser.role === 'student') {
          await DB.STUDENTS.update(currentUser.studentId, { profilePicture: imageData });
        } else if (currentUser.role === 'lecturer' || currentUser.role === 'ta') {
          await DB.LEC.update(currentUser.id, { profilePicture: imageData });
        } else if (currentUser.role === 'superAdmin') {
          const sa = await DB.SA.get();
          if (sa) await DB.SA.set({ ...sa, profilePicture: imageData });
        } else if (currentUser.role === 'coAdmin') {
          await DB.CA.update(currentUser.id, { profilePicture: imageData });
        }
        
        // Update all avatars on page
        await loadProfilePicture();
        await MODAL.success('Success', '✅ Profile picture updated successfully.');
        MODAL.close();
      } catch(err) {
        console.error('Upload error:', err);
        await MODAL.error('Error', err.message);
      }
    };
    reader.readAsDataURL(file);
  }

  async function deleteProfilePicture() {
    const confirmed = await MODAL.confirm('Delete Picture', 'Are you sure you want to delete your profile picture?', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    
    try {
      if (currentUser.role === 'student') {
        await DB.STUDENTS.update(currentUser.studentId, { profilePicture: null });
      } else if (currentUser.role === 'lecturer' || currentUser.role === 'ta') {
        await DB.LEC.update(currentUser.id, { profilePicture: null });
      } else if (currentUser.role === 'superAdmin') {
        const sa = await DB.SA.get();
        if (sa) await DB.SA.set({ ...sa, profilePicture: null });
      } else if (currentUser.role === 'coAdmin') {
        await DB.CA.update(currentUser.id, { profilePicture: null });
      }
      
      await loadProfilePicture();
      await MODAL.success('Deleted', '✅ Profile picture has been removed.');
      MODAL.close();
      setTimeout(() => showProfile(), 500);
    } catch(err) {
      console.error('Delete error:', err);
      await MODAL.error('Error', err.message);
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
        if (AUTH.saveSession) AUTH.saveSession(currentUser);
      } else if (currentUser.role === 'lecturer' || currentUser.role === 'ta') {
        await DB.LEC.update(currentUser.id, { name: newName });
        currentUser.name = newName;
        if (AUTH.saveSession) AUTH.saveSession(currentUser);
      } else if (currentUser.role === 'superAdmin') {
        const sa = await DB.SA.get();
        if (sa) await DB.SA.set({ ...sa, name: newName });
        currentUser.name = newName;
        if (AUTH.saveSession) AUTH.saveSession(currentUser);
      } else if (currentUser.role === 'coAdmin') {
        await DB.CA.update(currentUser.id, { name: newName });
        currentUser.name = newName;
        if (AUTH.saveSession) AUTH.saveSession(currentUser);
      }
      
      updateTopbarName(newName);
      await MODAL.success('Profile Updated', '✅ Your profile has been updated successfully.');
      MODAL.close();
      setTimeout(() => showProfile(), 500);
    } catch(err) {
      console.error('Update error:', err);
      await MODAL.error('Update Failed', err.message);
    }
  }

  function updateTopbarName(name) {
    const tbName = document.querySelector('.tb-user');
    if (tbName) tbName.textContent = name;
    
    const sidebarName = document.querySelector('.sidebar-header h3');
    if (sidebarName) sidebarName.textContent = name;
  }

  async function showChangePassword() {
    const modalId = 'changepwd_modal_' + Date.now();
    
    const html = `
      <div id="${modalId}" style="max-height:300px; overflow-y:auto; padding-right:5px">
        <div class="field">
          <label class="fl">🔐 Current Password</label>
          <div class="pw"><input type="password" id="current-password" class="fi" placeholder="Enter current password"><button class="eye" onclick="UI.tgEye('current-password',this)">👁</button></div>
        </div>
        <div class="field">
          <label class="fl">🔑 New Password</label>
          <div class="pw"><input type="password" id="new-password" class="fi" placeholder="Min 8 characters"><button class="eye" onclick="UI.tgEye('new-password',this)">👁</button></div>
        </div>
        <div class="field">
          <label class="fl">✓ Confirm New Password</label>
          <div class="pw"><input type="password" id="confirm-password" class="fi" placeholder="Confirm new password"><button class="eye" onclick="UI.tgEye('confirm-password',this)">👁</button></div>
        </div>
      </div>
    `;
    
    const result = await MODAL.confirm('Change Password', html, { confirmLabel: 'Update Password', cancelLabel: 'Cancel', confirmCls: 'btn-ug' });
    if (!result) return;
    
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
    
    try {
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
    } catch(err) {
      console.error('Password change error:', err);
      await MODAL.error('Error', 'Could not verify current password.');
      return;
    }
    
    if (!isValid) {
      await MODAL.error('Error', 'Current password is incorrect.');
      return;
    }
    
    await MODAL.success('Password Updated', '✅ Your password has been changed successfully. Please log in again.');
    setTimeout(() => {
      if (AUTH.clearSession) AUTH.clearSession();
      if (typeof APP !== 'undefined') APP.goTo('landing');
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
    
    await MODAL.alert('🔐 Biometric Status', html, { icon: '', btnLabel: 'Close', width: '400px' });
  }

  // ==================== HELP SYSTEM ====================
  async function showHelp() {
    const userRole = currentUser?.role || 'guest';
    
    const roleGuides = {
      student: `
        <div class="inner-panel">
          <h3>🎓 Student Guide</h3>
          <ul>
            <li><strong>📊 Overview:</strong> View your attendance statistics, active sessions, and course progress filtered by academic year and semester.</li>
            <li><strong>📅 Calendar:</strong> Set up your weekly timetable with flexible time ranges. Get notifications 30 minutes before class starts.</li>
            <li><strong>📋 History:</strong> View all your past sessions with present/absent status. Filter by year, semester, course, and lecturer. Download Excel reports.</li>
            <li><strong>💬 Messages:</strong> Communicate with your lecturers and course mates. Receive announcements and participate in course discussions.</li>
            <li><strong>✅ Check-in:</strong> Use biometric (FaceID/TouchID) verification for secure attendance. Location validation ensures you're in the classroom.</li>
          </ul>
        </div>
      `,
      lecturer: `
        <div class="inner-panel">
          <h3>👨‍🏫 Lecturer Guide</h3>
          <ul>
            <li><strong>📚 My Courses:</strong> View courses filtered by academic year and semester. Start new sessions with location-based validation.</li>
            <li><strong>🟢 Active Sessions:</strong> Monitor live check-ins, download QR codes, and end sessions when complete.</li>
            <li><strong>📋 Attendance Records:</strong> View student attendance in table format (latest to oldest). Export Excel with all records.</li>
            <li><strong>📊 Reports:</strong> Generate comprehensive reports with attendance distribution charts. Export to Excel and PDF for board presentations.</li>
            <li><strong>📖 Course Management:</strong> Archive or restore courses by academic period.</li>
            <li><strong>👥 Teaching Assistants:</strong> Invite TAs, suspend/unsuspend, or end tenure.</li>
            <li><strong>🔐 Passkey Reset:</strong> Generate reset links for students who change devices.</li>
            <li><strong>💬 Messages:</strong> Send announcements to all students enrolled in your courses.</li>
          </ul>
        </div>
      `,
      superAdmin: `
        <div class="inner-panel">
          <h3>🔐 Administrator Guide</h3>
          <ul>
            <li><strong>🆔 Unique IDs:</strong> Generate and manage lecturer registration IDs.</li>
            <li><strong>👨‍🏫 Lecturers:</strong> View, suspend, or remove lecturers.</li>
            <li><strong>🤝 Co-Admins:</strong> Approve applications and add joint administrators (max 3).</li>
            <li><strong>📊 Sessions:</strong> View all sessions with filters (year, semester, department, lecturer, course) - sorted latest to oldest.</li>
            <li><strong>📚 Courses:</strong> View all courses grouped by year, semester, department, lecturer.</li>
            <li><strong>📈 Reports:</strong> Generate overall attendance reports with charts and PDF download. Set minimum attendance percentage requirement.</li>
            <li><strong>💾 Database:</strong> Create and download system backups.</li>
            <li><strong>⚙️ Settings:</strong> Delete data by year range or reset entire system (backups preserved).</li>
          </ul>
        </div>
      `,
      coAdmin: `
        <div class="inner-panel">
          <h3>🤝 Co-Administrator Guide</h3>
          <ul>
            <li><strong>🆔 Generate IDs:</strong> Create unique IDs for lecturers in your department only.</li>
            <li><strong>👨‍🏫 Lecturers:</strong> View, suspend, or remove lecturers in your department.</li>
            <li><strong>📊 Sessions:</strong> View department sessions filtered by year, semester, and lecturer - sorted latest to oldest.</li>
            <li><strong>📈 Reports:</strong> Generate department reports showing course/lecturer performance with overview of Excellent, Good, At Risk, and Critical students. Export to Excel and PDF.</li>
            <li><strong>📚 Courses:</strong> View all courses in your department filtered by year, semester, and lecturer.</li>
            <li><strong>💾 Backup:</strong> Create and download department data backups.</li>
          </ul>
        </div>
      `
    };
    
    const html = `
      <div style="max-height:500px; overflow-y:auto; padding-right:5px">
        ${roleGuides[userRole] || roleGuides.student}
        
        <div class="inner-panel">
          <h3>❓ Frequently Asked Questions</h3>
          <ul>
            <li><strong>Forgot password?</strong> Click "Forgot Password" on the login page to reset.</li>
            <li><strong>Biometric not working?</strong> Contact your lecturer for a passkey reset link.</li>
            <li><strong>Attendance not showing?</strong> Check that you're viewing the correct academic period.</li>
            <li><strong>Need to change device?</strong> Request a passkey reset from your lecturer.</li>
            <li><strong>Location validation failing?</strong> Ensure GPS is enabled and you're in the classroom.</li>
          </ul>
        </div>
        
        <div class="inner-panel">
          <h3>📧 Contact Support</h3>
          <p>📧 Email: <a href="mailto:support@ug.edu.gh">support@ug.edu.gh</a></p>
          <p>📞 Phone: +233 (0) 30 123 4567</p>
          <p>📱 WhatsApp: +233 (0) 50 123 4567</p>
          <p>🌐 Website: <a href="https://www.ug.edu.gh" target="_blank">www.ug.edu.gh</a></p>
        </div>
        
        <div class="inner-panel">
          <h3>⏰ Office Hours</h3>
          <p>Monday - Friday: 8:00 AM - 5:00 PM</p>
          <p>Saturday: 9:00 AM - 1:00 PM</p>
          <p>Sunday: Closed</p>
        </div>
      </div>
    `;
    
    await MODAL.alert(`❓ Help Center - ${getRoleName(userRole)} Guide`, html, { icon: '❓', btnLabel: 'Close', width: '550px' });
  }

  function addAccountButton() {
    // Account and Help buttons are now in the sidebar HTML
    console.log('[USER_ACCOUNT] Account buttons are in sidebar');
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

  function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return {
    init,
    showProfile,
    showHelp,
    showChangePassword,
    showBiometricStatus,
    updateProfile,
    uploadProfilePicture,
    deleteProfilePicture,
    addAccountButton,
    loadProfilePicture,
    getRoleName
  };
})();

// Make USER_ACCOUNT globally available
window.USER_ACCOUNT = USER_ACCOUNT;
