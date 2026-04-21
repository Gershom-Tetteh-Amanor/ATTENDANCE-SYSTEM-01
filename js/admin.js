/* ============================================
   admin.js — Super admin + co-admin dashboards
   SADM = super admin   CADM = co-admin
   ============================================ */
'use strict';

const SADM = (() => {
  const c = () => document.getElementById('sadm-content');

  function tab(name) {
    document.querySelectorAll('#view-sadmin .tab').forEach(t=>{const l=t.textContent.trim().toLowerCase().replace(/\s/g,'').replace(/[^a-z]/g,'');t.classList.toggle('active',l.startsWith(name));});
    if(c())c().innerHTML='<div class="pg"><div class="att-empty">Loading…</div></div>';
    const fns={ids:renderIDs,lecturers:renderLecturers,sessions:renderSessions,database:renderDatabase,coadmins:renderCoAdmins,settings:renderSettings};
    if(fns[name])fns[name]();
  }

  async function renderIDs(){
    c().innerHTML=`<div class="pg"><h2>Lecturer Unique IDs</h2><p class="sub">Generate IDs and send to lecturers. Each ID registers exactly one account.</p><div class="strip strip-amber"><strong>How:</strong> Generate → Copy → Send to lecturer by WhatsApp or email.</div><div class="inner-panel"><h3>Generate a new ID</h3><div class="two-col" style="margin-top:10px"><div class="field"><label class="fl">Intended for</label><input type="text" id="uid-for" class="fi" placeholder="Dr. Mensah"/></div><div class="field"><label class="fl">Department (optional)</label><select id="uid-dept" class="fi"><option value="">Select…</option></select></div></div><button class="btn btn-ug btn-sm" onclick="SADM.genUID()">Generate Unique ID</button><div id="uid-result" style="display:none;margin-top:12px"><div class="uid-box"><div class="uid-lbl">Copy and send to the lecturer</div><div class="uid-val" id="uid-display"></div></div><button class="btn btn-secondary btn-sm" onclick="SADM.copyUID()" style="margin-top:8px">📋 Copy ID</button></div></div><div class="list-hdr"><h3 id="uid-hdr">All issued IDs</h3><select id="uid-filter" class="fi" style="width:auto;padding:6px 9px;font-size:12px" onchange="SADM.loadUIDs()"><option value="all">All</option><option value="available">Available</option><option value="assigned">Assigned</option><option value="revoked">Revoked</option></select></div><div id="uid-list"><div class="att-empty">Loading…</div></div></div>`;
    UI.fillDeptSelect('uid-dept');await loadUIDs();
  }

  async function loadUIDs(){
    const el=document.getElementById('uid-list');if(!el)return;const filter=document.getElementById('uid-filter')?.value||'all';
    try{const all=await DB.UID.getAll(),data=filter==='all'?all:all.filter(u=>u.status===filter);const hdr=document.getElementById('uid-hdr');if(hdr)hdr.textContent=`All issued IDs (${data.length})`;el.innerHTML=data.length?data.map(u=>`<div class="att-item"><div class="att-dot" style="background:${u.status==='available'?'var(--green-t)':u.status==='revoked'?'var(--danger)':'var(--text4)'}"></div><span style="font-family:monospace;font-weight:700;font-size:13px;color:${u.status==='available'?'var(--ug)':'var(--text3)'}">${UI.esc(u.id)}</span><span class="pill ${u.status==='available'?'pill-green':u.status==='assigned'?'pill-gray':'pill-red'}">${u.status}</span><span style="font-size:12px;color:var(--text3)">${UI.esc(u.intendedFor||'—')}</span><span class="att-time">${new Date(u.createdAt).toLocaleDateString()}</span>${u.status==='available'?`<button class="btn btn-danger btn-sm" onclick="SADM.revokeUID('${u.id}')">Revoke</button>`:''}</div>`).join(''):'<div class="no-rec">No IDs match.</div>';}
    catch(err){el.innerHTML=`<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;}
  }

  async function genUID(){
    try{const all=await DB.UID.getAll(),ex=new Set(all.map(u=>u.id));let uid,t=0;do{uid=UI.makeLecUID();t++;}while(ex.has(uid)&&t<50);await DB.UID.set(uid,{id:uid,status:'available',intendedFor:document.getElementById('uid-for')?.value.trim()||'(unspecified)',department:document.getElementById('uid-dept')?.value||'',createdBy:AUTH.getSession()?.id||'',createdAt:Date.now()});document.getElementById('uid-display').textContent=uid;document.getElementById('uid-result').style.display='block';const f=document.getElementById('uid-for');if(f)f.value='';loadUIDs();}
    catch(err){MODAL.error('Error',err.message);}
  }

  function copyUID(){const v=document.getElementById('uid-display')?.textContent;if(!v)return;navigator.clipboard?.writeText(v).then(()=>MODAL.success('Copied!',`ID: <strong>${v}</strong>`)).catch(()=>MODAL.alert('Copy this ID',v));}

  async function revokeUID(id){const ok=await MODAL.confirm('Revoke this ID?','Lecturer will not be able to register with it.',{confirmCls:'btn-danger'});if(!ok)return;try{await DB.UID.update(id,{status:'revoked'});loadUIDs();}catch(err){MODAL.error('Error',err.message);}}

  async function renderLecturers(){
    c().innerHTML=`<div class="pg"><h2>All lecturers</h2><p class="sub">All registered UG lecturers.</p><div id="all-lec-list"><div class="att-empty">Loading…</div></div></div>`;
    try{const lecs=await DB.LEC.getAll();document.getElementById('all-lec-list').innerHTML=lecs.length?lecs.map(l=>`<div class="att-item"><div class="att-dot" style="background:var(--amber)"></div><span class="att-name">${UI.esc(l.name)}</span><span style="font-family:monospace;font-size:12px;color:var(--ug);font-weight:700">${UI.esc(l.lecId)}</span><span class="att-sid">${UI.esc(l.email)}</span><span class="pill pill-gray">${UI.esc(l.department||'—')}</span><span class="att-time">${new Date(l.createdAt).toLocaleDateString()}</span><button class="btn btn-danger btn-sm" onclick="SADM.removeLec('${l.id}','${UI.esc(l.name)}')">Remove</button></div>`).join(''):'<div class="no-rec">No lecturers yet.</div>';}
    catch(err){document.getElementById('all-lec-list').innerHTML=`<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;}
  }

  async function removeLec(uid,name){const ok=await MODAL.confirm(`Remove ${name}?`,'Session records preserved in admin backup.',{confirmCls:'btn-danger'});if(!ok)return;try{const lec=await DB.LEC.get(uid);if(lec?.lecId)await DB.UID.update(lec.lecId,{status:'available',assignedTo:null,assignedAt:null});await DB.LEC.delete(uid);renderLecturers();}catch(err){MODAL.error('Error',err.message);}}

  async function renderSessions(){
    c().innerHTML=`<div class="pg"><h2>All sessions</h2><p class="sub">Every session across all departments.</p><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"><select id="sf-dept" class="fi" style="width:auto;font-size:12px;padding:7px 10px" onchange="SADM.filterSess()"><option value="all">All departments</option></select><button class="btn btn-secondary btn-sm" onclick="SADM.exportAllCSV()">⬇ Export CSV</button></div><div id="all-sess-list"><div class="att-empty">Loading…</div></div></div>`;
    const all=await DB.SESSION.getAll();const depts=[...new Set(all.map(s=>s.department).filter(Boolean))].sort();const sel=document.getElementById('sf-dept');depts.forEach(d=>{const o=document.createElement('option');o.value=o.textContent=d;sel.appendChild(o);});filterSess();
  }

  async function filterSess(){
    const el=document.getElementById('all-sess-list');if(!el)return;const dF=document.getElementById('sf-dept')?.value||'all';
    try{const all=(await DB.SESSION.getAll()).filter(s=>dF==='all'||s.department===dF).sort((a,b)=>b.createdAt-a.createdAt);el.innerHTML=all.length?all.slice(0,60).map(s=>{const cnt=s.records?Object.keys(s.records).length:0;return`<div class="sess-card"><div class="sc-hdr"><div><div class="sc-title">${UI.esc(s.courseCode)} — ${UI.esc(s.courseName)} <span class="pill ${s.active?'pill-teal':'pill-gray'}">${s.active?'active':'ended'}</span></div><div class="sc-meta">${UI.esc(s.lecturer)} · ${UI.esc(s.lecId)} · ${UI.esc(s.department||'—')} · ${UI.esc(s.date)} · ${cnt} present</div></div></div></div>`;}).join('')+(all.length>60?'<div style="font-size:12px;color:var(--text4);text-align:center;padding:10px">Showing first 60. Export CSV for all data.</div>':''):'<div class="no-rec">No sessions yet.</div>';}
    catch(err){el.innerHTML=`<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;}
  }

  async function exportAllCSV(){MODAL.loading('Preparing CSV…');try{const all=await DB.SESSION.getAll();const rows=[['Date','Course Code','Course','Student Name','Student ID','Fingerprint','Location','Time','Lecturer','Lecturer ID','Department']];all.forEach(s=>(s.records?Object.values(s.records):[]).forEach(r=>rows.push([s.date,s.courseCode,s.courseName,r.name,r.studentId,(r.fingerprint||'').slice(0,16),r.locNote||'',r.time,s.lecturer,s.lecId,s.department||''])));UI.dlCSV(rows,`UG_ALL_${UI.todayStr()}`);MODAL.close();}catch(err){MODAL.close();MODAL.error('Export failed',err.message);}}

  async function renderDatabase(){
    c().innerHTML=`<div class="pg"><h2>Overall database</h2><p class="sub">All attendance across all departments.</p><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px"><button class="btn btn-ug btn-sm" onclick="SADM.masterExcel()">⬇ Master Excel</button><button class="btn btn-secondary btn-sm" onclick="SADM.masterCSV()">⬇ Master CSV</button></div><div id="sadm-db-list"><div class="att-empty">Loading…</div></div></div>`;
    try{const all=await DB.SESSION.getAll(),groups={};all.forEach(s=>{if(!groups[s.courseCode])groups[s.courseCode]={code:s.courseCode,name:s.courseName,count:0,total:0};groups[s.courseCode].count++;groups[s.courseCode].total+=(s.records?Object.keys(s.records).length:0);});document.getElementById('sadm-db-list').innerHTML=Object.values(groups).length?Object.values(groups).sort((a,b)=>a.code.localeCompare(b.code)).map(g=>`<div class="sess-card"><div class="sc-hdr"><div><div class="sc-title">${UI.esc(g.code)} — ${UI.esc(g.name)}</div><div class="sc-meta">${g.count} sessions · ${g.total} total check-ins</div></div></div></div>`).join(''):'<div class="no-rec">No data yet.</div>';}
    catch(err){document.getElementById('sadm-db-list').innerHTML=`<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;}
  }

  async function masterExcel(){if(typeof XLSX==='undefined'){MODAL.alert('Not ready','SheetJS not loaded yet.');return;}MODAL.loading('Preparing master Excel…');try{const all=await DB.SESSION.getAll(),wb=XLSX.utils.book_new(),courses={};all.forEach(s=>{if(!courses[s.courseCode])courses[s.courseCode]={rows:[['Date','Session ID','Student Name','Student ID','Fingerprint','Location','Time','Lecturer','Lecturer ID','Department']]};(s.records?Object.values(s.records):[]).forEach(r=>courses[s.courseCode].rows.push([s.date,s.id,r.name,r.studentId,(r.fingerprint||'').slice(0,16),r.locNote||'',r.time,s.lecturer,s.lecId,s.department||'']));});Object.entries(courses).forEach(([code,{rows}])=>{const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=rows[0].map(()=>({wch:20}));XLSX.utils.book_append_sheet(wb,ws,code.slice(0,31));});XLSX.writeFile(wb,`UG_MASTER_${UI.todayStr()}.xlsx`);MODAL.close();}catch(err){MODAL.close();MODAL.error('Export failed',err.message);}}

  async function masterCSV(){MODAL.loading('Preparing CSV…');try{const all=await DB.SESSION.getAll();const rows=[['Date','Course Code','Course','Student Name','Student ID','Fingerprint','Location','Time','Lecturer','Lecturer ID','Department']];all.forEach(s=>(s.records?Object.values(s.records):[]).forEach(r=>rows.push([s.date,s.courseCode,s.courseName,r.name,r.studentId,(r.fingerprint||'').slice(0,16),r.locNote||'',r.time,s.lecturer,s.lecId,s.department||''])));UI.dlCSV(rows,`UG_MASTER_${UI.todayStr()}`);MODAL.close();}catch(err){MODAL.close();MODAL.error('Export failed',err.message);}}

  async function renderCoAdmins(){
    c().innerHTML=`<div class="pg"><h2>Co-admin management</h2><p class="sub">Approve applications. Co-admins see only their department.</p><div id="pending-section" style="display:none"><div class="strip strip-amber"><strong>⏳ Pending applications:</strong></div><div id="pending-list"></div><hr class="divider"/></div><div class="list-hdr"><h3>Active co-admins</h3></div><div id="ca-active-list"><div class="att-empty">Loading…</div></div></div>`;
    try{
      const all=await DB.CA.getAll(),pending=all.filter(a=>a.status==='pending'),active=all.filter(a=>a.status==='active');
      const dot=document.getElementById('cadm-dot');if(dot)dot.style.display=pending.length?'inline-block':'none';
      const ps=document.getElementById('pending-section'),pl=document.getElementById('pending-list');if(ps)ps.style.display=pending.length?'block':'none';
      if(pl)pl.innerHTML=pending.map(ca=>`<div class="appr-item"><div class="appr-hdr"><div><strong>${UI.esc(ca.name)}</strong> — ${UI.esc(ca.department)}<br/><span style="font-size:12px;color:var(--text3)">${UI.esc(ca.email)}</span></div><span style="font-size:11px;color:var(--text4)">${new Date(ca.createdAt).toLocaleString()}</span></div><div class="appr-act"><button class="btn btn-teal btn-sm" onclick="SADM.approveCA('${ca.id}')">✓ Approve</button><button class="btn btn-danger btn-sm" onclick="SADM.rejectCA('${ca.id}','${UI.esc(ca.name)}')">✗ Reject</button></div></div>`).join('');
      document.getElementById('ca-active-list').innerHTML=active.length?active.map(ca=>`<div class="att-item"><div class="att-dot" style="background:var(--amber)"></div><span class="att-name">${UI.esc(ca.name)}</span><span class="att-sid">${UI.esc(ca.email)}</span><span class="pill pill-amber">${UI.esc(ca.department||'—')}</span><span class="att-time">${new Date(ca.createdAt).toLocaleDateString()}</span><button class="btn btn-danger btn-sm" onclick="SADM.revokeCA('${ca.id}','${UI.esc(ca.name)}')">Revoke</button><button class="btn btn-danger btn-sm" onclick="SADM.deleteCA('${ca.id}','${UI.esc(ca.name)}')">Delete</button></div>`).join(''):'<div class="no-rec">No active co-admins yet.</div>';
    }catch(err){console.error(err);}
  }

  async function approveCA(id){try{await DB.CA.update(id,{status:'active',approvedAt:Date.now()});await MODAL.success('Approved','Co-admin can now sign in.');renderCoAdmins();}catch(err){MODAL.error('Error',err.message);}}
  async function rejectCA(id,name){const ok=await MODAL.confirm(`Reject ${name}?`,'Application will be deleted.',{confirmCls:'btn-danger'});if(!ok)return;try{await DB.CA.delete(id);renderCoAdmins();}catch(err){MODAL.error('Error',err.message);}}
  async function revokeCA(id,name){const ok=await MODAL.confirm(`Revoke ${name}?`,'They will not be able to sign in.',{confirmCls:'btn-danger'});if(!ok)return;try{await DB.CA.update(id,{status:'revoked'});renderCoAdmins();}catch(err){MODAL.error('Error',err.message);}}
  async function deleteCA(id,name){const ok=await MODAL.confirm(`Delete ${name}?`,'Permanently removes their account.',{confirmCls:'btn-danger'});if(!ok)return;try{await DB.CA.delete(id);renderCoAdmins();}catch(err){MODAL.error('Error',err.message);}}

  function renderSettings(){
    const user=AUTH.getSession();
    c().innerHTML=`<div class="pg"><h2>Settings</h2><div class="inner-panel"><h3>Appearance</h3><div style="display:flex;gap:10px;margin-top:10px"><button class="btn btn-secondary btn-sm" onclick="THEME.set('light')">☀️ Light</button><button class="btn btn-secondary btn-sm" onclick="THEME.set('dark')">🌙 Dark</button></div></div><div class="inner-panel"><h3>Signed in as</h3><p style="font-size:14px;margin-top:8px;color:var(--text2)">${UI.esc(user?.name||'—')}</p><p style="font-size:13px;color:var(--text3)">${UI.esc(user?.email||'—')}</p></div><div style="background:var(--surface);border:1px solid var(--danger-b);border-radius:12px;padding:16px"><h3 class="text-danger">Danger zone</h3><p style="font-size:13px;color:var(--text3);margin:8px 0 12px">Permanently deletes all lecturer accounts, sessions, UIDs and co-admins. Admin account is kept.</p><button class="btn btn-danger btn-sm" onclick="SADM.resetAll()">Reset all data</button></div></div>`;
  }

  async function resetAll(){
    const val=await MODAL.prompt('Confirm reset','Type <strong>RESET</strong> to confirm.',{icon:'⚠️',placeholder:'Type RESET',confirmLabel:'Delete everything',confirmCls:'btn-danger'});
    if(val!=='RESET'){if(val!==null)MODAL.alert('Cancelled','You must type RESET exactly.');return;}
    MODAL.loading('Resetting…');
    try{
      for(const path of['lecs','sessions','uids','cas','tas','taInvites','backup']){if(window._db)await window._db.ref(path).remove().catch(()=>{});else{const s=JSON.parse(localStorage.getItem('ugqr7_store')||'{}');delete s[path];localStorage.setItem('ugqr7_store',JSON.stringify(s));}}
      MODAL.close();await MODAL.success('Reset complete','All data deleted. Admin account kept.');renderSettings();
    }catch(err){MODAL.close();MODAL.error('Reset failed',err.message);}
  }

  return { tab, loadUIDs, genUID, copyUID, revokeUID, removeLec, filterSess, exportAllCSV, masterExcel, masterCSV, approveCA, rejectCA, revokeCA, deleteCA, resetAll };
})();

/* ══ CO-ADMIN ══ */
const CADM = (() => {
  const c    = () => document.getElementById('cadm-content');
  const dept = () => AUTH.getSession()?.department || '';

  function tab(name){document.querySelectorAll('#view-cadmin .tab').forEach(t=>t.classList.toggle('active',t.textContent.trim().toLowerCase().startsWith(name)));if(c())c().innerHTML='<div class="pg"><div class="att-empty">Loading…</div></div>';const fns={ids:renderIDs,lecturers:renderLecturers,sessions:renderSessions,database:renderDatabase};if(fns[name])fns[name]();}

  async function renderIDs(){
    const d=dept();c().innerHTML=`<div class="pg"><h2>Assign Lecturer IDs</h2><p class="sub">Generate IDs for lecturers in <strong>${UI.esc(d)}</strong>.</p><div class="inner-panel"><h3>Generate ID</h3><div class="field" style="margin-top:10px"><label class="fl">Intended for</label><input type="text" id="cadm-uid-for" class="fi" placeholder="Lecturer name"/></div><button class="btn btn-ug btn-sm" onclick="CADM.genUID()">Generate ID</button><div id="cadm-uid-result" style="display:none;margin-top:12px"><div class="uid-box"><div class="uid-lbl">Send this ID to the lecturer</div><div class="uid-val" id="cadm-uid-display"></div></div><button class="btn btn-secondary btn-sm" onclick="CADM.copyUID()" style="margin-top:8px">📋 Copy</button></div></div><h3>IDs you have issued</h3><div id="cadm-uid-list"><div class="att-empty">Loading…</div></div></div>`;
    await _loadMyUIDs();
  }

  async function _loadMyUIDs(){const el=document.getElementById('cadm-uid-list');if(!el)return;const myId=AUTH.getSession()?.id||'';try{const mine=(await DB.UID.getAll()).filter(u=>u.createdBy===myId);el.innerHTML=mine.length?mine.map(u=>`<div class="att-item"><div class="att-dot" style="background:${u.status==='available'?'var(--green-t)':'var(--text4)'}"></div><span style="font-family:monospace;font-weight:700;font-size:13px;color:var(--ug)">${UI.esc(u.id)}</span><span class="pill ${u.status==='available'?'pill-green':'pill-gray'}">${u.status}</span><span style="font-size:12px;color:var(--text3)">${UI.esc(u.intendedFor||'—')}</span>${u.status==='available'?`<button class="btn btn-danger btn-sm" onclick="CADM.revokeUID('${u.id}')">Revoke</button>`:''}</div>`).join(''):'<div class="no-rec">No IDs issued yet.</div>';}catch(err){el.innerHTML=`<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;}}

  async function genUID(){const user=AUTH.getSession();try{const all=await DB.UID.getAll(),ex=new Set(all.map(u=>u.id));let uid,t=0;do{uid=UI.makeLecUID();t++;}while(ex.has(uid)&&t<50);await DB.UID.set(uid,{id:uid,status:'available',intendedFor:document.getElementById('cadm-uid-for')?.value.trim()||'(unspecified)',department:user?.department||'',createdBy:user?.id||'',createdAt:Date.now()});document.getElementById('cadm-uid-display').textContent=uid;document.getElementById('cadm-uid-result').style.display='block';const f=document.getElementById('cadm-uid-for');if(f)f.value='';_loadMyUIDs();}catch(err){MODAL.error('Error',err.message);}}

  function copyUID(){const v=document.getElementById('cadm-uid-display')?.textContent;if(!v)return;navigator.clipboard?.writeText(v).then(()=>MODAL.success('Copied!',`ID: <strong>${v}</strong>`)).catch(()=>MODAL.alert('Copy manually',v));}
  async function revokeUID(id){const ok=await MODAL.confirm('Revoke?','',{confirmCls:'btn-danger'});if(!ok)return;try{await DB.UID.update(id,{status:'revoked'});_loadMyUIDs();}catch(err){MODAL.error('Error',err.message);}}

  async function renderLecturers(){const d=dept();c().innerHTML=`<div class="pg"><h2>Lecturers in ${UI.esc(d)}</h2><p class="sub">Only lecturers in your department.</p><div id="cadm-lec-list"><div class="att-empty">Loading…</div></div></div>`;try{const mine=(await DB.LEC.getAll()).filter(l=>l.department===d);document.getElementById('cadm-lec-list').innerHTML=mine.length?mine.map(l=>`<div class="att-item"><div class="att-dot" style="background:var(--amber)"></div><span class="att-name">${UI.esc(l.name)}</span><span style="font-family:monospace;font-size:12px;color:var(--ug);font-weight:700">${UI.esc(l.lecId)}</span><span class="att-sid">${UI.esc(l.email)}</span><span class="att-time">${new Date(l.createdAt).toLocaleDateString()}</span></div>`).join(''):'<div class="no-rec">No lecturers in your department yet.</div>';}catch(err){document.getElementById('cadm-lec-list').innerHTML=`<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;}}

  async function renderSessions(){const d=dept();c().innerHTML=`<div class="pg"><h2>Sessions in ${UI.esc(d)}</h2><p class="sub">Sessions from lecturers in your department.</p><div id="cadm-sess-list"><div class="att-empty">Loading…</div></div></div>`;try{const all=(await DB.SESSION.getAll()).filter(s=>s.department===d).sort((a,b)=>b.createdAt-a.createdAt);document.getElementById('cadm-sess-list').innerHTML=all.length?all.map(s=>{const cnt=s.records?Object.keys(s.records).length:0;return`<div class="sess-card"><div class="sc-hdr"><div><div class="sc-title">${UI.esc(s.courseCode)} — ${UI.esc(s.courseName)} <span class="pill ${s.active?'pill-teal':'pill-gray'}">${s.active?'active':'ended'}</span></div><div class="sc-meta">${UI.esc(s.lecturer)} · ${UI.esc(s.date)} · ${cnt} present</div></div></div></div>`;}).join(''):'<div class="no-rec">No sessions in your department yet.</div>';}catch(err){document.getElementById('cadm-sess-list').innerHTML=`<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;}}

  async function renderDatabase(){const d=dept();c().innerHTML=`<div class="pg"><h2>Department database</h2><p class="sub">All attendance for <strong>${UI.esc(d)}</strong>.</p><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px"><button class="btn btn-ug btn-sm" onclick="CADM.deptExcel()">⬇ Excel</button><button class="btn btn-secondary btn-sm" onclick="CADM.deptCSV()">⬇ CSV</button></div><div id="cadm-db-list"><div class="att-empty">Loading…</div></div></div>`;try{const all=(await DB.SESSION.getAll()).filter(s=>s.department===d),groups={};all.forEach(s=>{if(!groups[s.courseCode])groups[s.courseCode]={code:s.courseCode,name:s.courseName,count:0,total:0};groups[s.courseCode].count++;groups[s.courseCode].total+=(s.records?Object.keys(s.records).length:0);});document.getElementById('cadm-db-list').innerHTML=Object.values(groups).length?Object.values(groups).sort((a,b)=>a.code.localeCompare(b.code)).map(g=>`<div class="sess-card"><div class="sc-hdr"><div><div class="sc-title">${UI.esc(g.code)} — ${UI.esc(g.name)}</div><div class="sc-meta">${g.count} sessions · ${g.total} total</div></div></div></div>`).join(''):'<div class="no-rec">No data yet.</div>';}catch(err){document.getElementById('cadm-db-list').innerHTML=`<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;}}

  async function deptExcel(){if(typeof XLSX==='undefined'){MODAL.alert('Not ready','SheetJS not loaded.');return;}MODAL.loading('Preparing Excel…');const d=dept();try{const all=(await DB.SESSION.getAll()).filter(s=>s.department===d),wb=XLSX.utils.book_new(),courses={};all.forEach(s=>{if(!courses[s.courseCode])courses[s.courseCode]={rows:[['Date','Session ID','Student Name','Student ID','Fingerprint','Location','Time','Lecturer','Lecturer ID']]};(s.records?Object.values(s.records):[]).forEach(r=>courses[s.courseCode].rows.push([s.date,s.id,r.name,r.studentId,(r.fingerprint||'').slice(0,16),r.locNote||'',r.time,s.lecturer,s.lecId]));});Object.entries(courses).forEach(([code,{rows}])=>{const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=rows[0].map(()=>({wch:20}));XLSX.utils.book_append_sheet(wb,ws,code.slice(0,31));});XLSX.writeFile(wb,`UG_DEPT_${d.replace(/\W/g,'_')}_${UI.todayStr()}.xlsx`);MODAL.close();}catch(err){MODAL.close();MODAL.error('Export failed',err.message);}}

  async function deptCSV(){MODAL.loading('Preparing CSV…');const d=dept();try{const all=(await DB.SESSION.getAll()).filter(s=>s.department===d);const rows=[['Date','Course Code','Course','Student Name','Student ID','Fingerprint','Location','Time','Lecturer']];all.forEach(s=>(s.records?Object.values(s.records):[]).forEach(r=>rows.push([s.date,s.courseCode,s.courseName,r.name,r.studentId,(r.fingerprint||'').slice(0,16),r.locNote||'',r.time,s.lecturer])));UI.dlCSV(rows,`UG_DEPT_${d.replace(/\W/g,'_')}_${UI.todayStr()}`);MODAL.close();}catch(err){MODAL.close();MODAL.error('Export failed',err.message);}}

  return { tab, genUID, copyUID, revokeUID, deptExcel, deptCSV };
})();
