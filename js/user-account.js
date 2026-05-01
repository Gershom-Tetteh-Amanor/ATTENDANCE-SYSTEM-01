/* user-account.js — Universal User Account Management with Profile Pictures & Help System */
'use strict';

const USER_ACCOUNT = (() => {
  let currentUser = null;

  async function init() {
    currentUser = AUTH.getSession();
    if (!currentUser) return;
    await loadProfilePicture();
  }

  async function loadProfilePicture() {
    try {
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
    } catch(err) {
      console.error('Load profile picture error:', err);
    }
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
      return currentUser;
    }
  }

  // ==================== SHOW PROFILE ====================
  async function showProfile() {
    if (!currentUser) {
      await MODAL.error('Not Logged In', 'Please log in to access your profile.');
      return;
    }

    try {
      const userData = await getUserData();
      const profilePicture = userData?.profilePicture || null;
      const hasProfilePic = profilePicture && profilePicture.startsWith('data:image');
      
      const html = `
        <div style="max-height: 70vh; overflow-y: auto; padding-right: 10px;">
          <div style="text-align:center; margin-bottom:20px">
            <div style="position:relative; display:inline-block">
              <div id="profile-preview" style="width:100px; height:100px; border-radius:50%; background-size:cover; background-position:center; background-color:var(--surface2); display:flex; align-items:center; justify-content:center; font-size:40px; border:3px solid var(--ug); ${hasProfilePic ? `background-image:url('${profilePicture}');` : ''}">
                ${!hasProfilePic ? getAvatarIcon(currentUser?.role) : ''}
              </div>
              <button id="cameraBtn" style="position:absolute; bottom:0; right:0; background:var(--ug); color:white; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:16px; border:2px solid white; padding:0; z-index:10;">
                📷
              </button>
            </div>
            <div style="margin-top:10px;">
              <button id="deletePicBtn" class="btn btn-danger btn-sm" style="${!hasProfilePic ? 'display:none;' : ''} margin-right:5px;">🗑️ Delete Picture</button>
            </div>
            <h3 style="margin-top:10px;">${escapeHtml(userData.name || currentUser.name)}</h3>
            <p style="font-size:12px">${escapeHtml(currentUser.email)} · ${getRoleName(currentUser.role)}</p>
          </div>
          <div>
            <div class="field">
              <label>👤 Full Name</label>
              <input type="text" id="profile-name" class="fi" value="${escapeHtml(userData.name || currentUser.name)}">
            </div>
            <div class="field">
              <label>📧 Email</label>
              <input type="email" class="fi" value="${escapeHtml(currentUser.email)}" readonly>
            </div>
            <div class="field">
              <label>🎭 Role</label>
              <input type="text" class="fi" value="${getRoleName(currentUser.role)}" readonly>
            </div>
            ${currentUser.department ? `<div class="field"><label>🏛️ Department</label><input type="text" class="fi" value="${escapeHtml(currentUser.department)}" readonly></div>` : ''}
            <div class="field">
              <label>📅 Member Since</label>
              <input type="text" class="fi" value="${new Date(userData.createdAt || currentUser.createdAt || Date.now()).toLocaleDateString()}" readonly>
            </div>
            <hr>
            <div style="display:flex; gap:10px; flex-wrap:wrap">
              <button id="saveProfileBtn" class="btn btn-ug" style="flex:1">💾 Save Changes</button>
              <button id="changePwdBtn" class="btn btn-secondary" style="flex:1">🔑 Change Password</button>
              ${currentUser.role === 'student' ? `<button id="bioStatusBtn" class="btn btn-outline" style="flex:1">🔐 Biometric Status</button>` : ''}
            </div>
          </div>
        </div>
      `;
      
      await MODAL.alert('👤 My Profile', html, { icon: '', btnLabel: 'Close', width: '500px' });
      
      // Simple direct event binding without setTimeout
      bindProfileEvents();
      
    } catch(err) {
      console.error('Show profile error:', err);
      await MODAL.error('Error', 'Could not load profile.');
    }
  }

  function bindProfileEvents() {
    // Camera button
    const cameraBtn = document.getElementById('cameraBtn');
    if (cameraBtn) {
      cameraBtn.onclick = function(e) {
        e.stopPropagation();
        showPictureOptions();
        return false;
      };
    }
    
    // Delete button
    const deleteBtn = document.getElementById('deletePicBtn');
    if (deleteBtn) {
      deleteBtn.onclick = function() {
        deleteProfilePicture();
      };
    }
    
    // Save button
    const saveBtn = document.getElementById('saveProfileBtn');
    if (saveBtn) {
      saveBtn.onclick = function() {
        updateProfile();
      };
    }
    
    // Change password button
    const changePwdBtn = document.getElementById('changePwdBtn');
    if (changePwdBtn) {
      changePwdBtn.onclick = function() {
        MODAL.close();
        setTimeout(function() { showChangePassword(); }, 100);
      };
    }
    
    // Biometric status button
    const bioBtn = document.getElementById('bioStatusBtn');
    if (bioBtn) {
      bioBtn.onclick = function() {
        MODAL.close();
        setTimeout(function() { showBiometricStatus(); }, 100);
      };
    }
  }

  // Show options menu for profile picture
  async function showPictureOptions() {
    const profilePreview = document.getElementById('profile-preview');
    const hasProfilePic = profilePreview && profilePreview.style.backgroundImage && profilePreview.style.backgroundImage !== 'none' && profilePreview.style.backgroundImage !== '';
    
    const buttons = [];
    buttons.push('<button id="uploadOptBtn" class="btn btn-ug" style="width:100%; margin-bottom:10px;">📸 Upload Picture</button>');
    if (hasProfilePic) {
      buttons.push('<button id="removeOptBtn" class="btn btn-danger" style="width:100%;">🗑️ Remove Picture</button>');
    }
    
    const optionsHtml = `<div style="display:flex; flex-direction:column; gap:10px;">${buttons.join('')}</div>`;
    
    await MODAL.alert('Profile Picture', optionsHtml, { icon: '📷', btnLabel: 'Cancel', width: '300px' });
    
    // Bind option buttons
    const uploadOpt = document.getElementById('uploadOptBtn');
    if (uploadOpt) {
      uploadOpt.onclick = function() {
        MODAL.close();
        setTimeout(function() { triggerFileUpload(); }, 100);
      };
    }
    
    const removeOpt = document.getElementById('removeOptBtn');
    if (removeOpt) {
      removeOpt.onclick = function() {
        MODAL.close();
        setTimeout(function() { deleteProfilePicture(); }, 100);
      };
    }
  }

  function triggerFileUpload() {
    // Create a temporary file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/jpeg,image/png,image/jpg';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    
    fileInput.onchange = function(e) {
      const file = e.target.files[0];
      if (file) {
        uploadProfilePicture(file, fileInput);
      } else {
        document.body.removeChild(fileInput);
      }
    };
    
    fileInput.click();
  }

  async function uploadProfilePicture(file, fileInput) {
    if (!file) return;
    
    if (!file.type.match('image.*')) {
      await MODAL.alert('Invalid File', 'Please select an image file (JPEG, PNG).');
      if (fileInput && fileInput.parentNode) fileInput.parentNode.removeChild(fileInput);
      return;
    }
    
    if (file.size > 2 * 1024 * 1024) {
      await MODAL.alert('File Too Large', 'Profile picture must be less than 2MB.');
      if (fileInput && fileInput.parentNode) fileInput.parentNode.removeChild(fileInput);
      return;
    }
    
    const confirmUpload = await MODAL.confirm(
      'Upload Profile Picture',
      `Are you sure you want to upload "${file.name}" as your profile picture?`,
      { confirmLabel: 'Yes, Upload', cancelLabel: 'Cancel' }
    );
    
    if (!confirmUpload) {
      if (fileInput && fileInput.parentNode) fileInput.parentNode.removeChild(fileInput);
      return;
    }
    
    MODAL.loading('Uploading profile picture...');
    
    const reader = new FileReader();
    reader.onload = async function(e) {
      const imageData = e.target.result;
      
      try {
        if (currentUser.role === 'student') {
          await DB.STUDENTS.update(currentUser.studentId, { profilePicture: imageData });
        } else if (currentUser.role === 'lecturer' || currentUser.role === 'ta') {
          await DB.LEC.update(currentUser.id, { profilePicture: imageData });
        } else if (currentUser.role === 'superAdmin') {
          const sa = await DB.SA.get();
          if (sa) {
            sa.profilePicture = imageData;
            await DB.SA.set(sa);
          }
        } else if (currentUser.role === 'coAdmin') {
          await DB.CA.update(currentUser.id, { profilePicture: imageData });
        }
        
        if (currentUser) currentUser.profilePicture = imageData;
        await loadProfilePicture();
        
        MODAL.close();
        await MODAL.success('Success', 'Profile picture updated successfully.');
        
        setTimeout(function() {
          MODAL.close();
          showProfile();
        }, 1000);
        
      } catch(err) {
        console.error('Upload error:', err);
        MODAL.close();
        await MODAL.error('Error', err.message || 'Failed to upload profile picture.');
      }
      
      if (fileInput && fileInput.parentNode) fileInput.parentNode.removeChild(fileInput);
    };
    
    reader.onerror = async function() {
      MODAL.close();
      await MODAL.error('Error', 'Failed to read the image file.');
      if (fileInput && fileInput.parentNode) fileInput.parentNode.removeChild(fileInput);
    };
    
    reader.readAsDataURL(file);
  }

  async function deleteProfilePicture() {
    const confirmDelete = await MODAL.confirm(
      'Delete Profile Picture', 
      'Are you sure you want to delete your profile picture? This action cannot be undone.',
      { confirmLabel: 'Yes, Delete', cancelLabel: 'Cancel', confirmCls: 'btn-danger' }
    );
    
    if (!confirmDelete) return;
    
    MODAL.loading('Deleting profile picture...');
    
    try {
      if (currentUser.role === 'student') {
        await DB.STUDENTS.update(currentUser.studentId, { profilePicture: null });
      } else if (currentUser.role === 'lecturer' || currentUser.role === 'ta') {
        await DB.LEC.update(currentUser.id, { profilePicture: null });
      } else if (currentUser.role === 'superAdmin') {
        const sa = await DB.SA.get();
        if (sa) {
          sa.profilePicture = null;
          await DB.SA.set(sa);
        }
      } else if (currentUser.role === 'coAdmin') {
        await DB.CA.update(currentUser.id, { profilePicture: null });
      }
      
      if (currentUser) currentUser.profilePicture = null;
      
      const avatarIcon = getAvatarIcon(currentUser?.role);
      document.querySelectorAll('.user-avatar').forEach(function(avatar) {
        avatar.style.backgroundImage = '';
        avatar.style.backgroundColor = '';
        avatar.textContent = avatarIcon;
      });
      
      const profilePreview = document.getElementById('profile-preview');
      if (profilePreview) {
        profilePreview.style.backgroundImage = '';
        profilePreview.textContent = avatarIcon;
      }
      
      const deleteBtn = document.getElementById('deletePicBtn');
      if (deleteBtn) deleteBtn.style.display = 'none';
      
      await loadProfilePicture();
      
      MODAL.close();
      await MODAL.success('Deleted', 'Profile picture removed successfully.');
      
      setTimeout(function() {
        MODAL.close();
        showProfile();
      }, 1000);
      
    } catch(err) {
      console.error('Delete error:', err);
      MODAL.close();
      await MODAL.error('Error', err.message || 'Failed to delete profile picture.');
    }
  }

  async function updateProfile() {
    const newName = document.getElementById('profile-name')?.value.trim();
    if (!newName) {
      await MODAL.alert('Error', 'Name cannot be empty.');
      return;
    }
    
    const confirmUpdate = await MODAL.confirm(
      'Update Profile',
      `Are you sure you want to change your name to "${escapeHtml(newName)}"?`,
      { confirmLabel: 'Yes, Update', cancelLabel: 'Cancel' }
    );
    
    if (!confirmUpdate) return;
    
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
        if (sa) {
          sa.name = newName;
          await DB.SA.set(sa);
        }
        currentUser.name = newName;
        AUTH.saveSession(currentUser);
      } else if (currentUser.role === 'coAdmin') {
        await DB.CA.update(currentUser.id, { name: newName });
        currentUser.name = newName;
        AUTH.saveSession(currentUser);
      }
      
      updateTopbarName(newName);
      await MODAL.success('Profile Updated', 'Your profile has been updated successfully.');
      
      setTimeout(function() {
        MODAL.close();
        showProfile();
      }, 1000);
      
    } catch(err) {
      console.error('Update error:', err);
      await MODAL.error('Update Failed', err.message || 'Could not update profile.');
    }
  }

  function updateTopbarName(name) {
    const tbName = document.querySelector('.tb-user');
    if (tbName) tbName.textContent = name;
    const sidebarName = document.querySelector('.sidebar-header h3');
    if (sidebarName) sidebarName.textContent = name;
  }

  async function showChangePassword() {
    const html = `
      <div style="max-height: 60vh; overflow-y: auto; padding-right: 10px;">
        <div class="field">
          <label>🔐 Current Password</label>
          <div class="pw"><input type="password" id="current-password" class="fi" placeholder="Enter current password"><button class="eye" onclick="UI.tgEye('current-password',this)">👁</button></div>
        </div>
        <div class="field">
          <label>🔑 New Password</label>
          <div class="pw"><input type="password" id="new-password" class="fi" placeholder="Min 8 characters"><button class="eye" onclick="UI.tgEye('new-password',this)">👁</button></div>
        </div>
        <div class="field">
          <label>✓ Confirm New Password</label>
          <div class="pw"><input type="password" id="confirm-password" class="fi" placeholder="Confirm new password"><button class="eye" onclick="UI.tgEye('confirm-password',this)">👁</button></div>
        </div>
      </div>
    `;
    
    const confirm = await MODAL.confirm('Change Password', html, { confirmLabel: 'Update Password', cancelLabel: 'Cancel' });
    if (!confirm) return;
    
    const currentPass = document.getElementById('current-password')?.value;
    const newPass = document.getElementById('new-password')?.value;
    const confirmPass = document.getElementById('confirm-password')?.value;
    
    if (!currentPass || !newPass) {
      await MODAL.alert('Error', 'Please fill all fields.');
      return;
    }
    if (newPass.length < 8) {
      await MODAL.alert('Error', 'New password must be at least 8 characters.');
      return;
    }
    if (newPass !== confirmPass) {
      await MODAL.alert('Error', 'New passwords do not match.');
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
      await MODAL.alert('Error', 'Could not verify current password.');
      return;
    }
    
    if (!isValid) {
      await MODAL.alert('Error', 'Current password is incorrect.');
      return;
    }
    
    await MODAL.success('Password Updated', 'Your password has been changed. Please log in again.');
    setTimeout(function() {
      AUTH.clearSession();
      if (typeof APP !== 'undefined') APP.goTo('landing');
    }, 2000);
  }

  async function showBiometricStatus() {
    try {
      const student = await DB.STUDENTS.get(currentUser.studentId);
      const hasBiometric = !!(student?.webAuthnCredentialId);
      const lastUse = student?.lastBiometricUse ? new Date(student.lastBiometricUse).toLocaleString() : 'Never';
      const deviceCount = student?.devices ? Object.keys(student.devices).length : 0;
      
      const html = `
        <div style="text-align:center;">
          <div style="font-size:48px;">${hasBiometric ? '✅' : '⚠️'}</div>
          <p><strong>Biometric Status:</strong> ${hasBiometric ? 'Registered' : 'Not Registered'}</p>
          ${hasBiometric ? `<p><strong>Last Used:</strong> ${lastUse}</p>` : ''}
          <p><strong>Registered Devices:</strong> ${deviceCount}</p>
          <hr>
          <p class="sub">Biometric is used for secure check-ins.</p>
          ${!hasBiometric ? `<p class="note">Please contact your lecturer to set up biometric.</p>` : ''}
        </div>
      `;
      
      await MODAL.alert('Biometric Status', html, { icon: '', btnLabel: 'Close', width: '400px' });
    } catch(err) {
      console.error('Biometric status error:', err);
      await MODAL.alert('Error', 'Could not load biometric status.');
    }
  }

  async function showHelp() {
    const html = `
      <div style="max-height: 70vh; overflow-y: auto; padding-right: 10px;">
        <div class="inner-panel">
          <h3>📱 Quick Guide</h3>
          <ul>
            <li><strong>Check-in:</strong> Scan QR code, verify with FaceID/TouchID</li>
            <li><strong>View History:</strong> Go to History tab to see all check-ins</li>
            <li><strong>Calendar:</strong> Set up your timetable for reminders</li>
            <li><strong>Messages:</strong> Communicate with lecturers</li>
          </ul>
        </div>
        <div class="inner-panel">
          <h3>❓ FAQ</h3>
          <ul>
            <li><strong>Forgot password?</strong> Use "Forgot Password" on login page</li>
            <li><strong>Biometric not working?</strong> Request reset from lecturer</li>
            <li><strong>Location error?</strong> Enable GPS and ensure you're in class</li>
          </ul>
        </div>
        <div class="inner-panel">
          <h3>📧 Contact</h3>
          <p>Email: support@ug.edu.gh</p>
          <p>Phone: +233 30 123 4567</p>
        </div>
      </div>
    `;
    
    await MODAL.alert('Help Center', html, { icon: '❓', btnLabel: 'Close', width: '550px' });
  }

  function addAccountButton() {}

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
    deleteProfilePicture,
    addAccountButton,
    loadProfilePicture,
    getRoleName
  };
})();
