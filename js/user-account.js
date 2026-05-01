/* user-account.js — Universal User Account Management with Profile Pictures & Help System */
'use strict';

const USER_ACCOUNT = (() => {
  let currentUser = null;

  async function init() {
    currentUser = AUTH.getSession();
    if (!currentUser) return;
    console.log('[USER_ACCOUNT] Initialized for user:', currentUser.role, currentUser.id || currentUser.studentId);
    await loadProfilePicture();
  }

  // ==================== PROFILE PICTURE MANAGEMENT ====================
  async function loadProfilePicture() {
    try {
      const userData = await getUserData();
      const profilePicture = userData?.profilePicture || null;
      
      console.log('[USER_ACCOUNT] Loading profile picture, has picture:', !!profilePicture);
      
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
          avatar.style.backgroundSize = '';
          avatar.style.backgroundPosition = '';
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

  // ==================== SHOW PROFILE (SCROLLABLE) ====================
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
        <div style="max-height: 70vh; overflow-y: auto; padding-right: 10px; -webkit-overflow-scrolling: touch;">
          <div style="text-align:center; margin-bottom:20px">
            <div style="position:relative; display:inline-block">
              <div id="profile-preview" style="width:100px; height:100px; border-radius:50%; background-size:cover; background-position:center; background-color:var(--surface2); display:flex; align-items:center; justify-content:center; font-size:40px; border:3px solid var(--ug); ${hasProfilePic ? `background-image:url('${profilePicture}');` : ''}">
                ${!hasProfilePic ? getAvatarIcon(currentUser?.role) : ''}
              </div>
              <label for="profile-upload" style="position:absolute; bottom:0; right:0; background:var(--ug); color:white; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:16px; border:2px solid white;">📷</label>
              <input type="file" id="profile-upload" accept="image/jpeg,image/png,image/jpg" style="display:none" onchange="USER_ACCOUNT.handleFileSelect(this)">
            </div>
            <button id="delete-pic-btn" class="btn btn-danger btn-sm" onclick="USER_ACCOUNT.deleteProfilePicture()" style="margin-top:10px; width:auto; ${!hasProfilePic ? 'display:none;' : ''}">🗑️ Delete Picture</button>
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
              <button class="btn btn-ug" onclick="USER_ACCOUNT.updateProfile()" style="flex:1">💾 Save Changes</button>
              <button class="btn btn-secondary" onclick="USER_ACCOUNT.showChangePassword()" style="flex:1">🔑 Change Password</button>
              ${currentUser.role === 'student' ? `<button class="btn btn-outline" onclick="USER_ACCOUNT.showBiometricStatus()" style="flex:1">🔐 Biometric Status</button>` : ''}
            </div>
          </div>
        </div>
      `;
      
      await MODAL.alert('👤 My Profile', html, { icon: '', btnLabel: 'Close', width: '500px' });
    } catch(err) {
      console.error('Show profile error:', err);
      await MODAL.error('Error', 'Could not load profile. Please try again.');
    }
  }

  async function handleFileSelect(input) {
    const file = input.files[0];
    if (!file) return;
    
    const confirmed = await MODAL.confirm(
      'Upload Profile Picture',
      `Are you sure you want to upload "${file.name}" as your profile picture?`,
      { confirmLabel: 'Yes, Upload', cancelLabel: 'Cancel', confirmCls: 'btn-ug' }
    );
    
    if (!confirmed) {
      input.value = '';
      return;
    }
    
    await uploadProfilePicture(file, input);
  }

  async function uploadProfilePicture(file, input) {
    if (!file) return;
    
    if (!file.type.match('image.*')) {
      await MODAL.error('Invalid File', 'Please select an image file (JPEG, PNG).');
      input.value = '';
      return;
    }
    
    if (file.size > 2 * 1024 * 1024) {
      await MODAL.error('File Too Large', 'Profile picture must be less than 2MB.');
      input.value = '';
      return;
    }
    
    MODAL.loading('Uploading profile picture...');
    
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
      
      // Show delete button
      const deleteBtn = document.getElementById('delete-pic-btn');
      if (deleteBtn) deleteBtn.style.display = 'inline-block';
      
      // Save to database
      try {
        if (currentUser.role === 'student') {
          await DB.STUDENTS.update(currentUser.studentId, { profilePicture: imageData });
          console.log('[USER_ACCOUNT] Student profile picture uploaded');
        } else if (currentUser.role === 'lecturer' || currentUser.role === 'ta') {
          await DB.LEC.update(currentUser.id, { profilePicture: imageData });
          console.log('[USER_ACCOUNT] Lecturer profile picture uploaded');
        } else if (currentUser.role === 'superAdmin') {
          const sa = await DB.SA.get();
          if (sa) {
            sa.profilePicture = imageData;
            await DB.SA.set(sa);
            console.log('[USER_ACCOUNT] Admin profile picture uploaded');
          }
        } else if (currentUser.role === 'coAdmin') {
          await DB.CA.update(currentUser.id, { profilePicture: imageData });
          console.log('[USER_ACCOUNT] Co-admin profile picture uploaded');
        }
        
        // Update local user
        if (currentUser) {
          currentUser.profilePicture = imageData;
        }
        
        // Update all avatars on page
        await loadProfilePicture();
        
        MODAL.close();
        await MODAL.success('Success', '✅ Profile picture updated successfully.');
        
        setTimeout(() => {
          MODAL.close();
          showProfile();
        }, 1500);
        
      } catch(err) {
        console.error('Upload error:', err);
        MODAL.close();
        await MODAL.error('Error', err.message || 'Failed to upload profile picture.');
      }
    };
    reader.onerror = async () => {
      MODAL.close();
      await MODAL.error('Error', 'Failed to read the image file.');
    };
    reader.readAsDataURL(file);
    
    input.value = '';
  }

  async function deleteProfilePicture() {
    const confirmed = await MODAL.confirm(
      'Delete Profile Picture', 
      'Are you sure you want to delete your profile picture? This action cannot be undone.',
      { confirmLabel: 'Yes, Delete', cancelLabel: 'Cancel', confirmCls: 'btn-danger' }
    );
    if (!confirmed) return;
    
    MODAL.loading('Deleting profile picture...');
    
    try {
      console.log('[USER_ACCOUNT] Deleting profile picture for:', currentUser.role);
      
      if (currentUser.role === 'student') {
        await DB.STUDENTS.update(currentUser.studentId, { profilePicture: null });
        console.log('[USER_ACCOUNT] Student profile picture set to null');
      } else if (currentUser.role === 'lecturer' || currentUser.role === 'ta') {
        await DB.LEC.update(currentUser.id, { profilePicture: null });
        console.log('[USER_ACCOUNT] Lecturer profile picture set to null');
      } else if (currentUser.role === 'superAdmin') {
        const sa = await DB.SA.get();
        if (sa) {
          sa.profilePicture = null;
          await DB.SA.set(sa);
          console.log('[USER_ACCOUNT] Admin profile picture set to null');
        }
      } else if (currentUser.role === 'coAdmin') {
        await DB.CA.update(currentUser.id, { profilePicture: null });
        console.log('[USER_ACCOUNT] Co-admin profile picture set to null');
      }
      
      // Update local user
      if (currentUser) {
        currentUser.profilePicture = null;
      }
      
      // Force update all avatars to show default icon
      const avatarIcon = getAvatarIcon(currentUser?.role);
      document.querySelectorAll('.user-avatar').forEach(avatar => {
        avatar.style.backgroundImage = '';
        avatar.style.backgroundColor = '';
        avatar.style.backgroundSize = '';
        avatar.style.backgroundPosition = '';
        avatar.textContent = avatarIcon;
      });
      
      // Update profile preview if modal is still open
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
      const deleteBtn = document.getElementById('delete-pic-btn');
      if (deleteBtn) {
        deleteBtn.style.display = 'none';
      }
      
      await loadProfilePicture();
      
      MODAL.close();
      await MODAL.success('Deleted', '✅ Profile picture has been removed successfully.');
      
      setTimeout(() => {
        MODAL.close();
        showProfile();
      }, 1500);
      
    } catch(err) {
      console.error('Delete error:', err);
      MODAL.close();
      await MODAL.error('Error', err.message || 'Failed to delete profile picture.');
    }
  }

  async function updateProfile() {
    const newName = document.getElementById('profile-name')?.value.trim();
    if (!newName) {
      await MODAL.error('Error', 'Name cannot be empty.');
      return;
    }
    
    const confirmed = await MODAL.confirm(
      'Update Profile',
      `Are you sure you want to change your name to "${escapeHtml(newName)}"?`,
      { confirmLabel: 'Yes, Update', cancelLabel: 'Cancel', confirmCls: 'btn-ug' }
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
      await MODAL.success('Profile Updated', '✅ Your profile has been updated successfully.');
      
      setTimeout(() => {
        MODAL.close();
        showProfile();
      }, 1500);
      
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
      await MODAL.error('Error', 'Could not load biometric status.');
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

  // ==================== SIDEBAR ACCOUNT BUTTON ====================
  function addAccountButton() {
    console.log('[USER_ACCOUNT] Account buttons are in sidebar - no topbar buttons added');
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
    handleFileSelect,
    uploadProfilePicture,
    deleteProfilePicture,
    addAccountButton,
    loadProfilePicture,
    getRoleName
  };
})();
