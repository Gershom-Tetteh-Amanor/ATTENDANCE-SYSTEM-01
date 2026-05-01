/* user-account.js — Universal User Account Management (FIXED with onclick) */
'use strict';

const USER_ACCOUNT = (() => {
  let currentUser = null;

  async function init() {
    currentUser = AUTH.getSession();
    if (!currentUser) return;
    console.log('[USER_ACCOUNT] Initialized for user:', currentUser.role);
    await loadProfilePicture();
  }

  async function loadProfilePicture() {
    const userData = await getUserData();
    const profilePicture = userData?.profilePicture || null;
    
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
      if (!currentUser) return null;
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
    const defaultAvatar = getAvatarIcon(currentUser?.role);
    
    const html = `
      <div class="profile-container" style="text-align:center; margin-bottom:20px">
        <!-- Profile Picture Section -->
        <div style="position:relative; display:inline-block; margin-bottom:15px">
          <div id="profile-preview" style="width:120px; height:120px; border-radius:50%; background-size:cover; background-position:center; background-color:var(--surface2); display:flex; align-items:center; justify-content:center; font-size:48px; border:3px solid var(--ug); ${hasProfilePic ? `background-image:url('${profilePicture}');` : ''}">
            ${!hasProfilePic ? defaultAvatar : ''}
          </div>
        </div>
        
        <!-- Camera/Upload Button Below Picture -->
        <div style="margin-bottom: 15px;">
          <button type="button" class="btn btn-outline btn-sm" style="display: inline-flex; align-items: center; gap: 5px; width: auto; padding: 6px 12px;" onclick="window.USER_ACCOUNT_PROFILE.uploadClick()">
            📷 Change Picture
          </button>
          ${hasProfilePic ? `<button type="button" class="btn btn-danger btn-sm" style="display: inline-flex; align-items: center; gap: 5px; width: auto; padding: 6px 12px; margin-left: 8px;" onclick="window.USER_ACCOUNT_PROFILE.removeClick()">
            🗑️ Remove
          </button>` : ''}
          <input type="file" id="profile-file-input" accept="image/jpeg,image/png,image/jpg" style="display:none">
        </div>
        
        <h3 style="margin-top:5px;">${escapeHtml(userData.name || currentUser.name)}</h3>
        <p class="sub" style="font-size:12px">${escapeHtml(currentUser.email)} · ${getRoleName(currentUser.role)}</p>
        
        <hr style="margin: 15px 0;">
        
        <!-- Form Fields -->
        <div style="max-height:350px; overflow-y:auto; padding-right:5px; text-align:left">
          <div class="field">
            <label class="fl">👤 Full Name</label>
            <input type="text" id="profile-name-input" class="fi" value="${escapeHtml(userData.name || currentUser.name)}">
          </div>
          <div class="field">
            <label class="fl">📧 Email</label>
            <input type="email" class="fi" value="${escapeHtml(currentUser.email)}" readonly>
            <p class="note" style="font-size:10px">Email cannot be changed. Contact admin for assistance.</p>
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
          
          <!-- Action Buttons -->
          <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-bottom:10px">
            <button type="button" class="btn btn-ug" style="flex:1; min-width:120px;" onclick="window.USER_ACCOUNT_PROFILE.saveClick()">💾 Save Changes</button>
            <button type="button" class="btn btn-secondary" style="flex:1; min-width:120px;" onclick="window.USER_ACCOUNT_PROFILE.passwordClick()">🔑 Change Password</button>
          </div>
          ${currentUser.role === 'student' ? `<div style="display:flex; justify-content:center; margin-top:10px"><button type="button" class="btn btn-outline" style="width:auto; padding:8px 20px;" onclick="window.USER_ACCOUNT_PROFILE.biometricClick()">🔐 Biometric Status</button></div>` : ''}
        </div>
      </div>
    `;
    
    await MODAL.alert('👤 My Profile', html, { icon: '', btnLabel: 'Close', width: '500px' });
    
    // Setup global handler for this modal instance
    setupGlobalHandlers();
  }
  
  function setupGlobalHandlers() {
    // Create global handler object
    window.USER_ACCOUNT_PROFILE = {
      uploadClick: function() {
        console.log('[USER_ACCOUNT] Upload button clicked');
        const fileInput = document.getElementById('profile-file-input');
        if (fileInput) {
          fileInput.click();
          fileInput.onchange = async function(e) {
            if (e.target.files && e.target.files[0]) {
              await USER_ACCOUNT.uploadProfilePicture(e.target.files[0]);
            }
            fileInput.value = '';
          };
        } else {
          console.error('[USER_ACCOUNT] File input not found');
        }
      },
      
      removeClick: async function() {
        console.log('[USER_ACCOUNT] Remove button clicked');
        await USER_ACCOUNT.deleteProfilePicture();
      },
      
      saveClick: async function() {
        console.log('[USER_ACCOUNT] Save button clicked');
        await USER_ACCOUNT.updateProfile();
      },
      
      passwordClick: function() {
        console.log('[USER_ACCOUNT] Change Password button clicked');
        MODAL.close();
        setTimeout(() => USER_ACCOUNT.showChangePassword(), 300);
      },
      
      biometricClick: function() {
        console.log('[USER_ACCOUNT] Biometric button clicked');
        MODAL.close();
        setTimeout(() => USER_ACCOUNT.showBiometricStatus(), 300);
      }
    };
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
    
    MODAL.loading('Uploading profile picture...');
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const imageData = e.target.result;
      
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
        
        await loadProfilePicture();
        MODAL.close();
        await MODAL.success('Success', '✅ Profile picture updated successfully.');
        
        setTimeout(() => {
          MODAL.close();
          showProfile();
        }, 1000);
        
      } catch(err) {
        console.error('[USER_ACCOUNT] Upload error:', err);
        MODAL.close();
        await MODAL.error('Error', err.message || 'Failed to upload.');
      }
    };
    reader.readAsDataURL(file);
  }

  async function deleteProfilePicture() {
    const confirmed = await MODAL.confirm('Delete Picture', 'Are you sure you want to delete your profile picture?', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    
    MODAL.loading('Removing profile picture...');
    
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
      MODAL.close();
      await MODAL.success('Deleted', '✅ Profile picture has been removed. Default avatar restored.');
      
      setTimeout(() => {
        MODAL.close();
        showProfile();
      }, 1000);
      
    } catch(err) {
      console.error('[USER_ACCOUNT] Delete error:', err);
      MODAL.close();
      await MODAL.error('Error', err.message || 'Failed to delete.');
    }
  }

  async function updateProfile() {
    const newName = document.getElementById('profile-name-input')?.value.trim();
    if (!newName) {
      await MODAL.error('Error', 'Name cannot be empty.');
      return;
    }
    
    const confirmed = await MODAL.confirm('Update Name', `Change name to "${escapeHtml(newName)}"?`, { confirmLabel: 'Yes, Update' });
    if (!confirmed) return;
    
    MODAL.loading('Updating profile...');
    
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
      MODAL.close();
      await MODAL.success('Profile Updated', '✅ Your profile has been updated successfully.');
      
      setTimeout(() => {
        MODAL.close();
        showProfile();
      }, 1000);
      
    } catch(err) {
      console.error('[USER_ACCOUNT] Update error:', err);
      MODAL.close();
      await MODAL.error('Update Failed', err.message);
    }
  }

  function updateTopbarName(name) {
    const tbName = document.querySelector('.tb-user');
    if (tbName) tbName.textContent = name;
    
    const lecturerSidebar = document.querySelector('#view-lecturer .sidebar-header h3');
    if (lecturerSidebar) lecturerSidebar.textContent = name;
    
    const sadmSidebar = document.querySelector('#view-sadmin .sidebar-header h3');
    if (sadmSidebar) sadmSidebar.textContent = name;
    
    const cadmSidebar = document.querySelector('#view-cadmin .sidebar-header h3');
    if (cadmSidebar) cadmSidebar.textContent = name;
    
    const studentSidebar = document.getElementById('student-sidebar-name');
    if (studentSidebar) studentSidebar.textContent = name;
  }

  async function showChangePassword() {
    const html = `
      <div class="changepwd-container" style="max-height:350px; overflow-y:auto; padding-right:5px">
        <div class="field">
          <label class="fl">🔐 Current Password</label>
          <div class="pw"><input type="password" id="current-password" class="fi" placeholder="Enter current password"><button class="eye" type="button" onclick="UI.tgEye('current-password',this)">👁</button></div>
        </div>
        <div class="field">
          <label class="fl">🔑 New Password</label>
          <div class="pw"><input type="password" id="new-password" class="fi" placeholder="Min 8 characters"><button class="eye" type="button" onclick="UI.tgEye('new-password',this)">👁</button></div>
        </div>
        <div class="field">
          <label class="fl">✓ Confirm New Password</label>
          <div class="pw"><input type="password" id="confirm-password" class="fi" placeholder="Confirm new password"><button class="eye" type="button" onclick="UI.tgEye('confirm-password',this)">👁</button></div>
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
    
    MODAL.loading('Verifying password...');
    
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
      console.error('[USER_ACCOUNT] Password change error:', err);
      MODAL.close();
      await MODAL.error('Error', 'Could not verify current password.');
      return;
    }
    
    if (!isValid) {
      MODAL.close();
      await MODAL.error('Error', 'Current password is incorrect.');
      return;
    }
    
    MODAL.close();
    await MODAL.success('Password Updated', '✅ Your password has been changed successfully. Please log in again with your new password.');
    
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
        <p class="sub" style="font-size:12px">Biometric (FaceID/TouchID/Windows Hello) is used for secure check-ins.</p>
        ${!hasBiometric ? `<p class="note" style="margin-top:10px">Please contact your lecturer to set up biometric for your account.</p>` : ''}
      </div>
    `;
    
    await MODAL.alert('🔐 Biometric Status', html, { icon: '', btnLabel: 'Close', width: '400px' });
  }

  async function showHelp() {
    const userRole = currentUser?.role || 'guest';
    
    const roleGuides = {
      student: `
        <div class="inner-panel">
          <h3>🎓 Student Guide</h3>
          <ul>
            <li><strong>📊 Overview:</strong> View your attendance statistics, active sessions, and course progress filtered by academic year and semester.</li>
            <li><strong>📅 Calendar:</strong> Set up your weekly timetable and get notifications 30 minutes before class.</li>
            <li><strong>📋 History:</strong> View all past sessions with present/absent status. Download Excel reports.</li>
            <li><strong>💬 Messages:</strong> Communicate with lecturers and course mates.</li>
            <li><strong>✅ Check-in:</strong> Use biometric verification for secure attendance.</li>
          </ul>
        </div>
      `,
      lecturer: `
        <div class="inner-panel">
          <h3>👨‍🏫 Lecturer Guide</h3>
          <ul>
            <li><strong>📚 My Courses:</strong> View courses by academic year/semester. Start sessions with location validation.</li>
            <li><strong>🟢 Active Sessions:</strong> Monitor live check-ins, download QR codes, end sessions.</li>
            <li><strong>📋 Attendance Records:</strong> View student attendance, export Excel.</li>
            <li><strong>📊 Reports:</strong> Generate reports with charts, export to Excel/PDF.</li>
            <li><strong>👥 Teaching Assistants:</strong> Invite and manage TAs.</li>
            <li><strong>🔐 Passkey Reset:</strong> Generate reset links for students with new devices.</li>
          </ul>
        </div>
      `,
      superAdmin: `
        <div class="inner-panel">
          <h3>🔐 Administrator Guide</h3>
          <ul>
            <li><strong>🆔 Unique IDs:</strong> Generate lecturer registration IDs (emailed automatically).</li>
            <li><strong>👨‍🏫 Lecturers:</strong> View, suspend, remove lecturers.</li>
            <li><strong>🤝 Co-Admins:</strong> Approve applications, add joint admins (max 3).</li>
            <li><strong>📊 Sessions:</strong> View all sessions with filters, export Excel.</li>
            <li><strong>📈 Reports:</strong> Generate overall reports with charts, set min attendance.</li>
            <li><strong>💾 Database:</strong> Create and download system backups.</li>
          </ul>
        </div>
      `,
      coAdmin: `
        <div class="inner-panel">
          <h3>🤝 Co-Administrator Guide</h3>
          <ul>
            <li><strong>🆔 Generate IDs:</strong> Create IDs for lecturers in your department.</li>
            <li><strong>👨‍🏫 Lecturers:</strong> Manage lecturers in your department.</li>
            <li><strong>📊 Sessions:</strong> View department sessions with filters.</li>
            <li><strong>📈 Reports:</strong> Generate department reports, export Excel/PDF.</li>
            <li><strong>💾 Backup:</strong> Create department data backups.</li>
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
            <li><strong>Forgot password?</strong> Click "Forgot Password" on the login page.</li>
            <li><strong>Biometric not working?</strong> Contact your lecturer for a passkey reset link.</li>
            <li><strong>Location validation failing?</strong> Enable GPS and ensure you're in the classroom.</li>
          </ul>
        </div>
        
        <div class="inner-panel">
          <h3>📧 Contact Support</h3>
          <p>📧 Email: <a href="mailto:support@ug.edu.gh">support@ug.edu.gh</a></p>
          <p>📞 Phone: +233 (0) 30 123 4567</p>
        </div>
      </div>
    `;
    
    await MODAL.alert(`❓ Help Center - ${getRoleName(userRole)} Guide`, html, { icon: '❓', btnLabel: 'Close', width: '550px' });
  }

  function addAccountButton() {
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

// Also create a separate global object for profile button handlers
window.USER_ACCOUNT_PROFILE = {
  uploadClick: function() {
    console.log('[GLOBAL] Upload button clicked');
    const fileInput = document.getElementById('profile-file-input');
    if (fileInput) {
      fileInput.click();
      fileInput.onchange = function(e) {
        if (e.target.files && e.target.files[0]) {
          USER_ACCOUNT.uploadProfilePicture(e.target.files[0]);
        }
        fileInput.value = '';
      };
    }
  },
  removeClick: function() {
    console.log('[GLOBAL] Remove button clicked');
    USER_ACCOUNT.deleteProfilePicture();
  },
  saveClick: function() {
    console.log('[GLOBAL] Save button clicked');
    USER_ACCOUNT.updateProfile();
  },
  passwordClick: function() {
    console.log('[GLOBAL] Change Password button clicked');
    MODAL.close();
    setTimeout(() => USER_ACCOUNT.showChangePassword(), 300);
  },
  biometricClick: function() {
    console.log('[GLOBAL] Biometric button clicked');
    MODAL.close();
    setTimeout(() => USER_ACCOUNT.showBiometricStatus(), 300);
  }
};
