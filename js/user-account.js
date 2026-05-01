/* user-account.js — Universal User Account Management with Profile Pictures & Help System (FULLY FIXED) */
'use strict';

const USER_ACCOUNT = (() => {
  let currentUser = null;
  let currentModal = null;

  async function init() {
    currentUser = AUTH.getSession();
    if (!currentUser) {
      console.log('[USER_ACCOUNT] No user session found');
      return;
    }
    console.log('[USER_ACCOUNT] Initialized for user:', currentUser.role, currentUser.id || currentUser.studentId);
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
      console.error('[USER_ACCOUNT] Load profile picture error:', err);
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
      if (!currentUser) return null;
      
      if (currentUser.role === 'student') {
        return await DB.STUDENTS.get(currentUser.studentId) || currentUser;
      } else if (currentUser.role === 'lecturer' || currentUser.role === 'ta') {
        return await DB.LEC.get(currentUser.id) || currentUser;
      } else if (currentUser.role === 'superAdmin') {
        const sa = await DB.SA.get();
        return sa || currentUser;
      } else if (currentUser.role === 'coAdmin') {
        return await DB.CA.get(currentUser.id) || currentUser;
      }
      return currentUser;
    } catch(e) {
      console.error('[USER_ACCOUNT] Get user data error:', e);
      return currentUser;
    }
  }

  async function updateUserData(updateFields) {
    if (!currentUser) throw new Error('No user logged in');
    
    console.log('[USER_ACCOUNT] Updating user data:', updateFields);
    
    if (currentUser.role === 'student') {
      await DB.STUDENTS.update(currentUser.studentId, updateFields);
      const updatedStudent = await DB.STUDENTS.get(currentUser.studentId);
      if (updatedStudent) {
        Object.assign(currentUser, updatedStudent);
        if (typeof AUTH !== 'undefined' && AUTH.saveSession) {
          AUTH.saveSession(currentUser);
        }
      }
    } else if (currentUser.role === 'lecturer' || currentUser.role === 'ta') {
      await DB.LEC.update(currentUser.id, updateFields);
      const updatedLec = await DB.LEC.get(currentUser.id);
      if (updatedLec) {
        Object.assign(currentUser, updatedLec);
        if (typeof AUTH !== 'undefined' && AUTH.saveSession) {
          AUTH.saveSession(currentUser);
        }
      }
    } else if (currentUser.role === 'superAdmin') {
      const sa = await DB.SA.get();
      if (sa) {
        Object.assign(sa, updateFields);
        await DB.SA.set(sa);
        Object.assign(currentUser, sa);
        if (typeof AUTH !== 'undefined' && AUTH.saveSession) {
          AUTH.saveSession(currentUser);
        }
      }
    } else if (currentUser.role === 'coAdmin') {
      await DB.CA.update(currentUser.id, updateFields);
      const updatedCA = await DB.CA.get(currentUser.id);
      if (updatedCA) {
        Object.assign(currentUser, updatedCA);
        if (typeof AUTH !== 'undefined' && AUTH.saveSession) {
          AUTH.saveSession(currentUser);
        }
      }
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
      
      // Create a unique ID for this modal instance
      const modalId = 'profile_modal_' + Date.now();
      
      const html = `
        <div id="${modalId}" style="max-height: 70vh; overflow-y: auto; padding-right: 10px;">
          <div style="text-align:center; margin-bottom:20px">
            <div style="position:relative; display:inline-block">
              <div id="profile-preview" style="width:100px; height:100px; border-radius:50%; background-size:cover; background-position:center; background-color:var(--surface2); display:flex; align-items:center; justify-content:center; font-size:40px; border:3px solid var(--ug); ${hasProfilePic ? `background-image:url('${profilePicture}');` : ''}">
                ${!hasProfilePic ? getAvatarIcon(currentUser?.role) : ''}
              </div>
            </div>
            <div style="margin-top:10px; display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
              <button type="button" class="profile-upload-btn" style="background:var(--ug); color:white; border:none; border-radius:6px; padding:6px 12px; cursor:pointer;">📸 Upload Picture</button>
              <button type="button" class="profile-remove-btn" style="background:transparent; color:var(--danger); border:1px solid var(--danger); border-radius:6px; padding:6px 12px; cursor:pointer; ${!hasProfilePic ? 'display:none;' : ''}">🗑️ Remove Picture</button>
            </div>
            <h3 style="margin-top:10px;">${escapeHtml(userData.name || currentUser.name)}</h3>
            <p style="font-size:12px">${escapeHtml(currentUser.email)} · ${getRoleName(currentUser.role)}</p>
          </div>
          <div>
            <div class="field">
              <label>👤 Full Name</label>
              <input type="text" id="profile-name-input" class="fi" value="${escapeHtml(userData.name || currentUser.name)}">
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
              <input type="text" class="fi" value="${userData.createdAt ? new Date(userData.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}" readonly>
            </div>
            <hr>
            <div style="display:flex; gap:10px; flex-wrap:wrap">
              <button type="button" class="profile-save-btn" style="flex:1; background:var(--ug); color:white; border:none; border-radius:6px; padding:10px; cursor:pointer;">💾 Save Changes</button>
              <button type="button" class="profile-changepwd-btn" style="flex:1; background:var(--surface2); border:1px solid var(--border); border-radius:6px; padding:10px; cursor:pointer;">🔑 Change Password</button>
              ${currentUser.role === 'student' ? `<button type="button" class="profile-biometric-btn" style="flex:1; background:transparent; border:1px solid var(--ug); border-radius:6px; padding:10px; cursor:pointer;">🔐 Biometric Status</button>` : ''}
            </div>
          </div>
        </div>
      `;
      
      await MODAL.alert('👤 My Profile', html, { icon: '', btnLabel: 'Close', width: '500px' });
      
      // Bind events after a short delay to ensure DOM is ready
      setTimeout(() => {
        attachProfileEvents(modalId);
      }, 150);
      
    } catch(err) {
      console.error('[USER_ACCOUNT] Show profile error:', err);
      await MODAL.error('Error', 'Could not load profile.');
    }
  }

  function attachProfileEvents(modalId) {
    console.log('[USER_ACCOUNT] Attaching profile events');
    
    // Find buttons within the modal
    const modalContainer = document.getElementById(modalId);
    if (!modalContainer) {
      console.log('[USER_ACCOUNT] Modal container not found, trying global selectors');
      attachGlobalProfileEvents();
      return;
    }
    
    // Upload button
    const uploadBtn = modalContainer.querySelector('.profile-upload-btn');
    if (uploadBtn) {
      uploadBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[USER_ACCOUNT] Upload button clicked');
        uploadProfilePicture();
      };
    }
    
    // Remove button
    const removeBtn = modalContainer.querySelector('.profile-remove-btn');
    if (removeBtn) {
      removeBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[USER_ACCOUNT] Remove button clicked');
        deleteProfilePicture();
      };
    }
    
    // Save button
    const saveBtn = modalContainer.querySelector('.profile-save-btn');
    if (saveBtn) {
      saveBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[USER_ACCOUNT] Save button clicked');
        updateProfile();
      };
    }
    
    // Change password button
    const changePwdBtn = modalContainer.querySelector('.profile-changepwd-btn');
    if (changePwdBtn) {
      changePwdBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[USER_ACCOUNT] Change password button clicked');
        MODAL.close();
        setTimeout(() => showChangePassword(), 300);
      };
    }
    
    // Biometric button
    const bioBtn = modalContainer.querySelector('.profile-biometric-btn');
    if (bioBtn) {
      bioBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[USER_ACCOUNT] Biometric button clicked');
        MODAL.close();
        setTimeout(() => showBiometricStatus(), 300);
      };
    }
  }
  
  function attachGlobalProfileEvents() {
    // Fallback: attach to globally found elements
    const uploadBtn = document.querySelector('.profile-upload-btn');
    if (uploadBtn && !uploadBtn.hasAttribute('data-listener')) {
      uploadBtn.setAttribute('data-listener', 'true');
      uploadBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        uploadProfilePicture();
      };
    }
    
    const removeBtn = document.querySelector('.profile-remove-btn');
    if (removeBtn && !removeBtn.hasAttribute('data-listener')) {
      removeBtn.setAttribute('data-listener', 'true');
      removeBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        deleteProfilePicture();
      };
    }
    
    const saveBtn = document.querySelector('.profile-save-btn');
    if (saveBtn && !saveBtn.hasAttribute('data-listener')) {
      saveBtn.setAttribute('data-listener', 'true');
      saveBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        updateProfile();
      };
    }
    
    const changePwdBtn = document.querySelector('.profile-changepwd-btn');
    if (changePwdBtn && !changePwdBtn.hasAttribute('data-listener')) {
      changePwdBtn.setAttribute('data-listener', 'true');
      changePwdBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        MODAL.close();
        setTimeout(() => showChangePassword(), 300);
      };
    }
    
    const bioBtn = document.querySelector('.profile-biometric-btn');
    if (bioBtn && !bioBtn.hasAttribute('data-listener')) {
      bioBtn.setAttribute('data-listener', 'true');
      bioBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        MODAL.close();
        setTimeout(() => showBiometricStatus(), 300);
      };
    }
  }

  // Upload profile picture
  async function uploadProfilePicture() {
    console.log('[USER_ACCOUNT] uploadProfilePicture called');
    
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/jpeg,image/png,image/jpg';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    
    fileInput.onchange = async function(e) {
      const file = e.target.files[0];
      if (!file) {
        document.body.removeChild(fileInput);
        return;
      }
      
      console.log('[USER_ACCOUNT] File selected:', file.name);
      
      if (!file.type.match('image.*')) {
        await MODAL.alert('Invalid File', 'Please select an image file (JPEG, PNG).');
        document.body.removeChild(fileInput);
        return;
      }
      
      if (file.size > 2 * 1024 * 1024) {
        await MODAL.alert('File Too Large', 'Profile picture must be less than 2MB.');
        document.body.removeChild(fileInput);
        return;
      }
      
      const confirmed = await MODAL.confirm(
        'Upload Picture',
        `Upload "${file.name}" as your profile picture?`,
        { confirmLabel: 'Yes, Upload', cancelLabel: 'Cancel' }
      );
      
      if (!confirmed) {
        document.body.removeChild(fileInput);
        return;
      }
      
      MODAL.loading('Uploading profile picture...');
      
      const reader = new FileReader();
      reader.onload = async function(ev) {
        const imageData = ev.target.result;
        
        try {
          await updateUserData({ profilePicture: imageData });
          
          // Update preview
          const preview = document.getElementById('profile-preview');
          if (preview) {
            preview.style.backgroundImage = `url(${imageData})`;
            preview.style.backgroundSize = 'cover';
            preview.style.backgroundPosition = 'center';
            preview.textContent = '';
          }
          
          // Show remove button
          const removeBtn = document.querySelector('.profile-remove-btn');
          if (removeBtn) removeBtn.style.display = 'inline-block';
          
          await loadProfilePicture();
          
          MODAL.close();
          await MODAL.success('Success', 'Profile picture updated successfully!');
          
          setTimeout(() => {
            MODAL.close();
            showProfile();
          }, 1000);
          
        } catch(err) {
          console.error('[USER_ACCOUNT] Upload error:', err);
          MODAL.close();
          await MODAL.error('Error', err.message || 'Failed to upload.');
        }
        
        document.body.removeChild(fileInput);
      };
      
      reader.onerror = async function() {
        MODAL.close();
        await MODAL.error('Error', 'Failed to read the image file.');
        document.body.removeChild(fileInput);
      };
      
      reader.readAsDataURL(file);
    };
    
    fileInput.click();
  }

  // Delete profile picture
  async function deleteProfilePicture() {
    console.log('[USER_ACCOUNT] deleteProfilePicture called');
    
    const confirmed = await MODAL.confirm(
      'Delete Profile Picture', 
      'Are you sure you want to delete your profile picture?',
      { confirmLabel: 'Yes, Delete', cancelLabel: 'Cancel', confirmCls: 'btn-danger' }
    );
    
    if (!confirmed) return;
    
    MODAL.loading('Deleting profile picture...');
    
    try {
      await updateUserData({ profilePicture: null });
      
      // Update preview
      const preview = document.getElementById('profile-preview');
      if (preview) {
        preview.style.backgroundImage = '';
        preview.textContent = getAvatarIcon(currentUser?.role);
      }
      
      // Hide remove button
      const removeBtn = document.querySelector('.profile-remove-btn');
      if (removeBtn) removeBtn.style.display = 'none';
      
      await loadProfilePicture();
      
      MODAL.close();
      await MODAL.success('Deleted', 'Profile picture removed.');
      
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
    console.log('[USER_ACCOUNT] updateProfile called');
    
    const newName = document.getElementById('profile-name-input')?.value.trim();
    if (!newName) {
      await MODAL.alert('Error', 'Name cannot be empty.');
      return;
    }
    
    const confirmed = await MODAL.confirm(
      'Update Name',
      `Change name to "${escapeHtml(newName)}"?`,
      { confirmLabel: 'Yes, Update', cancelLabel: 'Cancel' }
    );
    
    if (!confirmed) return;
    
    try {
      await updateUserData({ name: newName });
      
      updateTopbarName(newName);
      
      await MODAL.success('Updated', 'Name changed successfully.');
      
      setTimeout(() => {
        MODAL.close();
        showProfile();
      }, 1000);
      
    } catch(err) {
      console.error('[USER_ACCOUNT] Update error:', err);
      await MODAL.error('Error', err.message || 'Update failed.');
    }
  }

  function updateTopbarName(name) {
    const tbName = document.querySelector('.tb-user');
    if (tbName) tbName.textContent = name;
    
    // Update sidebar name if it exists
    const sidebarName = document.querySelector('#view-lecturer .sidebar-header h3');
    if (sidebarName) sidebarName.textContent = name;
    
    const sadmName = document.querySelector('#view-sadmin .sidebar-header h3');
    if (sadmName) sadmName.textContent = name;
    
    const cadmName = document.querySelector('#view-cadmin .sidebar-header h3');
    if (cadmName) cadmName.textContent = name;
    
    const studentSidebarName = document.getElementById('student-sidebar-name');
    if (studentSidebarName) studentSidebarName.textContent = name;
  }

  async function showChangePassword() {
    const html = `
      <div style="max-height: 60vh; overflow-y: auto; padding-right: 10px;">
        <div class="field">
          <label>🔐 Current Password</label>
          <div class="pw"><input type="password" id="current-password" class="fi" placeholder="Current password"><button class="eye" onclick="UI.tgEye('current-password',this)">👁</button></div>
        </div>
        <div class="field">
          <label>🔑 New Password</label>
          <div class="pw"><input type="password" id="new-password" class="fi" placeholder="New password (min 8 chars)"><button class="eye" onclick="UI.tgEye('new-password',this)">👁</button></div>
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
      await MODAL.alert('Error', 'Password must be at least 8 characters.');
      return;
    }
    if (newPass !== confirmPass) {
      await MODAL.alert('Error', 'Passwords do not match.');
      return;
    }
    
    const currentHash = UI.hashPw(currentPass);
    let isValid = false;
    
    try {
      if (currentUser.role === 'student') {
        const student = await DB.STUDENTS.get(currentUser.studentId);
        isValid = student && student.pwHash === currentHash;
        if (isValid) await DB.STUDENTS.update(currentUser.studentId, { pwHash: UI.hashPw(newPass) });
      } else if (currentUser.role === 'lecturer' || currentUser.role === 'ta') {
        const lec = await DB.LEC.get(currentUser.id);
        isValid = lec && lec.pwHash === currentHash;
        if (isValid) await DB.LEC.update(currentUser.id, { pwHash: UI.hashPw(newPass) });
      } else if (currentUser.role === 'superAdmin') {
        const sa = await DB.SA.get();
        isValid = sa && sa.pwHash === currentHash;
        if (isValid) {
          sa.pwHash = UI.hashPw(newPass);
          await DB.SA.set(sa);
        }
      } else if (currentUser.role === 'coAdmin') {
        const ca = await DB.CA.get(currentUser.id);
        isValid = ca && ca.pwHash === currentHash;
        if (isValid) await DB.CA.update(currentUser.id, { pwHash: UI.hashPw(newPass) });
      }
    } catch(err) {
      console.error('[USER_ACCOUNT] Password error:', err);
      await MODAL.alert('Error', 'Could not verify current password.');
      return;
    }
    
    if (!isValid) {
      await MODAL.alert('Error', 'Current password is incorrect.');
      return;
    }
    
    await MODAL.success('Password Updated', 'Your password has been changed. Please log in again with your new password.');
    setTimeout(function() {
      if (typeof AUTH !== 'undefined' && AUTH.clearSession) {
        AUTH.clearSession();
      }
      if (typeof APP !== 'undefined') APP.goTo('landing');
    }, 2000);
  }

  async function showBiometricStatus() {
    try {
      const student = await DB.STUDENTS.get(currentUser.studentId);
      const hasBio = !!(student?.webAuthnCredentialId);
      const lastUse = student?.lastBiometricUse ? new Date(student.lastBiometricUse).toLocaleString() : 'Never';
      const devices = student?.devices ? Object.keys(student.devices).length : 0;
      
      const html = `
        <div style="text-align:center;">
          <div style="font-size:48px;">${hasBio ? '✅' : '⚠️'}</div>
          <p><strong>Status:</strong> ${hasBio ? 'Passkey Registered' : 'No Passkey Registered'}</p>
          ${hasBio ? `<p><strong>Last Used:</strong> ${lastUse}</p>` : ''}
          <p><strong>Registered Devices:</strong> ${devices}</p>
          <hr>
          <p class="sub" style="font-size:12px;">Passkey (FaceID/TouchID) is used for secure check-ins.</p>
          ${!hasBio ? `<p class="sub" style="font-size:12px; margin-top:10px;">Contact your lecturer to request a passkey reset link.</p>` : ''}
        </div>
      `;
      
      await MODAL.alert('Biometric Status', html, { icon: '', btnLabel: 'Close', width: '400px' });
    } catch(err) {
      console.error('[USER_ACCOUNT] Biometric status error:', err);
      await MODAL.alert('Error', 'Could not load biometric status.');
    }
  }

  async function showHelp() {
    const userRole = currentUser?.role || 'user';
    let helpContent = '';
    
    if (userRole === 'student') {
      helpContent = `
        <ul style="margin-left: 20px; line-height: 1.8;">
          <li><strong>📱 Check-in:</strong> Scan QR code displayed by your lecturer, verify with FaceID/TouchID</li>
          <li><strong>📊 Dashboard:</strong> View your attendance progress across all courses</li>
          <li><strong>📅 Calendar:</strong> Add class timetable and personal study schedule</li>
          <li><strong>📋 History:</strong> View all your check-in records, export to Excel</li>
          <li><strong>💬 Messages:</strong> Communicate with lecturers and TAs</li>
        </ul>
      `;
    } else if (userRole === 'lecturer' || userRole === 'ta') {
      helpContent = `
        <ul style="margin-left: 20px; line-height: 1.8;">
          <li><strong>▶️ Start Session:</strong> Create QR code attendance sessions with location fencing</li>
          <li><strong>📊 View Records:</strong> See live check-ins, download Excel reports</li>
          <li><strong>📝 Manual Check-in:</strong> Add students manually or via bulk upload</li>
          <li><strong>📢 Announcements:</strong> Send course announcements to enrolled students</li>
          <li><strong>👥 Teaching Assistants:</strong> Invite and manage TAs</li>
          <li><strong>🔐 Passkey Reset:</strong> Help students reset biometric passkeys for new devices</li>
        </ul>
      `;
    } else if (userRole === 'superAdmin' || userRole === 'coAdmin') {
      helpContent = `
        <ul style="margin-left: 20px; line-height: 1.8;">
          <li><strong>🆔 Generate IDs:</strong> Create unique lecturer registration IDs (emailed automatically)</li>
          <li><strong>👨‍🏫 Manage Lecturers:</strong> View, suspend, remove lecturers</li>
          <li><strong>🤝 Co-Admins:</strong> Approve applications, add joint admins (max 3)</li>
          <li><strong>📊 Reports:</strong> Generate system-wide reports with charts and exports</li>
          <li><strong>💾 Backups:</strong> Create and download database backups</li>
          <li><strong>📢 Announcements:</strong> Send system-wide announcements to all users</li>
        </ul>
      `;
    }
    
    const html = `
      <div style="max-height: 70vh; overflow-y: auto; padding-right: 10px;">
        <div class="inner-panel">
          <h3>📱 Quick Guide</h3>
          ${helpContent}
        </div>
        <div class="inner-panel">
          <h3>❓ FAQ</h3>
          <ul style="margin-left: 20px; line-height: 1.8;">
            <li><strong>Forgot password?</strong> Use "Forgot Password" on the login page</li>
            <li><strong>Biometric not working?</strong> Contact your lecturer for a passkey reset link</li>
            <li><strong>Location error?</strong> Enable GPS and ensure you're in the classroom</li>
            <li><strong>QR code not scanning?</strong> Refresh the page or get a new QR from lecturer</li>
          </ul>
        </div>
        <div class="inner-panel">
          <h3>📧 Contact Support</h3>
          <p>Email: support@ug.edu.gh<br>Phone: +233 30 123 4567<br>Hours: Monday-Friday, 8am-5pm</p>
        </div>
      </div>
    `;
    
    await MODAL.alert('Help Center', html, { icon: '❓', btnLabel: 'Close', width: '550px' });
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
    deleteProfilePicture,
    loadProfilePicture,
    getRoleName,
    getUserData
  };
})();
