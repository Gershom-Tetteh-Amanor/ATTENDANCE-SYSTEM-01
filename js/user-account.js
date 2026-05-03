/* user-account.js — Universal User Account Management (FULLY WORKING WITH PROFILE PICTURES) */
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
    
    await loadProfilePicture();
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
      const defaultAvatar = getAvatarIcon(currentUser?.role);
      
      // Use inline onclick handlers - this ensures buttons work
      const html = `
        <div class="profile-scroll-container" style="max-height: 60vh; overflow-y: auto; padding-right: 10px;">
          <div style="text-align:center; margin-bottom:20px">
            <div style="position:relative; display:inline-block">
              <div id="profile-preview" style="width:100px; height:100px; border-radius:50%; background-size:cover; background-position:center; background-color:var(--surface2); display:flex; align-items:center; justify-content:center; font-size:40px; border:3px solid var(--ug); ${hasProfilePic ? `background-image:url('${profilePicture}');` : ''}">
                ${!hasProfilePic ? defaultAvatar : ''}
              </div>
            </div>
            <div style="margin-top:10px; display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
              <button type="button" onclick="USER_ACCOUNT.uploadProfilePicture()" style="background:var(--ug); color:white; border:none; border-radius:6px; padding:6px 12px; cursor:pointer;">📸 Upload Picture</button>
              <button type="button" onclick="USER_ACCOUNT.deleteProfilePicture()" id="profile-remove-btn-inline" style="background:transparent; color:var(--danger); border:1px solid var(--danger); border-radius:6px; padding:6px 12px; cursor:pointer; ${!hasProfilePic ? 'display:none;' : 'display:inline-block;'}">🗑️ Remove Picture</button>
            </div>
            <h3 style="margin-top:10px;">${escapeHtml(userData.name || currentUser.name)}</h3>
            <p style="font-size:12px">${escapeHtml(currentUser.email)} · ${getRoleName(currentUser.role)}</p>
          </div>
          <div>
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
              <input type="text" class="fi" value="${userData.createdAt ? new Date(userData.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}" readonly>
            </div>
            <hr style="margin:15px 0">
            <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-bottom:10px">
              <button type="button" onclick="USER_ACCOUNT.updateProfileName()" style="flex:1; background:var(--ug); color:white; border:none; border-radius:6px; padding:10px; cursor:pointer;">💾 Save Changes</button>
              <button type="button" onclick="USER_ACCOUNT.showChangePassword()" style="flex:1; background:var(--surface2); border:1px solid var(--border); border-radius:6px; padding:10px; cursor:pointer;">🔑 Change Password</button>
            </div>
            ${currentUser.role === 'student' ? `<div style="display:flex; justify-content:center; margin-top:10px"><button type="button" onclick="USER_ACCOUNT.showBiometricStatus()" style="background:transparent; border:1px solid var(--ug); border-radius:6px; padding:8px 20px; cursor:pointer;">🔐 Biometric Status</button></div>` : ''}
          </div>
        </div>
      `;
      
      await MODAL.alert('👤 My Profile', html, { icon: '', btnLabel: 'Close', width: '500px' });
      
    } catch(err) {
      console.error('[USER_ACCOUNT] Show profile error:', err);
      await MODAL.error('Error', 'Could not load profile.');
    }
  }

  // Upload profile picture - called from inline onclick
  async function uploadProfilePicture() {
    console.log('[USER_ACCOUNT] uploadProfilePicture called');
    
    // Create file input dynamically
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/jpeg,image/png,image/jpg,image/gif,image/webp';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    
    fileInput.onchange = async function(e) {
      const file = e.target.files[0];
      if (!file) {
        document.body.removeChild(fileInput);
        return;
      }
      
      console.log('[USER_ACCOUNT] File selected:', file.name, 'Size:', file.size, 'Type:', file.type);
      
      if (!file.type.match('image.*')) {
        await MODAL.alert('Invalid File', 'Please select an image file (JPEG, PNG, GIF, or WebP).');
        document.body.removeChild(fileInput);
        return;
      }
      
      if (file.size > 5 * 1024 * 1024) {
        await MODAL.alert('File Too Large', 'Profile picture must be less than 5MB.');
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
          
          MODAL.close();
          await MODAL.success('Success', '✅ Profile picture updated successfully!');
          
          // Refresh the profile modal to show updated picture
          setTimeout(() => {
            showProfile();
          }, 500);
          
        } catch(err) {
          console.error('[USER_ACCOUNT] Upload error:', err);
          MODAL.close();
          await MODAL.error('Error', err.message || 'Failed to upload picture. Please try again.');
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

  // Delete profile picture - replaces with default avatar
  async function deleteProfilePicture() {
    console.log('[USER_ACCOUNT] deleteProfilePicture called');
    
    const confirmed = await MODAL.confirm(
      'Delete Picture', 
      'Are you sure you want to delete your profile picture? It will be replaced with the default avatar.',
      { confirmCls: 'btn-danger', confirmLabel: 'Yes, Delete' }
    );
    if (!confirmed) return;
    
    MODAL.loading('Removing profile picture...');
    
    try {
      await updateUserData({ profilePicture: null });
      
      MODAL.close();
      await MODAL.success('Deleted', '✅ Profile picture has been removed. Default avatar restored.');
      
      // Refresh the profile modal
      setTimeout(() => {
        showProfile();
      }, 500);
      
    } catch(err) {
      console.error('[USER_ACCOUNT] Delete error:', err);
      MODAL.close();
      await MODAL.error('Error', err.message || 'Failed to delete picture.');
    }
  }

  // Update profile name - called from inline onclick
  async function updateProfileName() {
    console.log('[USER_ACCOUNT] updateProfileName called');
    
    const newName = document.getElementById('profile-name-input')?.value.trim();
    if (!newName) {
      await MODAL.error('Error', 'Name cannot be empty.');
      return;
    }
    
    const confirmed = await MODAL.confirm('Update Name', `Change name to "${escapeHtml(newName)}"?`, { confirmLabel: 'Yes, Update' });
    if (!confirmed) return;
    
    MODAL.loading('Updating profile...');
    
    try {
      await updateUserData({ name: newName });
      
      updateTopbarName(newName);
      
      MODAL.close();
      await MODAL.success('Profile Updated', '✅ Your profile has been updated successfully.');
      
      setTimeout(() => {
        showProfile();
      }, 500);
      
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

  // ==================== CHANGE PASSWORD (SCROLLABLE) ====================
  async function showChangePassword() {
    const html = `
      <div class="changepwd-scroll-container" style="max-height: 400px; overflow-y: auto; padding-right: 10px;">
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
    
    const result = await MODAL.confirm('Change Password', html, { confirmLabel: 'Update Password', cancelLabel: 'Cancel', confirmCls: 'btn-ug', width: '450px' });
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

  // ==================== BIOMETRIC STATUS ====================
  async function showBiometricStatus() {
    try {
      const student = await DB.STUDENTS.get(currentUser.studentId);
      const hasBiometric = !!(student?.webAuthnCredentialId);
      const lastUse = student?.lastBiometricUse ? new Date(student.lastBiometricUse).toLocaleString() : 'Never';
      const deviceCount = student?.devices ? Object.keys(student.devices).length : 0;
      
      const html = `
        <div class="biometric-scroll-container" style="max-height: 400px; overflow-y: auto; padding-right: 10px; text-align:center;">
          <div style="font-size:48px; margin-bottom:10px">${hasBiometric ? '✅' : '⚠️'}</div>
          <p><strong>Biometric Status:</strong> ${hasBiometric ? 'Registered' : 'Not Registered'}</p>
          ${hasBiometric ? `<p><strong>Last Used:</strong> ${lastUse}</p>` : ''}
          <p><strong>Registered Devices:</strong> ${deviceCount}</p>
          <hr style="margin:15px 0">
          <p class="sub" style="font-size:12px;">Biometric (FaceID/TouchID/Windows Hello) is used for secure check-ins.</p>
          ${!hasBiometric ? `<p class="note" style="margin-top:10px">Please contact your lecturer to set up biometric for your account.</p>` : ''}
        </div>
      `;
      
      await MODAL.alert('🔐 Biometric Status', html, { icon: '', btnLabel: 'Close', width: '400px' });
    } catch(err) {
      console.error('[USER_ACCOUNT] Biometric status error:', err);
      await MODAL.alert('Error', 'Could not load biometric status.');
    }
  }

  // ==================== HELP MODAL (SCROLLABLE) ====================
  async function showHelp() {
    const userRole = currentUser?.role || 'guest';
    
    const roleGuides = {
      student: `
        <div class="inner-panel">
          <h3>🎓 Student Guide</h3>
          <ul style="margin-left: 20px; line-height: 1.8;">
            <li><strong>📊 Overview:</strong> View your attendance statistics, active sessions, and course progress filtered by academic year and semester.</li>
            <li><strong>📅 Calendar:</strong> Set up your weekly timetable with flexible time ranges. Get notifications 30 minutes before class starts.</li>
            <li><strong>📋 History:</strong> View all your past sessions with present/absent status. Filter by year, semester, course, and lecturer. Download Excel reports.</li>
            <li><strong>💬 Messages:</strong> Communicate with your lecturers and course mates. Receive announcements and participate in course discussions.</li>
            <li><strong>✅ Check-in:</strong> Use biometric (FaceID/TouchID) verification for secure attendance. Location validation ensures you're in the classroom.</li>
            <li><strong>👤 Profile:</strong> Upload your profile picture and update your personal information.</li>
          </ul>
        </div>
      `,
      lecturer: `
        <div class="inner-panel">
          <h3>👨‍🏫 Lecturer Guide</h3>
          <ul style="margin-left: 20px; line-height: 1.8;">
            <li><strong>📚 My Courses:</strong> View courses by academic year/semester. Start sessions with location validation.</li>
            <li><strong>🟢 Active Sessions:</strong> Monitor live check-ins, download QR codes, end sessions.</li>
            <li><strong>📋 Attendance Records:</strong> View student attendance, export Excel.</li>
            <li><strong>📊 Reports:</strong> Generate reports with charts, export to Excel/PDF.</li>
            <li><strong>👥 Teaching Assistants:</strong> Invite and manage TAs.</li>
            <li><strong>🔐 Passkey Reset:</strong> Generate reset links for students with new devices.</li>
            <li><strong>👤 Profile:</strong> Upload your profile picture and update your personal information.</li>
          </ul>
        </div>
      `,
      superAdmin: `
        <div class="inner-panel">
          <h3>🔐 Administrator Guide</h3>
          <ul style="margin-left: 20px; line-height: 1.8;">
            <li><strong>🆔 Unique IDs:</strong> Generate lecturer registration IDs (emailed automatically).</li>
            <li><strong>👨‍🏫 Lecturers:</strong> View, suspend, remove lecturers.</li>
            <li><strong>🤝 Co-Admins:</strong> Approve applications, add joint admins (max 3).</li>
            <li><strong>📊 Sessions:</strong> View all sessions with filters, export Excel.</li>
            <li><strong>📈 Reports:</strong> Generate overall reports with charts, set min attendance.</li>
            <li><strong>💾 Database:</strong> Create and download system backups.</li>
            <li><strong>👤 Profile:</strong> Upload your profile picture and update your personal information.</li>
          </ul>
        </div>
      `,
      coAdmin: `
        <div class="inner-panel">
          <h3>🤝 Co-Administrator Guide</h3>
          <ul style="margin-left: 20px; line-height: 1.8;">
            <li><strong>🆔 Generate IDs:</strong> Create IDs for lecturers in your department.</li>
            <li><strong>👨‍🏫 Lecturers:</strong> Manage lecturers in your department.</li>
            <li><strong>📊 Sessions:</strong> View department sessions with filters.</li>
            <li><strong>📈 Reports:</strong> Generate department reports, export Excel/PDF.</li>
            <li><strong>💾 Backup:</strong> Create department data backups.</li>
            <li><strong>👤 Profile:</strong> Upload your profile picture and update your personal information.</li>
          </ul>
        </div>
      `
    };
    
    const html = `
      <div class="help-scroll-container" style="max-height: 60vh; overflow-y: auto; padding-right: 10px;">
        ${roleGuides[userRole] || roleGuides.student}
        
        <div class="inner-panel">
          <h3>❓ Frequently Asked Questions</h3>
          <ul style="margin-left: 20px; line-height: 1.8;">
            <li><strong>Forgot password?</strong> Click "Forgot Password" on the login page.</li>
            <li><strong>Biometric not working?</strong> Contact your lecturer for a passkey reset link.</li>
            <li><strong>Location validation failing?</strong> Enable GPS and ensure you're in the classroom.</li>
            <li><strong>Profile picture not showing?</strong> Try uploading a smaller image (under 2MB).</li>
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
    updateProfileName,
    uploadProfilePicture,
    deleteProfilePicture,
    loadProfilePicture,
    getRoleName,
    getUserData
  };
})();

// Make USER_ACCOUNT globally available
window.USER_ACCOUNT = USER_ACCOUNT;
