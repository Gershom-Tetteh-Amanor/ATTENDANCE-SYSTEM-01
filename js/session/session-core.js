/* session-core.js — Core utilities and state for Lecturer/TA Dashboard */
'use strict';

const SESSION_CORE = (() => {
  // State management
  const state = {
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
    activeSessionsRefresh: null,
    currentSessionRecords: null,
    currentSessionData: null,
    currentRecordsCourseCode: null,
    currentRecordsYear: null,
    currentRecordsSemester: null,
    selectedReportCourse: null,
    selectedReportYear: null,
    selectedReportSemester: null,
    courseSessionsCache: []
  };

  // Helper to get current lecturer/TA ID
  function getCurrentLecturerId() {
    const user = AUTH.getSession();
    if (!user) {
      console.error('[SESSION] No user session found');
      return null;
    }
    if (user.role === 'ta') {
      return user.activeLecturerId || user.id;
    }
    return user.id;
  }

  function getCurrentUser() {
    return AUTH.getSession();
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function getAcademicPeriod(date = new Date()) {
    const year = date.getFullYear();
    const month = date.getMonth();
    let semester;
    if (month >= 7) semester = 1;
    else if (month >= 0 && month <= 6) semester = 2;
    else semester = 1;
    return { year, semester };
  }

  function getAttendanceCategory(percentage) {
    if (percentage >= 80) return { level: 'excellent', text: '✅ Excellent', color: 'var(--teal)' };
    if (percentage >= 75) return { level: 'good', text: '⚠️ Good', color: 'var(--amber)' };
    if (percentage >= 60) return { level: 'atRisk', text: '🔴 At Risk', color: '#e67e22' };
    return { level: 'critical', text: '❌ Critical', color: 'var(--danger)' };
  }

  function getAvailableYears() {
    const currentYear = new Date().getFullYear();
    const startYear = 2020;
    const years = [];
    for (let year = startYear; year <= currentYear; year++) {
      years.push(year);
    }
    return years;
  }

  // Timer management
  function stopTimers() {
    if (state.activeSessionsRefresh) clearInterval(state.activeSessionsRefresh);
    if (state.unsubRec) { state.unsubRec(); state.unsubRec = null; }
    if (state.unsubBlk) { state.unsubBlk(); state.unsubBlk = null; }
    if (state.tickTimer) { clearInterval(state.tickTimer); state.tickTimer = null; }
    if (state.refreshInterval) { clearInterval(state.refreshInterval); state.refreshInterval = null; }
  }

  // Reset form
  function resetForm() {
    console.log('[SESSION] resetForm called');
    state.locOn = true;
    state.locAcquired = false;
    state.lecLat = state.lecLng = null;
    state.session = null;
    stopTimers();
  }

  // Switch tab (delegates to specific modules)
  async function switchTab(tabName) {
    console.log('[SESSION] Switching to tab:', tabName);
    
    document.querySelectorAll('#view-lecturer .nav-item').forEach(item => {
      item.classList.remove('active');
      if (item.getAttribute('data-tab') === tabName) {
        item.classList.add('active');
      }
    });
    
    document.querySelectorAll('#view-lecturer .tab-content').forEach(content => {
      content.style.display = 'none';
    });
    
    const activeContent = document.getElementById(`${tabName}-view`);
    if (activeContent) {
      activeContent.style.display = 'block';
    }
    
    const tbTitle = document.getElementById('lec-tb-title');
    const titles = {
      mycourses: '📚 My Courses',
      session: '🟢 Active Sessions',
      records: '📋 Attendance Records',
      reports: '📊 Reports',
      courses: '📖 Course Management',
      tas: '👥 Teaching Assistants',
      biometric: '🔐 Passkey Reset'
    };
    if (tbTitle && titles[tabName]) {
      tbTitle.textContent = titles[tabName];
    }
    
    // Delegate to specific modules based on tab
    if (tabName === 'mycourses') {
      if (typeof SESSION_COURSES !== 'undefined') {
        await SESSION_COURSES.loadDashboardStats();
        await SESSION_COURSES.loadMyCoursesGrid();
      }
    } else if (tabName === 'session') {
      if (typeof SESSION_SESSIONS !== 'undefined') {
        await SESSION_SESSIONS.loadActiveSessions();
      }
    } else if (tabName === 'records') {
      if (typeof SESSION_ATTENDANCE !== 'undefined') {
        await SESSION_ATTENDANCE.loadRecords();
      }
    } else if (tabName === 'reports') {
      if (typeof SESSION_REPORTS !== 'undefined') {
        await SESSION_REPORTS.loadReports();
      }
    } else if (tabName === 'courses') {
      if (typeof SESSION_COURSES !== 'undefined') {
        await SESSION_COURSES.loadCourses();
      }
    } else if (tabName === 'tas') {
      if (typeof SESSION_ATTENDANCE !== 'undefined') {
        await SESSION_ATTENDANCE.loadTAs();
      }
    } else if (tabName === 'biometric') {
      if (typeof SESSION_CORE !== 'undefined') {
        await loadBiometricTab();
      }
    }
  }

  async function loadBiometricTab() {
    const container = document.getElementById('biometric-reset-content');
    if (!container) return;
    
    container.innerHTML = `
      <div class="inner-panel" style="margin-bottom: 20px;">
        <h3>🔐 Student Passkey Reset</h3>
        <p class="sub">When a student gets a new device, you can reset their passkey and unregister their old device.</p>
        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
          <button class="btn btn-ug" id="reset-passkey-btn" style="width: auto; padding: 10px 20px;">📱 Reset Passkey (New Device)</button>
          <button class="btn btn-secondary" id="manage-devices-btn" style="width: auto; padding: 10px 20px;">🔍 View / Manage Devices</button>
        </div>
      </div>
      <div class="inner-panel">
        <h3>📋 Instructions</h3>
        <ul style="margin-left: 20px; color: var(--text3); font-size: 13px; line-height: 1.8;">
          <li><strong>Device Binding:</strong> Each student's passkey is bound to their specific device</li>
          <li><strong>New Device:</strong> When a student gets a new device, their old passkey won't work</li>
          <li><strong>Reset Passkey:</strong> Click "Reset Passkey" and enter the student's ID</li>
          <li>The student will receive a link to register their fingerprint/face passkey on their new device</li>
          <li><strong>Old Device Unregistered:</strong> After reset, the old device cannot be used for check-ins</li>
        </ul>
      </div>
      <div class="inner-panel">
        <h3>📊 Recent Reset Requests</h3>
        <div id="recent-resets-list"><div class="att-empty">Loading...</div></div>
      </div>
    `;
    
    const resetBtn = document.getElementById('reset-passkey-btn');
    const manageBtn = document.getElementById('manage-devices-btn');
    
    if (resetBtn) resetBtn.onclick = () => showPasskeyResetUI();
    if (manageBtn) manageBtn.onclick = () => showDeviceManagementUI();
    
    await loadRecentResets();
  }

  async function loadRecentResets() {
    const container = document.getElementById('recent-resets-list');
    if (!container) return;
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) {
        container.innerHTML = '<div class="no-rec">⚠️ Unable to load reset history</div>';
        return;
      }
      
      const allResets = await DB.BIOMETRIC_RESET.getAllForLecturer(myId);
      const recentResets = allResets.sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
      
      if (recentResets.length === 0) {
        container.innerHTML = '<div class="no-rec">📭 No recent reset requests</div>';
        return;
      }
      
      let html = '<div style="font-size: 13px;">';
      for (const reset of recentResets) {
        const date = new Date(reset.createdAt).toLocaleString();
        const status = reset.used ? '✅ Used' : (reset.expiresAt < Date.now() ? '⏰ Expired' : '⏳ Pending');
        html += `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid var(--border); flex-wrap: wrap; gap: 8px;">
            <div>
              <strong>${escapeHtml(reset.studentName)}</strong><br>
              <span style="font-size: 11px; color: var(--text3);">${escapeHtml(reset.studentId)}</span>
            </div>
            <div style="font-size: 11px;">
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
      container.innerHTML = '<div class="no-rec">❌ Error loading reset history</div>';
    }
  }

  async function showPasskeyResetUI() {
    const studentId = await MODAL.prompt(
      'Reset Student Passkey',
      'Enter the Student ID of the student who needs to reset their passkey:',
      { icon: '🎓', placeholder: 'e.g., 10967696', confirmLabel: 'Continue' }
    );
    if (!studentId) return;
    
    const student = await DB.STUDENTS.byStudentId(studentId.toUpperCase());
    if (!student) {
      await MODAL.error('Student Not Found', `❌ No student found with ID: ${studentId}`);
      return;
    }
    
    const confirmReset = await MODAL.confirm(
      'Confirm Passkey Reset',
      `Reset passkey for:<br/><br/>
       <strong>${escapeHtml(student.name)}</strong><br/>
       ID: ${escapeHtml(student.studentId)}<br/>
       Email: ${escapeHtml(student.email)}<br/><br/>
       <span style="color: var(--danger);">⚠️ This will erase their current passkey and unregister their device.</span>`,
      { confirmLabel: 'Send Reset Link', confirmCls: 'btn-warning' }
    );
    if (!confirmReset) return;
    
    try {
      const myId = getCurrentLecturerId();
      const user = getCurrentUser();
      const token = Math.random().toString(36).substring(2, 34);
      const resetLink = `${CONFIG.SITE_URL}?reset=${token}`;
      
      await DB.STUDENTS.update(student.studentId, {
        webAuthnCredentialId: null,
        webAuthnData: null,
        lastBiometricReset: Date.now(),
        biometricResetReason: 'device_change'
      });
      
      await DB.BIOMETRIC_RESET.set(token, {
        token, studentId: student.studentId, studentName: student.name,
        studentEmail: student.email, lecturerId: myId,
        lecturerName: user?.name || 'Lecturer', reason: 'device_change_reset',
        createdAt: Date.now(), expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, used: false
      });
      
      await MODAL.alert('Passkey Reset Link', 
        `<div style="text-align: center;">
           <div class="strip-amber" style="margin-bottom: 15px;"><strong>🔗 Share this link with the student:</strong></div>
           <div style="background: var(--surface2); padding: 15px; border-radius: 8px; margin: 10px 0; word-break: break-all;">
             <a href="${resetLink}" target="_blank">${resetLink}</a>
           </div>
           <p style="font-size: 12px; margin-top: 10px;">⏰ This link expires in 7 days.</p>
         </div>`,
        { icon: '🔗', btnLabel: 'OK' }
      );
      await loadRecentResets();
    } catch(err) {
      await MODAL.error('Error', err.message);
    }
  }

  async function showDeviceManagementUI() {
    const studentId = await MODAL.prompt(
      'Manage Student Devices',
      'Enter Student ID to view passkey status:',
      { icon: '🎓', placeholder: 'e.g., 10967696', confirmLabel: 'Search' }
    );
    if (!studentId) return;
    
    const student = await DB.STUDENTS.byStudentId(studentId.toUpperCase());
    if (!student) {
      await MODAL.error('Student Not Found', `❌ No student found with ID: ${studentId}`);
      return;
    }
    
    const hasPasskey = !!(student.webAuthnCredentialId);
    const lastUse = student.lastBiometricUse ? new Date(student.lastBiometricUse).toLocaleString() : 'Never';
    const lastReset = student.lastBiometricReset ? new Date(student.lastBiometricReset).toLocaleString() : 'Never';
    const deviceCount = student.devices ? Object.keys(student.devices).length : 0;
    
    await MODAL.alert(
      `Student: ${escapeHtml(student.name)}`,
      `<div style="text-align: left;">
         <p><strong>ID:</strong> ${escapeHtml(student.studentId)}</p>
         <p><strong>Email:</strong> ${escapeHtml(student.email)}</p>
         <hr style="margin: 10px 0;">
         <p><strong>Passkey Status:</strong> ${hasPasskey ? '✅ Registered' : '❌ Not Registered'}</p>
         <p><strong>Registered Devices:</strong> ${deviceCount}</p>
         <p><strong>Last Passkey Use:</strong> ${lastUse}</p>
         <p><strong>Last Passkey Reset:</strong> ${lastReset}</p>
       </div>`,
      { icon: '📱', btnLabel: 'Close' }
    );
  }

  // Export public API
  return {
    // State
    state,
    // Utilities
    getCurrentLecturerId,
    getCurrentUser,
    escapeHtml,
    getAcademicPeriod,
    getAttendanceCategory,
    getAvailableYears,
    stopTimers,
    resetForm,
    switchTab,
    // Biometric functions
    loadBiometricTab,
    showPasskeyResetUI,
    showDeviceManagementUI,
    loadRecentResets
  };
})();

// Make global
window.SESSION_CORE = SESSION_CORE;
