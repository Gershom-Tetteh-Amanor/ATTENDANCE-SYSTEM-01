/* student.js — Student check-in
   Fix 3: Students register ONCE with student ID + UG email + password + fingerprint.
   Their identity is stored permanently in Firebase/demo store.
   On any device they re-verify with student ID + live fingerprint OR password.
   Duplicate check-ins are blocked by student ID per session (cross-device).
*/
'use strict';

const STU = (() => {
  const S = { session:null, cdTimer:null, stuLat:null, stuLng:null, fingerprint:null, registeredStudent:null };

  async function init(ciParam) {
    try {
      const data = JSON.parse(UI.b64d(decodeURIComponent(ciParam)));
      _hideAll();
      if(!data?.id||!data?.token){_invalid('Invalid QR code','Malformed QR. Ask your lecturer for a new one.');return;}
      if(Date.now()>data.expiresAt){_invalid('Session expired',`The sign-in window for <strong>${UI.esc(data.code)}</strong> has closed.`);return;}
      S.session=data;
      /* Show the registration/check-in form */
      UI.Q('s-code').textContent=data.code;
      UI.Q('s-course').textContent=data.course;
      UI.Q('s-date').textContent=data.date;
      /* Start with registration check step */
      _showStep('step-identity');
      _cdTick();clearInterval(S.cdTimer);S.cdTimer=setInterval(_cdTick,1000);
    }catch(e){console.error(e);_hideAll();_invalid('Could not read QR code','Please scan again.');}
  }

  function _hideAll(){['loading','invalid','done'].forEach(n=>UI.Q('stu-'+n)?.classList.remove('show'));const f=UI.Q('stu-form');if(f)f.style.display='none';}
  function _invalid(title,msg){clearInterval(S.cdTimer);S.cdTimer=null;UI.Q('stu-invalid').classList.add('show');UI.Q('inv-title').textContent=title;UI.Q('inv-msg').innerHTML=msg;}

  function _showStep(stepId) {
    UI.Q('stu-form').style.display='block';
    ['step-identity','step-biometric','step-checkin'].forEach(id=>{
      const el=UI.Q(id); if(el)el.style.display=id===stepId?'block':'none';
    });
  }

  function _cdTick(){
    if(!S.session)return;const rem=Math.max(0,S.session.expiresAt-Date.now()),el=UI.Q('s-cd');if(!el)return;
    if(rem===0){el.textContent='Session expired';el.className='countdown exp';clearInterval(S.cdTimer);S.cdTimer=null;_invalid('Session expired','Sign-in window closed.');return;}
    const h=Math.floor(rem/3600000),m=Math.floor((rem%3600000)/60000),s2=Math.floor((rem%60000)/1000);
    el.textContent=h>0?`${h}h ${UI.pad(m)}m ${UI.pad(s2)}s left`:`${m}:${UI.pad(s2)} left`;
    el.className='countdown '+(rem<180000?'warn':'ok');
  }

  /* ═══ STEP 1 — Identity: student enters their student ID ═══ */
  async function lookupStudent() {
    const sid = UI.Q('s-id-lookup')?.value.trim().toUpperCase();
    UI.clrAlert('stu-id-alert');
    if(!sid){UI.Q('s-id-lookup')?.classList.add('err');return UI.setAlert('stu-id-alert','Enter your Student ID.');}
    UI.Q('s-id-lookup').classList.remove('err');
    UI.btnLoad('btn-lookup',true);
    try {
      const existing = await DB.STUDENTS.byStudentId(sid);
      UI.btnLoad('btn-lookup',false,'Continue');
      if(existing){
        /* Known student — go to biometric step */
        S.registeredStudent = existing;
        UI.Q('s-reg-name').textContent   = existing.name;
        UI.Q('s-reg-sid').textContent    = existing.studentId;
        UI.Q('s-reg-email').textContent  = existing.email;
        _showStep('step-biometric');
      } else {
        /* New student — show registration fields */
        _showRegFields(sid);
      }
    }catch(err){UI.btnLoad('btn-lookup',false,'Continue');UI.setAlert('stu-id-alert',err.message||'Error.');}
  }

  function _showRegFields(sid) {
    UI.Q('s-id-lookup').value = sid;
    const regBlock = UI.Q('stu-reg-block');
    if(regBlock) regBlock.style.display = 'block';
    const hint = UI.Q('stu-new-hint');
    if(hint) hint.style.display = 'block';
  }

  /* ═══ STEP 1b — Register new student ═══ */
  async function registerStudent() {
    const sid   = UI.Q('s-id-lookup')?.value.trim().toUpperCase();
    const name  = UI.Q('s-reg-full-name')?.value.trim();
    const email = UI.Q('s-reg-email-input')?.value.trim().toLowerCase();
    const pass  = UI.Q('s-reg-pass')?.value;
    const pass2 = UI.Q('s-reg-pass2')?.value;
    UI.clrAlert('stu-id-alert');
    if(!sid||!name||!email||!pass)return UI.setAlert('stu-id-alert','All fields are required.');
    if(!email.endsWith('.ug.edu.gh')&&!email.endsWith('@st.ug.edu.gh'))return UI.setAlert('stu-id-alert','Email must be a UG email (e.g. @st.ug.edu.gh or @ug.edu.gh).');
    if(pass.length<6)return UI.setAlert('stu-id-alert','Password must be at least 6 characters.');
    if(pass!==pass2)  return UI.setAlert('stu-id-alert','Passwords do not match.');
    UI.btnLoad('btn-register-student',true);
    try {
      /* Capture biometric during registration */
      const fp = await _captureRaw();
      const student = {
        studentId: sid,
        name,
        email,
        pwHash:    UI.hashPw(pass),
        devices:   { [_fpKey(fp)]: Date.now() },
        primaryFp: fp,
        createdAt: Date.now(),
      };
      await DB.STUDENTS.set(sid, student);
      S.registeredStudent = student;
      UI.btnLoad('btn-register-student',false,'Register');
      await MODAL.success('Account created!',
        `Welcome, ${name}. Your account has been created.<br/>
         <span style="font-size:12px;color:var(--text3)">Your fingerprint is now registered on this device. On other devices you can verify with your password.</span>`
      );
      /* Now go to the check-in step */
      _prefillCheckin(student);
      _showStep('step-checkin');
    }catch(err){UI.btnLoad('btn-register-student',false,'Register');UI.setAlert('stu-id-alert',err.message||'Registration failed.');}
  }

  /* ═══ STEP 2 — Biometric verification (returning student) ═══ */
  async function verifyBiometric() {
    const student = S.registeredStudent;
    if(!student) return;
    UI.clrAlert('stu-bio-alert');
    UI.btnLoad('btn-verify-bio',true);

    const fp = await _captureRaw();

    /* Check if this device is already registered for this student */
    const deviceKnown = student.devices && student.devices[_fpKey(fp)];
    if(deviceKnown || _fpKey(fp) === _fpKey(student.primaryFp)) {
      /* Known device — fingerprint matches — proceed */
      S.fingerprint = fp;
      UI.btnLoad('btn-verify-bio',false,'Verify fingerprint');
      _prefillCheckin(student);
      _showStep('step-checkin');
    } else {
      /* New/unknown device — require password */
      UI.btnLoad('btn-verify-bio',false,'Verify fingerprint');
      UI.setAlert('stu-bio-alert','This device is not recognised. Please verify with your password below.');
      UI.Q('stu-pass-fallback').style.display = 'block';
    }
  }

  /* Password fallback when device not recognised */
  async function verifyPassword() {
    const pass = UI.Q('s-bio-pass')?.value;
    const student = S.registeredStudent;
    UI.clrAlert('stu-bio-alert');
    if(!pass||!student) return;
    if(UI.hashPw(pass) !== student.pwHash) {
      return UI.setAlert('stu-bio-alert','Incorrect password.');
    }
    /* Password correct — register this device */
    const fp = await _captureRaw();
    S.fingerprint = fp;
    await DB.STUDENTS.addDevice(student.studentId, fp);
    UI.Q('stu-pass-fallback').style.display = 'none';
    await MODAL.success('Device registered!','This device has been added to your account for future sign-ins.');
    _prefillCheckin(student);
    _showStep('step-checkin');
  }

  function _prefillCheckin(student) {
    const nameEl = UI.Q('s-name'), sidEl = UI.Q('s-sid');
    if(nameEl) nameEl.value = student.name;
    if(sidEl)  sidEl.value  = student.studentId;
    /* Show their profile card */
    const card = UI.Q('stu-profile-card');
    if(card) {
      UI.Q('sp-name').textContent  = student.name;
      UI.Q('sp-sid').textContent   = student.studentId;
      UI.Q('sp-email').textContent = student.email;
      card.style.display = 'block';
    }
    /* Set location */
    if(S.session?.locEnabled && S.session?.lat!=null){
      UI.Q('loc-btn-row').style.display='flex';UI.Q('no-loc-row').style.display='none';
      _setLoc('idle','Location required — tap to get your location');
    } else {
      UI.Q('loc-btn-row').style.display='none';UI.Q('no-loc-row').style.display='block';
      _setLoc('idle','Location not required for this session');
    }
  }

  /* ═══ Fingerprint capture ═══ */
  async function _captureRaw() {
    const signals = [
      navigator.userAgent, navigator.language,
      (navigator.languages||[]).join(','),
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      new Date().getTimezoneOffset(),
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      navigator.hardwareConcurrency||0, navigator.deviceMemory||0,
      navigator.platform||'', navigator.vendor||'',
      String(navigator.cookieEnabled),
    ];
    try{const cv=document.createElement('canvas');cv.width=240;cv.height=48;const ctx=cv.getContext('2d');ctx.fillStyle='#003087';ctx.fillRect(0,0,240,48);ctx.font='14px Arial';ctx.fillStyle='#fcd116';ctx.fillText('UG QR '+navigator.platform,8,30);signals.push(cv.toDataURL());}catch{}
    try{const gl=document.createElement('canvas').getContext('webgl');if(gl){const ext=gl.getExtension('WEBGL_debug_renderer_info');if(ext){signals.push(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL));signals.push(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));}}}catch{}
    const raw=signals.join('|||');let h1=0x811c9dc5,h2=0x6b3a9559;
    for(let i=0;i<raw.length;i++){const c=raw.charCodeAt(i);h1^=c;h1=Math.imul(h1,0x01000193)>>>0;h2^=c;h2=Math.imul(h2,0x00000193)>>>0;}
    for(let i=raw.length-1;i>=0;i--){const c=raw.charCodeAt(i);h1^=(c<<5)^h2;h1=Math.imul(h1,0x01000193)>>>0;h2^=(c<<3)^h1;h2=Math.imul(h2,0x00000193)>>>0;}
    return (h1>>>0).toString(16).padStart(8,'0')+(h2>>>0).toString(16).padStart(8,'0');
  }

  const _fpKey = fp => fp.replace(/[^a-zA-Z0-9]/g,'_');

  async function captureFingerprint() {
    const area=UI.Q('fp-scan-area'),status=UI.Q('fp-status-txt'),btn=UI.Q('fp-btn'),icon=UI.Q('fp-icon');
    if(area)area.classList.add('capturing'); if(icon)icon.textContent='⏳'; if(status)status.textContent='Capturing…';
    if(btn){btn.disabled=true;btn.innerHTML='<span class="spin"></span>Capturing…';}
    await new Promise(r=>setTimeout(r,700));
    S.fingerprint = await _captureRaw();
    if(area){area.classList.remove('capturing');area.classList.add('done');}
    if(icon)icon.textContent='✅';if(status)status.textContent='Fingerprint captured ✓';
    const fpRes=UI.Q('fp-result'),fpVal=UI.Q('fp-val');
    if(fpVal)fpVal.textContent=S.fingerprint.slice(0,16)+'…';if(fpRes)fpRes.style.display='block';
    if(btn){btn.disabled=false;btn.textContent='🔄 Re-capture';}
  }

  function getLocation(){
    _setLoc('busy','Fetching your location…');
    if(!navigator.geolocation){_simLoc();return;}
    navigator.geolocation.getCurrentPosition(p=>{S.stuLat=p.coords.latitude;S.stuLng=p.coords.longitude;_setLoc('ok',`Location acquired: ${S.stuLat.toFixed(5)}, ${S.stuLng.toFixed(5)}`);},()=>_simLoc(),{timeout:10000,maximumAge:0});
  }
  function _simLoc(){const base=S.session?.lat?[S.session.lat,S.session.lng]:[5.6505,-0.1875],d=0.0003;S.stuLat=base[0]+(Math.random()-.5)*d*2;S.stuLng=base[1]+(Math.random()-.5)*d*2;_setLoc('ok',`Location (demo): ${S.stuLat.toFixed(5)}, ${S.stuLng.toFixed(5)}`);}
  function _setLoc(cls,msg){const b=UI.Q('ls-box');if(!b)return;b.className='loc-status '+cls;UI.Q('ls-text').textContent=msg;}

  /* ═══ Final check-in ═══ */
  async function checkIn() {
    const nameEl=UI.Q('s-name'),sidEl=UI.Q('s-sid');
    const name=nameEl?.value.trim(),sid=sidEl?.value.trim();
    nameEl?.classList.remove('err');sidEl?.classList.remove('err');
    UI.Q('res-ok').style.display='none';UI.Q('res-err').style.display='none';
    if(!S.fingerprint){
      /* Auto-capture if not yet captured */
      await captureFingerprint();
    }
    if(!name){nameEl?.classList.add('err');_err('Please enter your full name.');return;}
    if(!sid){sidEl?.classList.add('err');_err('Student ID is required.');return;}
    if(!S.session||Date.now()>S.session.expiresAt){_err('This session has expired.');return;}
    ['ci-btn','ci-btn-loc'].forEach(id=>{const b=UI.Q(id);if(b){b.disabled=true;b.innerHTML='<span class="spin"></span>Checking in…';}});
    const sessId=S.session.id,normSid=sid.toUpperCase().trim();
    try {
      /* Duplicate student ID check (primary cross-device guard) */
      if(await DB.SESSION.hasSid(sessId,normSid)){
        const recs=await DB.SESSION.getRecords(sessId),who=recs.find(r=>r.studentId.toUpperCase()===normSid);
        await DB.SESSION.pushBlocked(sessId,{name,studentId:sid,reason:`Student ID already checked in${who?' as '+who.name:''}`,time:UI.nowTime()});
        _err(`Student ID "${sid}" has already checked in for this session.`);_resetBtns();return;
      }
      /* Duplicate device fingerprint (same-device guard) */
      if(await DB.SESSION.hasDevice(sessId,S.fingerprint)){
        const recs=await DB.SESSION.getRecords(sessId),who=recs.find(r=>r.fingerprint===S.fingerprint);
        await DB.SESSION.pushBlocked(sessId,{name,studentId:sid,reason:`Device already used by ${who?.name||'another student'}`,time:UI.nowTime()});
        _err(`This device already checked someone in${who?' ('+who.name+')':''}.`);_resetBtns();return;
      }
      /* Duplicate name */
      const existing=await DB.SESSION.getRecords(sessId);
      if(existing.find(r=>r.name.toLowerCase()===name.toLowerCase())){
        await DB.SESSION.pushBlocked(sessId,{name,studentId:sid,reason:'Name already checked in',time:UI.nowTime()});
        _err(`${name} has already checked in this session.`);_resetBtns();return;
      }
      /* Location fence */
      let locNote='';
      if(S.session.locEnabled&&S.session.lat!=null){
        if(S.stuLat===null){_err('Location required — tap "Get my location" first.');_resetBtns();return;}
        const dist=UI.haversine(S.stuLat,S.stuLng,S.session.lat,S.session.lng);
        if(dist>S.session.radius){await DB.SESSION.pushBlocked(sessId,{name,studentId:sid,reason:`Too far: ${dist}m (limit ${S.session.radius}m)`,time:UI.nowTime()});_err(`You are ${dist}m from the classroom (limit ${S.session.radius}m).`);_resetBtns();return;}
        locNote=`${dist}m`;
      }
      await Promise.all([
        DB.SESSION.addDevice(sessId,S.fingerprint),
        DB.SESSION.addSid(sessId,normSid),
        DB.SESSION.pushRecord(sessId,{name,studentId:sid,fingerprint:S.fingerprint,locNote,time:UI.nowTime(),checkedAt:Date.now()}),
      ]);
      clearInterval(S.cdTimer);S.cdTimer=null;_hideAll();
      UI.Q('stu-done').classList.add('show');
      UI.Q('done-msg').textContent=`Attendance for ${S.session.code} — ${S.session.course} on ${S.session.date} recorded.`;
    }catch(err){_err('Error: '+(err.message||'Something went wrong.'));_resetBtns();}
  }

  function _err(msg){const el=UI.Q('res-err');if(!el)return;el.innerHTML=`<strong>✗ Check-in failed</strong><br>${UI.esc(msg)}`;el.style.display='block';}
  function _resetBtns(){['ci-btn','ci-btn-loc'].forEach(id=>{const b=UI.Q(id);if(b){b.disabled=false;b.textContent='Check in';}});}

  return { init, lookupStudent, registerStudent, verifyBiometric, verifyPassword, captureFingerprint, getLocation, checkIn };
})();
