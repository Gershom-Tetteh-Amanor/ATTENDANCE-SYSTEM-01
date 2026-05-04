/* admin-co-lecturers.js — Co-Admin: Lecturer Management */
'use strict';

const ADMIN_CO_LECTURERS = (() => {
  const core = () => window.ADMIN_CORE;
  
  async function renderLecturers() {
    const container = document.getElementById('cadm-content');
    if (!container) return;
    
    const deptName = core().getCoAdminDepartment();
    
    try {
      let lecturers = await DB.LEC.getAll();
      lecturers = lecturers.filter(l => l.department === deptName);
      if (!lecturers.length) { container.innerHTML = '<div class="pg"><div class="no-rec">No lecturers</div></div>'; return; }
      
      container.innerHTML = `
        <div class="pg">
          <h2>👨‍🏫 Lecturers - ${core().escapeHtml(deptName)}</h2>
          <div class="courses-grid">
            ${lecturers.map(lec => `
              <div class="course-card">
                <div class="course-header">
                  <span class="course-code">👨‍🏫 ${core().escapeHtml(lec.name)}</span>
                  <span class="badge ${lec.status === 'suspended' ? 'badge-red' : 'badge'}">${lec.status === 'suspended' ? 'Suspended' : 'Active'}</span>
                </div>
                <div class="course-name">📧 ${core().escapeHtml(lec.email)}</div>
                <div class="course-stats">🆔 ${core().escapeHtml(lec.lecId || 'N/A')}</div>
                <div class="course-buttons">
                  ${lec.status === 'suspended' ? 
                    `<button class="btn btn-teal btn-sm" onclick="ADMIN_CO_LECTURERS.unsuspendLecturer('${lec.id}')">Unsuspend</button>` : 
                    `<button class="btn btn-warning btn-sm" onclick="ADMIN_CO_LECTURERS.suspendLecturer('${lec.id}')">Suspend</button>`
                  }
                  <button class="btn btn-danger btn-sm" onclick="ADMIN_CO_LECTURERS.removeLecturer('${lec.id}')">Remove</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } catch(err) { container.innerHTML = `<div class="pg"><div class="no-rec">❌ Error: ${core().escapeHtml(err.message)}</div></div>`; }
  }

  async function suspendLecturer(lecId) {
    const confirmed = await MODAL.confirm('Suspend', 'Suspend this lecturer?', { confirmCls: 'btn-warning' });
    if (!confirmed) return;
    await DB.LEC.update(lecId, { status: 'suspended', suspendedAt: Date.now() });
    await MODAL.success('Suspended', '✅ Lecturer suspended.');
    await renderLecturers();
  }

  async function unsuspendLecturer(lecId) {
    await DB.LEC.update(lecId, { status: 'active', unsuspendedAt: Date.now() });
    await MODAL.success('Unsuspended', '✅ Lecturer reactivated.');
    await renderLecturers();
  }

  async function removeLecturer(lecId) {
    const confirmed = await MODAL.confirm('Remove', 'Permanently remove?', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    await DB.LEC.delete(lecId);
    await MODAL.success('Removed', '✅ Lecturer removed.');
    await renderLecturers();
  }

  return {
    renderLecturers,
    suspendLecturer,
    unsuspendLecturer,
    removeLecturer
  };
})();

window.ADMIN_CO_LECTURERS = ADMIN_CO_LECTURERS;
