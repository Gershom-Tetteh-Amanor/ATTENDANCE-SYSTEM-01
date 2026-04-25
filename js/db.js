/* db.js — Database abstraction with STRICT lecturer-specific isolation */
'use strict';

const DB = (() => {
  const fb = () => window._db;
  const k  = s => String(s).replace(/[.#$[\]/]/g, '_');

  /* ══ Helpers ══ */
  const normalizeCourseCode = (code) => {
    return String(code || '').toUpperCase().replace(/\s/g, '');
  };

  const getCourseKey = (lecId, code, year, semester) => {
    const cleanLecId = k(lecId);
    const cleanCode = normalizeCourseCode(code);
    return `${cleanLecId}_${cleanCode}_${year}_${semester}`;
  };

  const getCurrentAcademicPeriod = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    let semester = 1;
    if (month >= 1 && month <= 6) semester = 2;
    return { year, semester };
  };

  /* ══ Firebase operations ══ */
  const fbGet    = async p => { const s = await fb().ref(p).once('value'); return s.val() ?? null; };
  const fbSet    = (p, v)  => fb().ref(p).set(v);
  const fbUpdate = (p, v)  => fb().ref(p).update(v);
  const fbRemove = p       => fb().ref(p).remove();
  const fbPush   = (p, v)  => fb().ref(p).push(v);
  const fbListen = (p, cb) => { const ref=fb().ref(p),fn=s=>cb(s.val()); ref.on('value',fn); return ()=>ref.off('value',fn); };

  /* ══ Demo store ══ */
  const LS = 'ugqr7_store';
  let _bc = null;
  const load    = () => { try{return JSON.parse(localStorage.getItem(LS)||'{}');}catch{return {};} };
  const save    = s => localStorage.setItem(LS, JSON.stringify(s));
  const getBC   = () => { if(!_bc&&typeof BroadcastChannel!=='undefined')_bc=new BroadcastChannel('ugqr7'); return _bc; };
  const bcast   = top => { try{getBC()?.postMessage({top,t:Date.now()});}catch{} };
  const demoGet = p => { const parts=p.replace(/^\//,'').split('/'); let n=load(); for(const x of parts){if(n==null)return null;n=n[x];} return n??null; };
  const demoSet = (p,v) => { const parts=p.replace(/^\//,'').split('/'),s=load(); let n=s; for(let i=0;i<parts.length-1;i++){if(!n[parts[i]]||typeof n[parts[i]]!=='object')n[parts[i]]={};n=n[parts[i]];} n[parts[parts.length-1]]=v; save(s);bcast(parts[0]); };
  const demoMerge  = (p,v) => demoSet(p,Object.assign({},demoGet(p)||{},v));
  const demoRemove = p => { const parts=p.replace(/^\//,'').split('/'),s=load(); let n=s; for(let i=0;i<parts.length-1;i++){if(!n[parts[i]])return;n=n[parts[i]];} delete n[parts[parts.length-1]];save(s);bcast(parts[0]); };
  const demoPush   = (p,v) => { const id='k'+Date.now().toString(36)+Math.random().toString(36).slice(2,5); demoSet(`${p}/${id}`,{...v,_k:id});return id; };
  const demoListen = (p,cb) => { cb(demoGet(p)); const top=p.split('/')[0],onMsg=e=>{if(e.data?.top===top)cb(demoGet(p));}; try{getBC()?.addEventListener('message',onMsg);}catch{} const timer=setInterval(()=>cb(demoGet(p)),1500); return()=>{clearInterval(timer);try{getBC()?.removeEventListener('message',onMsg);}catch{}}; };

  /* ══ Unified ══ */
  const get    = p     => fb()?fbGet(p)     :Promise.resolve(demoGet(p));
  const set    = (p,v) => fb()?fbSet(p,v)   :Promise.resolve(demoSet(p,v));
  const update = (p,v) => fb()?fbUpdate(p,v):Promise.resolve(demoMerge(p,v));
  const remove = p     => fb()?fbRemove(p)  :Promise.resolve(demoRemove(p));
  const push   = (p,v) => fb()?fbPush(p,v)  :Promise.resolve(demoPush(p,v));
  const arr    = async p => { const v=await get(p); return v&&typeof v==='object'?Object.values(v):[]; };
  const listen = (p,cb) => fb()?fbListen(p,cb):demoListen(p,cb);

  /* ══ SUPER ADMIN ══ */
  const SA = {
    get:    ()    => get('sa'),
    exists: async () => !!(await get('sa/id')),
    set:    d     => set('sa',d),
    update: d     => update('sa',d),
  };

  /* ══ CO-ADMIN ══ */
  const CA = {
    getAll:  ()          => arr('cas'),
    get:     uid         => get(`cas/${uid}`),
    set:     (uid,d)     => set(`cas/${uid}`,d),
    update:  (uid,d)     => update(`cas/${uid}`,d),
    delete:  uid         => remove(`cas/${uid}`),
    byEmail: async e     => { const a=await arr('cas');return a.find(c=>c.email===e)||null; },
  };

  /* ══ LECTURER ══ */
  const LEC = {
    getAll:  ()          => arr('lecs'),
    get:     uid         => get(`lecs/${uid}`),
    set:     (uid,d)     => set(`lecs/${uid}`,d),
    update:  (uid,d)     => update(`lecs/${uid}`,d),
    delete:  uid         => remove(`lecs/${uid}`),
    byEmail: async e     => { const a=await arr('lecs');return a.find(l=>l.email===e)||null; },
  };

  /* ══ TEACHING ASSISTANT ══ */
  const TA = {
    getAll:       ()         => arr('tas'),
    get:          uid        => get(`tas/${uid}`),
    set:          (uid,d)    => set(`tas/${uid}`,d),
    update:       (uid,d)    => update(`tas/${uid}`,d),
    delete:       uid        => remove(`tas/${uid}`),
    byEmail:      async e    => { const a=await arr('tas');return a.find(t=>t.email===e)||null; },
    setInvite:    (key,d)    => set(`taInvites/${k(key)}`,d),
    updateInvite: (key,d)    => update(`taInvites/${k(key)}`,d),
    inviteByCode: async code => { const all=await get('taInvites');if(!all)return null;return Object.entries(all).find(([,v])=>v.code===code)||null; },
  };

  /* ══ UNIQUE IDS ══ */
  const UID = {
    getAll:  ()         => arr('uids'),
    get:     id         => get(`uids/${k(id)}`),
    set:     (id,d)     => set(`uids/${k(id)}`,d),
    update:  (id,d)     => update(`uids/${k(id)}`,d),
    byLecturerEmail: async (email) => {
      const all = await arr('uids');
      return all.filter(u => u.assignedTo === email);
    },
  };

  /* ══ STUDENT ENROLLMENT ══ */
  const ENROLLMENT = {
    enroll: async (studentId, lecId, courseCode, courseName, semester, year) => {
      const enrollmentKey = `${studentId}_${lecId}_${courseCode}_${year}_${semester}`;
      await set(`enrollments/${k(enrollmentKey)}`, {
        studentId: studentId,
        lecId: lecId,
        courseCode: courseCode,
        courseName: courseName,
        year: year,
        semester: semester,
        enrolledAt: Date.now(),
        active: true
      });
    },
    
    getStudentEnrollments: async (studentId, lecId) => {
      const all = await arr('enrollments');
      const current = getCurrentAcademicPeriod();
      return all.filter(e =>
        e.studentId === studentId &&
        e.lecId === lecId &&
        e.year === current.year &&
        e.semester === current.semester &&
        e.active === true
      );
    },
    
    getAll: async () => {
      return await arr('enrollments');
    },
    
    isEnrolled: async (studentId, lecId, courseCode) => {
      const current = getCurrentAcademicPeriod();
      const all = await arr('enrollments');
      return all.some(e =>
        e.studentId === studentId &&
        e.lecId === lecId &&
        e.courseCode === courseCode &&
        e.year === current.year &&
        e.semester === current.semester &&
        e.active === true
      );
    },
  };

  /* ══ COURSE MANAGEMENT - STRICT LECTURER ISOLATION ══ */
  const COURSE = {
    // Get courses for ONE SPECIFIC lecturer only
    getAllForLecturer: async (lecId) => {
      if (!lecId) {
        console.error('[DB] getAllForLecturer: No lecId provided!');
        return [];
      }
      const path = `courses/${k(lecId)}`;
      const data = await get(path);
      if (!data) return [];
      const courses = Object.values(data);
      // Verify all courses belong to this lecturer
      const validCourses = courses.filter(c => c.lecId === lecId);
      if (validCourses.length !== courses.length) {
        console.warn(`[DB] Found ${courses.length - validCourses.length} courses with wrong lecId - filtering out`);
      }
      return validCourses;
    },
    
    // Get a specific course for a specific lecturer
    get: async (lecId, courseCode, year, semester) => {
      if (!lecId || !courseCode) return null;
      const all = await COURSE.getAllForLecturer(lecId);
      return all.find(c => c.code === courseCode && c.year === year && c.semester === semester) || null;
    },
    
    // Set a course - ALWAYS with lecId
    set: async (lecId, courseCode, year, semester, data) => {
      if (!lecId) throw new Error('CRITICAL: Cannot save course without lecId');
      if (!courseCode) throw new Error('CRITICAL: Cannot save course without courseCode');
      
      const cleanLecId = k(lecId);
      const cleanCode = normalizeCourseCode(courseCode);
      const key = `${cleanLecId}_${cleanCode}_${year}_${semester}`;
      const path = `courses/${cleanLecId}/${key}`;
      
      const courseData = { 
        ...data, 
        code: courseCode, 
        name: data.name,
        year: year, 
        semester: semester,
        lecId: lecId,
        createdAt: data.createdAt || Date.now(),
        updatedAt: Date.now()
      };
      
      console.log('[DB] Saving course for lecturer:', lecId);
      return await set(path, courseData);
    },
    
    // Update a course
    update: async (lecId, courseCode, year, semester, data) => {
      if (!lecId) throw new Error('CRITICAL: Cannot update course without lecId');
      if (!courseCode) throw new Error('CRITICAL: Cannot update course without courseCode');
      
      const existing = await COURSE.get(lecId, courseCode, year, semester);
      if (!existing) {
        return await COURSE.set(lecId, courseCode, year, semester, { 
          code: courseCode, 
          name: data.name || courseCode,
          year: year, 
          semester: semester, 
          active: true,
          ...data 
        });
      }
      
      const cleanLecId = k(lecId);
      const cleanCode = normalizeCourseCode(courseCode);
      const key = `${cleanLecId}_${cleanCode}_${year}_${semester}`;
      const path = `courses/${cleanLecId}/${key}`;
      
      const cleanData = {};
      for (const [k, v] of Object.entries(data)) {
        if (v !== undefined && v !== null) {
          cleanData[k] = v;
        }
      }
      cleanData.updatedAt = Date.now();
      
      return await update(path, cleanData);
    },
    
    // Delete a course
    deleteCourse: async (lecId, courseCode, year, semester) => {
      if (!lecId) throw new Error('CRITICAL: Cannot delete course without lecId');
      const cleanLecId = k(lecId);
      const cleanCode = normalizeCourseCode(courseCode);
      const key = `${cleanLecId}_${cleanCode}_${year}_${semester}`;
      const path = `courses/${cleanLecId}/${key}`;
      return await remove(path);
    },
    
    // Disable a course
    disableCourse: async (lecId, courseCode, year, semester) => {
      if (!lecId) throw new Error('CRITICAL: Cannot disable course without lecId');
      await COURSE.update(lecId, courseCode, year, semester, { 
        active: false, 
        status: 'archived',
        disabledAt: Date.now() 
      });
    },
    
    // Enable a course
    enableCourse: async (lecId, courseCode, year, semester) => {
      if (!lecId) throw new Error('CRITICAL: Cannot enable course without lecId');
      await COURSE.update(lecId, courseCode, year, semester, { 
        active: true, 
        status: 'active',
        enabledAt: Date.now() 
      });
    },
    
    // Get active courses for a period
    getActiveForPeriod: async (lecId, year, semester) => {
      const all = await COURSE.getAllForLecturer(lecId);
      return all.filter(c => c.active !== false && c.year === year && c.semester === semester);
    },
    
    // Get archived courses for a period
    getArchivedForPeriod: async (lecId, year, semester) => {
      const all = await COURSE.getAllForLecturer(lecId);
      return all.filter(c => c.active === false && c.year === year && c.semester === semester);
    },
  };

  /* ══ SESSION MANAGEMENT - STRICT LECTURER ISOLATION ══ */
  const SESSION = {
    get:     id         => get(`sessions/${id}`),
    set:     (id,d)     => set(`sessions/${id}`,d),
    update:  (id,d)     => update(`sessions/${id}`,d),
    delete:  id         => remove(`sessions/${id}`),
    getAll:  ()         => arr('sessions'),
    
    // Get sessions for ONE SPECIFIC lecturer only
    byLec:   async uid  => { 
      if (!uid) return [];
      const a = await arr('sessions');
      const filtered = a.filter(s => s.lecFbId === uid);
      console.log(`[DB] Found ${filtered.length} sessions for lecturer ${uid}`);
      return filtered;
    },
    
    getActiveByCourseCode: async (lecId, courseCode, year, semester) => {
      const all = await SESSION.byLec(lecId);
      return all.filter(s => s.active === true && s.courseCode === courseCode && s.year === year && s.semester === semester);
    },
    
    getStudentSessions: async (studentId, lecId) => {
      const all = await SESSION.byLec(lecId);
      const studentSessions = [];
      for (const session of all) {
        const records = session.records ? Object.values(session.records) : [];
        if (records.some(r => r.studentId && r.studentId.toUpperCase() === studentId.toUpperCase())) {
          studentSessions.push(session);
        }
      }
      return studentSessions;
    },
    
    pushRecord:    (id,r)  => push(`sessions/${id}/records`,r),
    pushBlocked:   (id,b)  => push(`sessions/${id}/blocked`,b),
    addDevice:     (id,fp) => set(`sessions/${id}/devs/${k(fp)}`,true),
    addSid:        (id,s)  => set(`sessions/${id}/sids/${k(btoa(s.toUpperCase()))}`,s.toUpperCase()),
    hasDevice:     async(id,fp)=>!!(await get(`sessions/${id}/devs/${k(fp)}`)),
    hasSid:        async(id,s) =>!!(await get(`sessions/${id}/sids/${k(btoa(s.toUpperCase()))}`)),
    getRecords:    async id => { const v=await get(`sessions/${id}/records`);return v?Object.values(v):[]; },
    getBlocked:    async id => { const v=await get(`sessions/${id}/blocked`);return v?Object.values(v):[]; },
    listenRecords: (id,cb) => listen(`sessions/${id}/records`, v=>cb(v&&typeof v==='object'?Object.values(v):[])),
    listenBlocked: (id,cb) => listen(`sessions/${id}/blocked`, v=>cb(v&&typeof v==='object'?Object.values(v):[])),
    listenActiveSessions: (lecId, cb) => listen('sessions', (data) => {
      if (!data) return cb([]);
      const sessions = Object.values(data);
      cb(sessions.filter(s => s.active === true && s.lecFbId === lecId));
    }),
  };

  /* ══ BACKUP ══ */
  const BACKUP = {
    save: (lecId,sessId,d) => set(`backup/${k(lecId)}/${sessId}`,d),
  };

  /* ══ STUDENTS — permanent registration ══ */
  const STUDENTS = {
    getAll:       ()          => arr('students'),
    get:          id          => get(`students/${k(id)}`),
    set:          (id,d)      => set(`students/${k(id)}`, d),
    update:       (id,d)      => update(`students/${k(id)}`, d),
    delete:       id          => remove(`students/${k(id)}`),
    
    byEmail:      async e     => { const a = await arr('students'); return a.find(s => s.email === e) || null; },
    byStudentId:  async id    => {
      const a = await arr('students');
      const upperId = id.toUpperCase();
      return a.find(s => s.studentId && s.studentId.toUpperCase() === upperId) || null;
    },
    
    addDevice:    (id, deviceFingerprint) => set(`students/${k(id)}/devices/${k(deviceFingerprint)}`, {
      registeredAt: Date.now(),
      lastUsed: Date.now(),
      userAgent: navigator.userAgent
    }),
    hasDevice:    async(id, deviceFingerprint)=>!!(await get(`students/${k(id)}/devices/${k(deviceFingerprint)}`)),
    getDevices:   async id    => { const v = await get(`students/${k(id)}/devices`); return v || {}; },
    removeDevice: async(id, deviceFingerprint) => remove(`students/${k(id)}/devices/${k(deviceFingerprint)}`),
    
    registerWebAuthn: async (id, credentialId, clientDataJSON, attestationObject) => update(`students/${k(id)}`, {
      webAuthnCredentialId: credentialId,
      webAuthnClientData: clientDataJSON,
      webAuthnAttestation: attestationObject,
      webAuthnRegisteredAt: Date.now(),
      webAuthnDeviceInfo: navigator.userAgent,
      webAuthnRegistered: true
    }),
    getWebAuthnCredential: async id => {
      const student = await get(`students/${k(id)}`);
      return student ? {
        credentialId: student.webAuthnCredentialId,
        clientData: student.webAuthnClientData,
        attestation: student.webAuthnAttestation
      } : null;
    },
    hasWebAuthn: async id => {
      const student = await get(`students/${k(id)}`);
      return !!(student && student.webAuthnCredentialId);
    },
    updateWebAuthnLastUse: async (id) => update(`students/${k(id)}`, { lastWebAuthnUse: Date.now() }),
    
    updateFaceImage: async (id, faceImage) => update(`students/${k(id)}`, {
      faceImage: faceImage,
      lastFaceUpdate: Date.now(),
      faceRegistered: true
    }),
    getFaceImage: async id => {
      const student = await get(`students/${k(id)}`);
      return student ? student.faceImage : null;
    },
    hasFaceRegistered: async id => {
      const student = await get(`students/${k(id)}`);
      return !!(student && student.faceImage);
    },
    
    updateBiometricUse: async (id, method) => update(`students/${k(id)}`, {
      lastBiometricUse: Date.now(),
      lastVerificationMethod: method
    }),
    getBiometricStatus: async id => {
      const student = await get(`students/${k(id)}`);
      return {
        webAuthnRegistered: !!(student && student.webAuthnCredentialId),
        faceRegistered: !!(student && student.faceImage),
        lastBiometricUse: student?.lastBiometricUse || null,
        devices: student?.devices || {}
      };
    },
    
    updatePassword: async (id, newHash) => update(`students/${k(id)}`, { pwHash: newHash }),
    
    setActive:     async (id, active) => update(`students/${k(id)}`, { active: active, lastActiveAt: Date.now() }),
    getActive:     async id => { const s = await get(`students/${k(id)}`); return s ? s.active !== false : true; },
    
    byDeviceFingerprint: async (deviceFingerprint) => {
      const a = await arr('students');
      return a.find(s => s.devices && s.devices[deviceFingerprint]) || null;
    },
    
    getAttendanceStats: async (studentId, lecId, courseCode = null) => {
      const sessions = await SESSION.byLec(lecId);
      let totalPresent = 0;
      let totalSessions = 0;
      const courses = {};
      for (const session of sessions) {
        if (courseCode && normalizeCourseCode(session.courseCode) !== normalizeCourseCode(courseCode)) {
          continue;
        }
        const records = session.records ? Object.values(session.records) : [];
        const attended = records.some(r => r.studentId && r.studentId.toUpperCase() === studentId.toUpperCase());
        if (attended || session.active === false) {
          const courseNorm = normalizeCourseCode(session.courseCode);
          if (!courses[courseNorm]) {
            courses[courseNorm] = {
              courseCode: session.courseCode,
              courseName: session.courseName,
              totalSessions: 0,
              attended: 0,
              sessions: []
            };
          }
          courses[courseNorm].totalSessions++;
          totalSessions++;
          if (attended) {
            courses[courseNorm].attended++;
            totalPresent++;
            courses[courseNorm].sessions.push({
              date: session.date,
              time: records.find(r => r.studentId && r.studentId.toUpperCase() === studentId.toUpperCase())?.time,
              status: 'present',
              sessionId: session.id
            });
          }
        }
      }
      return {
        totalSessions,
        totalPresent,
        attendancePercentage: totalSessions > 0 ? Math.round((totalPresent / totalSessions) * 100) : 0,
        courses: Object.values(courses).map(c => ({
          ...c,
          percentage: c.totalSessions > 0 ? Math.round((c.attended / c.totalSessions) * 100) : 0
        }))
      };
    },
  };

  /* ══ RESET TOKENS ══ */
  const RESET = {
    set:    (email,d)  => set(`resets/${k(email)}`,d),
    get:    email      => get(`resets/${k(email)}`),
    delete: email      => remove(`resets/${k(email)}`),
  };

  /* ══ STATISTICS / ANALYTICS ══ */
  const STATS = {
    incrementCheckins: async () => {
      const today = new Date().toISOString().split('T')[0];
      const stats = await get('stats') || {};
      stats.totalCheckins = (stats.totalCheckins || 0) + 1;
      stats.dailyCheckins = stats.dailyCheckins || {};
      stats.dailyCheckins[today] = (stats.dailyCheckins[today] || 0) + 1;
      stats.lastUpdated = Date.now();
      await set('stats', stats);
    },
    getStats: async () => get('stats'),
    getStudentCount: async () => {
      const students = await arr('students');
      return students.length;
    },
    getActiveSessions: async () => {
      const sessions = await arr('sessions');
      return sessions.filter(s => s.active === true).length;
    },
  };

  /* ══ EXPORT ══ */
  return {
    SA,
    CA,
    LEC,
    TA,
    UID,
    ENROLLMENT,
    COURSE,
    SESSION,
    BACKUP,
    STUDENTS,
    RESET,
    STATS,
    normalizeCourseCode,
    getCourseKey,
    getCurrentAcademicPeriod
  };
})();
