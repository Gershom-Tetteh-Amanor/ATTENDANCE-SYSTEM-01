/* session.js — Lecturer & TA dashboard
   Real-time check-ins (Firebase or demo mode).
   TA invite: 6-char code generation with copy functionality.
   Session ends ONLY when:
   1. Time duration expires
   2. Lecturer/TA manually ends it
   (Does NOT end when page is closed)
*/
'use strict';

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
    heartbeatInterval: null
  };

  /* ── Tab switching ── */
  function tab(name) {
    document.querySelectorAll('#view-lecturer .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('#view-lecturer .tab-page').forEach(p => p.classList.toggle('active', p.id === `lec-pg-${name}`));
    if (name === 'records') _loadRecords();
    if (name === 'reports') _loadReports();
    if (name === 'tas')     _loadTAs();
  }

  /* ── Reset form ── */
  function resetForm() {
    UI.Q('lec-setup').style.display  = 'block';
    UI.Q('lec-active').style.display = 'none';
    UI.Q('qr-box').innerHTML = '';
    const bw = UI.Q('l-blk-wrap'); if (bw) bw.style.display = 'none';
    UI.Q('l-code').value = UI.Q('l-course').value = '';
    S.locOn = true; S.locAcquired = false; S.lecLat = S.lecLng = null;
    UI.Q('loc-tog').classList.add('on');
    UI.Q('loc-lbl').textContent = 'Location fence enabled';
    const lr = UI.Q('loc-result'); if (lr) { lr.className = ''; lr.innerHTML = ''; }
    UI.Q('get-loc-btn').disabled    = false;
    UI.Q('get-loc-btn').textContent = '📍 Get my current location';
    UI.Q('gen-btn').disabled        = true;
    UI.Q('gen-hint').style.display  = 'block';
    tab('session');
  }

  /* ── Toggle location fence ── */
  function toggleFence() {
    S.locOn = !S.locOn;
    UI.Q('loc-tog').classList.toggle('on', S.locOn);
    UI.Q('loc-lbl').textContent = S.locOn ? 'Location fence enabled' : 'Location fence disabled';
    if (!S.locOn) { UI.Q('gen-btn').disabled=false; UI.Q('gen-hint').style.display='none'; }
    else if (!S.locAcquired) { UI.Q('gen-btn').disabled=true; UI.Q('gen-hint').style.display='block'; }
  }

  /* ── Get classroom GPS ── */
  function getLoc() {
    const btn=UI.Q('get-loc-btn'), res=UI.Q('loc-result');
    btn.disabled=true; btn.innerHTML='<span class="spin"></span>Getting location…';
    res.className='loc-result'; res.innerHTML='<div class="loc-dot pulsing"></div> Acquiring GPS…';
    if (!navigator.geolocation) { _demoLoc(); return; }
    navigator.geolocation.getCurrentPosition(
      p => { S.lecLat=p.coords.latitude; S.lecLng=p.coords.longitude; S.locAcquired=true; _locOK(p.coords.accuracy); },
      ()  => _demoLoc(),
      { enableHighAccuracy:true, timeout:15000, maximumAge:0 }
    );
  }
  function _demoLoc() { S.lecLat=5.6505+(Math.random()-.5)*.001; S.lecLng=-0.1875+(Math.random()-.5)*.001; S.locAcquired=true; _locOK(null); }
  function _locOK(acc) {
    const btn=UI.Q('get-loc-btn'), res=UI.Q('loc-result');
    res.className='loc-result ok';
    res.innerHTML=`<div class="loc-dot"></div> 📍 ${S.lecLat.toFixed(5)}, ${S.lecLng.toFixed(5)}${acc?` (±${Math.round(acc)}m)`:' (demo)'} — Set ✓`;
    btn.disabled=false; btn.textContent='🔄 Refresh location';
    UI.Q('gen-btn').disabled=false; UI.Q('gen-hint').style.display='none';
  }

  /* ── Start session (no auto-end on page close) ── */
  async function startSession() {
    const code   = UI.Q('l-code')?.value.trim().toUpperCase();
    const course = UI.Q('l-course')?.value.trim();
    const lecName= UI.Q('l-lecname')?.value.trim();
    const mins   = +(UI.Q('l-dur')?.value||60);
    UI.Q('l-code').classList.toggle('err', !code);
    UI.Q('l-course').classList.toggle('err', !course);
    if (!code||!course) return;
    if (S.locOn&&!S.locAcquired) { await MODAL.alert('Location required','Get your classroom location first (Step 1).'); return; }
    UI.btnLoad('gen-btn', true);
    try {
      const user=AUTH.getSession();
      const myId = user?.role==='ta' ? (user?.activeLecturerId||user?.id||'') : (user?.id||'');
      const existing=await DB.SESSION.byLec(myId);
      if (existing.find(s=>s.courseCode===code&&s.active)) {
        UI.btnLoad('gen-btn',false,'Step 2 — Generate QR code');
        await MODAL.error('Session conflict',`A session for <strong>${code}</strong> is already active. End it first.`); return;
      }
      const token=UI.makeToken(20), sessId=token.slice(0,12);
      S.session={
        id:sessId, token, courseCode:code, courseName:course,
        lecturer:lecName, lecId:user?.lecId||'', lecFbId:myId, department:user?.department||'',
        date:UI.todayStr(), expiresAt:Date.now()+mins*60000, durationMins:mins,
        lat:S.locOn?S.lecLat:null, lng:S.locOn?S.lecLng:null,
        radius:S.locOn?+(UI.Q('l-radius')?.value||100):null,
        locEnabled:S.locOn, active:true, createdAt:Date.now(),
        lastHeartbeat:Date.now() // Just for tracking, not for auto-end
      };
      await DB.SESSION.set(sessId, S.session);
      _buildPanel(lecName, mins);
      _startHeartbeat(); // Optional: just for tracking, not for auto-end
    } catch(err) { UI.btnLoad('gen-btn',false,'Step 2 — Generate QR code'); await MODAL.error('Error',err.message); }
  }

  /* ── Heartbeat (optional tracking only - does NOT end session) ── */
  function _startHeartbeat() {
    if (S.heartbeatInterval) clearInterval(S.heartbeatInterval);
    S.heartbeatInterval = setInterval(async () => {
      if (S.session && S.session.active) {
        try {
          await DB.SESSION.update(S.session.id, {
            lastHeartbeat: Date.now()
          });
          S.session.lastHeartbeat = Date.now();
        } catch(e) { console.warn('Heartbeat failed:', e); }
      }
    }, 60000); // Every 60 seconds
  }

  function _stopHeartbeat() {
    if (S.heartbeatInterval) {
      clearInterval(S.heartbeatInterval);
      S.heartbeatInterval = null;
    }
  }

  /* ── Build active-session panel ── */
  function _buildPanel(lecName, mins) {
    const s=S.session;
    UI.Q('l-si-code').textContent=s.courseCode; UI.Q('l-si-course').textContent=s.courseName;
    UI.Q('l-si-lec').textContent=lecName; UI.Q('l-si-date').textContent=s.date;
    UI.Q('l-si-lecid').textContent=s.lecId||'—'; UI.Q('l-si-id').textContent=s.id;
    UI.Q('l-si-dur').textContent=UI.fmtDur(mins);
    UI.Q('sec-pills').innerHTML=[
      {l:'1 device/sign-in',on:true},{l:'Fingerprint scan',on:true},
      {l:'Unique Student ID',on:true},{l:'Location fence',on:s.locEnabled},{l:'Time-limited QR',on:true},
      {l:'Manual end only',on:true}
    ].map(p=>`<span class="spill ${p.on?'on':'off'}">${p.on?'✓':'–'} ${p.l}</span>`).join('');
    const lc=UI.Q('l-loc-card');
    if (s.locEnabled&&s.lat) {
      lc.className='strip strip-teal';
      UI.Q('l-lfc-title').textContent=`Location fence — within ${s.radius}m`;
      UI.Q('l-lfc-detail').textContent=`Anchor: ${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`;
    } else { lc.className='strip strip-gray'; UI.Q('l-lfc-title').textContent='Location check disabled'; UI.Q('l-lfc-detail').textContent=''; }

    UI.Q('qr-box').innerHTML=''; UI.Q('qr-box').style.opacity='1';
    const payload=UI.b64e(JSON.stringify({id:s.id,token:s.token,code:s.courseCode,course:s.courseName,date:s.date,expiresAt:s.expiresAt,lat:s.lat,lng:s.lng,radius:s.radius,locEnabled:s.locEnabled}));
    const qrUrl=`${CONFIG.SITE_URL}?ci=${payload}`;
    if (typeof QRCode !== 'undefined') {
      new QRCode(UI.Q('qr-box'),{text:qrUrl,width:220,height:220,colorDark:'#1a1a18',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
    } else {
      UI.Q('qr-box').innerHTML=`<p style="padding:10px;font-size:11px;word-break:break-all;max-width:220px">${UI.esc(qrUrl)}</p>`;
    }
    UI.Q('lec-setup').style.display='none'; UI.Q('lec-active').style.display='block';
    UI.Q('live-csv-btn').style.display='none';
    UI.btnLoad('gen-btn',false,'Step 2 — Generate QR code');

    stopTimers();
    S.unsubRec=DB.SESSION.listenRecords(s.id, recs=>{_renderAtt(recs); if(recs.length>0) UI.Q('live-csv-btn').style.display='inline-block';});
    S.unsubBlk=DB.SESSION.listenBlocked(s.id, _renderBlk);
    _tick(); S.tickTimer=setInterval(_tick,1000);
  }

  function _tick() {
    if (!S.session) return;
    const rem=Math.max(0,S.session.expiresAt-Date.now()), el=UI.Q('l-cd');
    if (rem===0) { 
      el.textContent='Session expired'; 
      el.className='countdown exp'; 
      UI.Q('qr-box').style.opacity='0.3'; 
      clearInterval(S.tickTimer); 
      S.tickTimer=null; 
      _markEnded('timeout', 'Session duration expired');
      return; 
    }
    const h=Math.floor(rem/3600000),m=Math.floor((rem%3600000)/60000),ss=Math.floor((rem%60000)/1000);
    el.textContent=h>0?`${h}h ${UI.pad(m)}m ${UI.pad(ss)}s`:`${m}:${UI.pad(ss)}`;
    el.className='countdown '+(rem<180000?'warn':'ok');
  }

  function _renderAtt(records) {
    if (!Array.isArray(records)) records=[];
    UI.Q('l-att-count').textContent=records.length;
    UI.Q('l-att-list').innerHTML=records.length
      ? records.map((r,i)=>`<div class="att-item">
          <div class="att-dot"></div>
          <span style="font-size:11px;color:var(--text4);min-width:22px">${i+1}.</span>
          <span class="att-name">${UI.esc(r.name)}</span>
          <span class="att-sid">${UI.esc(r.studentId)}</span>
          <span class="pill pill-gray" title="${UI.esc(r.biometricId)}">🔏 ${UI.esc((r.biometricId||'').slice(0,8))}</span>
          ${r.locNote?`<span class="pill pill-teal">📍 ${UI.esc(r.locNote)}</span>`:''}
          <span class="att-time">${UI.esc(r.time)}</span>
        </div>`).join('')
      : '<div class="att-empty">Waiting for students to check in…</div>';
  }

  function _renderBlk(blocked) {
    if (!Array.isArray(blocked)) blocked=[];
    const w=UI.Q('l-blk-wrap'); if (!w) return;
    if (!blocked.length){w.style.display='none';return;}
    w.style.display='block'; UI.Q('l-blk-count').textContent=blocked.length;
    UI.Q('l-blk-list').innerHTML=blocked.map(b=>`<div class="blk-item"><span><strong>${UI.esc(b.name)}</strong> (${UI.esc(b.studentId)}) — ${UI.esc(b.reason)}</span><span style="color:var(--text4);white-space:nowrap">${UI.esc(b.time)}</span></div>`).join('');
  }

  async function _markEnded(endedBy = 'manual', reason = '') {
    if (!S.session) return;
    try {
      await DB.SESSION.update(S.session.id, {
        active: false,
        endedAt: Date.now(),
        endedBy: endedBy,
        endedReason: reason
      });
      const recs=await DB.SESSION.getRecords(S.session.id), blks=await DB.SESSION.getBlocked(S.session.id);
      await DB.BACKUP.save(S.session.lecId||S.session.lecFbId,S.session.id,{
        session:{...S.session,active:false,endedAt:Date.now(),endedBy,endedReason:reason},
        records:recs,
        blocked:blks,
        savedAt:new Date().toISOString()
      });
    } catch(e){console.warn(e.message);}
    S.session=null;
    _stopHeartbeat();
  }

  async function endSession() {
    const ok=await MODAL.confirm('End session?','All records will be saved and backed up.',{icon:'🛑',confirmLabel:'End session',confirmCls:'btn-danger'});
    if (!ok) return;
    stopTimers(); 
    await _markEnded('manual', 'Lecturer/TA manually ended session'); 
    resetForm(); 
    await MODAL.success('Session ended','All records saved.');
  }

  function stopTimers() {
    clearInterval(S.tickTimer); S.tickTimer=null;
    if (S.unsubRec){S.unsubRec();S.unsubRec=null;} 
    if (S.unsubBlk){S.unsubBlk();S.unsubBlk=null;}
    _stopHeartbeat();
  }

  function downloadQR() {
    const canvas=UI.Q('qr-box').querySelector('canvas'), img=UI.Q('qr-box').querySelector('img');
    if (!canvas&&!img){MODAL.alert('QR not ready','Start a session first.');return;}
    const a=document.createElement('a');
    a.href=canvas?canvas.toDataURL('image/png'):img.src;
    a.download=`QR_${S.session?.courseCode}_${S.session?.date}.png`; a.click();
  }

  async function exportLiveCSV() {
    if (!S.session) return;
    const recs=await DB.SESSION.getRecords(S.session.id);
    const rows=[['#','Name','Student ID','Biometric ID','Location','Time','Course','Lecturer','Date']];
    recs.forEach((r,i)=>rows.push([i+1,r.name,r.studentId,(r.biometricId||'').slice(0,16),r.locNote||'',r.time,S.session.courseCode,S.session.lecturer,S.session.date]));
    UI.dlCSV(rows,`ATT_${S.session.courseCode}_LIVE`);
  }

  /* ════ RECORDS TAB - with ability to end active sessions ════ */
  async function _loadRecords() {
    const el=UI.Q('records-list'); el.innerHTML='<div class="att-empty">Loading…</div>';
    try {
      const user=AUTH.getSession();
      const myLecId = user?.role==='ta' ? (user?.activeLecturerId||user?.id||'') : (user?.id||'');
      const sessions=(await DB.SESSION.byLec(myLecId)).filter(s=>!s.deletedByLec).sort((a,b)=>b.createdAt-a.createdAt);
      if (!sessions.length){el.innerHTML='<div class="no-rec">No sessions yet.</div>';return;}
      
      el.innerHTML=sessions.map(s=>{
        const recs=s.records?Object.values(s.records):[];
        const isActive = s.active === true;
        
        let statusBadge = '';
        let endButton = '';
        
        if (isActive) {
          statusBadge = `<span class="pill pill-teal" style="background:var(--teal);color:white">🟢 ACTIVE</span>`;
          endButton = `<button class="btn btn-warning btn-sm" onclick="LEC.endSessionFromRecord('${s.id}')" style="background:var(--amber);color:var(--text1)">⏹️ End Session</button>`;
        } else {
          statusBadge = `<span class="pill pill-gray">🔴 ENDED</span>`;
        }
        
        const endedInfo = s.endedBy ? `<div class="sc-meta" style="font-size:10px;color:var(--text4)">Ended: ${s.endedBy === 'manual' ? 'Manually' : s.endedBy === 'timeout' ? 'Time expired' : s.endedBy}</div>` : '';
        
        return `<div class="sess-card" style="border-left:4px solid ${isActive ? 'var(--teal)' : 'var(--text4)'}">
          <div class="sc-hdr">
            <div>
              <div class="sc-title">${UI.esc(s.courseCode)} — ${UI.esc(s.courseName)} ${statusBadge}</div>
              <div class="sc-meta">${UI.esc(s.date)} · ${recs.length} present · Duration: ${UI.fmtDur(s.durationMins||60)}</div>
              ${isActive ? `<div class="sc-meta" style="color:var(--teal);font-size:11px">⏱️ Session expires: ${new Date(s.expiresAt).toLocaleTimeString()}</div>` : endedInfo}
            </div>
            <div class="sc-actions" style="display:flex;gap:6px;flex-wrap:wrap">
              ${endButton}
              <button class="btn btn-secondary btn-sm" onclick="LEC.exportSessCSV('${s.id}')">⬇ CSV</button>
              ${!isActive ? `<button class="btn btn-danger btn-sm" onclick="LEC.deleteSess('${s.id}')">🗑️ Del</button>` : ''}
            </div>
          </div>
          ${recs.length > 0 ? `
            <div style="margin-top:10px">
              ${recs.slice(0,5).map((r,i)=>`<div class="rec-row"><span style="font-size:11px;color:var(--text4);min-width:22px">${i+1}.</span><span class="rec-name">${UI.esc(r.name)}</span><span class="rec-sid">${UI.esc(r.studentId)}</span><span class="rec-time">${UI.esc(r.time)}</span></div>`).join('')}
              ${recs.length>5?`<div style="font-size:11px;color:var(--text4);padding:4px 0">…${recs.length-5} more</div>`:''}
            </div>
          ` : '<div class="no-rec" style="margin-top:8px">No check-ins yet</div>'}
        </div>`;
      }).join('');
    } catch(err){el.innerHTML=`<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;}
  }

  // End an active session from the records tab
  async function endSessionFromRecord(sessionId) {
    const session = await DB.SESSION.get(sessionId);
    if (!session) {
      await MODAL.error('Not found', 'This session no longer exists.');
      return;
    }
    
    if (!session.active) {
      await MODAL.alert('Already ended', 'This session has already been ended.');
      _loadRecords();
      return;
    }
    
    const confirm = await MODAL.confirm(
      'End this session?',
      `<strong>${UI.esc(session.courseCode)} — ${UI.esc(session.courseName)}</strong><br/>
       Date: ${session.date}<br/>
       Current check-ins: ${session.records ? Object.keys(session.records).length : 0}<br/><br/>
       Ending this session will:
       • Stop new check-ins
       • Save all records permanently
       • Archive the session`,
      { icon: '🛑', confirmLabel: 'End Session', confirmCls: 'btn-warning' }
    );
    
    if (!confirm) return;
    
    try {
      const recs = await DB.SESSION.getRecords(sessionId);
      const blks = await DB.SESSION.getBlocked(sessionId);
      
      await DB.SESSION.update(sessionId, {
        active: false,
        endedAt: Date.now(),
        manuallyEnded: true,
        endedBy: 'manual_from_records',
        endedReason: 'Lecturer/TA ended session from records tab'
      });
      
      await DB.BACKUP.save(session.lecFbId || session.lecId, sessionId, {
        session: { ...session, active: false, manuallyEnded: true },
        records: recs,
        blocked: blks,
        savedAt: new Date().toISOString()
      });
      
      // If this is the currently active session in the UI, stop it
      if (S.session && S.session.id === sessionId) {
        stopTimers();
        S.session = null;
        resetForm();
      }
      
      await MODAL.success('Session Ended', 
        `Session for <strong>${UI.esc(session.courseCode)}</strong> has been ended.<br/>
         ${recs.length} check-in${recs.length !== 1 ? 's were' : ' was'} recorded and saved.`
      );
      
      _loadRecords();
      
      const activeTab = document.querySelector('#view-lecturer .tab.active')?.dataset?.tab;
      if (activeTab === 'session' && S.session === null) {
        resetForm();
      }
    } catch(err) {
      await MODAL.error('Error', err.message || 'Failed to end session.');
    }
  }

  async function deleteSess(id) {
    const session = await DB.SESSION.get(id);
    if (session && session.active) {
      const endFirst = await MODAL.confirm(
        'Cannot delete active session',
        'This session is still active. Would you like to end it first?',
        { confirmLabel: 'Yes, end it', cancelLabel: 'Cancel', confirmCls: 'btn-warning' }
      );
      if (endFirst) {
        await endSessionFromRecord(id);
      }
      return;
    }
    
    const ok=await MODAL.confirm('Delete session?','Admin backup preserved.',{confirmCls:'btn-danger'}); 
    if (!ok) return;
    try{
      await DB.SESSION.update(id,{deletedByLec:true});
      _loadRecords();
    }catch(err){MODAL.error('Error',err.message);}
  }

  async function exportSessCSV(id) {
    const s=await DB.SESSION.get(id); if (!s) return;
    const recs=await DB.SESSION.getRecords(id);
    if (!recs.length){MODAL.alert('No records','No check-ins to export.');return;}
    const rows=[['#','Name','Student ID','Biometric ID','Location','Time','Course','Lecturer','Date']];
    recs.forEach((r,i)=>rows.push([i+1,r.name,r.studentId,(r.biometricId||'').slice(0,16),r.locNote||'',r.time,s.courseCode,s.lecturer,s.date]));
    UI.dlCSV(rows,`ATT_${s.courseCode}_${s.date}`);
  }

  /* ════ REPORTS TAB ════ */
  async function _loadReports() {
    const el=UI.Q('reports-list'); el.innerHTML='<div class="att-empty">Loading…</div>';
    try {
      const user=AUTH.getSession();
      const all=(await DB.SESSION.byLec(user?.role==='ta'?(user?.activeLecturerId||user?.id||''):(user?.id||''))).filter(s=>!s.deletedByLec);
      if (!all.length){el.innerHTML='<div class="no-rec">No sessions yet.</div>';return;}
      const grouped={};
      all.forEach(s=>{if(!grouped[s.courseCode])grouped[s.courseCode]={code:s.courseCode,name:s.courseName,sessions:[]};grouped[s.courseCode].sessions.push(s);});
      el.innerHTML=Object.values(grouped).map(g=>{
        const total=g.sessions.reduce((n,s)=>n+(s.records?Object.keys(s.records).length:0),0);
        return `<div class="sess-card"><div class="sc-hdr"><div>
          <div class="sc-title">${UI.esc(g.code)} — ${UI.esc(g.name)}</div>
          <div class="sc-meta">${g.sessions.length} session${g.sessions.length!==1?'s':''} · ${total} total check-ins</div>
        </div><div class="sc-actions">
          <button class="btn btn-ug btn-sm" onclick="LEC.exportCourseXL('${UI.esc(g.code)}')">⬇ Excel</button>
          <button class="btn btn-secondary btn-sm" onclick="LEC.exportCourseCSV('${UI.esc(g.code)}')">⬇ CSV</button>
        </div></div></div>`;
      }).join('');
    } catch(err){el.innerHTML=`<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;}
  }

  async function exportCourseXL(code) {
    if (typeof XLSX === 'undefined'){MODAL.alert('Library not ready','SheetJS not loaded yet. Try again in a moment.');return;}
    MODAL.loading('Preparing Excel…');
    try {
      const user=AUTH.getSession();
      const all=(await DB.SESSION.byLec(user?.role==='ta'?(user?.activeLecturerId||user?.id||''):(user?.id||''))).filter(s=>s.courseCode===code&&!s.deletedByLec);
      if (!all.length){MODAL.close();MODAL.alert('No data','No sessions for this course.');return;}
      const wb=XLSX.utils.book_new();
      const r1=[['#','Date','Session ID','Student Name','Student ID','Biometric ID','Location','Check-in Time','Course','Lecturer','Lecturer ID']];
      let n=1; all.forEach(s=>{const recs=s.records?Object.values(s.records):[];if(!recs.length)r1.push([n++,s.date,s.id,'(no check-ins)','','','','',s.courseName,s.lecturer,s.lecId]);else recs.forEach(r=>r1.push([n++,s.date,s.id,r.name,r.studentId,(r.biometricId||'').slice(0,16),r.locNote||'',r.time,s.courseName,s.lecturer,s.lecId]));});
      const ws1=XLSX.utils.aoa_to_sheet(r1); ws1['!cols']=r1[0].map(()=>({wch:20}));
      XLSX.utils.book_append_sheet(wb,ws1,'Attendance List');
      const freq={}; all.forEach(s=>(s.records?Object.values(s.records):[]).forEach(r=>{const sid=r.studentId.toUpperCase().trim();if(!freq[sid])freq[sid]={sid:r.studentId,name:r.name,count:0,dates:[]};freq[sid].count++;freq[sid].dates.push(s.date);}));
      const r2=[['Student ID','Student Name','Sessions Attended','Total Sessions','Attendance %','Dates']];
      Object.values(freq).sort((a,b)=>b.count-a.count).forEach(f=>r2.push([f.sid,f.name,f.count,all.length,Math.round(f.count/all.length*100)+'%',f.dates.join(', ')]));
      const ws2=XLSX.utils.aoa_to_sheet(r2); ws2['!cols']=r2[0].map(()=>({wch:22}));
      XLSX.utils.book_append_sheet(wb,ws2,'Attendance Frequency');
      XLSX.writeFile(wb,`UG_ATT_${code}_${(user?.lecId||'').replace(/[^a-z0-9]/gi,'_')}.xlsx`);
      MODAL.close();
    } catch(err){MODAL.close();MODAL.error('Export failed',err.message);}
  }

  async function exportCourseCSV(code) {
    const user=AUTH.getSession();
    const all=(await DB.SESSION.byLec(user?.role==='ta'?(user?.activeLecturerId||user?.id||''):(user?.id||''))).filter(s=>s.courseCode===code&&!s.deletedByLec);
    const rows=[['#','Date','Student Name','Student ID','Biometric ID','Location','Time','Course','Lecturer']];
    let n=1; all.forEach(s=>(s.records?Object.values(s.records):[]).forEach(r=>rows.push([n++,s.date,r.name,r.studentId,(r.biometricId||'').slice(0,16),r.locNote||'',r.time,s.courseName,s.lecturer])));
    UI.dlCSV(rows,`UG_ATT_${code}`);
  }

  /* ════ TEACHING ASSISTANTS TAB ════ */
  async function _loadTAs() {
    const el=UI.Q('ta-list'); if (!el) return;
    el.innerHTML='<div class="att-empty">Loading…</div>';
    try {
      const user=AUTH.getSession(), myId=user?.id||'';
      const all=await DB.TA.getAll(), mine=all.filter(ta=>ta.lecturers?.includes(myId));
      if (UI.Q('ta-count')) UI.Q('ta-count').textContent=mine.length;
      if (!mine.length){el.innerHTML='<div class="no-rec">No teaching assistants yet.</div>';return;}
      el.innerHTML=mine.map(ta=>`<div class="att-item">
        <div class="att-dot" style="background:var(--teal)"></div>
        <span class="att-name">${UI.esc(ta.name||'(not yet registered)')}</span>
        <span class="att-sid">${UI.esc(ta.email)}</span>
        <span class="pill ${ta.status==='active'?'pill-teal':'pill-gray'}">${ta.status==='active'?'✓ Active':'Pending'}</span>
        <button class="btn btn-danger btn-sm" style="margin-left:auto" onclick="LEC.removeTA('${ta.id}','${UI.esc(ta.name||ta.email)}')">Remove</button>
      </div>`).join('');
    } catch(err){el.innerHTML=`<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;}
  }

  async function inviteTA() {
    const emailEl = UI.Q('ta-email-input');
    const nameEl = UI.Q('ta-name-input');
    const courseEl = UI.Q('ta-course-input');
    
    const email = (emailEl?.value || '').trim().toLowerCase();
    const taName = nameEl?.value?.trim() || '';
    const courseName = courseEl?.value?.trim() || 'Course';
    
    UI.clrAlert('ta-add-alert');
    
    if (!email) {
      UI.setAlert('ta-add-alert', '❌ Enter the TA\'s UG student email.');
      return;
    }
    
    if (!email.endsWith('@st.ug.edu.gh')) {
      UI.setAlert('ta-add-alert', '❌ Email must end with @st.ug.edu.gh (University of Ghana student email).');
      return;
    }
    
    if (!taName) {
      UI.setAlert('ta-add-alert', '❌ Enter the TA\'s full name.');
      return;
    }
    
    UI.btnLoad('ta-invite-btn', true);
    
    try {
      const user = AUTH.getSession();
      const myId = user?.id || '';
      const myName = user?.name || 'Your Lecturer';
      
      const existing = await DB.TA.byEmail(email);
      
      if (existing) {
        const lecs = existing.lecturers || [];
        if (lecs.includes(myId)) {
          UI.btnLoad('ta-invite-btn', false, 'Send invite');
          UI.setAlert('ta-add-alert', '⚠️ This TA is already linked to your dashboard.');
          return;
        }
        
        await DB.TA.update(existing.id, { lecturers: [...lecs, myId] });
        
        if (emailEl) emailEl.value = '';
        if (nameEl) nameEl.value = '';
        if (courseEl) courseEl.value = '';
        UI.btnLoad('ta-invite-btn', false, 'Send invite');
        
        await MODAL.success('TA Linked!', 
          `<strong>${UI.esc(taName)}</strong> (${UI.esc(email)}) already had an account and has been added to your dashboard.`
        );
        _loadTAs();
        return;
      }
      
      const code = UI.makeCode();
      const invKey = UI.makeToken();
      const signupLink = `${CONFIG.SITE_URL}?code=${code}#ta-signup`;
      
      await DB.TA.setInvite(invKey, {
        code: code,
        toEmail: email,
        toName: taName,
        lecturerId: myId,
        lecturerName: myName,
        courseName: courseName,
        createdAt: Date.now(),
        expiresAt: Date.now() + (48 * 3600 * 1000),
        usedAt: null
      });
      
      if (emailEl) emailEl.value = '';
      if (nameEl) nameEl.value = '';
      if (courseEl) courseEl.value = '';
      UI.btnLoad('ta-invite-btn', false, 'Send invite');
      
      await MODAL.alert('Invite Code Generated',
        `<div style="text-align:center">
           <div style="margin-bottom:16px;color:var(--text2);font-size:14px">
             Share this information with <strong>${UI.esc(taName)}</strong> at <strong>${UI.esc(email)}</strong>
           </div>
           
           <div style="background:var(--ug);color:var(--gold);padding:20px;border-radius:12px;margin-bottom:16px">
             <div style="font-size:12px;opacity:0.9;margin-bottom:6px">6-Character Invite Code</div>
             <div style="font-family:monospace;font-size:36px;font-weight:700;letter-spacing:4px">${code}</div>
             <div style="font-size:11px;opacity:0.8;margin-top:6px">Valid for 48 hours</div>
           </div>
           
           <div style="background:var(--surface2);padding:12px;border-radius:8px;margin-bottom:16px;word-break:break-all">
             <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Registration Link</div>
             <div style="font-family:monospace;font-size:11px">${UI.esc(signupLink)}</div>
           </div>
           
           <div style="display:flex;gap:10px;justify-content:center;margin-top:12px">
             <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${code}')">
               📋 Copy Code
             </button>
             <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${signupLink}')">
               🔗 Copy Link
             </button>
           </div>
         </div>`,
        { icon: '🎓', btnLabel: 'Done' }
      );
      
      _loadTAs();
      
    } catch(err) {
      UI.btnLoad('ta-invite-btn', false, 'Send invite');
      UI.setAlert('ta-add-alert', 'Error: ' + (err.message || 'Failed to generate invite.'));
      console.error('TA Invite Error:', err);
    }
  }

  async function removeTA(taId, taName) {
    const ok = await MODAL.confirm(`Remove ${taName}?`, 'They lose access to your dashboard only.', { confirmCls: 'btn-danger' });
    if (!ok) return;
    try {
      const user = AUTH.getSession();
      const myId = user?.id || '';
      const ta = await DB.TA.get(taId);
      if (!ta) return;
      await DB.TA.update(taId, { lecturers: (ta.lecturers || []).filter(id => id !== myId) });
      _loadTAs();
    } catch(err) { MODAL.error('Error', err.message); }
  }

  return { 
    tab, resetForm, toggleFence, getLoc, startSession, endSession, endSessionFromRecord,
    downloadQR, exportLiveCSV, stopTimers, deleteSess, exportSessCSV, 
    exportCourseXL, exportCourseCSV, inviteTA, removeTA 
  };
})();
