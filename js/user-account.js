/* user-account.js — Universal User Account Management with Profile Pictures & Help System */
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
    try {
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
          avatar.style.textContent = getAvatarIcon(currentUser?.role);
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
        <div class="profile-modal-content" style="max-height: 70vh; overflow-y: auto; padding-right: 10px; -webkit-overflow-scrolling: touch;">
          <div style="text-align:center; margin-bottom:20px">
            <div style="position:relative; display:inline-block">
              <div id="profile-preview" style="width:100px; height:100px; border-radius:50%; background-size:cover; background-position:center; background-color:var(--surface2); display:flex; align-items:center; justify-content:center; font-size:40px; border:3px solid var(--ug); ${hasProfilePic ? `background-image:url('${profilePicture}');` : ''}">
                ${!hasProfilePic ? getAvatarIcon(currentUser?.role) : ''}
              </div>
              <button type="button" class="camera-btn" data-action="camera" style="position:absolute; bottom:0; right:0; background:var(--ug); color:white; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:16px; border:2px solid white; padding:0; z-index:10;">
                📷
              </button>
              <input type="file" id="profile-upload" accept="image/jpeg,image/png,image/jpg" style="display:none">
            </div>
            <button type="button" class="delete-pic-btn btn btn-danger" data-action="delete" style="margin-top:10px; width:auto; ${!hasProfilePic ? 'display:none;' : ''}">🗑️ Delete Picture</button>
            <h3 style="margin-top:10px;">${escapeHtml(userData.name || currentUser.name)}</h3>
            <p class="sub" style="font-size:12px">${escapeHtml(currentUser.email)} · ${getRoleName(currentUser.role)}</p>
          </div>
          <div>
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
              <button type="button" class="save-profile-btn btn btn-ug" data-action="save" style="flex:1">💾 Save Changes</button>
              <button type="button" class="change-password-btn btn btn-secondary" data-action="changepwd" style="flex:1">🔑 Change Password</button>
              ${currentUser.role === 'student' ? `<button type="button" class="biometric-status-btn btn btn-outline" data-action="biometric" style="flex:1">🔐 Biometric Status</button>` : ''}
            </div>
          </div>
        </div>
      `;
      
      await MODAL.alert('👤 My Profile', html, { icon: '', btnLabel: 'Close', width: '500px' });
      
      // Use event delegation - attach listener to document for dynamic elements
      setTimeout(() => {
        // Remove any existing listener first to avoid duplicates
        document.removeEventListener('click', handleProfileClick);
        document.addEventListener('click', handleProfileClick);
        console.log('[USER_ACCOUNT] Event listener attached for profile clicks');
      }, 100);
      
    } catch(err) {
      console.error('Show profile error:', err);
      await MODAL.error('Error', 'Could not load profile. Please try again.');
    }
  }

  // Global click handler for profile modal buttons
  function handleProfileClick(e) {
    const target = e.target;
    const button = target.closest('button');
    
    if (!button) return;
    
    const action = button.getAttribute('data-action');
    console.log('[USER_ACCOUNT] Button clicked, action:', action);
    
    if (action === 'camera') {
      e.preventDefault();
      e.stopPropagation();
      console.log('[USER_ACCOUNT] Camera button clicked');
      showPictureOptions();
    } 
    else if (action === 'delete') {
      e.preventDefault();
      console.log('[USER_ACCOUNT] Delete button clicked');
      deleteProfilePicture();
    }
    else if (action === 'save') {
      e.preventDefault();
      console.log('[USER_ACCOUNT] Save button clicked');
      updateProfile();
    }
    else if (action === 'changepwd') {
      e.preventDefault();
      console.log('[USER_ACCOUNT] Change password button clicked');
      MODAL.close();
      setTimeout(() => {
        showChangePassword();
      }, 100);
    }
    else if (action === 'biometric') {
      e.preventDefault();
      console.log('[USER_ACCOUNT] Biometric status button clicked');
      MODAL.close();
      setTimeout(() => {
        showBiometricStatus();
      }, 100);
    }
  }

  // Show options menu for profile picture
  async function showPictureOptions() {
    console.log('[USER_ACCOUNT] showPictureOptions called');
    
    // Get current profile preview to check if there's a picture
    const profilePreview = document.getElementById('profile-preview');
    const hasProfilePic = profilePreview && profilePreview.style.backgroundImage && profilePreview.style.backgroundImage !== 'none' && profilePreview.style.backgroundImage !== '';
    
    console.log('[USER_ACCOUNT] Has profile picture:', hasProfilePic);
    
    const optionsHtml = `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button type="button" class="upload-option-btn btn btn-ug" data-option="upload" style="width: 100%; padding: 12px;">
          📸 Upload Picture
        </button>
        ${hasProfilePic ? `
        <button type="button" class="remove-option-btn btn btn-danger" data-option="remove" style="width: 100%; padding: 12px;">
          🗑️ Remove Picture
        </button>
        ` : ''}
      </div>
    `;
    
    await MODAL.alert('Profile Picture', optionsHtml, { icon: '📷', btnLabel: 'Cancel', width: '300px' });
    
    // Attach event listeners for the option buttons
    setTimeout(() => {
      const uploadBtn = document.querySelector('.upload-option-btn');
      const removeBtn = document.querySelector('.remove-option-btn');
      
      if (uploadBtn) {
        uploadBtn.onclick = () => {
          console.log('[USER_ACCOUNT] Upload option selected');
          MODAL.close();
          setTimeout(() => {
            triggerFileUpload();
          }, 100);
        };
      }
      
      if (removeBtn) {
        removeBtn.onclick = () => {
          console.log('[USER_ACCOUNT] Remove option selected');
          MODAL.close();
          setTimeout(() => {
            deleteProfilePicture();
          }, 100);
        };
      }
    }, 100);
  }

  // Trigger file upload
  function triggerFileUpload() {
    console.log('[USER_ACCOUNT] triggerFileUpload called');
    
    // Try to find existing file input
    let fileInput = document.getElementById('profile-upload');
    
    if (!fileInput) {
      console.log('[USER_ACCOUNT] Creating new file input');
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.id = 'profile-upload';
      fileInput.accept = 'image/jpeg,image/png,image/jpg';
      fileInput.style.display = 'none';
      document.body.appendChild(fileInput);
    }
    
    // Remove previous event listener
    fileInput.onchange = null;
    
    // Add new event listener
    fileInput.onchange = async (e) => {
      console.log('[USER_ACCOUNT] File selected');
      await uploadProfilePicture(fileInput);
    };
    
    // Clear and click
    fileInput.value = '';
    fileInput.click();
  }

  // Upload profile picture
  async function uploadProfilePicture(input) {
    const file = input.files[0];
    if (!file) return;
    
    console.log('[USER_ACCOUNT] Uploading file:', file.name);
    
    // Validate file type
    if (!file.type.match('image.*')) {
      await MODAL.alert('Invalid File', 'Please select an image file (JPEG, PNG).', { icon: '❌' });
      input.value = '';
      return;
    }
    
    // Validate file size
    if (file.size > 2 * 1024 * 1024) {
      await MODAL.alert('File Too Large', 'Profile picture must be less than 2MB.', { icon: '❌' });
      input.value = '';
      return;
    }
    
    // Show confirmation
    const confirmUpload = await MODAL.confirm(
      '📸 Upload Profile Picture',
      `Are you sure you want to upload "${file.name}" as your profile picture?`,
      { confirmLabel: 'Yes, Upload', cancelLabel: 'Cancel', confirmCls: 'btn-ug' }
    );
    
    if (!confirmUpload) {
      input.value = '';
      return;
    }
    
    // Show loading
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
          if (sa) {
            sa.profilePicture = imageData;
            await DB.SA.set(sa);
          }
        } else if (currentUser.role === 'coAdmin') {
          await DB.CA.update(currentUser.id, { profilePicture: imageData });
        }
        
        if (currentUser) {
          currentUser.profilePicture = imageData;
        }
        
        await loadProfilePicture();
        
        MODAL.close();
        await MODAL.alert('Success', '✅ Profile picture updated successfully.', { icon: '✅', btnLabel: 'OK' });
        
        // Refresh profile
        setTimeout(() => {
          MODAL.close();
          showProfile();
        }, 1000);
        
      } catch(err) {
        console.error('Upload error:', err);
        MODAL.close();
        await MODAL.alert('Error', err.message || 'Failed to upload profile picture.', { icon: '❌' });
      }
    };
    reader.onerror = async () => {
      MODAL.close();
      await MODAL.alert('Error', 'Failed to read the image file.', { icon: '❌' });
    };
    reader.readAsDataURL(file);
    
    input.value = '';
  }

  // Delete profile picture
  async function deleteProfilePicture() {
    console.log('[USER_ACCOUNT] Delete profile picture called');
    
    // Show confirmation
    const confirmDelete = await MODAL.confirm(
      '🗑️ Delete Profile Picture', 
      'Are you sure you want to delete your profile picture? This action cannot be undone.',
      { confirmLabel: 'Yes, Delete', cancelLabel: 'Cancel', confirmCls: 'btn-danger' }
    );
    
    if (!confirmDelete) {
      return;
    }
    
    // Show loading
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
      
      if (currentUser) {
        currentUser.profilePicture = null;
      }
      
      // Force update all avatars to default icon
      const avatarIcon = getAvatarIcon(currentUser?.role);
      document.querySelectorAll('.user-avatar').forEach(avatar => {
        avatar.style.backgroundImage = '';
        avatar.style.backgroundColor = '';
        avatar.style.textContent = avatarIcon;
      });
      
      // Update preview if modal is open
      const profilePreview = document.getElementById('profile-preview');
      if (profilePreview) {
        profilePreview.style.backgroundImage = '';
        profilePreview.textContent = avatarIcon;
        profilePreview.style.display = 'flex';
        profilePreview.style.alignItems = 'center';
        profilePreview.style.justifyContent = 'center';
        profilePreview.style.fontSize = '40px';
      }
      
      // Hide delete button
      const deleteBtn = document.querySelector('.delete-pic-btn');
      if (deleteBtn) {
        deleteBtn.style.display = 'none';
      }
      
      await loadProfilePicture();
      
      MODAL.close();
      await MODAL.alert('Deleted', '✅ Profile picture has been removed successfully. The default avatar has been restored.', { icon: '✅', btnLabel: 'OK' });
      
      // Refresh profile
      setTimeout(() => {
        MODAL.close();
        showProfile();
      }, 1000);
      
    } catch(err) {
      console.error('Delete error:', err);
      MODAL.close();
      await MODAL.alert('Error', err.message || 'Failed to delete profile picture.', { icon: '❌' });
    }
  }

  async function updateProfile() {
    const newName = document.getElementById('profile-name')?.value.trim();
    if (!newName) {
      await MODAL.alert('Error', 'Name cannot be empty.', { icon: '❌' });
      return;
    }
    
    const confirmUpdate = await MODAL.confirm(
      'Update Profile',
      `Are you sure you want to change your name to "${escapeHtml(newName)}"?`,
      { confirmLabel: 'Yes, Update', cancelLabel: 'Cancel', confirmCls: 'btn-ug' }
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
      await MODAL.alert('Profile Updated', '✅ Your profile has been updated successfully.', { icon: '✅', btnLabel: 'OK' });
      
      setTimeout(() => {
        MODAL.close();
        showProfile();
      }, 1000);
      
    } catch(err) {
      console.error('Update error:', err);
      await MODAL.alert('Update Failed', err.message || 'Could not update profile.', { icon: '❌' });
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
      <div style="max-height: 60vh; overflow-y: auto; padding-right: 10px; -webkit-overflow-scrolling: touch;">
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
    
    const confirm = await MODAL.confirm('Change Password', html, { confirmLabel: 'Update Password', cancelLabel: 'Cancel', confirmCls: 'btn-ug' });
    if (!confirm) return;
    
    const currentPass = document.getElementById('current-password')?.value;
    const newPass = document.getElementById('new-password')?.value;
    const confirmPass = document.getElementById('confirm-password')?.value;
    
    if (!currentPass || !newPass) {
      await MODAL.alert('Error', 'Please fill all fields.', { icon: '❌' });
      return;
    }
    if (newPass.length < 8) {
      await MODAL.alert('Error', 'New password must be at least 8 characters.', { icon: '❌' });
      return;
    }
    if (newPass !== confirmPass) {
      await MODAL.alert('Error', 'New passwords do not match.', { icon: '❌' });
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
      await MODAL.alert('Error', 'Could not verify current password.', { icon: '❌' });
      return;
    }
    
    if (!isValid) {
      await MODAL.alert('Error', 'Current password is incorrect.', { icon: '❌' });
      return;
    }
    
    await MODAL.alert('Password Updated', '✅ Your password has been changed successfully. Please log in again.', { icon: '✅', btnLabel: 'OK' });
    setTimeout(() => {
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
        <div style="text-align:center; max-height: 50vh; overflow-y: auto; padding: 10px;">
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
    } catch(err) {
      console.error('Biometric status error:', err);
      await MODAL.alert('Error', 'Could not load biometric status.', { icon: '❌' });
    }
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
            <li><strong>📋 Attendance Records:</strong> View student attendance in table format. Export Excel with all records.</li>
            <li><strong>📊 Reports:</strong> Generate comprehensive reports with attendance distribution charts. Export to Excel for board presentations.</li>
            <li><strong>📢 Announcements:</strong> Send announcements to students in specific courses.</li>
            <li><strong>📖 Course Management:</strong> Archive or restore courses by academic period.</li>
            <li><strong>👥 Teaching Assistants:</strong> Invite TAs, suspend/unsuspend, or end tenure.</li>
            <li><strong>🔐 Passkey Reset:</strong> Generate reset links for students who change devices.</li>
          </ul>
        </div>
      `,
      superAdmin: `
        <div class="inner-panel">
          <h3>🔐 Administrator Guide</h3>
          <ul>
            <li><strong>📢 Announcements:</strong> Send system-wide announcements to all users or specific roles/departments.</li>
            <li><strong>🆔 Unique IDs:</strong> Generate and manage lecturer registration IDs.</li>
            <li><strong>👨‍🏫 Lecturers:</strong> View, suspend, or remove lecturers.</li>
            <li><strong>🤝 Co-Admins:</strong> Approve applications and add joint administrators (max 3).</li>
            <li><strong>📊 Sessions:</strong> View all sessions with filters - sorted latest to oldest.</li>
            <li><strong>📚 Courses:</strong> View all courses grouped by year, semester, department, lecturer.</li>
            <li><strong>📈 Reports:</strong> Generate overall attendance reports with charts and PDF download.</li>
            <li><strong>💾 Database:</strong> Create and download system backups.</li>
            <li><strong>⚙️ Settings:</strong> Delete data by year range or reset entire system.</li>
          </ul>
        </div>
      `,
      coAdmin: `
        <div class="inner-panel">
          <h3>🤝 Co-Administrator Guide</h3>
          <ul>
            <li><strong>📢 Announcements:</strong> Send announcements to lecturers and students in your department.</li>
            <li><strong>🆔 Generate IDs:</strong> Create unique IDs for lecturers in your department only.</li>
            <li><strong>👨‍🏫 Lecturers:</strong> View, suspend, or remove lecturers in your department.</li>
            <li><strong>📊 Sessions:</strong> View department sessions filtered by year, semester, and lecturer.</li>
            <li><strong>📈 Reports:</strong> Generate department reports showing course/lecturer performance.</li>
            <li><strong>📚 Courses:</strong> View all courses in your department filtered by year, semester, and lecturer.</li>
            <li><strong>💾 Backup:</strong> Create and download department data backups.</li>
          </ul>
        </div>
      `
    };
    
    const html = `
      <div style="max-height: 70vh; overflow-y: auto; padding-right: 10px; -webkit-overflow-scrolling: touch;">
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
    deleteProfilePicture,
    addAccountButton,
    loadProfilePicture,
    getRoleName
  };
})();
