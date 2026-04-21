/* session.js — Lecturer & TA dashboard
   Real-time check-ins (Firebase or demo mode).
   TA invite: 6-char code + automatic email via EmailJS.
   ─────────────────────────────────────────── */
'use strict';

const LEC = (() => {
  const S = { session:null, locOn:true, lecLat:null, lecLng:null, locAcquired:false, tickTimer:null, unsubRec:null, unsubBlk:null };

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

  /* ── Get classroom GPS (fresh every session) ── */
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

  /* ── Start session ── */
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
      };
      await DB.SESSION.set(sessId, S.session);
      _buildPanel(lecName, mins);
    } catch(err) { UI.btnLoad('gen-btn',false,'Step 2 — Generate QR code'); await MODAL.error('Error',err.message); }
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
    if (rem===0) { el.textContent='Session expired'; el.className='countdown exp'; UI.Q('qr-box').style.opacity='0.3'; clearInterval(S.tickTimer); S.tickTimer=null; _markEnded(); return; }
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
          <span class="pill pill-gray" title="${UI.esc(r.fingerprint)}">🔏 ${UI.esc((r.fingerprint||'').slice(0,8))}</span>
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

  async function _markEnded() {
    if (!S.session) return;
    try {
      await DB.SESSION.update(S.session.id,{active:false,endedAt:Date.now()});
      const recs=await DB.SESSION.getRecords(S.session.id), blks=await DB.SESSION.getBlocked(S.session.id);
      await DB.BACKUP.save(S.session.lecId||S.session.lecFbId,S.session.id,{session:{...S.session,active:false},records:recs,blocked:blks,savedAt:new Date().toISOString()});
    } catch(e){console.warn(e.message);}
    S.session=null;
  }

  async function endSession() {
    const ok=await MODAL.confirm('End session?','All records will be saved and backed up.',{icon:'🛑',confirmLabel:'End session',confirmCls:'btn-danger'});
    if (!ok) return;
    stopTimers(); await _markEnded(); resetForm(); await MODAL.success('Session ended','All records saved.');
  }

  function stopTimers() {
    clearInterval(S.tickTimer); S.tickTimer=null;
    if (S.unsubRec){S.unsubRec();S.unsubRec=null;} if (S.unsubBlk){S.unsubBlk();S.unsubBlk=null;}
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
    const rows=[['#','Name','Student ID','Fingerprint','Location','Time','Course','Lecturer','Date']];
    recs.forEach((r,i)=>rows.push([i+1,r.name,r.studentId,(r.fingerprint||'').slice(0,16),r.locNote||'',r.time,S.session.courseCode,S.session.lecturer,S.session.date]));
    UI.dlCSV(rows,`ATT_${S.session.courseCode}_LIVE`);
  }

  /* ════ RECORDS TAB ════ */
  async function _loadRecords() {
    const el=UI.Q('records-list'); el.innerHTML='<div class="att-empty">Loading…</div>';
    try {
      const user=AUTH.getSession();
      const myLecId = user?.role==='ta' ? (user?.activeLecturerId||user?.id||'') : (user?.id||'');
      const sessions=(await DB.SESSION.byLec(myLecId)).filter(s=>!s.deletedByLec).sort((a,b)=>b.createdAt-a.createdAt);
      if (!sessions.length){el.innerHTML='<div class="no-rec">No completed sessions yet.</div>';return;}
      el.innerHTML=sessions.map(s=>{
        const recs=s.records?Object.values(s.records):[];
        const sp=s.active?`<span class="pill pill-teal">active</span>`:`<span class="pill pill-gray">ended</span>`;
        return `<div class="sess-card"><div class="sc-hdr"><div>
          <div class="sc-title">${UI.esc(s.courseCode)} — ${UI.esc(s.courseName)} ${sp}</div>
          <div class="sc-meta">${UI.esc(s.date)} · ${recs.length} present</div>
        </div><div class="sc-actions">
          <button class="btn btn-secondary btn-sm" onclick="LEC.exportSessCSV('${s.id}')">⬇ CSV</button>
          <button class="btn btn-danger btn-sm" onclick="LEC.deleteSess('${s.id}')">Del</button>
        </div></div>
        ${recs.slice(0,5).map((r,i)=>`<div class="rec-row"><span style="font-size:11px;color:var(--text4);min-width:22px">${i+1}.</span><span class="rec-name">${UI.esc(r.name)}</span><span class="rec-sid">${UI.esc(r.studentId)}</span><span class="rec-time">${UI.esc(r.time)}</span></div>`).join('')}
        ${recs.length>5?`<div style="font-size:11px;color:var(--text4);padding:4px 0">…${recs.length-5} more</div>`:''}
        </div>`;
      }).join('');
    } catch(err){el.innerHTML=`<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;}
  }

  async function deleteSess(id) {
    const ok=await MODAL.confirm('Delete session?','Admin backup preserved.',{confirmCls:'btn-danger'}); if (!ok) return;
    try{await DB.SESSION.update(id,{deletedByLec:true});_loadRecords();}catch(err){MODAL.error('Error',err.message);}
  }

  async function exportSessCSV(id) {
    const s=await DB.SESSION.get(id); if (!s) return;
    const recs=await DB.SESSION.getRecords(id);
    if (!recs.length){MODAL.alert('No records','No check-ins to export.');return;}
    const rows=[['#','Name','Student ID','Fingerprint','Location','Time','Course','Lecturer','Date']];
    recs.forEach((r,i)=>rows.push([i+1,r.name,r.studentId,(r.fingerprint||'').slice(0,16),r.locNote||'',r.time,s.courseCode,s.lecturer,s.date]));
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
      const r1=[['#','Date','Session ID','Student Name','Student ID','Fingerprint','Location','Check-in Time','Course','Lecturer','Lecturer ID']];
      let n=1; all.forEach(s=>{const recs=s.records?Object.values(s.records):[];if(!recs.length)r1.push([n++,s.date,s.id,'(no check-ins)','','','','',s.courseName,s.lecturer,s.lecId]);else recs.forEach(r=>r1.push([n++,s.date,s.id,r.name,r.studentId,(r.fingerprint||'').slice(0,16),r.locNote||'',r.time,s.courseName,s.lecturer,s.lecId]));});
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
    const rows=[['#','Date','Student Name','Student ID','Fingerprint','Location','Time','Course','Lecturer']];
    let n=1; all.forEach(s=>(s.records?Object.values(s.records):[]).forEach(r=>rows.push([n++,s.date,r.name,r.studentId,(r.fingerprint||'').slice(0,16),r.locNote||'',r.time,s.courseName,s.lecturer])));
    UI.dlCSV(rows,`UG_ATT_${code}`);
  }

  /* ════ TEACHING ASSISTANTS TAB with EmailJS ════ */
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
    
    const email = (emailEl?.value||'').trim().toLowerCase();
    const taName = nameEl?.value?.trim() || '';
    const courseName = courseEl?.value?.trim() || 'course';
    
    UI.clrAlert('ta-add-alert');
    if (!email) return UI.setAlert('ta-add-alert','Enter the TA\'s UG student email.');
    if (!UI.isTAEmail(email)) return UI.setAlert('ta-add-alert','Email must end with @st.ug.edu.gh');
    if (!taName) return UI.setAlert('ta-add-alert','Enter the TA\'s full name.');
    
    UI.btnLoad('ta-invite-btn',true);
    try {
      const user = AUTH.getSession();
      const myId = user?.id || '';
      
      // Check if TA already exists
      const existing = await DB.TA.byEmail(email);
      
      if (existing) {
        const lecs = existing.lecturers || [];
        if (lecs.includes(myId)) {
          UI.btnLoad('ta-invite-btn',false,'Send invite');
          return UI.setAlert('ta-add-alert','This TA is already linked to your dashboard.');
        }
        await DB.TA.update(existing.id, { lecturers: [...lecs, myId] });
        emailEl.value = '';
        if (nameEl) nameEl.value = '';
        if (courseEl) courseEl.value = '';
        UI.btnLoad('ta-invite-btn',false,'Send invite');
        await MODAL.success('TA linked!', `${email} already has an account and has been added to your dashboard.`);
        _loadTAs();
        return;
      }
      
      // Generate invite code
      const code = UI.makeCode();
      const invKey = UI.makeToken();
      const signupLink = `${CONFIG.SITE_URL}?code=${code}#ta-signup`;
      
      await DB.TA.setInvite(invKey, {
        code,
        toEmail: email,
        toName: taName,
        lecturerId: myId,
        lecturerName: user?.name || 'Lecturer',
        courseName: courseName,
        createdAt: Date.now(),
        expiresAt: Date.now() + 48 * 3600 * 1000,
        usedAt: null
      });
      
      // Send email via EmailJS
      let emailSent = false;
      let emailError = null;
      
      if (CONFIG.EMAILJS && CONFIG.EMAILJS.PUBLIC_KEY && !CONFIG.EMAILJS.PUBLIC_KEY.startsWith('YOUR_')) {
        try {
          if (typeof emailjs === 'undefined') {
            throw new Error('EmailJS library not loaded. Check your internet connection.');
          }
          
          const templateParams = {
            to_name: taName,
            to_email: email,
            invite_code: code,
            signup_link: signupLink,
            lecturer_name: user?.name || 'Your Lecturer',
            course_name: courseName,
          };
          
          const response = await emailjs.send(
            CONFIG.EMAILJS.SERVICE_ID,
            CONFIG.EMAILJS.TEMPLATE_ID,
            templateParams
          );
          
          if (response.status === 200) {
            emailSent = true;
            console.log('[UG-QR] Email sent successfully:', response);
          } else {
            emailError = `EmailJS returned status ${response.status}`;
          }
        } catch(err) {
          emailError = err.message || 'Unknown email error';
          console.error('[UG-QR] EmailJS error:', err);
        }
      } else {
        emailError = 'EmailJS not configured. Add your API keys to config.js';
        console.warn('[UG-QR]', emailError);
      }
      
      // Clear form
      emailEl.value = '';
      if (nameEl) nameEl.value = '';
      if (courseEl) courseEl.value = '';
      UI.btnLoad('ta-invite-btn',false,'Send invite');
      
      if (emailSent) {
        await MODAL.success('Invitation sent!',
          `An email with the invite code has been sent to <strong>${UI.esc(email)}</strong>.<br/>
           <span style="font-size:12px;color:var(--text3)">The TA can click the link in the email to register.</span>
           <hr style="margin:12px 0"/>
           <div style="font-size:11px;background:var(--surface2);padding:8px;border-radius:6px">
             <strong>Invite code:</strong> ${code}<br/>
             <strong>Link:</strong> <span style="word-break:break-all">${UI.esc(signupLink)}</span>
           </div>`
        );
      } else {
        // Fallback: show code manually
        await MODAL.alert('Invite code generated (email failed)',
          `<div style="margin-bottom:10px;color:var(--danger);font-size:13px">
             ⚠️ Email could not be sent: ${UI.esc(emailError)}
           </div>
           <div style="margin-bottom:10px">Please share this information with <strong>${UI.esc(taName)}</strong> (${UI.esc(email)}):</div>
           <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:10px;text-align:center">
             <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Invite code (expires in 48 hours)</div>
             <div style="font-family:monospace;font-size:28px;font-weight:700;letter-spacing:.15em;color:var(--ug)">${code}</div>
             <button class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="navigator.clipboard.writeText('${code}')">📋 Copy code</button>
           </div>
           <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px;word-break:break-all">
             <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Registration link</div>
             <div style="font-family:monospace;font-size:11px;margin-bottom:8px">${UI.esc(signupLink)}</div>
             <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${signupLink}')">📋 Copy link</button>
           </div>
           <div style="margin-top:12px;padding:8px;background:var(--amber-l);border-radius:6px;font-size:12px">
             💡 <strong>Tip:</strong> Check your EmailJS configuration in config.js to enable automatic emails.
           </div>`,
          { icon:'📧', btnLabel:'Done' }
        );
      }
      _loadTAs();
    } catch(err) {
      UI.setAlert('ta-add-alert', err.message || 'Failed to generate invite.');
    } finally {
      UI.btnLoad('ta-invite-btn', false, '📧 Send email invitation');
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
    tab, resetForm, toggleFence, getLoc, startSession, endSession, 
    downloadQR, exportLiveCSV, stopTimers, deleteSess, exportSessCSV, 
    exportCourseXL, exportCourseCSV, inviteTA, removeTA 
  };
})();
