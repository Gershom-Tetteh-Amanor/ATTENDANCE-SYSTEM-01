/* admin-super-ids.js — Super Admin: Unique ID Management */
'use strict';

const ADMIN_SUPER_IDS = (() => {
  const core = () => window.ADMIN_CORE;
  let currentUidList = [];
  
  async function renderIDs() {
    const container = document.getElementById('sadm-content');
    if (!container) return;
    
    container.innerHTML = `
      <div class="pg">
        <h2>📋 Generate Unique Lecturer IDs</h2>
        <div class="inner-panel">
          <h3>➕ Generate New ID</h3>
          <div class="two-col">
            <div class="field">
              <label class="fl">📧 Lecturer Email</label>
              <input type="email" id="new-uid-email" class="fi" placeholder="lecturer@ug.edu.gh">
            </div>
            <div class="field">
              <label class="fl">🏛️ Department</label>
              <select id="new-uid-dept" class="fi">
                <option value="">Select Department</option>
                ${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="field">
            <label class="fl">👤 Lecturer Name</label>
            <input type="text" id="new-uid-name" class="fi" placeholder="Full name of lecturer">
          </div>
          <button class="btn btn-ug" onclick="ADMIN_SUPER_IDS.generateUID()">Generate ID & Send Email</button>
        </div>
        <div class="filter-bar">
          <div><label class="fl">Department</label><select id="filter-uid-dept" class="fi" onchange="ADMIN_SUPER_IDS.refreshUIDList()"><option value="">All</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <div><label class="fl">Status</label><select id="filter-uid-status" class="fi" onchange="ADMIN_SUPER_IDS.refreshUIDList()"><option value="">All</option><option value="available">Available</option><option value="assigned">Assigned</option><option value="revoked">Revoked</option></select></div>
        </div>
        <div id="uids-list"></div>
      </div>
    `;
    await refreshUIDList();
  }

  async function refreshUIDList() {
    const container = document.getElementById('uids-list');
    if (!container) return;
    try {
      let uids = await DB.UID.getAll();
      const deptFilter = document.getElementById('filter-uid-dept')?.value;
      const statusFilter = document.getElementById('filter-uid-status')?.value;
      if (deptFilter) uids = uids.filter(u => u.department === deptFilter);
      if (statusFilter) uids = uids.filter(u => u.status === statusFilter);
      const available = uids.filter(u => u.status === 'available');
      const assigned = uids.filter(u => u.status === 'assigned');
      const revoked = uids.filter(u => u.status === 'revoked');
      currentUidList = uids;
      
      container.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-value">${available.length}</div><div class="stat-label">✅ Available</div></div>
          <div class="stat-card"><div class="stat-value">${assigned.length}</div><div class="stat-label">📋 Assigned</div></div>
          <div class="stat-card"><div class="stat-value">${revoked.length}</div><div class="stat-label">🚫 Revoked</div></div>
        </div>
        <div><h4>✅ Available</h4>${available.length ? available.map(u => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border); flex-wrap:wrap; gap:8px;">
            <code>${core().escapeHtml(u.id)}</code>
            <span>${core().escapeHtml(u.department)}</span>
            <span>📧 ${core().escapeHtml(u.email) || 'No email'}</span>
            <button class="btn btn-warning btn-sm" onclick="ADMIN_SUPER_IDS.revokeUID('${u.id}')">Revoke</button>
          </div>
        `).join('') : '<div class="no-rec">None</div>'}</div>
        <div><h4>📋 Assigned</h4>${assigned.length ? assigned.map(u => `
          <div style="padding:8px; border-bottom:1px solid var(--border)">
            <code>${core().escapeHtml(u.id)}</code>
            <span>To: ${core().escapeHtml(u.assignedTo)} (${core().escapeHtml(u.lecturerName || 'Unknown')})</span>
            <span>📧 ${core().escapeHtml(u.email)}</span>
          </div>
        `).join('') : '<div class="no-rec">None</div>'}</div>
      `;
    } catch(err) { 
      container.innerHTML = `<div class="no-rec">❌ Error: ${core().escapeHtml(err.message)}</div>`; 
    }
  }

  async function generateUID() {
    const email = document.getElementById('new-uid-email')?.value.trim().toLowerCase();
    const dept = document.getElementById('new-uid-dept')?.value;
    const name = document.getElementById('new-uid-name')?.value.trim();
    
    if (!email) { await MODAL.alert('Required', 'Please enter lecturer email.'); return; }
    if (!dept) { await MODAL.alert('Required', 'Please select department.'); return; }
    if (!name) { await MODAL.alert('Required', 'Please enter lecturer name.'); return; }
    
    if (!email.endsWith('@ug.edu.gh') && !email.includes('@')) {
      await MODAL.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    
    const uid = 'LEC-' + Math.random().toString(36).substring(2, 12).toUpperCase();
    
    await DB.UID.set(uid, { 
      id: uid, 
      department: dept, 
      email: email,
      lecturerName: name,
      status: 'available', 
      createdAt: Date.now() 
    });
    
    await AUTH._sendUIDEmail(uid, name, email, dept);
    
    await MODAL.success('Generated', `✅ ${uid} generated and sent to ${email}`);
    document.getElementById('new-uid-email').value = '';
    document.getElementById('new-uid-name').value = '';
    document.getElementById('new-uid-dept').value = '';
    await refreshUIDList();
  }

  async function revokeUID(uid) {
    const confirmed = await MODAL.confirm('Revoke', `Revoke ${uid}?`, { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    await DB.UID.update(uid, { status: 'revoked', revokedAt: Date.now() });
    await MODAL.success('Revoked', `✅ ${uid} revoked.`);
    await refreshUIDList();
  }

  return {
    renderIDs,
    refreshUIDList,
    generateUID,
    revokeUID
  };
})();

window.ADMIN_SUPER_IDS = ADMIN_SUPER_IDS;
