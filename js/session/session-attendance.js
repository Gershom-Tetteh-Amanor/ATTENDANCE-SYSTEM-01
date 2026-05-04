/* session-attendance.js — Attendance Records, Reports & TA Management */
'use strict';

const SESSION_ATTENDANCE = (() => {
  const core = () => window.SESSION_CORE;
  
  async function loadRecords() {
    const container = document.getElementById('records-list');
    if (!container) return;
    
    const myId = core().getCurrentLecturerId();
    const availableYears = core().getAvailableYears();
    const currentYear = new Date().getFullYear();
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap;">
        <div style="min-width: 120px;">
          <label class="fl">📅 Academic Year</label>
          <select id="records-year" class="fi" onchange="SESSION_ATTENDANCE.populateRecordsCourses()">
            <option value="">Select Year</option>
            ${availableYears.map(y => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`).join('')}
          </select>
        </div>
        <div style="min-width: 120px;">
          <label class="fl">📖 Semester</label>
          <select id="records-semester" class="fi" onchange="SESSION_ATTENDANCE.populateRecordsCourses()">
            <option value="">Select Semester</option>
            <option value="1">First Semester</option>
            <option value="2">Second Semester</option>
          </select>
        </div>
        <div style="min-width: 200px;">
          <label class="fl">📚 Course</label>
          <select id="records-course" class="fi" onchange="SESSION_ATTENDANCE.loadSessionsForCourse()">
            <option value="">Select Course First</option>
          </select>
        </div>
        <div style="min-width: 200px;">
          <label class="fl">📅 View Type</label>
          <select id="records-view-type" class="fi" onchange="SESSION_ATTENDANCE.loadSessionRecords()">
            <option value="">Select Course First</option>
          </select>
        </div>
        <div>
          <button class="btn btn-ug" onclick="SESSION_ATTENDANCE.loadSessionRecords()">🔍 Load Records</button>
        </div>
      </div>
      <div id="records-results"><div class="att-empty">📭 Select filters and click Load Records</div></div>
    `;
  }

  async function populateRecordsCourses() {
    const year = document.getElementById('records-year')?.value;
    const semester = document.getElementById('records-semester')?.value;
    const courseSelect = document.getElementById('records-course');
    if (!year || !semester || !courseSelect) return;
    
    courseSelect.innerHTML = '<option value=""><span class="spin-ug"></span> Loading...</option>';
    
    try {
      const myId = core().getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      const periodCourses = allCourses.filter(c => 
        c.year === parseInt(year) && c.semester === parseInt(semester) && c.active !== false
      );
      
      if (periodCourses.length === 0) {
        courseSelect.innerHTML = '<option value="">📭 No courses found for this period</option>';
        return;
      }
      
      let options = '<option value="">Select Course</option>';
      for (const course of periodCourses) {
        options += `<option value="${core().escapeHtml(course.code)}|${core().escapeHtml(course.name)}">${core().escapeHtml(course.code)} - ${core().escapeHtml(course.name)}</option>`;
      }
      courseSelect.innerHTML = options;
    } catch(err) { 
      courseSelect.innerHTML = '<option value="">❌ Error loading courses</option>'; 
    }
  }

  async function loadSessionsForCourse() {
    // Implementation continues...
    // (This would include the session loading logic)
  }

  async function loadSessionRecords() {
    // Implementation continues...
  }

  async function exportSingleSessionToExcel(sessionId) {
    if (typeof XLSX === 'undefined') { 
      await MODAL.alert('Library Error', 'Excel export not loaded.'); 
      return; 
    }
    
    try {
      const session = await DB.SESSION.get(sessionId);
      if (!session) {
        await MODAL.alert('Error', 'Session not found.');
        return;
      }
      
      const records = session.records ? Object.values(session.records) : [];
      const startedBy = session.lecturer ? (session.lecturer === 'TA' ? 'TA' : 'Lecturer') : 'Lecturer';
      
      const wsData = [
        [`Attendance Records - ${session.courseCode} - ${session.courseName}`],
        [`Session Date: ${session.date}`],
        [`Started By: ${startedBy} - ${session.lecturerName || session.lecturer || 'Unknown'}`],
        [`Duration: ${session.durationMins || 60} minutes`],
        [`Generated: ${new Date().toLocaleString()}`],
        [`Total Check-ins: ${records.length}`],
        [],
        ['#', 'Student ID', 'Student Name', 'Check-in Time', 'Verification Method', 'Distance', 'Location Note']
      ];
      
      records.forEach((r, i) => {
        wsData.push([
          i + 1,
          r.studentId || '',
          r.name || '',
          r.time || new Date(r.checkedAt).toLocaleTimeString(),
          r.authMethod === 'webauthn' ? 'Biometric' : (r.authMethod === 'manual' ? 'Manual' : '—'),
          r.distanceMeters ? r.distanceMeters + 'm' : (r.locNote || '—'),
          r.locNote || ''
        ]);
      });
      
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Session_${session.courseCode}_${session.date.replace(/\s/g, '_')}`);
      XLSX.writeFile(wb, `UG_Session_${session.courseCode}_${session.date.replace(/\s/g, '_')}.xlsx`);
      await MODAL.success('Export Complete', `✅ Session exported with ${records.length} records.`);
      
    } catch(err) {
      console.error('Export session error:', err);
      await MODAL.error('Export Failed', err.message);
    }
  }

  async function loadTAs() {
    const container = document.getElementById('ta-list');
    if (!container) return;
    
    container.innerHTML = `
      <div class="inner-panel" style="margin-bottom: 20px;">
        <h3>👥 Invite New Teaching Assistant</h3>
        <div class="field"><label class="fl">📧 TA Email Address</label><input type="email" id="ta-email-input" class="fi" placeholder="ta@ug.edu.gh"/></div>
        <button class="btn btn-ug" onclick="SESSION_ATTENDANCE.inviteTA()" style="width: auto; padding: 10px 20px; margin-top: 10px;">📧 Send Invite Email</button>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 10px; margin-top: 20px;">
        <h3>👥 My Teaching Assistants</h3>
        <span class="badge" id="ta-count">0</span>
      </div>
      <div id="ta-list-container"><div class="att-empty">📭 No TAs added yet. Send an invite above.</div></div>
    `;
    await refreshTAList();
  }

  async function refreshTAList() {
    const container = document.getElementById('ta-list-container');
    const countElement = document.getElementById('ta-count');
    if (!container) return;
    
    try {
      const myId = core().getCurrentLecturerId();
      if (!myId) {
        container.innerHTML = '<div class="no-rec">⚠️ Unable to load TAs</div>';
        return;
      }
      
      const allTAs = await DB.TA.getAll();
      const myTAs = allTAs.filter(ta => ta.lecturers && ta.lecturers.includes(myId));
      
      if (countElement) countElement.textContent = myTAs.length;
      
      if (myTAs.length === 0) {
        container.innerHTML = '<div class="no-rec">📭 No TAs added yet. Send an invite above.</div>';
        return;
      }
      
      const user = core().getCurrentUser();
      const lecturerName = user?.name || 'Your Lecturer';
      
      container.innerHTML = `<div class="courses-grid">${myTAs.map(ta => `
        <div class="course-card">
          <div class="course-header">
            <span class="course-code">👤 ${core().escapeHtml(ta.name || 'Pending Registration')}</span>
            <span class="badge ${ta.status === 'active' ? 'badge-teal' : 'badge-gray'}">${ta.status === 'active' ? '✅ Active' : '⏳ Pending'}</span>
          </div>
          <div class="course-name">📧 ${core().escapeHtml(ta.email)}</div>
          <div class="course-stats">
            <span>👥 Assigned to: ${core().escapeHtml(lecturerName)}</span>
          </div>
          <div class="course-buttons">
            ${ta.status === 'suspended' ? 
              `<button class="btn btn-teal btn-sm" onclick="SESSION_ATTENDANCE.unsuspendTA('${ta.id}')">🔄 Unsuspend</button>` :
              `<button class="btn btn-warning btn-sm" onclick="SESSION_ATTENDANCE.suspendTA('${ta.id}')">⛔ Suspend</button>`
            }
            <button class="btn btn-danger btn-sm" onclick="SESSION_ATTENDANCE.endTenure('${ta.id}')">🔚 End Tenure</button>
          </div>
        </div>
      `).join('')}</div>`;
    } catch(err) {
      console.error('Load TAs error:', err);
      container.innerHTML = `<div class="no-rec">❌ Error: ${core().escapeHtml(err.message)}</div>`;
    }
  }

  async function suspendTA(taId) {
    const confirmed = await MODAL.confirm('Suspend TA', 'Suspend this TA? They will not be able to access the system.', { confirmCls: 'btn-warning' });
    if (!confirmed) return;
    await DB.TA.update(taId, { status: 'suspended', suspendedAt: Date.now() });
    await MODAL.success('TA Suspended', '✅ The TA has been suspended.');
    await refreshTAList();
  }

  async function unsuspendTA(taId) {
    await DB.TA.update(taId, { status: 'active', unsuspendedAt: Date.now() });
    await MODAL.success('TA Unsuspended', '✅ The TA has been reactivated.');
    await refreshTAList();
  }

  async function inviteTA() {
    const email = document.getElementById('ta-email-input')?.value.trim().toLowerCase();
    if (!email) { await MODAL.alert('Missing Info', '⚠️ Please enter TA email address.'); return; }
    if (!email.includes('@')) { await MODAL.alert('Invalid Email', '⚠️ Please enter a valid email address.'); return; }
    
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const inviteKey = Math.random().toString(36).substring(2, 15);
    const user = core().getCurrentUser();
    const signupLink = `${CONFIG.SITE_URL}?code=${code}#ta-signup`;
    
    await DB.TA.setInvite(inviteKey, { 
      code, toEmail: email, lecturerId: core().getCurrentLecturerId(), 
      lecturerName: user?.name, createdAt: Date.now(), 
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, usedAt: null 
    });
    
    await MODAL.alert('Invite Code', `
      <div style="text-align:center">
        <div style="font-size:36px; background:var(--ug); color:var(--gold); padding:20px; border-radius:10px; margin:10px 0;">${code}</div>
        <p>Share this code with the TA at ${email}</p>
        <p>Registration: <a href="${signupLink}" target="_blank">${signupLink}</a></p>
      </div>
    `, { icon: '📧' });
    
    document.getElementById('ta-email-input').value = '';
    await refreshTAList();
  }

  async function endTenure(taId) {
    const confirmed = await MODAL.confirm('End Tenure', 'End this TA\'s tenure? They will no longer access your dashboard.', { confirmLabel: 'Yes', confirmCls: 'btn-danger' });
    if (!confirmed) return;
    
    const myId = core().getCurrentLecturerId();
    if (!myId) return;
    
    const ta = await DB.TA.get(taId);
    if (ta && ta.lecturers) {
      const updatedLecturers = ta.lecturers.filter(id => id !== myId);
      await DB.TA.update(taId, { lecturers: updatedLecturers, endedTenures: { ...(ta.endedTenures || {}), [myId]: Date.now() } });
      if (updatedLecturers.length === 0) await DB.TA.update(taId, { active: false });
      await MODAL.success('Tenure Ended', '✅ TA removed from your dashboard.');
      await refreshTAList();
    }
  }

  return {
    loadRecords,
    populateRecordsCourses,
    loadSessionsForCourse,
    loadSessionRecords,
    exportSingleSessionToExcel,
    loadTAs,
    refreshTAList,
    suspendTA,
    unsuspendTA,
    inviteTA,
    endTenure
  };
})();

window.SESSION_ATTENDANCE = SESSION_ATTENDANCE;
