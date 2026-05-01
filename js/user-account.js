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
        <div id="profileModalContent" style="max-height: 70vh; overflow-y: auto; padding-right: 10px;">
          <div style="text-align:center; margin-bottom:20px">
            <div style="position:relative; display:inline-block">
              <div id="profile-preview" style="width:100px; height:100px; border-radius:50%; background-size:cover; background-position:center; background-color:var(--surface2); display:flex; align-items:center; justify-content:center; font-size:40px; border:3px solid var(--ug); ${hasProfilePic ? `background-image:url('${profilePicture}');` : ''}">
                ${!hasProfilePic ? getAvatarIcon(currentUser?.role) : ''}
              </div>
            </div>
            <div style="margin-top:10px; display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
              <button type="button" class="action-btn" data-action="upload" style="background:var(--ug); color:white; border:none; border-radius:6px; padding:6px 12px; cursor:pointer;">📸 Upload</button>
              <button type="button" class="action-btn" data-action="remove" style="background:transparent; color:var(--danger); border:1px solid var(--danger); border-radius:6px; padding:6px 12px; cursor:pointer; ${!hasProfilePic ? 'display:none;' : ''}">🗑️ Remove</button>
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
              <button type="button" class="action-btn" data-action="save" style="flex:1; background:var(--ug); color:white; border:none; border-radius:6px; padding:10px; cursor:pointer;">💾 Save Changes</button>
              <button type="button" class="action-btn" data-action="changepwd" style="flex:1; background:var(--surface2); border:1px solid var(--border); border-radius:6px; padding:10px; cursor:pointer;">🔑 Change Password</button>
              ${currentUser.role === 'student' ? `<button type="button" class="action-btn" data-action="biometric" style="flex:1; background:transparent; border:1px solid var(--ug); border-radius:6px; padding:10px; cursor:pointer;">🔐 Biometric</button>` : ''}
            </div>
          </div>
        </div>
      `;
      
      await MODAL.alert('👤 My Profile', html, { icon: '', btnLabel: 'Close', width: '500px' });
      
      // Bind all buttons using event delegation on the document
      bindModalEvents();
      
    } catch(err) {
      console.error('Show profile error:', err);
      await MODAL.error('Error', 'Could not load profile.');
    }
  }

  function bindModalEvents() {
    // Use event delegation to handle all button clicks
    document.addEventListener('click', handleModalButtonClick);
  }

  function handleModalButtonClick(e) {
    const target = e.target;
    const action = target.getAttribute('data-action');
    
    if (!action) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    console.log('Button clicked:', action);
    
    switch(action) {
      case 'upload':
        uploadProfilePicture();
        break;
      case 'remove':
        deleteProfilePicture();
        break;
      case 'save':
        updateProfile();
        break;
      case 'changepwd':
        MODAL.close();
        setTimeout(() => showChangePassword(), 100);
        break;
      case 'biometric':
        MODAL.close();
        setTimeout(() => showBiometricStatus(), 100);
        break;
    }
  }

  // Upload profile picture
  async function uploadProfilePicture() {
    // Create file input
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
      
      // Validate
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
      
      // Confirm
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
          await MODAL.success('Success', 'Profile picture updated successfully!');
          
          setTimeout(function() {
            MODAL.close();
            showProfile();
          }, 1000);
          
        } catch(err) {
          console.error('Upload error:', err);
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
    const confirmed = await MODAL.confirm(
      'Delete Profile Picture', 
      'Are you sure you want to delete your profile picture?',
      { confirmLabel: 'Yes, Delete', cancelLabel: 'Cancel', confirmCls: 'btn-danger' }
    );
    
    if (!confirmed) return;
    
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
      
      // Update all avatars
      const avatarIcon = getAvatarIcon(currentUser?.role);
      document.querySelectorAll('.user-avatar').forEach(function(avatar) {
        avatar.style.backgroundImage = '';
        avatar.style.backgroundColor = '';
        avatar.textContent = avatarIcon;
      });
      
      // Update preview
      const preview = document.getElementById('profile-preview');
      if (preview) {
        preview.style.backgroundImage = '';
        preview.textContent = avatarIcon;
      }
      
      await loadProfilePicture();
      
      MODAL.close();
      await MODAL.success('Deleted', 'Profile picture removed.');
      
      setTimeout(function() {
        MODAL.close();
        showProfile();
      }, 1000);
      
    } catch(err) {
      console.error('Delete error:', err);
      MODAL.close();
      await MODAL.error('Error', err.message || 'Failed to delete.');
    }
  }

  async function updateProfile() {
    const newName = document.getElementById('profile-name')?.value.trim();
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
      await MODAL.success('Updated', 'Name changed successfully.');
      
      setTimeout(function() {
        MODAL.close();
        showProfile();
      }, 1000);
      
    } catch(err) {
      console.error('Update error:', err);
      await MODAL.error('Error', err.message || 'Update failed.');
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
          <div class="pw"><input type="password" id="current-password" class="fi" placeholder="Current password"><button class="eye" onclick="UI.tgEye('current-password',this)">👁</button></div>
        </div>
        <div class="field">
          <label>🔑 New Password</label>
          <div class="pw"><input type="password" id="new-password" class="fi" placeholder="New password (min 8 chars)"><button class="eye" onclick="UI.tgEye('new-password',this)">👁</button></div>
        </div>
        <div class="field">
          <label>✓ Confirm</label>
          <div class="pw"><input type="password" id="confirm-password" class="fi" placeholder="Confirm new password"><button class="eye" onclick="UI.tgEye('confirm-password',this)">👁</button></div>
        </div>
      </div>
    `;
    
    const confirm = await MODAL.confirm('Change Password', html, { confirmLabel: 'Update', cancelLabel: 'Cancel' });
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
      console.error('Password error:', err);
      await MODAL.alert('Error', 'Could not verify current password.');
      return;
    }
    
    if (!isValid) {
      await MODAL.alert('Error', 'Current password is incorrect.');
      return;
    }
    
    await MODAL.success('Password Updated', 'Please log in again.');
    setTimeout(function() {
      AUTH.clearSession();
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
          <p><strong>Status:</strong> ${hasBio ? 'Registered' : 'Not Registered'}</p>
          ${hasBio ? `<p><strong>Last Used:</strong> ${lastUse}</p>` : ''}
          <p><strong>Devices:</strong> ${devices}</p>
          <hr>
          <p class="sub">Biometric is used for secure check-ins.</p>
        </div>
      `;
      
      await MODAL.alert('Biometric Status', html, { icon: '', btnLabel: 'Close', width: '400px' });
    } catch(err) {
      await MODAL.alert('Error', 'Could not load status.');
    }
  }

  async function showHelp() {
    const html = `
      <div style="max-height: 70vh; overflow-y: auto; padding-right: 10px;">
        <div class="inner-panel"><h3>📱 Quick Guide</h3>
          <ul><li><strong>Check-in:</strong> Scan QR code, use FaceID/TouchID</li>
          <li><strong>History:</strong> View all check-ins, export Excel</li>
          <li><strong>Calendar:</strong> Set timetable for reminders</li></ul>
        </div>
        <div class="inner-panel"><h3>❓ FAQ</h3>
          <ul><li><strong>Forgot password?</strong> Use "Forgot Password" on login</li>
          <li><strong>Biometric not working?</strong> Request reset from lecturer</li>
          <li><strong>Location error?</strong> Enable GPS, be in classroom</li></ul>
        </div>
        <div class="inner-panel"><h3>📧 Contact</h3>
          <p>Email: support@ug.edu.gh<br>Phone: +233 30 123 4567</p>
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
