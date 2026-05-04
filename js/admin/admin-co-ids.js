/* admin-co-ids.js — Co-Admin: ID Generation */
'use strict';

const ADMIN_CO_IDS = (() => {
  const core = () => window.ADMIN_CORE;
  
  async function renderIDs() {
    const container = document.getElementById('cadm-content');
    if (!container) return;
    
    const deptName = core().getCoAdminDepartment();
    
    container.innerHTML = `
      <div class="pg">
        <h2>📋 Generate IDs</h2>
        <p>Department: ${core().escapeHtml(deptName)}</p>
        <div class="inner-panel">
          <div class="two-col">
            <div class="field">
              <label class="fl">📧 Lecturer Email</label>
              <input type="email" id="cadm-uid-email" class="fi" placeholder="lecturer@ug.edu.gh">
            </div>
            <div class="field">
              <label class="fl">👤 Lecturer Name</label>
              <input type="text" id="cadm-uid-name" class="fi" placeholder="Full name">
            </div>
          </div>
          <button class="btn btn-ug" onclick="ADMIN_CO_IDS.generateUID()">Generate ID & Send</button>
        </div>
        <div id="cadm-uids-list"></div>
      </div>
    `;
    await refreshUIDList();
  }

  async function refreshUIDList() {
    const container = document.getElementById('cadm-uids-list');
    if (!container) return;
    
    const deptName = core().getCoAdminDepartment();
    try {
      let uids = await DB.UID.getAll();
      uids = uids.filter(u => u.department === deptName);
      const available = uids.filter(u => u.status === 'available');
      const assigned = uids.filter(u => u.status === 'assigned');
      
      container.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-value">${available.length}</div><div class="stat-label">Available</div></div>
          <div class="stat-card"><div class="stat-value">${assigned.length}</div><div class="stat-label">Assigned</div></div>
        </div>
        <div><h4>✅ Available</h4>${available.length ? available.map(u => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border); flex-wrap:wrap; gap:8px;">
            <code>${core().escapeHtml(u.id)}</code>
            <span>📧 ${core().escapeHtml(u.email) || 'No email'}</span>
            <button class="btn btn-teal btn-sm" onclick="ADMIN_CO_IDS.sendUID('${u.id}')">Send</button>
          </div>
        `).join('') : '<div class="no-rec">None</div>'}</div>
        <div><h4>📋 Assigned</h4>${assigned.length ? assigned.map(u => `
          <div style="padding:8px; border-bottom:1px solid var(--border)">
            <code>${core().escapeHtml(u.id)}</code>
            <span>To: ${core().escapeHtml(u.assignedTo)} (${core().escapeHtml(u.lecturerName || 'Unknown')})</span>
          </div>
        `).join('') : '<div class="no-rec">None</div>'}</div>
      `;
    } catch(err) { container.innerHTML = `<div class="no-rec">❌ Error: ${core().escapeHtml(err.message)}</div>`; }
  }

  async function generateUID() {
    const email = document.getElementById('cadm-uid-email')?.value.trim().toLowerCase();
    const name = document.getElementById('cadm-uid-name')?.value.trim();
    const deptName = core().getCoAdminDepartment();
    
    if (!email) { await MODAL.alert('Required', 'Please enter lecturer email.'); return; }
    if (!name) { await MODAL.alert('Required', 'Please enter lecturer name.'); return; }
    if (!email.endsWith('@ug.edu.gh') && !email.includes('@')) {
      await MODAL.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    
    const uid = 'LEC-' + Math.random().toString(36).substring(2, 12).toUpperCase();
    
    await DB.UID.set(uid, { 
      id: uid, 
      department: deptName, 
      email: email,
      lecturerName: name,
      status: 'available', 
      createdAt: Date.now() 
    });
    
    await AUTH._sendUIDEmail(uid, name, email, deptName);
    await MODAL.success('Generated', `✅ ${uid} generated and sent to ${email}`);
    document.getElementById('cadm-uid-email').value = '';
    document.getElementById('cadm-uid-name').value = '';
    await refreshUIDList();
  }

  async function sendUID(uid) {
    const email = await MODAL.prompt('Send to Lecturer', 'Enter email:', { placeholder: 'lecturer@ug.edu.gh' });
    if (!email) return;
    await MODAL.success('Sent', `✅ UID sent to ${email}`);
    await DB.UID.update(uid, { status: 'assigned', assignedTo: email, assignedAt: Date.now() });
    await refreshUIDList();
  }

  return {
    renderIDs,
    refreshUIDList,
    generateUID,
    sendUID
  };
})();

window.ADMIN_CO_IDS = ADMIN_CO_IDS;
