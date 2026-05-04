/* student-calendar.js — Calendar view with 24-hour timetable spanning */
'use strict';

const STUDENT_CALENDAR = (() => {
  const core = () => window.STUDENT_CORE;
  const location = () => window.STUDENT_LOCATION;
  
  // Helper function to check if a time slot falls within a period
  function isTimeInClass(slotTime, classStart, classEnd) {
    const slotMinutes = core().timeToMinutes(slotTime);
    const startMinutes = core().timeToMinutes(classStart);
    const endMinutes = core().timeToMinutes(classEnd);
    return slotMinutes >= startMinutes && slotMinutes < endMinutes;
  }

  // Helper function to calculate rowspan
  function calculateRowSpan(startTime, endTime, timeSlots) {
    const startIndex = timeSlots.indexOf(startTime);
    const endIndex = timeSlots.indexOf(endTime);
    if (startIndex === -1 || endIndex === -1) return 1;
    return endIndex - startIndex;
  }

  async function changeCalendarPeriod() {
    const select = document.getElementById('calendar-period');
    if (select) {
      const [year, semester] = select.value.split('_');
      core().state.currentSelectedYear = parseInt(year);
      core().state.currentSelectedSemester = parseInt(semester);
      await window.STUDENT_TIMETABLE.loadTimetable();
      await window.STUDENT_TIMETABLE.loadPersonalStudyTimes();
      await loadCalendarView();
    }
  }

  async function loadCalendarView() {
    const container = document.getElementById('calendar-view');
    if (!container) return;
    
    const periodCourses = window.STUDENT_OVERVIEW.getCoursesForCurrentPeriod();
    const availablePeriods = [...new Set(core().state.enrolledCourses.map(c => `${c.year}_${c.semester}`))]
      .sort((a, b) => {
        const [yearA, semA] = a.split('_');
        const [yearB, semB] = b.split('_');
        if (yearA !== yearB) return yearB - yearA;
        return semB - semA;
      });
    
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const currentDay = core().getCurrentDay();
    
    const upcomingSessions = [];
    for (const entry of core().state.timetable) {
      if (entry.day !== currentDay) continue;
      const entryStartMinutes = core().timeToMinutes(entry.startTime);
      const minutesUntil = entryStartMinutes - currentMinutes;
      if (minutesUntil <= 30 && minutesUntil > 0) {
        upcomingSessions.push({ ...entry, minutesUntil });
      }
    }
    
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const timeSlots = [];
    for (let hour = 0; hour <= 23; hour++) {
      timeSlots.push(`${hour.toString().padStart(2, '0')}:00`);
      if (hour < 23) timeSlots.push(`${hour.toString().padStart(2, '0')}:30`);
    }
    
    let periodsHtml = '';
    if (availablePeriods.length > 0) {
      periodsHtml = availablePeriods.map(p => {
        const [year, semester] = p.split('_');
        return `<option value="${p}" ${parseInt(year) === core().state.currentSelectedYear && parseInt(semester) === core().state.currentSelectedSemester ? 'selected' : ''}>
          ${year} - ${semester === '1' ? 'First Semester' : 'Second Semester'}
        </option>`;
      }).join('');
    } else {
      const availableYears = core().getAvailableYears();
      const currentYear = new Date().getFullYear();
      periodsHtml = availableYears.map(year => `
        <option value="${year}_1" ${year === core().state.currentSelectedYear && core().state.currentSelectedSemester === 1 ? 'selected' : ''}>
          ${year} - First Semester
        </option>
        <option value="${year}_2" ${year === core().state.currentSelectedYear && core().state.currentSelectedSemester === 2 ? 'selected' : ''}>
          ${year} - Second Semester
        </option>
      `).join('');
    }
    
    let timetableHtml = `
      <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap;">
        <div><label class="fl">📅 Academic Period</label><select id="calendar-period" class="fi" onchange="STUDENT_CALENDAR.changeCalendarPeriod()">${periodsHtml}</select></div>
        <div><button class="btn btn-secondary" onclick="STUDENT_TIMETABLE.showTimetableEditor()">✏️ Edit Class Timetable</button></div>
        <div><button class="btn btn-teal" onclick="STUDENT_TIMETABLE.showPersonalStudyEditor()">📚 Edit Personal Study Time</button></div>
      </div>
      ${upcomingSessions.length > 0 ? `
        <div class="alert-card" style="margin-bottom: 20px; background: var(--amber-s); border-left: 4px solid var(--amber);">
          <strong>⏰ Upcoming Sessions (Next 30 minutes):</strong>
          ${upcomingSessions.map(session => `
            <div style="margin-top: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
              <span>📚 ${session.courseCode} with ${session.lecturerName} at ${core().formatTime24(session.startTime)} <strong>(in ${session.minutesUntil} minutes)</strong></span>
              <button class="btn btn-ug btn-sm" onclick="STUDENT_MAIN.checkInFromTimetable('${session.courseCode}', '${session.lecId}')" style="margin-left: 10px;">✓ Check In Now</button>
            </div>
          `).join('')}
        </div>
      ` : ''}
      <div class="dash-section">
        <h3>📅 My Weekly Schedule (24-Hour Format)</h3>
        <div class="timetable-grid" style="overflow-x: auto; position: relative; max-height: 600px; overflow-y: auto;">
          <table style="width: 100%; border-collapse: collapse; min-width: 900px;">
            <thead>
              <tr style="background: var(--ug); color: white; position: sticky; top: 0; z-index: 10;">
                <th style="padding: 12px; min-width: 70px;">Time (24h)</th>
                ${days.map(day => `<th style="padding: 12px;">${day}</th>`).join('')}
              </tr>
            </thead>
            <tbody>`;
    
    const coveredSlots = {};
    
    for (let i = 0; i < timeSlots.length; i++) {
      const currentSlot = timeSlots[i];
      const displayTime = core().formatTime24(currentSlot);
      const hour = parseInt(currentSlot.split(':')[0]);
      let borderClass = '', extraRow = '';
      
      if (hour === 0) { 
        borderClass = 'border-top: 2px solid var(--ug);'; 
        extraRow = '<div style="font-size: 10px; color: var(--ug); margin-top: 4px;">🌙 Midnight</div>'; 
      } else if (hour === 12) { 
        borderClass = 'border-top: 1px solid var(--border);'; 
        extraRow = '<div style="font-size: 10px; color: var(--text4); margin-top: 4px;">☀️ Noon</div>'; 
      }
      
      timetableHtml += `
        <tr>
          <td style="padding: 8px; border: 1px solid var(--border); font-weight: 600; background: var(--surface2); vertical-align: middle; ${borderClass}">
            <strong>${displayTime}</strong>
            ${extraRow}
          </td>`;
      
      for (const day of days) {
        const slotKey = `${day}_${currentSlot}`;
        if (coveredSlots[slotKey]) { continue; }
        
        let classFound = null, classSpan = 0;
        const classAtThisSlot = core().state.timetable.find(t => t.day === day && t.startTime === currentSlot);
        
        if (classAtThisSlot) {
          const endSlotIndex = timeSlots.indexOf(classAtThisSlot.endTime);
          const startSlotIndex = timeSlots.indexOf(classAtThisSlot.startTime);
          classSpan = endSlotIndex - startSlotIndex;
          classFound = classAtThisSlot;
        }
        
        if (classFound && classSpan > 0) {
          for (let r = 0; r < classSpan && i + r < timeSlots.length; r++) {
            coveredSlots[`${day}_${timeSlots[i + r]}`] = true;
          }
          
          timetableHtml += `
            <td style="padding: 10px; border: 1px solid var(--border); background: var(--primary-s); vertical-align: middle;" rowspan="${classSpan}">
              <strong>📚 ${core().escapeHtml(classFound.courseCode)}</strong><br>
              <small>${core().escapeHtml(classFound.lecturerName)}</small><br>
              <small>${core().formatTime24(classFound.startTime)} - ${core().formatTime24(classFound.endTime)}</small>
              ${classFound.location ? `<br><small>📍 ${core().escapeHtml(classFound.location)}</small>` : ''}
              <div style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
                <button class="btn btn-sm btn-outline" style="padding: 4px 8px; font-size: 11px;" onclick="STUDENT_MAIN.checkInFromTimetable('${classFound.courseCode}', '${classFound.lecId}')">✓ Check In</button>
                <button class="btn btn-sm btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="STUDENT_MAIN.showClassLocation('${classFound.courseCode}', '${classFound.lecId}')">📍 Get Directions</button>
              </div>
            </td>`;
        } else {
          let isWithinClass = false;
          for (const classItem of core().state.timetable) {
            if (classItem.day === day && 
                core().timeToMinutes(currentSlot) > core().timeToMinutes(classItem.startTime) && 
                core().timeToMinutes(currentSlot) < core().timeToMinutes(classItem.endTime)) {
              isWithinClass = true;
              break;
            }
          }
          
          if (!isWithinClass) {
            let studyFound = null, studySpan = 0;
            const studyAtThisSlot = core().state.personalStudyTimes.find(p => p.day === day && p.startTime === currentSlot);
            
            if (studyAtThisSlot) {
              const endSlotIndex = timeSlots.indexOf(studyAtThisSlot.endTime);
              const startSlotIndex = timeSlots.indexOf(studyAtThisSlot.startTime);
              studySpan = endSlotIndex - startSlotIndex;
              studyFound = studyAtThisSlot;
            }
            
            if (studyFound && studySpan > 0) {
              for (let r = 0; r < studySpan && i + r < timeSlots.length; r++) {
                coveredSlots[`${day}_${timeSlots[i + r]}`] = true;
              }
              
              const priorityColor = studyFound.priority === 'urgent' ? '#d42b2b' : (studyFound.priority === 'important' ? '#b8860b' : '#1d9e75');
              timetableHtml += `
                <td style="padding: 10px; border: 1px solid var(--border); background: var(--green-s); vertical-align: middle;" rowspan="${studySpan}">
                  <strong>📖 ${core().escapeHtml(studyFound.title)}</strong><br>
                  <small>${core().formatTime24(studyFound.startTime)} - ${core().formatTime24(studyFound.endTime)}</small>
                  ${studyFound.location ? `<br><small>📍 ${core().escapeHtml(studyFound.location)}</small>` : ''}
                  ${studyFound.description ? `<br><small>📝 ${core().escapeHtml(studyFound.description)}</small>` : ''}
                </td>`;
            } else {
              let isWithinStudy = false;
              for (const study of core().state.personalStudyTimes) {
                if (study.day === day && 
                    core().timeToMinutes(currentSlot) > core().timeToMinutes(study.startTime) && 
                    core().timeToMinutes(currentSlot) < core().timeToMinutes(study.endTime)) {
                  isWithinStudy = true;
                  break;
                }
              }
              
              if (!isWithinStudy) {
                timetableHtml += `<td style="padding: 8px; border: 1px solid var(--border); color: var(--text4); text-align: center; vertical-align: middle;">—</td>`;
              }
            }
          }
        }
      }
      timetableHtml += `</tr>`;
    }
    
    timetableHtml += `
            </tbody>
          </table>
        </div>
        <p class="note" style="margin-top: 12px; text-align: center;">💡 24-hour format shown. Click "Get Directions" for GPS navigation to your class location.</p>
      </div>
    `;
    
    container.innerHTML = timetableHtml;
  }

  return {
    loadCalendarView,
    changeCalendarPeriod,
    isTimeInClass,
    calculateRowSpan
  };
})();

window.STUDENT_CALENDAR = STUDENT_CALENDAR;
