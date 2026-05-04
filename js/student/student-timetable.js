/* student-timetable.js — Timetable and personal study time management */
'use strict';

const STUDENT_TIMETABLE = (() => {
  const core = () => window.STUDENT_CORE;
  const location = () => window.STUDENT_LOCATION;
  
  // Load timetable from localStorage
  async function loadTimetable() {
    const student = core().getCurrentStudent();
    const key = `timetable_${student.studentId}_${core().state.currentSelectedYear}_${core().state.currentSelectedSemester}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      core().state.timetable = JSON.parse(saved);
    } else {
      core().state.timetable = [];
    }
  }

  async function saveTimetable() {
    const student = core().getCurrentStudent();
    const key = `timetable_${student.studentId}_${core().state.currentSelectedYear}_${core().state.currentSelectedSemester}`;
    localStorage.setItem(key, JSON.stringify(core().state.timetable));
  }

  async function loadPersonalStudyTimes() {
    const student = core().getCurrentStudent();
    const key = `personal_study_${student.studentId}_${core().state.currentSelectedYear}_${core().state.currentSelectedSemester}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      core().state.personalStudyTimes = JSON.parse(saved);
    } else {
      core().state.personalStudyTimes = [];
    }
  }

  async function savePersonalStudyTimes() {
    const student = core().getCurrentStudent();
    const key = `personal_study_${student.studentId}_${core().state.currentSelectedYear}_${core().state.currentSelectedSemester}`;
    localStorage.setItem(key, JSON.stringify(core().state.personalStudyTimes));
  }

  // Show timetable editor
  async function showTimetableEditor() {
    const periodCourses = core().getEnrolledCourses().filter(c => 
      c.year === core().state.currentSelectedYear && 
      c.semester === core().state.currentSelectedSemester
    );
    
    const availableCourses = periodCourses.map(c => ({ 
      code: c.courseCode, 
      name: c.courseName, 
      lecturer: c.lecturerName, 
      lecId: c.lecId, 
      location: c.location || 'Classroom' 
    }));
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    const timeSlots = [];
    for (let hour = 0; hour <= 23; hour++) {
      timeSlots.push(`${hour.toString().padStart(2, '0')}:00`);
      if (hour < 23) timeSlots.push(`${hour.toString().padStart(2, '0')}:30`);
    }
    
    let entriesHtml = '';
    if (core().state.timetable.length > 0) {
      entriesHtml = `<div class="courses-grid" style="grid-template-columns: 1fr;">`;
      core().state.timetable.forEach((entry, index) => {
        entriesHtml += `
          <div class="timetable-item" style="border-left: 3px solid var(--ug); padding: 12px; margin-bottom: 8px; background: var(--surface); border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; width: 100%;">
              <div><strong>📅 ${entry.day}</strong> at ⏰ ${core().formatTime24(entry.startTime)} - ${core().formatTime24(entry.endTime)}</div>
              <div>📚 <strong>${core().escapeHtml(entry.courseCode)}</strong> - ${core().escapeHtml(entry.courseName)} (${core().escapeHtml(entry.lecturerName)})</div>
              <div>📍 ${core().escapeHtml(entry.location || 'Classroom')}</div>
              <button class="btn btn-danger btn-sm" onclick="STUDENT_TIMETABLE.removeTimetableEntry(${index})">🗑️ Remove</button>
            </div>
          </div>
        `;
      });
      entriesHtml += `</div>`;
    } else {
      entriesHtml = '<div class="no-rec">📭 No class entries yet. Add your course schedule above.</div>';
    }
    
    const modalContent = `
      <div style="max-height: 500px; overflow-y: auto;">
        <div class="timetable-editor">
          <h4>➕ Add Class Timetable Entry</h4>
          <p class="note" style="margin-bottom: 12px;">💡 The class will automatically span across all time slots from start to end time. Use 24-hour format.</p>
          <p class="note" style="margin-bottom: 12px;">🔔 You will receive a sound notification 30 minutes before each class.</p>
          <div class="two-col">
            <div class="field"><label class="fl">📅 Day</label><select id="timetable-day" class="fi">${days.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
            <div class="field"><label class="fl">📚 Course</label><select id="timetable-course" class="fi"><option value="">Select Course</option>${availableCourses.map(c => `<option value="${c.code}|${c.name}|${c.lecturer}|${c.lecId}|${c.location}">${c.code} - ${c.name} (${c.lecturer})</option>`).join('')}</select></div>
          </div>
          <div class="two-col">
            <div class="field"><label class="fl">⏰ Start Time (24h)</label><select id="timetable-start" class="fi">${timeSlots.map(t => `<option value="${t}">${t} (${core().formatTime24(t)})</option>`).join('')}</select></div>
            <div class="field"><label class="fl">⏰ End Time (24h)</label><select id="timetable-end" class="fi">${timeSlots.map(t => `<option value="${t}">${t} (${core().formatTime24(t)})</option>`).join('')}</select></div>
          </div>
          <div class="field"><label class="fl">📍 Location</label><input type="text" id="timetable-location" class="fi" placeholder="e.g., JQB 3, Online, etc."></div>
          <button class="btn btn-ug" onclick="STUDENT_TIMETABLE.addTimetableEntry()">✅ Add to Timetable</button>
        </div>
        <div class="timetable-editor" style="margin-top: 20px;"><h4>📋 Current Class Timetable</h4>${entriesHtml}</div>
      </div>
    `;
    await MODAL.alert('✏️ Edit Class Timetable', modalContent, { icon: '📅', btnLabel: 'Close', width: '700px' });
  }

  async function addTimetableEntry() {
    const day = document.getElementById('timetable-day')?.value;
    const startTime = document.getElementById('timetable-start')?.value;
    const endTime = document.getElementById('timetable-end')?.value;
    const courseValue = document.getElementById('timetable-course')?.value;
    const location = document.getElementById('timetable-location')?.value.trim() || 'Classroom';
    
    if (!day || !startTime || !endTime || !courseValue) {
      await MODAL.alert('Missing Info', '⚠️ Please fill all fields.');
      return;
    }
    if (startTime >= endTime) {
      await MODAL.alert('Invalid Time', '⚠️ Start time must be before end time.');
      return;
    }
    
    const [courseCode, courseName, lecturerName, lecId] = courseValue.split('|');
    
    const overlappingClass = core().state.timetable.find(t => 
      t.day === day && core().doTimesOverlap(startTime, endTime, t.startTime, t.endTime)
    );
    
    if (overlappingClass) {
      const replace = await MODAL.confirm('Time Conflict Detected', 
        `This time (${core().formatTime24(startTime)} - ${core().formatTime24(endTime)}) overlaps with ${overlappingClass.courseCode} (${core().formatTime24(overlappingClass.startTime)} - ${core().formatTime24(overlappingClass.endTime)}). Replace it?`, 
        { confirmLabel: 'Yes, Replace', confirmCls: 'btn-warning' });
      if (!replace) return;
      const overlappingIndex = core().state.timetable.findIndex(t => t.day === day && core().doTimesOverlap(startTime, endTime, t.startTime, t.endTime));
      if (overlappingIndex !== -1) core().state.timetable.splice(overlappingIndex, 1);
    }
    
    const overlappingStudy = core().state.personalStudyTimes.find(p => 
      p.day === day && core().doTimesOverlap(startTime, endTime, p.startTime, p.endTime)
    );
    if (overlappingStudy) {
      const proceed = await MODAL.confirm('Personal Study Conflict', 
        `This time overlaps with your personal study "${overlappingStudy.title}" (${core().formatTime24(overlappingStudy.startTime)} - ${core().formatTime24(overlappingStudy.endTime)}). Add class anyway?`, 
        { confirmLabel: 'Yes, Add Class', confirmCls: 'btn-warning' });
      if (!proceed) return;
    }
    
    core().state.timetable.push({ day, startTime, endTime, courseCode, courseName, lecturerName, lecId, location, addedAt: Date.now() });
    
    const daysOrder = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
    core().state.timetable.sort((a, b) => {
      if (daysOrder[a.day] !== daysOrder[b.day]) return daysOrder[a.day] - daysOrder[b.day];
      return a.startTime.localeCompare(b.startTime);
    });
    
    await saveTimetable();
    await MODAL.close();
    await showTimetableEditor();
    if (typeof STUDENT_CALENDAR !== 'undefined') await STUDENT_CALENDAR.loadCalendarView();
    await MODAL.success('Added', '✅ Class timetable entry added. You will receive reminders 30 minutes before class.');
  }

  async function removeTimetableEntry(index) {
    const confirmed = await MODAL.confirm('Remove Entry', 'Remove this class from your timetable?', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    core().state.timetable.splice(index, 1);
    await saveTimetable();
    await MODAL.close();
    await showTimetableEditor();
    if (typeof STUDENT_CALENDAR !== 'undefined') await STUDENT_CALENDAR.loadCalendarView();
    await MODAL.success('Removed', '✅ Timetable entry removed.');
  }

  // Personal Study Time Editor
  async function showPersonalStudyEditor() {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const timeSlots = [];
    for (let hour = 0; hour <= 23; hour++) {
      timeSlots.push(`${hour.toString().padStart(2, '0')}:00`);
      if (hour < 23) timeSlots.push(`${hour.toString().padStart(2, '0')}:30`);
    }
    
    let entriesHtml = '';
    if (core().state.personalStudyTimes.length > 0) {
      entriesHtml = `<div class="courses-grid" style="grid-template-columns: 1fr;">`;
      core().state.personalStudyTimes.forEach((entry, index) => {
        entriesHtml += `
          <div class="timetable-item" style="border-left: 3px solid var(--teal); padding: 12px; margin-bottom: 8px; background: var(--surface); border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; width: 100%;">
              <div><strong>📅 ${entry.day}</strong> at ⏰ ${core().formatTime24(entry.startTime)} - ${core().formatTime24(entry.endTime)}</div>
              <div>📖 <strong>${core().escapeHtml(entry.title || 'Personal Study')}</strong></div>
              <div>📍 ${core().escapeHtml(entry.location || 'Self-study')}</div>
              <div><button class="btn btn-warning btn-sm" onclick="STUDENT_TIMETABLE.editPersonalStudyEntry(${index})">✏️ Edit</button><button class="btn btn-danger btn-sm" onclick="STUDENT_TIMETABLE.removePersonalStudyEntry(${index})">🗑️ Remove</button></div>
            </div>
          </div>
        `;
      });
      entriesHtml += `</div>`;
    } else {
      entriesHtml = '<div class="no-rec">📭 No personal study times added. Add your study schedule above.</div>';
    }
    
    const modalContent = `
      <div style="max-height: 500px; overflow-y: auto;">
        <div class="timetable-editor">
          <h4>➕ Add Personal Study Time</h4>
          <p class="note" style="margin-bottom: 12px;">🔔 You will receive a gentle reminder 15 minutes before each study session.</p>
          <div class="two-col">
            <div class="field"><label class="fl">📅 Day</label><select id="personal-day" class="fi">${days.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
            <div class="field"><label class="fl">📖 Study Title</label><input type="text" id="personal-title" class="fi" placeholder="e.g., Math Review"></div>
          </div>
          <div class="two-col">
            <div class="field"><label class="fl">⏰ Start Time (24h)</label><select id="personal-start" class="fi">${timeSlots.map(t => `<option value="${t}">${t} (${core().formatTime24(t)})</option>`).join('')}</select></div>
            <div class="field"><label class="fl">⏰ End Time (24h)</label><select id="personal-end" class="fi">${timeSlots.map(t => `<option value="${t}">${t} (${core().formatTime24(t)})</option>`).join('')}</select></div>
          </div>
          <div class="two-col">
            <div class="field"><label class="fl">📍 Location</label><input type="text" id="personal-location" class="fi" placeholder="e.g., Library"></div>
            <div class="field"><label class="fl">🎯 Priority</label><select id="personal-priority" class="fi"><option value="normal">Normal</option><option value="important">Important</option><option value="urgent">Urgent</option></select></div>
          </div>
          <div class="field"><label class="fl">📝 Description</label><textarea id="personal-description" class="fi" rows="2" placeholder="What will you study?"></textarea></div>
          <button class="btn btn-teal" onclick="STUDENT_TIMETABLE.addPersonalStudyEntry()">✅ Add Personal Study Time</button>
        </div>
        <div class="timetable-editor" style="margin-top: 20px;"><h4>📋 Current Personal Study Schedule</h4>${entriesHtml}</div>
      </div>
    `;
    await MODAL.alert('📖 Manage Personal Study Time', modalContent, { icon: '📚', btnLabel: 'Close', width: '700px' });
  }

  async function addPersonalStudyEntry() {
    const day = document.getElementById('personal-day')?.value;
    const startTime = document.getElementById('personal-start')?.value;
    const endTime = document.getElementById('personal-end')?.value;
    const title = document.getElementById('personal-title')?.value.trim();
    const location = document.getElementById('personal-location')?.value.trim();
    const priority = document.getElementById('personal-priority')?.value;
    const description = document.getElementById('personal-description')?.value.trim();
    
    if (!day || !startTime || !endTime) { await MODAL.alert('Missing Info', '⚠️ Please fill in day and time.'); return; }
    if (!title) { await MODAL.alert('Missing Info', '⚠️ Please enter a study title.'); return; }
    if (startTime >= endTime) { await MODAL.alert('Invalid Time', '⚠️ Start time must be before end time.'); return; }
    
    const overlappingClass = core().state.timetable.find(t => t.day === day && core().doTimesOverlap(startTime, endTime, t.startTime, t.endTime));
    if (overlappingClass) {
      const overlapWarning = await MODAL.confirm('Time Conflict Detected', 
        `This study time overlaps with ${overlappingClass.courseCode} (${core().formatTime24(overlappingClass.startTime)} - ${core().formatTime24(overlappingClass.endTime)}). Continue anyway?`, 
        { confirmLabel: 'Yes, Add Anyway', confirmCls: 'btn-warning' });
      if (!overlapWarning) return;
    }
    
    core().state.personalStudyTimes.push({ day, startTime, endTime, title, location, priority, description, type: 'personal', createdAt: Date.now() });
    
    const daysOrder = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
    core().state.personalStudyTimes.sort((a, b) => {
      if (daysOrder[a.day] !== daysOrder[b.day]) return daysOrder[a.day] - daysOrder[b.day];
      return a.startTime.localeCompare(b.startTime);
    });
    
    await savePersonalStudyTimes();
    await MODAL.close();
    await showPersonalStudyEditor();
    if (typeof STUDENT_CALENDAR !== 'undefined') await STUDENT_CALENDAR.loadCalendarView();
    await MODAL.success('Added', '✅ Personal study time added. You will receive gentle reminders.');
  }

  async function editPersonalStudyEntry(index) {
    const entry = core().state.personalStudyTimes[index];
    if (!entry) return;
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const timeSlots = [];
    for (let hour = 0; hour <= 23; hour++) {
      timeSlots.push(`${hour.toString().padStart(2, '0')}:00`);
      if (hour < 23) timeSlots.push(`${hour.toString().padStart(2, '0')}:30`);
    }
    
    const modalContent = `
      <div>
        <div class="two-col"><div class="field"><label class="fl">📅 Day</label><select id="edit-personal-day" class="fi">${days.map(d => `<option value="${d}" ${d === entry.day ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
        <div class="field"><label class="fl">📖 Study Title</label><input type="text" id="edit-personal-title" class="fi" value="${core().escapeHtml(entry.title)}"></div></div>
        <div class="two-col"><div class="field"><label class="fl">⏰ Start Time (24h)</label><select id="edit-personal-start" class="fi">${timeSlots.map(t => `<option value="${t}" ${t === entry.startTime ? 'selected' : ''}>${t} (${core().formatTime24(t)})</option>`).join('')}</select></div>
        <div class="field"><label class="fl">⏰ End Time (24h)</label><select id="edit-personal-end" class="fi">${timeSlots.map(t => `<option value="${t}" ${t === entry.endTime ? 'selected' : ''}>${t} (${core().formatTime24(t)})</option>`).join('')}</select></div></div>
        <div class="two-col"><div class="field"><label class="fl">📍 Location</label><input type="text" id="edit-personal-location" class="fi" value="${core().escapeHtml(entry.location || '')}"></div>
        <div class="field"><label class="fl">🎯 Priority</label><select id="edit-personal-priority" class="fi"><option value="normal" ${entry.priority === 'normal' ? 'selected' : ''}>Normal</option><option value="important" ${entry.priority === 'important' ? 'selected' : ''}>Important</option><option value="urgent" ${entry.priority === 'urgent' ? 'selected' : ''}>Urgent</option></select></div></div>
        <div class="field"><label class="fl">📝 Description</label><textarea id="edit-personal-description" class="fi" rows="2">${core().escapeHtml(entry.description || '')}</textarea></div>
      </div>
    `;
    const confirmed = await MODAL.confirm('✏️ Edit Personal Study Time', modalContent, { confirmLabel: 'Save Changes', cancelLabel: 'Cancel' });
    if (!confirmed) return;
    
    const newDay = document.getElementById('edit-personal-day')?.value;
    const newStartTime = document.getElementById('edit-personal-start')?.value;
    const newEndTime = document.getElementById('edit-personal-end')?.value;
    const newTitle = document.getElementById('edit-personal-title')?.value.trim();
    const newLocation = document.getElementById('edit-personal-location')?.value.trim();
    const newPriority = document.getElementById('edit-personal-priority')?.value;
    const newDescription = document.getElementById('edit-personal-description')?.value.trim();
    
    if (!newTitle) { await MODAL.alert('Missing Info', '⚠️ Please enter a study title.'); return; }
    core().state.personalStudyTimes[index] = { ...entry, day: newDay, startTime: newStartTime, endTime: newEndTime, title: newTitle, location: newLocation, priority: newPriority, description: newDescription, updatedAt: Date.now() };
    await savePersonalStudyTimes();
    await MODAL.close();
    await showPersonalStudyEditor();
    if (typeof STUDENT_CALENDAR !== 'undefined') await STUDENT_CALENDAR.loadCalendarView();
    await MODAL.success('Updated', '✅ Personal study time updated.');
  }

  async function removePersonalStudyEntry(index) {
    const confirmed = await MODAL.confirm('Remove Study Time', 'Remove this personal study time from your schedule?', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    core().state.personalStudyTimes.splice(index, 1);
    await savePersonalStudyTimes();
    await MODAL.close();
    await showPersonalStudyEditor();
    if (typeof STUDENT_CALENDAR !== 'undefined') await STUDENT_CALENDAR.loadCalendarView();
    await MODAL.success('Removed', '✅ Personal study time removed.');
  }

  return {
    loadTimetable,
    saveTimetable,
    loadPersonalStudyTimes,
    savePersonalStudyTimes,
    showTimetableEditor,
    addTimetableEntry,
    removeTimetableEntry,
    showPersonalStudyEditor,
    addPersonalStudyEntry,
    editPersonalStudyEntry,
    removePersonalStudyEntry
  };
})();

window.STUDENT_TIMETABLE = STUDENT_TIMETABLE;
