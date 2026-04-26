/* session.js — Lecturer & TA Dashboard with Strict Lecturer Isolation & Passkey Reset */
'use strict';

// Self-registration to ensure LEC is available globally
(function() {
  if (typeof window.LEC === 'undefined') {
    window.LEC = {};
  }
})();

const LEC = (() => {
  const S = { 
    session: null, 
    locOn: true, 
    lecLat: null, 
    lecLng: null, 
    locAcquired: false, 
    tickTimer: null, 
    unsubRec: null, 
    unsubBlk: null,
    currentViewYear: null,
    currentViewSemester: null,
    currentViewCourse: null,
    refreshInterval: null,
    currentReportData: null,
    activeSessionsRefresh: null
  };

  function _setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // Helper to get current lecturer/TA ID
  function getCurrentLecturerId() {
    const user = AUTH.getSession();
    if (!user) {
      console.error('[LEC] No user session found');
      return null;
    }
    if (user.role === 'ta') {
      const lecId = user.activeLecturerId || user.id;
      console.log('[LEC] Current TA accessing lecturer:', lecId);
      return lecId;
    }
    console.log('[LEC] Current lecturer ID:', user.id);
    return user.id;
  }

  function getCurrentUser() {
    return AUTH.getSession();
  }

  // Helper to get academic year and semester from a date
  function getAcademicPeriod(date = new Date()) {
    const year = date.getFullYear();
    const month = date.getMonth();
    let semester;
    let academicYear;
    
    if (month >= 7) { // August (7) to December (11)
      semester = 1;
      academicYear = year;
    } else if (month >= 0 && month <= 6) { // January (0) to July (6)
      semester = 2;
      academicYear = year;
    } else {
      semester = 1;
      academicYear = year;
    }
    
    return { year: academicYear, semester };
  }

  // Helper to get academic period from a date string
  function getPeriodFromDateString(dateStr) {
    const parts = dateStr.split(' ');
    let year = parseInt(parts[2]);
    const monthName = parts[1];
    
    const monthMap = {
      'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
      'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
    };
    const month = monthMap[monthName];
    
    let semester;
    let academicYear = year;
    
    if (month >= 7) {
      semester = 1;
      academicYear = year;
    } else if (month >= 0 && month <= 6) {
      semester = 2;
      academicYear = year;
    } else {
      semester = 1;
      academicYear = year;
    }
    
    return { year: academicYear, semester };
  }

  // Auto-fix existing sessions missing year/semester
  async function fixExistingSessions() {
    try {
      const myId = getCurrentLecturerId();
      if (!myId) return;
      
      const allSessions = await DB.SESSION.byLec(myId);
      let fixedCount = 0;
      
      for (const session of allSessions) {
        if (!session.year || !session.semester) {
          const period = getPeriodFromDateString(session.date);
          await DB.SESSION.update(session.id, {
            year: period.year,
            semester: period.semester
          });
          fixedCount++;
        }
      }
      
      if (fixedCount > 0) {
        console.log(`[LEC] Fixed ${fixedCount} sessions with missing year/semester`);
      }
    } catch(e) {
      console.warn('[LEC] Fix existing sessions error:', e);
    }
  }

  // ==================== GLOBAL VALUE UPDATE FUNCTIONS ====================
  window.updateDurVal = function(val) {
    const mins = parseInt(val);
    let display = '';
    if (mins < 60) { 
      display = mins + ' min'; 
    } else { 
      const hours = Math.floor(mins / 60); 
      const remainingMins = mins % 60; 
      display = remainingMins > 0 ? hours + 'h ' + remainingMins + 'min' : hours + 'h'; 
    }
    const el = document.getElementById('l-dur-val');
    if (el) el.textContent = display;
  };
  
  window.updateRadiusVal = function(val) {
    const el = document.getElementById('l-rad-val');
    if (el) el.textContent = val + 'm';
  };
  
  window.updateStartDurVal = function(val) {
    const mins = parseInt(val);
    let display = '';
    if (mins < 60) { 
      display = mins + ' min'; 
    } else { 
      const hours = Math.floor(mins / 60); 
      const remainingMins = mins % 60; 
      display = remainingMins > 0 ? hours + 'h ' + remainingMins + 'min' : hours + 'h'; 
    }
    const el = document.getElementById('start-dur-val');
    if (el) el.textContent = display;
  };
  
  window.updateStartRadiusVal = function(val) {
    const el = document.getElementById('start-rad-val');
    if (el) el.textContent = val + 'm';
  };

  // ==================== MAIN TAB FUNCTION ====================
  function tab(name) {
    console.log('[LEC] Switching to tab:', name);
    
    // Update tab active states
    document.querySelectorAll('#view-lecturer .tab').forEach(t => {
      const tabName = t.getAttribute('data-tab');
      if (tabName === name) {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });
    
    // Update page active states
    document.querySelectorAll('#view-lecturer .tab-page').forEach(p => {
      const pageId = p.id;
      const expectedId = `lec-pg-${name}`;
      if (pageId === expectedId) {
        p.classList.add('active');
        console.log('[LEC] Activated page:', pageId);
      } else {
        p.classList.remove('active');
      }
    });
    
    // Load content based on tab
    if (name === 'mycourses') {
      _loadMyCourses();
    } else if (name === 'records') {
      _loadRecords();
    } else if (name === 'reports') {
      _loadReports();
    } else if (name === 'courses') {
      _loadCourses();
    } else if (name === 'tas') {
      _loadTAs();
    } else if (name === 'session') {
      _loadActiveSessionsOnly();
    } else if (name === 'biometric') {
      console.log('[LEC] Loading biometric tab content');
      _loadBiometricTab();
    }
  }

  // ==================== BIOMETRIC RESET TAB ====================
  async function _loadBiometricTab() {
    console.log('[LEC] Loading biometric reset tab');
    
    // Get the container
    const container = document.getElementById('lec-pg-biometric');
    if (!container) {
      console.error('[LEC] Could not find lec-pg-biometric container');
      return;
    }
    
    // Clear and set content
    container.innerHTML = `
      <div class="pg">
        <div class="inner-panel" style="margin-bottom:20px">
          <h3>🔐 Student Passkey Reset</h3>
          <p class="sub">When a student gets a new device, you can reset their passkey and unregister their old device.</p>
          <div style="display:flex; gap:12px; flex-wrap:wrap">
            <button class="btn btn-ug" id="reset-passkey-btn" style="width:auto; padding:10px 20px">📱 Reset Passkey (New Device)</button>
            <button class="btn btn-secondary" id="manage-devices-btn" style="width:auto; padding:10px 20px">🔍 View / Manage Devices</button>
          </div>
        </div>
        <div class="inner-panel">
          <h3>📋 Instructions</h3>
          <ul style="margin-left:20px; color:var(--text3); font-size:13px; line-height:1.8">
            <li><strong>Device Binding:</strong> Each student's passkey is bound to their specific device</li>
            <li><strong>New Device:</strong> When a student gets a new device, their old passkey won't work</li>
            <li><strong>Reset Passkey:</strong> Click "Reset Passkey" and enter the student's ID</li>
            <li>The student will receive an email with a secure reset link (or you can copy the link)</li>
            <li>The link expires after 7 days for security</li>
            <li>The student will be prompted to register their fingerprint/face passkey on their new device</li>
            <li><strong>Old Device Unregistered:</strong> After reset, the old device cannot be used for check-ins</li>
            <li>Use "View / Manage Devices" to see which devices are registered to a student</li>
          </ul>
        </div>
        <div class="inner-panel">
          <h3>📊 Recent Reset Requests</h3>
          <div id="recent-resets-list"><div class="att-empty">Loading...</div></div>
        </div>
      </div>
    `;
    
    // Attach event listeners
    const resetBtn = document.getElementById('reset-passkey-btn');
    const manageBtn = document.getElementById('manage-devices-btn');
    
    if (resetBtn) {
      resetBtn.onclick = () => showPasskeyResetUI();
    }
    if (manageBtn) {
      manageBtn.onclick = () => showDeviceManagementUI();
    }
    
    await _loadRecentResets();
  }

  async function _loadRecentResets() {
    const container = document.getElementById('recent-resets-list');
    if (!container) return;
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) {
        container.innerHTML = '<div class="no-rec">Unable to load reset history</div>';
        return;
      }
      
      const allResets = await DB.BIOMETRIC_RESET.getAllForLecturer(myId);
      const recentResets = allResets.sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
      
      if (recentResets.length === 0) {
        container.innerHTML = '<div class="no-rec">No recent reset requests</div>';
        return;
      }
      
      let html = '<div style="font-size:13px">';
      for (const reset of recentResets) {
        const date = new Date(reset.createdAt).toLocaleString();
        const status = reset.used ? '✅ Used' : (reset.expiresAt < Date.now() ? '⏰ Expired' : '⏳ Pending');
        html += `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid var(--border); flex-wrap:wrap; gap:8px">
            <div>
              <strong>${UI.esc(reset.studentName)}</strong><br>
              <span style="font-size:11px; color:var(--text3)">${UI.esc(reset.studentId)}</span>
            </div>
            <div style="font-size:11px">
              <span>${date}</span><br>
              <span class="pill ${reset.used ? 'pill-teal' : (reset.expiresAt < Date.now() ? 'pill-gray' : 'pill-amber')}">${status}</span>
            </div>
          </div>
        `;
      }
      html += '</div>';
      container.innerHTML = html;
    } catch(err) {
      console.error('Load recent resets error:', err);
      container.innerHTML = '<div class="no-rec">Error loading reset history</div>';
    }
  }

  // ==================== PASSKEY RESET FUNCTIONS ====================
  async function showPasskeyResetUI() {
    const studentId = await MODAL.prompt(
      'Reset Student Passkey',
      'Enter the Student ID of the student who needs to reset their passkey (e.g., for a new device):',
      { icon: '🎓', placeholder: 'e.g., 10967696', confirmLabel: 'Continue' }
    );
    
    if (!studentId) return;
    
    const student = await DB.STUDENTS.byStudentId(studentId.toUpperCase());
    if (!student) {
      await MODAL.error('Student Not Found', `No student found with ID: ${studentId}`);
      return;
    }
    
    // Show current device info
    const devices = await DB.DEVICE_REGISTRATION.getStudentDevices(student.studentId);
    let deviceInfo = '';
    if (devices.length > 0) {
      deviceInfo = '<p><strong>Currently Registered Devices:</strong></p><ul>';
      for (const device of devices) {
        deviceInfo += `<li>${UI.esc(device.deviceName || 'Unknown Device')} - Last used: ${device.lastUsed ? new Date(device.lastUsed).toLocaleDateString() : 'Never'}</li>`;
      }
      deviceInfo += '</ul><p style="color:var(--amber-t)">⚠️ Resetting will remove ALL registered devices and passkeys.</p>';
    } else {
      deviceInfo = '<p><em>No devices currently registered.</em></p>';
    }
    
    const hasPasskey = !!(student.webAuthnCredentialId || student.webAuthnCredentialId);
    const passkeyStatus = hasPasskey ? '✅ Passkey Registered' : '❌ No Passkey Registered';
    
    const confirmReset = await MODAL.confirm(
      'Confirm Passkey Reset',
      `<div style="text-align:left">
         <p><strong>Student:</strong> ${UI.esc(student.name)}</p>
         <p><strong>ID:</strong> ${UI.esc(student.studentId)}</p>
         <p><strong>Email:</strong> ${UI.esc(student.email)}</p>
         <p><strong>Passkey Status:</strong> ${passkeyStatus}</p>
         <hr style="margin:10px 0">
         ${deviceInfo}
         <hr style="margin:10px 0">
         <span style="color:var(--danger)">⚠️ This will erase their current passkey and unregister all devices.</span><br/><br/>
         The student will receive a link to register a new passkey on their new device.
       </div>`,
      { confirmLabel: 'Send Reset Link', confirmCls: 'btn-warning' }
    );
    
    if (!confirmReset) return;
    
    try {
      const myId = getCurrentLecturerId();
      const user = getCurrentUser();
      
      const token = UI.makeToken(32);
      const resetLink = `${CONFIG.SITE_URL}?reset=${token}`;
      
      // Unregister all devices and clear passkey
      await DB.DEVICE_REGISTRATION.unregisterDevice(student.studentId, null);
      
      await DB.BIOMETRIC_RESET.set(token, {
        token,
        studentId: student.studentId,
        studentName: student.name,
        studentEmail: student.email,
        lecturerId: myId,
        lecturerName: user?.name || 'Lecturer',
        reason: 'device_change_reset',
        createdAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        used: false
      });
      
      // Send email to student
      let emailSent = false;
      if (typeof AUTH !== 'undefined' && AUTH._sendBiometricResetEmail) {
        emailSent = await AUTH._sendBiometricResetEmail(
          student.email,
          student.name,
          resetLink,
          user?.name || 'Lecturer'
        );
      }
      
      if (emailSent) {
        await MODAL.success('Passkey Reset Link Sent', 
          `A passkey reset link has been sent to ${student.email}<br/><br/>
           The student can click the link to register their fingerprint/face passkey on their new device.<br/><br/>
           <strong>Note:</strong> The link expires in 7 days.<br/>
           Their old device(s) have been unregistered and cannot be used for check-ins anymore.`
        );
      } else {
        // Show link manually if email fails
        await MODAL.alert('Passkey Reset Link Generated', 
          `<div style="text-align:center">
             <div class="strip strip-amber" style="margin-bottom:15px">
               <strong>Email could not be sent.</strong> Share this link with the student manually:
             </div>
             <div style="background:var(--surface2); padding:15px; border-radius:8px; margin:10px 0; word-break:break-all">
               <a href="${resetLink}" target="_blank">${resetLink}</a>
             </div>
             <p style="font-size:12px; margin-top:10px">This link expires in 7 days.</p>
             <p style="font-size:11px; color:var(--amber-t)">⚠️ Their old device(s) have been unregistered.</p>
           </div>`,
          { icon: '🔗' }
        );
      }
      
      // Refresh recent resets list
      await _loadRecentResets();
      
      console.log('[LEC] Passkey reset requested for:', student.studentId);
      
    } catch(err) {
      console.error('Passkey reset error:', err);
      await MODAL.error('Error', err.message);
    }
  }

  async function showDeviceManagementUI() {
    const studentId = await MODAL.prompt(
      'Manage Student Devices',
      'Enter Student ID to view registered devices:',
      { icon: '🎓', placeholder: 'e.g., 10967696', confirmLabel: 'Search' }
    );
    
    if (!studentId) return;
    
    const student = await DB.STUDENTS.byStudentId(studentId.toUpperCase());
    if (!student) {
      await MODAL.error('Student Not Found', `No student found with ID: ${studentId}`);
      return;
    }
    
    const devices = await DB.DEVICE_REGISTRATION.getStudentDevices(student.studentId);
    const hasPasskey = !!(student.webAuthnCredentialId || student.webAuthnCredentialId);
    
    let devicesHtml = '';
    if (devices.length === 0) {
      devicesHtml = '<p><em>No registered devices found.</em></p>';
    } else {
      devicesHtml = '<table style="width:100%; font-size:12px; border-collapse:collapse">';
      devicesHtml += '<tr style="border-bottom:1px solid var(--border)"><th style="padding:8px; text-align:left">Device</th><th style="padding:8px; text-align:left">Registered</th><th style="padding:8px; text-align:left">Last Used</th></tr>';
      for (const device of devices) {
        devicesHtml += `<tr style="border-bottom:1px solid var(--border2)">
          <td style="padding:8px">${UI.esc(device.deviceName || 'Unknown Device')}</td>
          <td style="padding:8px">${new Date(device.registeredAt).toLocaleDateString()}</td>
          <td style="padding:8px">${device.lastUsed ? new Date(device.lastUsed).toLocaleDateString() : 'Never'}</td>
        </tr>`;
      }
      devicesHtml += '</table>';
    }
    
    // Get reset history
    const resetRequests = await DB.BIOMETRIC_RESET.getAllForStudent(student.studentId);
    let resetHistoryHtml = '';
    if (resetRequests.length > 0) {
      resetHistoryHtml = '<hr style="margin:15px 0"><p><strong>Reset History:</strong></p><ul style="margin-left:20px; font-size:12px">';
      for (const req of resetRequests.slice(-5)) {
        const status = req.used ? 'Used' : (req.expiresAt < Date.now() ? 'Expired' : 'Pending');
        const resetDate = new Date(req.createdAt).toLocaleDateString();
        resetHistoryHtml += `<li>${resetDate} - ${req.reason} (${status})</li>`;
      }
      resetHistoryHtml += '</ul>';
    }
    
    const action = await MODAL.confirm(
      `Student: ${UI.esc(student.name)}`,
      `<div style="text-align:left; max-height:400px; overflow-y:auto">
         <p><strong>ID:</strong> ${UI.esc(student.studentId)}</p>
         <p><strong>Email:</strong> ${UI.esc(student.email)}</p>
         <hr style="margin:10px 0">
         <p><strong>Passkey Status:</strong> ${hasPasskey ? '✅ Registered' : '❌ Not Registered'}</p>
         <p><strong>Last Passkey Use:</strong> ${student.lastBiometricUse ? new Date(student.lastBiometricUse).toLocaleString() : 'Never'}</p>
         <p><strong>Last Passkey Reset:</strong> ${student.lastBiometricReset ? new Date(student.lastBiometricReset).toLocaleString() : 'Never'}</p>
         <hr style="margin:10px 0">
         <p><strong>Registered Devices (${devices.length}):</strong></p>
         ${devicesHtml}
         ${resetHistoryHtml}
       </div>
       <br/>
       What would you like to do?`,
      { confirmLabel: 'Reset Passkey & Unregister All Devices', cancelLabel: 'Cancel', confirmCls: 'btn-warning' }
    );
    
    if (action) {
      const myId = getCurrentLecturerId();
      const user = getCurrentUser();
      
      const token = UI.makeToken(32);
      const resetLink = `${CONFIG.SITE_URL}?reset=${token}`;
      
      // Unregister all devices and clear passkey
      await DB.DEVICE_REGISTRATION.unregisterDevice(student.studentId, null);
      
      await DB.BIOMETRIC_RESET.set(token, {
        token,
        studentId: student.studentId,
        studentName: student.name,
        studentEmail: student.email,
        lecturerId: myId,
        lecturerName: user?.name || 'Lecturer',
        reason: 'manual_device_reset',
        createdAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        used: false
      });
      
      let emailSent = false;
      if (typeof AUTH !== 'undefined' && AUTH._sendBiometricResetEmail) {
        emailSent = await AUTH._sendBiometricResetEmail(
          student.email,
          student.name,
          resetLink,
          user?.name || 'Lecturer'
        );
      }
      
      if (emailSent) {
        await MODAL.success('Passkey Reset Link Sent', `A passkey reset link has been sent to ${student.email}`);
      } else {
        await MODAL.alert('Passkey Reset Link', 
          `<div style="text-align:center">
             <div class="strip strip-amber" style="margin-bottom:15px">
               <strong>Email could not be sent.</strong> Share this link with the student manually:
             </div>
             <div style="background:var(--surface2); padding:15px; border-radius:8px; margin:10px 0; word-break:break-all">
               <a href="${resetLink}" target="_blank">${resetLink}</a>
             </div>
             <p>Share this link with the student to register a new passkey.</p>
           </div>`,
          { icon: '🔗' }
        );
      }
      
      await _loadRecentResets();
    }
  }

  // ==================== ACTIVE SESSIONS TAB ====================
  async function _loadActiveSessionsOnly() {
    const container = document.getElementById('active-sessions-list');
    if (!container) return;
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading active sessions...</div>';
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) {
        container.innerHTML = '<div class="att-empty">Unable to load sessions. Please refresh.</div>';
        return;
      }
      
      const allSessions = await DB.SESSION.byLec(myId);
      const activeSessions = allSessions.filter(s => s.active === true);
      
      if (activeSessions.length === 0) {
        container.innerHTML = '<div class="att-empty">No active sessions. Go to "My Courses" to start a session.</div>';
        return;
      }
      
      let html = '<h2 style="margin-bottom:15px">🟢 Active Sessions</h2><p class="sub">Sessions currently running. They will end automatically when duration expires.</p>';
      
      for (const session of activeSessions) {
        const timeRemaining = Math.max(0, session.expiresAt - Date.now());
        const minutesLeft = Math.floor(timeRemaining / 60000);
        const secondsLeft = Math.floor((timeRemaining % 60000) / 1000);
        const records = session.records ? Object.values(session.records).length : 0;
        
        if (timeRemaining <= 0) {
          await DB.SESSION.update(session.id, { active: false, endedAt: Date.now(), endedReason: 'timeout' });
          continue;
        }
        
        const qrPayload = UI.b64e(JSON.stringify({ 
          id: session.id, token: session.token, code: session.courseCode, 
          course: session.courseName, date: session.date, expiresAt: session.expiresAt,
          lat: session.lat, lng: session.lng, radius: session.radius, locEnabled: session.locEnabled
        }));
        const qrUrl = `${CONFIG.SITE_URL}?ci=${qrPayload}`;
        
        html += `
          <div class="sess-card" style="margin-bottom:20px; border-left: 4px solid var(--teal)">
            <div style="background:var(--ug); color:white; padding:12px; border-radius:8px 8px 0 0; margin:-13px -13px 0 -13px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px">
              <div>
                <strong>📚 ${UI.esc(session.courseCode)} - ${UI.esc(session.courseName)}</strong>
                <span style="margin-left:15px">📅 ${session.date}</span>
                <span style="margin-left:15px">📖 ${session.year} - ${session.semester === 1 ? 'First Sem' : 'Second Sem'}</span>
                <span style="margin-left:15px">👥 ${records} checked in</span>
              </div>
              <div>
                <span class="countdown ok" style="color:#fcd116">⏱️ ${minutesLeft}m ${secondsLeft}s left</span>
                <button class="btn btn-danger btn-sm" onclick="LEC.endSessionById('${session.id}')" style="margin-left:10px">⏹️ End Session</button>
              </div>
            </div>
            <div style="padding:15px; text-align:center">
              <div id="qr-${session.id}" style="display:inline-block; background:#fff; padding:15px; border-radius:10px"></div>
              <div style="margin-top:15px; display:flex; gap:10px; justify-content:center; flex-wrap:wrap">
                <button class="btn btn-secondary btn-sm" onclick="LEC.downloadSessionQR('${session.id}')">⬇ Download QR</button>
                <button class="btn btn-outline btn-sm" onclick="navigator.clipboard.writeText('${qrUrl}')">📋 Copy Link</button>
              </div>
            </div>
          </div>
        `;
        
        setTimeout(() => {
          const qrContainer = document.getElementById(`qr-${session.id}`);
          if (qrContainer && typeof QRCode !== 'undefined') {
            qrContainer.innerHTML = '';
            new QRCode(qrContainer, { text: qrUrl, width: 180, height: 180, colorDark: '#1a1a18', colorLight: '#ffffff' });
          }
        }, 100);
      }
      
      container.innerHTML = html;
      
      if (S.activeSessionsRefresh) clearInterval(S.activeSessionsRefresh);
      S.activeSessionsRefresh = setInterval(() => _checkAndUpdateActiveSessions(), 5000);
      
    } catch(err) {
      console.error('Load active sessions error:', err);
      container.innerHTML = `<div class="att-empty">Error loading sessions: ${UI.esc(err.message)}</div>`;
    }
  }
  
  async function _checkAndUpdateActiveSessions() {
    try {
      const myId = getCurrentLecturerId();
      if (!myId) return;
      
      const allSessions = await DB.SESSION.byLec(myId);
      const activeSessions = allSessions.filter(s => s.active === true);
      let needsRefresh = false;
      
      for (const session of activeSessions) {
        if (session.expiresAt <= Date.now()) {
          await DB.SESSION.update(session.id, { active: false, endedAt: Date.now(), endedReason: 'timeout' });
          needsRefresh = true;
          console.log('[LEC] Session auto-ended:', session.id, session.courseCode);
        }
      }
      
      if (needsRefresh) {
        await _loadActiveSessionsOnly();
      }
    } catch(e) { console.warn(e); }
  }

  async function endSessionById(sessionId) {
    const confirmed = await MODAL.confirm('End Session', 'End this session? All records will be saved.', 
      { confirmLabel: 'Yes, End Session', confirmCls: 'btn-danger' });
    if (!confirmed) return;
    
    try {
      await DB.SESSION.update(sessionId, { active: false, endedAt: Date.now(), endedReason: 'manual' });
      console.log('[LEC] Session manually ended:', sessionId);
      await MODAL.success('Session Ended', 'The session has been ended.');
      await _loadActiveSessionsOnly();
    } catch(err) {
      console.error('End session error:', err);
      await MODAL.error('Error', err.message);
    }
  }

  function downloadSessionQR(sessionId) {
    const qrContainer = document.getElementById(`qr-${sessionId}`);
    const canvas = qrContainer?.querySelector('canvas');
    if (canvas) {
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `QR_${sessionId}.png`;
      a.click();
    } else {
      MODAL.alert('QR not ready', 'Please wait for QR code to generate.');
    }
  }

  // ==================== START SESSION PAGE ====================
  async function showStartSessionPage(courseCode, courseName, year, semester) {
    console.log('[LEC] Showing start session page for:', courseCode, courseName, year, semester);
    
    sessionStorage.setItem('starting_course_code', courseCode);
    sessionStorage.setItem('starting_course_name', courseName);
    sessionStorage.setItem('starting_course_year', year);
    sessionStorage.setItem('starting_course_semester', semester);
    
    const container = document.getElementById('courses-display');
    if (!container) return;
    
    container.innerHTML = `
      <div class="start-session-page" style="max-width:500px; margin:0 auto">
        <button class="btn btn-outline btn-sm" onclick="LEC.viewCourses()" style="margin-bottom:20px">← Back to Courses</button>
        
        <div class="inner-panel">
          <h2>▶ Start New Session</h2>
          <p class="sub">Course: <strong>${UI.esc(courseCode)} - ${UI.esc(courseName)}</strong></p>
          <p class="sub" style="color:var(--teal); margin-top:-10px">📅 ${year} - ${semester === 1 ? 'First Semester' : 'Second Semester'}</p>
          
          <div class="sl-row" style="margin-bottom:20px">
            <label class="fl">Duration (minutes)</label>
            <input type="range" id="start-dur" min="5" max="180" value="60" oninput="updateStartDurVal(this.value)"/>
            <span class="sv" id="start-dur-val">60 min</span>
          </div>
          
          <div class="loc-step">
            <h3>📍 Classroom Location (Required)</h3>
            <p>Set your current location as the classroom fence. Students must be within this radius to check in.</p>
            <div class="sl-row" style="margin-bottom:8px">
              <label class="fl">Fence radius</label>
              <input type="range" id="start-radius" min="20" max="500" value="100" oninput="updateStartRadiusVal(this.value)"/>
              <span class="sv" id="start-rad-val">100m</span>
            </div>
            <button class="btn btn-teal" id="start-get-loc-btn" onclick="LEC.getStartLocation()">📍 Get my location</button>
            <div class="loc-result" id="start-loc-result"></div>
          </div>
          
          <button class="btn btn-ug" id="start-gen-btn" onclick="LEC.generateAndStartSession()" disabled style="margin-top:20px">▶ Generate QR Code & Start Session</button>
          <p class="gen-hint" id="start-gen-hint">Get your classroom location first.</p>
        </div>
      </div>
    `;
    
    S.lecLat = null;
    S.lecLng = null;
    S.locAcquired = false;
  }
  
  function getStartLocation() {
    const btn = document.getElementById('start-get-loc-btn');
    const res = document.getElementById('start-loc-result');
    if (!btn || !res) return;
    
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span>Getting location…';
    res.className = 'loc-result';
    res.innerHTML = '<div class="loc-dot pulsing"></div> Acquiring GPS…';
    
    if (!navigator.geolocation) { 
      _demoStartLoc(); 
      return; 
    }
    
    navigator.geolocation.getCurrentPosition(p => {
      S.lecLat = p.coords.latitude;
      S.lecLng = p.coords.longitude;
      S.locAcquired = true;
      _startLocOK(p.coords.accuracy);
    }, () => _demoStartLoc(), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
  
  function _demoStartLoc() {
    S.lecLat = 5.6505 + (Math.random() - .5) * .001;
    S.lecLng = -0.1875 + (Math.random() - .5) * .001;
    S.locAcquired = true;
    _startLocOK(null);
  }
  
  function _startLocOK(acc) {
    const btn = document.getElementById('start-get-loc-btn');
    const res = document.getElementById('start-loc-result');
    const genBtn = document.getElementById('start-gen-btn');
    const genHint = document.getElementById('start-gen-hint');
    
    if (!btn || !res) return;
    
    res.className = 'loc-result ok';
    res.innerHTML = `<div class="loc-dot"></div> 📍 ${S.lecLat.toFixed(5)}, ${S.lecLng.toFixed(5)}${acc ? ` (±${Math.round(acc)}m)` : ' (demo)'} — Set ✓`;
    btn.disabled = false;
    btn.textContent = '🔄 Refresh location';
    
    if (genBtn) {
      genBtn.disabled = false;
      if (genHint) genHint.style.display = 'none';
    }
  }
  
  async function generateAndStartSession() {
    const courseCode = sessionStorage.getItem('starting_course_code');
    const courseName = sessionStorage.getItem('starting_course_name');
    const courseYear = parseInt(sessionStorage.getItem('starting_course_year'));
    const courseSemester = parseInt(sessionStorage.getItem('starting_course_semester'));
    const mins = document.getElementById('start-dur') ? +(document.getElementById('start-dur').value) : 60;
    
    if (!courseCode || !courseName) {
      await MODAL.alert('Error', 'Course information missing.');
      return;
    }
    
    if (!S.locAcquired || !S.lecLat) {
      await MODAL.alert('Location required', 'Get your classroom location first.');
      return;
    }
    
    const genBtn = document.getElementById('start-gen-btn');
    UI.btnLoad('start-gen-btn', true);
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) {
        UI.btnLoad('start-gen-btn', false, 'Start Session');
        await MODAL.error('Error', 'Could not identify your account. Please logout and login again.');
        return;
      }
      
      console.log('[LEC] Starting session for lecturer:', myId, 'Course:', courseCode);
      
      // Verify this course belongs to this lecturer
      const courseExists = await DB.COURSE.get(myId, courseCode, courseYear, courseSemester);
      if (!courseExists) {
        UI.btnLoad('start-gen-btn', false, 'Start Session');
        await MODAL.error('Error', `Course ${courseCode} does not exist in your account.`);
        return;
      }
      
      const user = getCurrentUser();
      const existing = await DB.SESSION.byLec(myId);
      if (existing.find(s => s.courseCode === courseCode && s.year === courseYear && s.semester === courseSemester && s.active)) {
        UI.btnLoad('start-gen-btn', false, 'Start Session');
        await MODAL.error('Session conflict', `A session for ${courseCode} (${courseYear} Semester ${courseSemester === 1 ? 'First' : 'Second'}) is already active.`);
        return;
      }
      
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'});
      const token = UI.makeToken(20);
      const sessId = token.slice(0, 12);
      const radius = document.getElementById('start-radius') ? +(document.getElementById('start-radius').value) : 100;
      
      const sessionData = {
        id: sessId, 
        token: token, 
        courseCode: courseCode, 
        courseName: courseName,
        lecturer: user?.name || '', 
        lecId: user?.lecId || '', 
        lecFbId: myId,
        department: user?.department || '', 
        date: dateStr,
        expiresAt: Date.now() + mins * 60000, 
        durationMins: mins,
        lat: S.lecLat, 
        lng: S.lecLng, 
        radius: radius, 
        locEnabled: true,
        active: true, 
        createdAt: Date.now(), 
        year: courseYear,
        semester: courseSemester,
        records: {}, 
        sids: {}, 
        devs: {}
      };
      
      await DB.SESSION.set(sessId, sessionData);
      await MODAL.success('Session Started', `Session for ${courseCode} (${courseYear} Semester ${courseSemester === 1 ? 'First' : 'Second'}) has started!`);
      
      sessionStorage.removeItem('starting_course_code');
      sessionStorage.removeItem('starting_course_name');
      sessionStorage.removeItem('starting_course_year');
      sessionStorage.removeItem('starting_course_semester');
      tab('session');
      
    } catch(err) {
      UI.btnLoad('start-gen-btn', false, 'Start Session');
      console.error('Start session error:', err);
      await MODAL.error('Error', err.message);
    }
  }

  // ==================== MY COURSES TAB ====================
  async function _loadMyCourses() {
    const container = document.getElementById('my-courses-container');
    if (!container) return;
    
    const now = new Date();
    const period = getAcademicPeriod(now);
    let defaultYear = period.year;
    let defaultSemester = period.semester;
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom:20px">
        <div style="flex:1; min-width:150px">
          <label class="fl">Academic Year</label>
          <select id="mycourses-year" class="fi" style="padding:8px">
            <option value="">Select Year</option>
            <option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option>
            <option value="2026">2026</option><option value="2027">2027</option><option value="2028">2028</option>
          </select>
        </div>
        <div style="flex:1; min-width:150px">
          <label class="fl">Semester</label>
          <select id="mycourses-semester" class="fi" style="padding:8px">
            <option value="">Select Semester</option>
            <option value="1">First Semester</option>
            <option value="2">Second Semester</option>
          </select>
        </div>
        <div><button class="btn btn-ug" onclick="LEC.viewCourses()">View Courses</button></div>
        <div><button class="btn btn-secondary" onclick="LEC.showAddCourse()">+ Add New Course</button></div>
      </div>
      <div id="courses-display"><div class="att-empty">Select Year and Semester to view your courses</div></div>
      <div id="add-course-section" style="display:none; margin-top:20px">
        <div class="inner-panel"><h3>Add New Course</h3>
          <div class="two-col"><div class="field"><label class="fl">Course Code</label><input type="text" id="new-course-code" class="fi" placeholder="e.g., STAT111" oninput="this.value=this.value.toUpperCase()"/></div>
          <div class="field"><label class="fl">Course Name</label><input type="text" id="new-course-name" class="fi" placeholder="e.g., Statistics"/></div></div>
          <div class="two-col" style="margin-top:10px">
            <div class="field"><label class="fl">Academic Year</label><select id="new-course-year" class="fi"><option value="">Select Year</option><option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option><option value="2026">2026</option><option value="2027">2027</option><option value="2028">2028</option></select></div>
            <div class="field"><label class="fl">Semester</label><select id="new-course-semester" class="fi"><option value="">Select Semester</option><option value="1">First Semester</option><option value="2">Second Semester</option></select></div>
          </div>
          <p class="note" style="margin-top:8px; font-size:11px">⚠️ Course will be created specifically for the selected Academic Year and Semester</p>
          <button class="btn btn-ug" onclick="LEC.addNewCourse()">Create Course</button>
          <button class="btn btn-secondary" onclick="LEC.hideAddCourse()">Cancel</button>
        </div>
      </div>
    `;
    
    const yearSelect = document.getElementById('mycourses-year');
    const semSelect = document.getElementById('mycourses-semester');
    if (yearSelect) yearSelect.value = defaultYear;
    if (semSelect) semSelect.value = defaultSemester;
    await viewCourses();
  }

  async function viewCourses() {
    const year = document.getElementById('mycourses-year')?.value;
    const semester = document.getElementById('mycourses-semester')?.value;
    if (!year || !semester) {
      await MODAL.alert('Missing Info', 'Please select both Year and Semester.');
      return;
    }
    
    S.currentViewYear = parseInt(year);
    S.currentViewSemester = parseInt(semester);
    const container = document.getElementById('courses-display');
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading courses...</div>';
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) {
        container.innerHTML = '<div class="no-rec">Error: Could not identify your account. Please logout and login again.</div>';
        return;
      }
      
      console.log('[LEC] Loading courses for lecturer:', myId);
      
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      console.log('[LEC] Total courses for this lecturer:', allCourses.length);
      
      const periodCourses = allCourses.filter(c => 
        c.year === S.currentViewYear && 
        c.semester === S.currentViewSemester && 
        c.active !== false
      );
      
      console.log('[LEC] Courses for period:', periodCourses.length);
      
      if (periodCourses.length === 0) {
        container.innerHTML = `<div class="inner-panel"><div class="no-rec">No courses found for ${S.currentViewYear} - Semester ${S.currentViewSemester === 1 ? 'First' : 'Second'}.<br/>Click "Add New Course" to create one for this period.</div></div>`;
        return;
      }
      
      let html = `<h3 style="margin-bottom:15px; color:var(--ug)">📚 ${S.currentViewYear} - ${S.currentViewSemester === 1 ? 'First Semester' : 'Second Semester'} (${periodCourses.length} courses)</h3>`;
      for (const c of periodCourses) {
        html += `
          <div class="course-card-item" style="background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:15px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px">
            <div>
              <div style="font-weight:700; font-size:16px; color:var(--ug)">${UI.esc(c.code)}</div>
              <div style="font-size:13px; color:var(--text2)">${UI.esc(c.name)}</div>
              <div style="font-size:11px; color:var(--text3); margin-top:5px">Created: ${new Date(c.createdAt).toLocaleDateString()}</div>
            </div>
            <div>
              <button class="btn btn-ug btn-sm" onclick="LEC.showStartSessionPage('${c.code}', '${c.name.replace(/'/g, "\\'")}', ${c.year}, ${c.semester})">▶ Start Session</button>
              <button class="btn btn-outline btn-sm" onclick="LEC.editCourse('${c.code}', '${c.name.replace(/'/g, "\\'")}', ${c.year}, ${c.semester})" style="margin-left:5px">✏️ Edit</button>
            </div>
          </div>
        `;
      }
      container.innerHTML = html;
    } catch(err) {
      console.error('View courses error:', err);
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  async function editCourse(courseCode, currentName, year, semester) {
    const newName = await MODAL.prompt(
      'Edit Course Name',
      `Edit name for ${courseCode} (${year} Semester ${semester === 1 ? 'First' : 'Second'}):`,
      { icon: '✏️', placeholder: 'Course name', defVal: currentName, confirmLabel: 'Save Changes' }
    );
    
    if (!newName || newName === currentName) return;
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      await DB.COURSE.update(myId, courseCode, year, semester, { 
        name: newName,
        updatedAt: Date.now()
      });
      
      await MODAL.success('Course Updated', `${courseCode} name has been changed for ${year} Semester ${semester === 1 ? 'First' : 'Second'}.`);
      await viewCourses();
    } catch(err) {
      console.error('Edit course error:', err);
      await MODAL.error('Error', err.message);
    }
  }

  function showAddCourse() {
    const section = document.getElementById('add-course-section');
    if (section) section.style.display = 'block';
    
    if (S.currentViewYear) {
      const yearSelect = document.getElementById('new-course-year');
      if (yearSelect) yearSelect.value = S.currentViewYear;
    }
    if (S.currentViewSemester) {
      const semSelect = document.getElementById('new-course-semester');
      if (semSelect) semSelect.value = S.currentViewSemester;
    }
  }

  function hideAddCourse() {
    const section = document.getElementById('add-course-section');
    if (section) section.style.display = 'none';
    ['new-course-code', 'new-course-name', 'new-course-year', 'new-course-semester'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

  async function addNewCourse() {
    const code = document.getElementById('new-course-code')?.value.trim().toUpperCase();
    const name = document.getElementById('new-course-name')?.value.trim();
    const year = document.getElementById('new-course-year')?.value;
    const semester = document.getElementById('new-course-semester')?.value;
    
    if (!code || !name) {
      await MODAL.alert('Missing Info', 'Please enter course code and name.');
      return;
    }
    
    if (!year || !semester) {
      await MODAL.alert('Missing Info', 'Please select Academic Year and Semester for this course.');
      return;
    }
    
    const yearInt = parseInt(year);
    const semInt = parseInt(semester);
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) {
        await MODAL.error('Error', 'Could not identify your account. Please logout and login again.');
        return;
      }
      
      console.log('[LEC] Adding course for lecturer:', myId);
      
      const existing = await DB.COURSE.get(myId, code, yearInt, semInt);
      if (existing) {
        await MODAL.alert('Course Exists', `Course ${code} already exists for ${yearInt} Semester ${semInt === 1 ? 'First' : 'Second'}.`);
        return;
      }
      
      const user = getCurrentUser();
      await DB.COURSE.set(myId, code, yearInt, semInt, {
        code: code,
        name: name,
        year: yearInt,
        semester: semInt,
        active: true,
        status: 'active',
        createdAt: Date.now(),
        createdBy: user?.name || user?.email || 'unknown',
        lecId: myId
      });
      
      console.log('[LEC] Course saved successfully for lecturer:', myId);
      
      await MODAL.success('Course Created', `${code} - ${name} has been added for ${yearInt} Semester ${semInt === 1 ? 'First' : 'Second'}.`);
      hideAddCourse();
      await viewCourses();
    } catch(err) {
      console.error('Add course error:', err);
      await MODAL.error('Error', err.message);
    }
  }

  // ==================== MY RECORDS TAB ====================
  async function _loadRecords() {
    const container = document.getElementById('records-list');
    if (!container) return;
    
    await fixExistingSessions();
    
    const now = new Date();
    const currentPeriod = getAcademicPeriod(now);
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom:20px">
        <div style="flex:1; min-width:150px">
          <label class="fl">Academic Year</label>
          <select id="records-year" class="fi">
            <option value="">Select Year</option>
            <option value="2023">2023</option>
            <option value="2024">2024</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
            <option value="2028">2028</option>
          </select>
        </div>
        <div style="flex:1; min-width:150px">
          <label class="fl">Semester</label>
          <select id="records-semester" class="fi">
            <option value="">Select Semester</option>
            <option value="1">First Semester</option>
            <option value="2">Second Semester</option>
          </select>
        </div>
        <div style="flex:1; min-width:220px">
          <label class="fl">Course</label>
          <select id="records-course" class="fi">
            <option value="">Select Course</option>
          </select>
        </div>
        <div>
          <button class="btn btn-ug" onclick="LEC.loadRecords()">Load Records</button>
        </div>
      </div>
      <div id="records-results"><div class="att-empty">Select filters and click Load Records</div></div>
    `;
    
    const yearSelect = document.getElementById('records-year');
    const semSelect = document.getElementById('records-semester');
    if (yearSelect) yearSelect.value = currentPeriod.year;
    if (semSelect) semSelect.value = currentPeriod.semester;
    
    if (yearSelect) yearSelect.onchange = () => _populateRecordsCourses();
    if (semSelect) semSelect.onchange = () => _populateRecordsCourses();
    
    await _populateRecordsCourses();
  }

  async function _populateRecordsCourses() {
    const year = document.getElementById('records-year')?.value;
    const semester = document.getElementById('records-semester')?.value;
    const courseSelect = document.getElementById('records-course');
    
    if (!year || !semester || !courseSelect) return;
    
    courseSelect.innerHTML = '<option value=""><span class="spin-ug"></span> Loading...</option>';
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      const periodCourses = allCourses.filter(c => 
        c.year === parseInt(year) && 
        c.semester === parseInt(semester)
      );
      
      if (periodCourses.length === 0) {
        courseSelect.innerHTML = '<option value="">No courses found for this period. End a session first.</option>';
        return;
      }
      
      let options = '<option value="">Select Course</option>';
      for (const course of periodCourses) {
        options += `<option value="${UI.esc(course.code)}">${UI.esc(course.code)} - ${UI.esc(course.name)}</option>`;
      }
      
      courseSelect.innerHTML = options;
      
    } catch(err) { 
      console.error('Populate records courses error:', err);
      courseSelect.innerHTML = '<option value="">Error loading courses</option>'; 
    }
  }

  async function loadRecords() {
    const year = document.getElementById('records-year')?.value;
    const semester = document.getElementById('records-semester')?.value;
    const courseCode = document.getElementById('records-course')?.value;
    const container = document.getElementById('records-results');
    
    if (!year || !semester || !courseCode) {
      await MODAL.alert('Missing Info', 'Please select Year, Semester, and Course.');
      return;
    }
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading sessions...</div>';
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      const allSessions = await DB.SESSION.byLec(myId);
      const yearInt = parseInt(year);
      const semInt = parseInt(semester);
      
      const filteredSessions = allSessions.filter(s => {
        return s.courseCode === courseCode && 
               s.active === false && 
               s.year === yearInt && 
               s.semester === semInt;
      }).sort((a, b) => new Date(b.date) - new Date(a.date));
      
      if (filteredSessions.length === 0) {
        container.innerHTML = '<div class="no-rec">No ended sessions found for this course. End a session first.</div>';
        return;
      }
      
      let html = `<h3 style="margin-bottom:15px">📋 ${UI.esc(courseCode)}</h3>`;
      html += `<div style="margin-bottom:20px"><button class="btn btn-ug" onclick="LEC.exportAllSessionsToExcel('${courseCode}', ${yearInt}, ${semInt})">📊 Export All to Excel</button></div>`;
      
      for (const session of filteredSessions) {
        const records = session.records ? Object.values(session.records) : [];
        const displayRecords = records.slice(0, 5);
        const hasMore = records.length > 5;
        
        html += `
          <div class="sess-card" style="margin-bottom:16px">
            <div style="background:var(--ug); color:white; padding:12px; border-radius:8px 8px 0 0; margin:-13px -13px 0 -13px; display:flex; justify-content:space-between; flex-wrap:wrap">
              <div>
                <strong>📅 ${session.date}</strong> 
                <span style="margin-left:10px">⏱️ ${session.durationMins || 60} min</span>
                <span style="margin-left:10px">👥 ${records.length} students</span>
              </div>
              <div>
                <button class="btn btn-secondary btn-sm" onclick="LEC.exportSessionToExcel('${session.id}')">📥 Download Excel</button>
                <button class="btn btn-outline btn-sm" onclick="LEC.showManualCheckinModal('${session.id}', '${courseCode}')" style="margin-left:5px">📝 Manual Check-in</button>
              </div>
            </div>
            <div style="padding:12px; overflow-x:auto">
              <table style="width:100%; border-collapse:collapse">
                <thead>
                  <tr style="border-bottom:2px solid var(--border)">
                    <th style="padding:8px">#</th>
                    <th style="padding:8px">Student Name</th>
                    <th style="padding:8px">Student ID</th>
                    <th style="padding:8px">Time</th>
                    <th style="padding:8px">Method</th>
                  </tr>
                </thead>
                <tbody>
                  ${displayRecords.map((r, i) => `
                    <tr style="border-bottom:1px solid var(--border2)">
                      <td style="padding:8px">${i+1}</td>
                      <td style="padding:8px">${UI.esc(r.name)}</td>
                      <td style="padding:8px">${UI.esc(r.studentId)}</td>
                      <td style="padding:8px">${r.time}</td>
                      <td style="padding:8px">${r.authMethod === 'manual' ? '📝 Manual' : '🔐 Passkey'}</td>
                    </tr>
                  `).join('')}
                  ${hasMore ? `<tr><td colspan="5" style="padding:12px; text-align:center; color:var(--text3)">... and ${records.length - 5} more students</td></tr>` : ''}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }
      container.innerHTML = html;
    } catch(err) {
      console.error('Load records error:', err);
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  async function showManualCheckinModal(sessionId, courseCode) {
    const studentId = await MODAL.prompt(
      'Manual Check-in',
      `Enter Student ID for ${courseCode}:`,
      { icon: '🎓', placeholder: 'e.g., 10967696', confirmLabel: 'Check In' }
    );
    if (!studentId) return;
    
    const session = await DB.SESSION.get(sessionId);
    if (!session) {
      await MODAL.error('Error', 'Session not found.');
      return;
    }
    
    const normalizedId = studentId.trim().toUpperCase();
    const student = await DB.STUDENTS.byStudentId(normalizedId);
    
    if (!student) {
      await MODAL.alert('Student Not Found', `No student found with ID: ${normalizedId}`);
      return;
    }
    
    const myId = getCurrentLecturerId();
    const isEnrolled = await DB.ENROLLMENT.isEnrolled(normalizedId, myId, courseCode);
    if (!isEnrolled) {
      const enrollNow = await MODAL.confirm('Student Not Enrolled', `${student.name} is not enrolled. Enroll and check in?`, { confirmLabel: 'Yes' });
      if (!enrollNow) return;
      await DB.ENROLLMENT.enroll(normalizedId, myId, courseCode, session.courseName, session.semester, session.year);
    }
    
    if (await DB.SESSION.hasSid(sessionId, normalizedId)) {
      await MODAL.alert('Already Checked In', `${student.name} already checked in.`);
      return;
    }
    
    await DB.SESSION.addDevice(sessionId, `manual_${Date.now()}`);
    await DB.SESSION.addSid(sessionId, normalizedId);
    await DB.SESSION.pushRecord(sessionId, {
      name: student.name, 
      studentId: normalizedId, 
      biometricId: `manual_${Date.now()}`,
      authMethod: 'manual', 
      locNote: 'Manual check-in', 
      time: UI.nowTime(),
      checkedAt: Date.now(), 
      manualCheckin: true, 
      checkedBy: getCurrentUser()?.name
    });
    
    await MODAL.success('Checked In', `${student.name} checked in successfully.`);
    await loadRecords();
  }

  async function exportSessionToExcel(sessionId) {
    if (typeof XLSX === 'undefined') { 
      await MODAL.alert('Library Error', 'Excel export not loaded.'); 
      return; 
    }
    const session = await DB.SESSION.get(sessionId);
    if (!session) return;
    
    const records = session.records ? Object.values(session.records) : [];
    const wsData = [
      ['Attendance Record', session.courseCode, session.courseName],
      ['Academic Period', `${session.year} - ${session.semester === 1 ? 'First Semester' : 'Second Semester'}`],
      ['Date', session.date],
      ['Duration', `${session.durationMins || 60} minutes`],
      ['Lecturer', session.lecturer],
      [],
      ['#', 'Student Name', 'Student ID', 'Check-in Time', 'Verification Method']
    ];
    records.forEach((r, i) => wsData.push([i+1, r.name, r.studentId, r.time, r.authMethod === 'manual' ? 'Manual' : 'Passkey']));
    wsData.push([], ['Total Students Present:', records.length]);
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{wch:5}, {wch:25}, {wch:15}, {wch:12}, {wch:18}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Attendance_${session.courseCode}_${session.year}_Sem${session.semester}`);
    XLSX.writeFile(wb, `UG_ATT_${session.courseCode}_${session.year}_Sem${session.semester}.xlsx`);
    await MODAL.success('Export Complete', 'Excel file downloaded.');
  }

  async function exportAllSessionsToExcel(courseCode, year, semester) {
    if (typeof XLSX === 'undefined') { 
      await MODAL.alert('Library Error', 'Excel export not loaded.'); 
      return; 
    }
    const myId = getCurrentLecturerId();
    if (!myId) throw new Error('Unable to identify lecturer');
    
    const allSessions = await DB.SESSION.byLec(myId);
    const filteredSessions = allSessions.filter(s => 
      s.courseCode === courseCode && 
      s.active === false && 
      s.year === year && 
      s.semester === semester
    ).sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const wb = XLSX.utils.book_new();
    
    const summaryData = [
      ['Attendance Summary Report'],
      [`Course: ${courseCode}`],
      [`Academic Year: ${year} - Semester ${semester === 1 ? 'First' : 'Second'}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [`Total Sessions: ${filteredSessions.length}`],
      [],
      ['Student ID', 'Student Name', 'Sessions Attended', 'Total Sessions', 'Attendance Rate (%)']
    ];
    
    const studentStats = new Map();
    for (const session of filteredSessions) {
      const records = session.records ? Object.values(session.records) : [];
      for (const r of records) {
        if (!studentStats.has(r.studentId)) {
          studentStats.set(r.studentId, { name: r.name, attended: 0, total: filteredSessions.length });
        }
        studentStats.get(r.studentId).attended++;
      }
    }
    
    for (const [sid, stat] of studentStats) {
      const rate = ((stat.attended / stat.total) * 100).toFixed(1);
      summaryData.push([sid, stat.name, stat.attended, stat.total, rate]);
    }
    
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');
    
    for (const session of filteredSessions) {
      const records = session.records ? Object.values(session.records) : [];
      const sessionData = [
        [`Session: ${session.date}`],
        [`Total Students: ${records.length}`],
        [],
        ['#', 'Student Name', 'Student ID', 'Check-in Time', 'Verification Method']
      ];
      records.forEach((r, i) => sessionData.push([i+1, r.name, r.studentId, r.time, r.authMethod === 'manual' ? 'Manual' : 'Passkey']));
      const ws = XLSX.utils.aoa_to_sheet(sessionData);
      XLSX.utils.book_append_sheet(wb, ws, session.date.replace(/\//g, '-').substring(0, 31));
    }
    
    XLSX.writeFile(wb, `UG_ATT_${courseCode}_${year}_Sem${semester}_FULL.xlsx`);
    await MODAL.success('Export Complete', 'Excel workbook downloaded.');
  }

  // ==================== REPORTS TAB ====================
  async function _loadReports() {
    const container = document.getElementById('reports-list');
    if (!container) return;
    
    await fixExistingSessions();
    
    const now = new Date();
    const currentPeriod = getAcademicPeriod(now);
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom:20px">
        <div style="flex:1; min-width:150px">
          <label class="fl">Academic Year</label>
          <select id="report-year" class="fi">
            <option value="">Select Year</option>
            <option value="2023">2023</option>
            <option value="2024">2024</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
          </select>
        </div>
        <div style="flex:1; min-width:150px">
          <label class="fl">Semester</label>
          <select id="report-semester" class="fi">
            <option value="">Select Semester</option>
            <option value="1">First Semester</option>
            <option value="2">Second Semester</option>
          </select>
        </div>
        <div style="flex:1; min-width:220px">
          <label class="fl">Course</label>
          <select id="report-course" class="fi">
            <option value="">Select Course</option>
          </select>
        </div>
        <div>
          <button class="btn btn-ug" onclick="LEC.generateReport()">Generate Report</button>
        </div>
        <div>
          <button class="btn btn-secondary" onclick="LEC.exportReportToExcel()">📥 Export Excel</button>
        </div>
      </div>
      <div id="report-results"><div class="att-empty">Select filters and click Generate Report</div></div>
    `;
    
    const yearSelect = document.getElementById('report-year');
    const semSelect = document.getElementById('report-semester');
    if (yearSelect) yearSelect.value = currentPeriod.year;
    if (semSelect) semSelect.value = currentPeriod.semester;
    
    if (yearSelect) yearSelect.onchange = () => _populateReportCourses();
    if (semSelect) semSelect.onchange = () => _populateReportCourses();
    
    await _populateReportCourses();
  }

  async function _populateReportCourses() {
    const year = document.getElementById('report-year')?.value;
    const semester = document.getElementById('report-semester')?.value;
    const courseSelect = document.getElementById('report-course');
    
    if (!year || !semester || !courseSelect) return;
    
    courseSelect.innerHTML = '<option value=""><span class="spin-ug"></span> Loading...</option>';
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      const periodCourses = allCourses.filter(c => 
        c.year === parseInt(year) && 
        c.semester === parseInt(semester)
      );
      
      if (periodCourses.length === 0) {
        courseSelect.innerHTML = '<option value="">No courses found for this period. End a session first.</option>';
        return;
      }
      
      let options = '<option value="">Select Course</option>';
      for (const course of periodCourses) {
        options += `<option value="${UI.esc(course.code)}">${UI.esc(course.code)} - ${UI.esc(course.name)}</option>`;
      }
      
      courseSelect.innerHTML = options;
      
    } catch(err) { 
      console.error('Populate report courses error:', err);
      courseSelect.innerHTML = '<option value="">Error loading courses</option>'; 
    }
  }

  async function generateReport() {
    const year = document.getElementById('report-year')?.value;
    const semester = document.getElementById('report-semester')?.value;
    const courseCode = document.getElementById('report-course')?.value;
    const container = document.getElementById('report-results');
    
    if (!year || !semester || !courseCode) {
      await MODAL.alert('Missing Info', 'Please select Year, Semester, and Course.');
      return;
    }
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Generating report...</div>';
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      const allSessions = await DB.SESSION.byLec(myId);
      const yearInt = parseInt(year);
      const semInt = parseInt(semester);
      
      const filteredSessions = allSessions.filter(s => 
        s.courseCode === courseCode && 
        s.active === false && 
        s.year === yearInt && 
        s.semester === semInt
      );
      
      if (filteredSessions.length === 0) {
        container.innerHTML = '<div class="no-rec">No ended sessions found for this course.</div>';
        return;
      }
      
      const studentStats = new Map();
      for (const session of filteredSessions) {
        const records = session.records ? Object.values(session.records) : [];
        for (const r of records) {
          if (!studentStats.has(r.studentId)) {
            studentStats.set(r.studentId, { name: r.name, attended: 0 });
          }
          studentStats.get(r.studentId).attended++;
        }
      }
      
      const totalSessions = filteredSessions.length;
      const sortedStats = Array.from(studentStats.entries()).sort((a,b) => b[1].attended - a[1].attended);
      
      let html = `
        <div style="margin-bottom:20px">
          <h3>📊 Attendance Report: ${UI.esc(courseCode)}</h3>
          <p class="sub">${yearInt} - ${semInt === 1 ? 'First Semester' : 'Second Semester'}</p>
        </div>
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:20px">
          <div class="stat-card"><div class="stat-value">${totalSessions}</div><div class="stat-label">Total Sessions</div></div>
          <div class="stat-card"><div class="stat-value">${studentStats.size}</div><div class="stat-label">Total Students</div></div>
          <div class="stat-card"><div class="stat-value">${Math.round(Array.from(studentStats.values()).reduce((sum,s) => sum + s.attended, 0) / totalSessions)}</div><div class="stat-label">Avg per Session</div></div>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%; border-collapse:collapse">
            <thead>
              <tr style="background:var(--ug); color:white">
                <th style="padding:10px">#</th>
                <th style="padding:10px">Student ID</th>
                <th style="padding:10px">Student Name</th>
                <th style="padding:10px">Attended</th>
                <th style="padding:10px">Rate</th>
                <th style="padding:10px">Status</th>
               </tr>
            </thead>
            <tbody>
      `;
      
      let i = 1;
      for (const [sid, stat] of sortedStats) {
        const rate = ((stat.attended / totalSessions) * 100).toFixed(1);
        const rateNum = parseFloat(rate);
        let status = '';
        let statusColor = '';
        if (rateNum >= 80) { 
          status = '✅ Excellent'; 
          statusColor = 'var(--teal)'; 
        } else if (rateNum >= 60) { 
          status = '⚠️ Good'; 
          statusColor = 'var(--amber)'; 
        } else { 
          status = '❌ Poor'; 
          statusColor = 'var(--danger)'; 
        }
        
        html += `
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:8px">${i++}</td>
            <td style="padding:8px">${UI.esc(sid)}</td>
            <td style="padding:8px">${UI.esc(stat.name)}</td>
            <td style="padding:8px; text-align:center">${stat.attended}/${totalSessions}</td>
            <td style="padding:8px; text-align:center; color:${statusColor}">${rate}%</td>
            <td style="padding:8px; color:${statusColor}">${status}</td>
          </tr>
        `;
      }
      
      html += `
            </tbody>
          </table>
        </div>
      `;
      
      container.innerHTML = html;
      S.currentReportData = { year: yearInt, semester: semInt, courseCode, studentStats, totalSessions };
      
    } catch(err) {
      console.error('Generate report error:', err);
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  async function exportReportToExcel() {
    if (typeof XLSX === 'undefined') { 
      await MODAL.alert('Library Error', 'Excel export not loaded.'); 
      return; 
    }
    if (!S.currentReportData) { 
      await MODAL.alert('No Data', 'Generate a report first.'); 
      return; 
    }
    
    const { year, semester, courseCode, studentStats, totalSessions } = S.currentReportData;
    const wsData = [
      ['Attendance Report'],
      [`Course: ${courseCode}`],
      [`Academic Year: ${year} - Semester ${semester === 1 ? 'First' : 'Second'}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [`Total Sessions: ${totalSessions}`, `Total Students: ${studentStats.size}`],
      [],
      ['#', 'Student ID', 'Student Name', 'Sessions Attended', 'Total Sessions', 'Attendance Rate (%)', 'Status']
    ];
    
    let i = 1;
    for (const [sid, stat] of studentStats) {
      const rate = ((stat.attended / totalSessions) * 100).toFixed(1);
      wsData.push([i++, sid, stat.name, stat.attended, totalSessions, rate, parseFloat(rate) >= 60 ? 'Good Standing' : 'At Risk']);
    }
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{wch:5}, {wch:15}, {wch:25}, {wch:18}, {wch:15}, {wch:18}, {wch:15}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Report_${courseCode}_${year}_Sem${semester}`);
    XLSX.writeFile(wb, `UG_ATT_Report_${courseCode}_${year}_Sem${semester}.xlsx`);
    await MODAL.success('Export Complete', 'Report downloaded.');
  }

  // ==================== COURSE MANAGEMENT TAB ====================
  async function _loadCourses() {
    const container = document.getElementById('active-courses-list');
    if (!container) return;
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom:20px">
        <div style="flex:1; min-width:150px">
          <label class="fl">Academic Year</label>
          <select id="course-year" class="fi">
            <option value="">Select Year</option>
            <option value="2023">2023</option>
            <option value="2024">2024</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
          </select>
        </div>
        <div style="flex:1; min-width:150px">
          <label class="fl">Semester</label>
          <select id="course-semester" class="fi">
            <option value="">Select Semester</option>
            <option value="1">First Semester</option>
            <option value="2">Second Semester</option>
          </select>
        </div>
        <div>
          <button class="btn btn-ug" onclick="LEC.loadCoursesManagement()">Load Courses</button>
        </div>
      </div>
      <div id="active-courses-list-container"><div class="att-empty">Select Year and Semester to view courses</div></div>
      <div id="archived-courses-list" style="margin-top:20px"><h3>📦 Archived Courses</h3><div class="att-empty">Select Year and Semester to view archived courses</div></div>
    `;
  }

  async function loadCoursesManagement() {
    const year = document.getElementById('course-year')?.value;
    const semester = document.getElementById('course-semester')?.value;
    const activeContainer = document.getElementById('active-courses-list-container');
    const archivedContainer = document.getElementById('archived-courses-list');
    
    if (!year || !semester) {
      await MODAL.alert('Missing Info', 'Please select Year and Semester.');
      return;
    }
    
    activeContainer.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading courses...</div>';
    if (archivedContainer) archivedContainer.innerHTML = '<div class="att-empty">Loading...</div>';
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      const sessions = await DB.SESSION.byLec(myId);
      
      const yearInt = parseInt(year);
      const semInt = parseInt(semester);
      
      const activeCourses = [];
      const archivedCourses = [];
      
      for (const course of allCourses) {
        if (course.year === yearInt && course.semester === semInt) {
          let sessionCount = 0;
          let lastSessionDate = course.createdAt ? new Date(course.createdAt).toLocaleDateString() : 'Never';
          
          for (const session of sessions) {
            if (session.year === yearInt && session.semester === semInt && session.courseCode === course.code) {
              sessionCount++;
              lastSessionDate = session.date;
            }
          }
          
          const courseInfo = {
            code: course.code,
            name: course.name,
            active: course.active !== false,
            sessionCount: sessionCount,
            lastSessionDate: lastSessionDate,
            disabledAt: course.disabledAt,
            year: course.year,
            semester: course.semester
          };
          
          if (course.active !== false) {
            activeCourses.push(courseInfo);
          } else {
            archivedCourses.push(courseInfo);
          }
        }
      }
      
      activeCourses.sort((a,b) => a.code.localeCompare(b.code));
      archivedCourses.sort((a,b) => a.code.localeCompare(b.code));
      
      if (activeCourses.length === 0) {
        activeContainer.innerHTML = '<div class="no-rec">No active courses found for this period.</div>';
      } else {
        activeContainer.innerHTML = activeCourses.map(c => `
          <div class="course-management-card">
            <div class="course-header">
              <div class="course-code">${UI.esc(c.code)}</div>
              <div class="course-status active">🟢 Active</div>
            </div>
            <div class="course-name">${UI.esc(c.name)}</div>
            <div class="course-meta">📊 ${c.sessionCount} sessions · Last: ${c.lastSessionDate}</div>
            <button class="btn btn-warning btn-sm" onclick="LEC.disableCourse('${c.code}', ${c.year}, ${c.semester})">⏹️ Disable Course</button>
          </div>
        `).join('');
      }
      
      if (archivedContainer) {
        if (archivedCourses.length === 0) {
          archivedContainer.innerHTML = '<div class="no-rec">No archived courses for this period.</div>';
        } else {
          archivedContainer.innerHTML = archivedCourses.map(c => `
            <div class="course-management-card archived" style="opacity:0.8">
              <div class="course-header">
                <div class="course-code">${UI.esc(c.code)}</div>
                <div class="course-status inactive">🔴 Archived</div>
              </div>
              <div class="course-name">${UI.esc(c.name)}</div>
              <div class="course-meta">📊 ${c.sessionCount} sessions · Last: ${c.lastSessionDate}${c.disabledAt ? ` · Disabled: ${new Date(c.disabledAt).toLocaleDateString()}` : ''}</div>
              <button class="btn btn-teal btn-sm" onclick="LEC.enableCourse('${c.code}', ${c.year}, ${c.semester})">🔄 Enable Course</button>
            </div>
          `).join('');
        }
      }
    } catch(err) {
      console.error('Load courses error:', err);
      activeContainer.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  async function disableCourse(courseCode, year, semester) {
    const confirmed = await MODAL.confirm('Disable Course', `Disable ${courseCode} for ${year} Semester ${semester === 1 ? 'First' : 'Second'}? This will move it to archives.`, { confirmLabel: 'Yes, Disable', confirmCls: 'btn-warning' });
    if (!confirmed) return;
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      await DB.COURSE.disableCourse(myId, courseCode, year, semester);
      await MODAL.success('Course Disabled', `${courseCode} has been moved to archives for ${year} Semester ${semester === 1 ? 'First' : 'Second'}.`);
      await loadCoursesManagement();
      if (document.getElementById('lec-pg-mycourses').classList.contains('active')) {
        await viewCourses();
      }
    } catch(err) {
      console.error('Disable course error:', err);
      await MODAL.error('Error', err.message);
    }
  }

  async function enableCourse(courseCode, year, semester) {
    const confirmed = await MODAL.confirm('Enable Course', `Enable ${courseCode} for ${year} Semester ${semester === 1 ? 'First' : 'Second'}?`, { confirmLabel: 'Yes, Enable', confirmCls: 'btn-teal' });
    if (!confirmed) return;
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      await DB.COURSE.enableCourse(myId, courseCode, year, semester);
      await MODAL.success('Course Enabled', `${courseCode} is now active for ${year} Semester ${semester === 1 ? 'First' : 'Second'}.`);
      await loadCoursesManagement();
      if (document.getElementById('lec-pg-mycourses').classList.contains('active')) {
        await viewCourses();
      }
    } catch(err) {
      console.error('Enable course error:', err);
      await MODAL.error('Error', err.message);
    }
  }

  // ==================== TAS TAB ====================
  async function _loadTAs() {
    const container = document.getElementById('ta-list');
    if (!container) return;
    
    container.innerHTML = `
      <div class="inner-panel" style="margin-bottom:20px">
        <h3>Invite New Teaching Assistant</h3>
        <div class="field"><label class="fl">TA Email Address</label><input type="email" id="ta-email-input" class="fi" placeholder="ta@ug.edu.gh"/><p class="note" style="font-size:11px; margin-top:5px">The TA will receive an email with their unique invite code and registration link.</p></div>
        <button class="btn btn-ug" onclick="LEC.inviteTA()" style="width:auto; padding:10px 20px; margin-top:10px">📧 Send Invite Email</button>
      </div>
      <div class="list-hdr" style="display:flex; justify-content:space-between; margin-bottom:10px; margin-top:20px">
        <h3>My Teaching Assistants</h3>
        <span class="badge" id="ta-count">0</span>
      </div>
      <div id="ta-list-container"><div class="att-empty">No TAs added yet. Send an invite above.</div></div>
    `;
    await refreshTAList();
  }

  async function refreshTAList() {
    const container = document.getElementById('ta-list-container');
    const countElement = document.getElementById('ta-count');
    if (!container) return;
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) {
        container.innerHTML = '<div class="no-rec">Unable to load TAs</div>';
        return;
      }
      
      const allTAs = await DB.TA.getAll();
      const myTAs = allTAs.filter(ta => ta.lecturers && ta.lecturers.includes(myId) && ta.active !== false);
      
      if (countElement) countElement.textContent = myTAs.length;
      
      if (myTAs.length === 0) {
        container.innerHTML = '<div class="no-rec">No TAs added yet. Send an invite above.</div>';
        return;
      }
      
      container.innerHTML = myTAs.map(ta => `
        <div class="att-item">
          <div class="att-dot" style="background:var(--teal)"></div>
          <span class="att-name">${UI.esc(ta.name || 'Pending Registration')}</span>
          <span class="att-sid">${UI.esc(ta.email)}</span>
          <span class="pill ${ta.status === 'active' ? 'pill-teal' : 'pill-gray'}">${ta.status === 'active' ? '✓ Registered' : '⏳ Pending'}</span>
          <button class="btn btn-danger btn-sm" onclick="LEC.endTenure('${ta.id}')">End Tenure</button>
        </div>
      `).join('');
    } catch(err) {
      console.error('Load TAs error:', err);
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  async function inviteTA() {
    const email = document.getElementById('ta-email-input')?.value.trim().toLowerCase();
    if (!email) { 
      await MODAL.alert('Missing Info', 'Please enter TA email address.'); 
      return; 
    }
    if (!email.includes('@')) { 
      await MODAL.alert('Invalid Email', 'Please enter a valid email address.'); 
      return; 
    }
    
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const inviteKey = UI.makeToken();
    const user = getCurrentUser();
    const signupLink = `${CONFIG.SITE_URL}?code=${code}#ta-signup`;
    
    await DB.TA.setInvite(inviteKey, { 
      code, 
      toEmail: email, 
      lecturerId: getCurrentLecturerId(), 
      lecturerName: user?.name, 
      createdAt: Date.now(), 
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, 
      usedAt: null 
    });
    
    let emailSent = false;
    if (typeof AUTH !== 'undefined' && AUTH._sendTAInviteEmail) {
      emailSent = await AUTH._sendTAInviteEmail(email, '', code, signupLink, user?.name);
    }
    
    if (emailSent) {
      await MODAL.success('Invite Sent', `An invite email has been sent to ${email}`);
    } else {
      await MODAL.alert('Invite Code', `
        <div style="text-align:center">
          <div style="font-size:36px; background:var(--ug); color:var(--gold); padding:20px; border-radius:10px">${code}</div>
          <p>Share this code with the TA at ${email}</p>
          <p>Registration: <a href="${signupLink}" target="_blank">${signupLink}</a></p>
        </div>`, { icon: '📧' });
    }
    
    document.getElementById('ta-email-input').value = '';
    await refreshTAList();
  }

  async function endTenure(taId) {
    const confirmed = await MODAL.confirm('End Tenure', 'End this TA\'s tenure? They will no longer access your dashboard.', { confirmLabel: 'Yes', confirmCls: 'btn-danger' });
    if (!confirmed) return;
    
    const myId = getCurrentLecturerId();
    if (!myId) return;
    
    const ta = await DB.TA.get(taId);
    if (ta && ta.lecturers) {
      const updatedLecturers = ta.lecturers.filter(id => id !== myId);
      await DB.TA.update(taId, { 
        lecturers: updatedLecturers, 
        endedTenures: { ...(ta.endedTenures || {}), [myId]: Date.now() } 
      });
      if (updatedLecturers.length === 0) await DB.TA.update(taId, { active: false });
      await MODAL.success('Tenure Ended', 'TA removed from your dashboard.');
      await refreshTAList();
    }
  }

  // ==================== RESET FORM ====================
  function resetForm() {
    S.locOn = true; 
    S.locAcquired = false; 
    S.lecLat = S.lecLng = null; 
    S.session = null;
    
    if (S.activeSessionsRefresh) clearInterval(S.activeSessionsRefresh);
    if (S.unsubRec) { S.unsubRec(); S.unsubRec = null; }
    if (S.unsubBlk) { S.unsubBlk(); S.unsubBlk = null; }
    if (S.tickTimer) { clearInterval(S.tickTimer); S.tickTimer = null; }
    if (S.refreshInterval) { clearInterval(S.refreshInterval); S.refreshInterval = null; }
    
    const activeTab = document.querySelector('#view-lecturer .tab.active');
    const defaultTab = activeTab ? activeTab.getAttribute('data-tab') : 'mycourses';
    tab(defaultTab);
  }

  // ==================== EXPORTS ====================
  return {
    tab, 
    resetForm,
    viewCourses, 
    showAddCourse, 
    hideAddCourse, 
    addNewCourse, 
    showStartSessionPage, 
    editCourse,
    generateAndStartSession, 
    getStartLocation,
    endSessionById, 
    downloadSessionQR,
    loadRecords, 
    exportSessionToExcel, 
    exportAllSessionsToExcel, 
    showManualCheckinModal,
    generateReport, 
    exportReportToExcel,
    loadCoursesManagement, 
    disableCourse, 
    enableCourse,
    inviteTA, 
    endTenure, 
    refreshTAList,
    showPasskeyResetUI,
    showDeviceManagementUI
  };
})();

// Ensure LEC is globally available
window.LEC = LEC;
console.log('[session.js] LEC module loaded and registered globally');
console.log('[session.js] Exported functions:', {
  tab: typeof LEC.tab,
  showPasskeyResetUI: typeof LEC.showPasskeyResetUI,
  showDeviceManagementUI: typeof LEC.showDeviceManagementUI
});

// Also expose individual functions for debugging
window.LEC_tab = LEC.tab;
window.LEC_viewCourses = LEC.viewCourses;
window.LEC_showPasskeyResetUI = LEC.showPasskeyResetUI;
window.LEC_showDeviceManagementUI = LEC.showDeviceManagementUI;
