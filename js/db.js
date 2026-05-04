/* db.js — Database abstraction with HIGH-PERFORMANCE OPTIMIZATIONS
   Optimized for: Thousands of concurrent requests
   Maintains backward compatibility - ALWAYS RETURNS ARRAYS for existing code
*/

'use strict';

const DB = (() => {
  const fb = () => window._db;
  const k = s => String(s).replace(/[.#$[\]/]/g, '_');

  /* ═══════════════════════════════════════════════════════════════════
     PERFORMANCE: MEMORY CACHE LAYER (L1 Cache)
  ═══════════════════════════════════════════════════════════════════ */
  
  class MemoryCache {
    constructor(maxSize = 300, defaultTTL = 30000) {
      this.cache = new Map();
      this.maxSize = maxSize;
      this.defaultTTL = defaultTTL;
      this.hits = 0;
      this.misses = 0;
    }
    
    get(key) {
      const item = this.cache.get(key);
      if (!item) {
        this.misses++;
        return null;
      }
      
      if (Date.now() > item.expiresAt) {
        this.cache.delete(key);
        this.misses++;
        return null;
      }
      
      this.hits++;
      // Move to end for LRU (recently used)
      this.cache.delete(key);
      this.cache.set(key, item);
      return item.value;
    }
    
    set(key, value, ttl = null) {
      // LRU eviction if at max size
      if (this.cache.size >= this.maxSize) {
        const oldestKey = this.cache.keys().next().value;
        this.cache.delete(oldestKey);
      }
      
      this.cache.set(key, {
        value: this._cloneDeep(value),
        expiresAt: Date.now() + (ttl || this.defaultTTL)
      });
    }
    
    delete(key) {
      this.cache.delete(key);
    }
    
    clear() {
      this.cache.clear();
    }
    
    invalidatePattern(pattern) {
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    }
    
    getStats() {
      const total = this.hits + this.misses;
      return {
        hits: this.hits,
        misses: this.misses,
        hitRate: total > 0 ? ((this.hits / total) * 100).toFixed(1) + '%' : '0%',
        size: this.cache.size
      };
    }
    
    _cloneDeep(obj) {
      if (!obj || typeof obj !== 'object') return obj;
      try {
        return JSON.parse(JSON.stringify(obj));
      } catch {
        return obj;
      }
    }
  }
  
  // Create global cache instance
  const cache = new MemoryCache(300, 30000);
  
  /* ═══════════════════════════════════════════════════════════════════
     PERFORMANCE: PENDING REQUEST DEDUPLICATION
  ═══════════════════════════════════════════════════════════════════ */
  
  const pendingRequests = new Map();
  
  async function dedupeRequest(key, fetcher) {
    if (pendingRequests.has(key)) {
      return pendingRequests.get(key);
    }
    
    const promise = fetcher().finally(() => {
      pendingRequests.delete(key);
    });
    
    pendingRequests.set(key, promise);
    return promise;
  }
  
  /* ═══════════════════════════════════════════════════════════════════
     PERFORMANCE: INDEXED ACCESS PATTERNS
  ═══════════════════════════════════════════════════════════════════ */
  
  class IndexManager {
    constructor() {
      this.indexes = {
        'students_by_email': new Map(),
        'lecturers_by_email': new Map(),
        'students_by_id': new Map()
      };
      this.lastIndexUpdate = 0;
      this.indexTTL = 60000;
    }
    
    async rebuildIndex(indexName) {
      if (Date.now() - this.lastIndexUpdate < this.indexTTL) {
        return;
      }
      
      this.lastIndexUpdate = Date.now();
      
      try {
        switch(indexName) {
          case 'students_by_email':
            const students = await getAllStudents();
            this.indexes.students_by_email.clear();
            for (const student of students) {
              if (student.email) {
                this.indexes.students_by_email.set(student.email.toLowerCase(), student);
              }
            }
            break;
            
          case 'lecturers_by_email':
            const lecturers = await getAllLecturers();
            this.indexes.lecturers_by_email.clear();
            for (const lecturer of lecturers) {
              if (lecturer.email) {
                this.indexes.lecturers_by_email.set(lecturer.email.toLowerCase(), lecturer);
              }
            }
            break;
            
          case 'students_by_id':
            const allStudents = await getAllStudents();
            this.indexes.students_by_id.clear();
            for (const student of allStudents) {
              if (student.studentId) {
                this.indexes.students_by_id.set(student.studentId.toUpperCase(), student);
              }
            }
            break;
        }
      } catch (err) {
        console.warn('[IndexManager] Rebuild failed:', err);
      }
    }
    
    async getStudentByEmail(email) {
      await this.rebuildIndex('students_by_email');
      return this.indexes.students_by_email.get(email?.toLowerCase()) || null;
    }
    
    async getStudentById(id) {
      await this.rebuildIndex('students_by_id');
      return this.indexes.students_by_id.get(id?.toUpperCase()) || null;
    }
    
    async getLecturerByEmail(email) {
      await this.rebuildIndex('lecturers_by_email');
      return this.indexes.lecturers_by_email.get(email?.toLowerCase()) || null;
    }
  }
  
  const indexManager = new IndexManager();
  
  /* ═══════════════════════════════════════════════════════════════════
     CORE FIREBASE OPERATIONS (Optimized)
  ═══════════════════════════════════════════════════════════════════ */
  
  // Optimized get with caching
  const get = async (path, options = {}) => {
    const { skipCache = false, ttl = 30000 } = options;
    const cacheKey = `get:${path}`;
    
    if (!skipCache) {
      const cached = cache.get(cacheKey);
      if (cached !== null) return cached;
    }
    
    return dedupeRequest(cacheKey, async () => {
      try {
        let result;
        
        if (fb()) {
          const snapshot = await fb().ref(path).once('value');
          result = snapshot.val() ?? null;
        } else {
          result = demoGet(path);
        }
        
        if (!skipCache && result !== null) {
          cache.set(cacheKey, result, ttl);
        }
        
        return result;
      } catch (err) {
        console.error(`[DB] Get error at ${path}:`, err);
        throw err;
      }
    });
  };
  
  // Optimized set with cache invalidation
  const set = async (path, value, options = {}) => {
    const { invalidateCache = true } = options;
    
    try {
      if (fb()) {
        await fb().ref(path).set(value);
      } else {
        demoSet(path, value);
      }
      
      if (invalidateCache) {
        cache.invalidatePattern(path);
        const parentPath = path.split('/').slice(0, -1).join('/');
        if (parentPath) {
          cache.invalidatePattern(parentPath);
        }
      }
      
      return true;
    } catch (err) {
      console.error(`[DB] Set error at ${path}:`, err);
      throw err;
    }
  };
  
  // Optimized update
  const update = async (path, updates, options = {}) => {
    const { invalidateCache = true } = options;
    
    try {
      if (fb()) {
        await fb().ref(path).update(updates);
      } else {
        demoMerge(path, updates);
      }
      
      if (invalidateCache) {
        cache.invalidatePattern(path);
      }
      
      return true;
    } catch (err) {
      console.error(`[DB] Update error at ${path}:`, err);
      throw err;
    }
  };
  
  const remove = async (path) => {
    try {
      if (fb()) {
        await fb().ref(path).remove();
      } else {
        demoRemove(path);
      }
      cache.invalidatePattern(path);
      return true;
    } catch (err) {
      console.error(`[DB] Remove error at ${path}:`, err);
      throw err;
    }
  };
  
  const push = async (path, value) => {
    try {
      let newKey;
      if (fb()) {
        const newRef = fb().ref(path).push();
        await newRef.set(value);
        newKey = newRef.key;
      } else {
        newKey = demoPush(path, value);
      }
      cache.invalidatePattern(path);
      return newKey;
    } catch (err) {
      console.error(`[DB] Push error at ${path}:`, err);
      throw err;
    }
  };
  
  // CRITICAL: This returns ARRAY for backward compatibility
  const arr = async (path, options = {}) => {
    const { skipCache = false, ttl = 15000 } = options;
    const cacheKey = `arr:${path}`;
    
    if (!skipCache) {
      const cached = cache.get(cacheKey);
      if (cached !== null) return cached;
    }
    
    const data = await get(path);
    const result = data && typeof data === 'object' ? Object.values(data) : [];
    
    if (!skipCache) {
      cache.set(cacheKey, result, ttl);
    }
    
    return result;
  };
  
  // Batch write operation
  const batchWrite = async (operations) => {
    if (!fb()) {
      for (const op of operations) {
        if (op.type === 'set') await demoSet(op.path, op.value);
        else if (op.type === 'update') await demoMerge(op.path, op.value);
        else if (op.type === 'remove') await demoRemove(op.path);
      }
      return;
    }
    
    const batch = {};
    for (const op of operations) {
      const path = op.path;
      if (op.type === 'set') batch[path] = op.value;
      else if (op.type === 'update') {
        const existing = await get(path, { skipCache: true });
        batch[path] = { ...(existing || {}), ...op.value };
      }
      else if (op.type === 'remove') batch[path] = null;
    }
    
    await fb().ref().update(batch);
    
    for (const op of operations) {
      cache.invalidatePattern(op.path);
    }
  };
  
  // Exists check (lightweight)
  const exists = async (path) => {
    const cacheKey = `exists:${path}`;
    const cached = cache.get(cacheKey);
    if (cached !== null) return cached;
    
    try {
      let result;
      if (fb()) {
        const snapshot = await fb().ref(path).once('value');
        result = snapshot.exists();
      } else {
        result = demoGet(path) !== null;
      }
      cache.set(cacheKey, result, 10000);
      return result;
    } catch {
      return false;
    }
  };
  
  const listen = (p, cb) => fb() ? fbListen(p, cb) : demoListen(p, cb);
  
  const fbListen = (p, cb) => { 
    const ref = fb().ref(p);
    const fn = s => cb(s.val());
    ref.on('value', fn);
    return () => ref.off('value', fn);
  };
  
  /* ═══════════════════════════════════════════════════════════════════
     HELPER FUNCTIONS for getting all records (with caching)
  ═══════════════════════════════════════════════════════════════════ */
  
  async function getAllStudents() {
    return await arr('students');
  }
  
  async function getAllLecturers() {
    return await arr('lecs');
  }
  
  /* ═══════════════════════════════════════════════════════════════════
     DEMO STORE (Fallback when Firebase not configured)
  ═══════════════════════════════════════════════════════════════════ */
  
  const LS = 'ugqr7_store';
  let _bc = null;
  const loadStore = () => { try{return JSON.parse(localStorage.getItem(LS)||'{}');}catch{return {};} };
  const saveStore = s => localStorage.setItem(LS, JSON.stringify(s));
  const getBC = () => { if(!_bc&&typeof BroadcastChannel!=='undefined')_bc=new BroadcastChannel('ugqr7'); return _bc; };
  const bcast = top => { try{getBC()?.postMessage({top,t:Date.now()});}catch{} };
  const demoGet = p => { const parts=p.replace(/^\//,'').split('/'); let n=loadStore(); for(const x of parts){if(n==null)return null;n=n[x];} return n??null; };
  const demoSet = (p,v) => { const parts=p.replace(/^\//,'').split('/'),s=loadStore(); let n=s; for(let i=0;i<parts.length-1;i++){if(!n[parts[i]]||typeof n[parts[i]]!=='object')n[parts[i]]={};n=n[parts[i]];} n[parts[parts.length-1]]=v; saveStore(s);bcast(parts[0]); };
  const demoMerge = (p,v) => demoSet(p,Object.assign({},demoGet(p)||{},v));
  const demoRemove = p => { const parts=p.replace(/^\//,'').split('/'),s=loadStore(); let n=s; for(let i=0;i<parts.length-1;i++){if(!n[parts[i]])return;n=n[parts[i]];} delete n[parts[parts.length-1]];saveStore(s);bcast(parts[0]); };
  const demoPush = (p,v) => { const id='k'+Date.now().toString(36)+Math.random().toString(36).slice(2,5); demoSet(`${p}/${id}`,{...v,_k:id});return id; };
  const demoListen = (p,cb) => { cb(demoGet(p)); const top=p.split('/')[0],onMsg=e=>{if(e.data?.top===top)cb(demoGet(p));}; try{getBC()?.addEventListener('message',onMsg);}catch{} const timer=setInterval(()=>cb(demoGet(p)),1500); return()=>{clearInterval(timer);try{getBC()?.removeEventListener('message',onMsg);}catch{}}; };
  
  /* ═══════════════════════════════════════════════════════════════════
     OPTIMIZED COLLECTION QUERIES (All return ARRAYS for compatibility)
  ═══════════════════════════════════════════════════════════════════ */
  
  // SUPER ADMIN
  const SA = {
    get: () => get('sa', { ttl: 60000 }),
    exists: () => exists('sa/id'),
    set: (d) => set('sa', d),
    update: (d) => update('sa', d),
  };

  // CO-ADMIN
  const CA = {
    getAll: () => arr('cas', { ttl: 30000 }),
    get: (uid) => get(`cas/${uid}`, { ttl: 30000 }),
    set: (uid, d) => set(`cas/${uid}`, d),
    update: (uid, d) => update(`cas/${uid}`, d),
    delete: (uid) => remove(`cas/${uid}`),
    byEmail: async (email) => {
      if (!email) return null;
      const all = await arr('cas');
      return all.find(c => c.email === email) || null;
    },
  };

  // LECTURER
  const LEC = {
    getAll: () => arr('lecs', { ttl: 30000 }),
    get: (uid) => get(`lecs/${uid}`, { ttl: 30000 }),
    set: (uid, d) => set(`lecs/${uid}`, d),
    update: (uid, d) => update(`lecs/${uid}`, d),
    delete: (uid) => remove(`lecs/${uid}`),
    byEmail: async (email) => {
      if (!email) return null;
      const all = await arr('lecs');
      return all.find(l => l.email === email) || null;
    },
  };

  // TEACHING ASSISTANT
  const TA = {
    getAll: () => arr('tas', { ttl: 30000 }),
    get: (uid) => get(`tas/${uid}`, { ttl: 30000 }),
    set: (uid, d) => set(`tas/${uid}`, d),
    update: (uid, d) => update(`tas/${uid}`, d),
    delete: (uid) => remove(`tas/${uid}`),
    byEmail: async (email) => {
      if (!email) return null;
      const all = await arr('tas');
      return all.find(t => t.email === email) || null;
    },
    setInvite: (key, d) => set(`taInvites/${k(key)}`, d),
    updateInvite: (key, d) => update(`taInvites/${k(key)}`, d),
    inviteByCode: async (code) => {
      const all = await arr('taInvites');
      return all.find(inv => inv.code === code) || null;
    },
  };

  // UNIQUE IDS
  const UID = {
    getAll: () => arr('uids', { ttl: 30000 }),
    get: (id) => get(`uids/${k(id)}`, { ttl: 30000 }),
    set: (id, d) => set(`uids/${k(id)}`, d),
    update: (id, d) => update(`uids/${k(id)}`, d),
    byLecturerEmail: async (email) => {
      const all = await arr('uids');
      return all.filter(u => u.assignedTo === email);
    },
  };

  // ENROLLMENT
  const ENROLLMENT = {
    enroll: async (studentId, lecId, courseCode, courseName, semester, year) => {
      const enrollmentKey = `${studentId}_${lecId}_${courseCode}_${year}_${semester}`;
      const enrollmentData = {
        studentId: studentId,
        lecId: lecId,
        courseCode: courseCode,
        courseName: courseName,
        year: year,
        semester: semester,
        enrolledAt: Date.now(),
        active: true
      };
      await set(`enrollments/${k(enrollmentKey)}`, enrollmentData);
      cache.invalidatePattern('enrollments');
    },
    
    getStudentEnrollments: async (studentId, lecId = null) => {
      const cacheKey = `enrollments_student_${studentId}_${lecId || 'all'}`;
      const cached = cache.get(cacheKey);
      if (cached) return cached;
      
      const all = await arr('enrollments');
      let filtered = all.filter(e => e.studentId === studentId && e.active === true);
      if (lecId) {
        filtered = filtered.filter(e => e.lecId === lecId);
      }
      
      cache.set(cacheKey, filtered, 15000);
      return filtered;
    },
    
    getAll: () => arr('enrollments', { ttl: 20000 }),
    
    isEnrolled: async (studentId, lecId, courseCode) => {
      const enrollments = await ENROLLMENT.getStudentEnrollments(studentId, lecId);
      return enrollments.some(e => e.courseCode === courseCode);
    },
    
    delete: async (enrollmentKey) => {
      await remove(`enrollments/${k(enrollmentKey)}`);
      cache.invalidatePattern('enrollments');
    },
  };

  // COURSE MANAGEMENT
  const COURSE = {
    getAllForLecturer: async (lecId) => {
      if (!lecId) return [];
      const cacheKey = `courses_lecturer_${lecId}`;
      const cached = cache.get(cacheKey);
      if (cached) return cached;
      
      const data = await get(`courses/${k(lecId)}`);
      const result = data ? Object.values(data) : [];
      cache.set(cacheKey, result, 30000);
      return result;
    },
    
    get: async (lecId, courseCode, year, semester) => {
      const courses = await COURSE.getAllForLecturer(lecId);
      return courses.find(c => c.code === courseCode && c.year === year && c.semester === semester) || null;
    },
    
    set: async (lecId, courseCode, year, semester, data) => {
      if (!lecId) throw new Error('Cannot save course without lecId');
      const cleanLecId = k(lecId);
      const cleanCode = normalizeCourseCode(courseCode);
      const key = `${cleanLecId}_${cleanCode}_${year}_${semester}`;
      const path = `courses/${cleanLecId}/${key}`;
      
      const courseData = { 
        ...data, 
        code: courseCode, 
        year: year, 
        semester: semester,
        lecId: lecId,
        updatedAt: Date.now()
      };
      if (!courseData.createdAt) courseData.createdAt = Date.now();
      
      await set(path, courseData);
      cache.invalidatePattern(`courses_lecturer_${lecId}`);
      return courseData;
    },
    
    update: async (lecId, courseCode, year, semester, data) => {
      if (!lecId) throw new Error('Cannot update course without lecId');
      const cleanLecId = k(lecId);
      const cleanCode = normalizeCourseCode(courseCode);
      const key = `${cleanLecId}_${cleanCode}_${year}_${semester}`;
      const path = `courses/${cleanLecId}/${key}`;
      
      const cleanData = {};
      for (const [k, v] of Object.entries(data)) {
        if (v !== undefined && v !== null) cleanData[k] = v;
      }
      cleanData.updatedAt = Date.now();
      
      await update(path, cleanData);
      cache.invalidatePattern(`courses_lecturer_${lecId}`);
    },
    
    deleteCourse: async (lecId, courseCode, year, semester) => {
      if (!lecId) throw new Error('Cannot delete course without lecId');
      const cleanLecId = k(lecId);
      const cleanCode = normalizeCourseCode(courseCode);
      const key = `${cleanLecId}_${cleanCode}_${year}_${semester}`;
      await remove(`courses/${cleanLecId}/${key}`);
      cache.invalidatePattern(`courses_lecturer_${lecId}`);
    },
    
    disableCourse: async (lecId, courseCode, year, semester) => {
      await COURSE.update(lecId, courseCode, year, semester, { active: false, disabledAt: Date.now() });
    },
    
    enableCourse: async (lecId, courseCode, year, semester) => {
      await COURSE.update(lecId, courseCode, year, semester, { active: true, enabledAt: Date.now() });
    },
  };

  // SESSION MANAGEMENT
  const SESSION = {
    get: (id) => get(`sessions/${id}`, { ttl: 15000 }),
    set: (id, d) => set(`sessions/${id}`, d),
    update: (id, d) => update(`sessions/${id}`, d),
    delete: (id) => remove(`sessions/${id}`),
    getAll: () => arr('sessions', { ttl: 15000 }),
    
    byLec: async (uid) => {
      if (!uid) return [];
      const all = await arr('sessions');
      return all.filter(s => s.lecFbId === uid);
    },
    
    getActiveByLecturer: async (lecId) => {
      const cacheKey = `active_sessions_${lecId}`;
      const cached = cache.get(cacheKey);
      if (cached) return cached;
      
      const all = await arr('sessions');
      const active = all.filter(s => s.lecFbId === lecId && s.active === true);
      cache.set(cacheKey, active, 5000);
      return active;
    },
    
    getStudentSessions: async (studentId, lecId = null) => {
      const all = await arr('sessions');
      const filtered = all.filter(session => {
        if (lecId && session.lecFbId !== lecId) return false;
        const records = session.records ? Object.values(session.records) : [];
        return records.some(r => r.studentId && r.studentId.toUpperCase() === studentId.toUpperCase());
      });
      return filtered;
    },
    
    pushRecord: async (id, record) => {
      const recordId = Date.now().toString() + Math.random().toString(36).substr(2, 4);
      await set(`sessions/${id}/records/${recordId}`, record);
      cache.invalidatePattern(`sessions/${id}`);
      return recordId;
    },
    
    pushBlocked: async (id, blocked) => {
      const blockedId = Date.now().toString() + Math.random().toString(36).substr(2, 4);
      await set(`sessions/${id}/blocked/${blockedId}`, blocked);
      cache.invalidatePattern(`sessions/${id}`);
    },
    
    addDevice: async (id, fp) => {
      await set(`sessions/${id}/devs/${k(fp)}`, true);
    },
    
    addSid: async (id, sid) => {
      await set(`sessions/${id}/sids/${k(btoa(sid.toUpperCase()))}`, sid.toUpperCase());
    },
    
    hasDevice: async (id, fp) => {
      return !!(await get(`sessions/${id}/devs/${k(fp)}`, { ttl: 5000 }));
    },
    
    hasSid: async (id, sid) => {
      return !!(await get(`sessions/${id}/sids/${k(btoa(sid.toUpperCase()))}`, { ttl: 5000 }));
    },
    
    getRecords: async (id) => {
      const data = await get(`sessions/${id}/records`);
      return data ? Object.values(data) : [];
    },
    
    getBlocked: async (id) => {
      const data = await get(`sessions/${id}/blocked`);
      return data ? Object.values(data) : [];
    },
    
    listenRecords: (id, cb) => listen(`sessions/${id}/records`, v => 
      cb(v && typeof v === 'object' ? Object.values(v) : [])
    ),
    
    listenBlocked: (id, cb) => listen(`sessions/${id}/blocked`, v => 
      cb(v && typeof v === 'object' ? Object.values(v) : [])
    ),
    
    listenActiveSessions: (lecId, cb) => {
      return listen('sessions', (data) => {
        if (!data) return cb([]);
        const sessions = Object.values(data);
        if (lecId) {
          cb(sessions.filter(s => s.active === true && s.lecFbId === lecId));
        } else {
          cb(sessions.filter(s => s.active === true));
        }
      });
    },
    
    endExpiredSessions: async () => {
      const now = Date.now();
      const all = await arr('sessions');
      const expired = all.filter(s => s.active === true && s.expiresAt < now);
      
      for (const session of expired) {
        await SESSION.update(session.id, { active: false, endedAt: now, endedReason: 'auto_timeout' });
      }
      
      return expired.length;
    }
  };

  // BACKUP
  const BACKUP = {
    save: async (backupId, data) => {
      const sanitizedId = String(backupId).replace(/[.#$[\]/]/g, '_');
      await set(`backups/${sanitizedId}`, data);
    },
    get: async (backupId) => {
      const sanitizedId = String(backupId).replace(/[.#$[\]/]/g, '_');
      return await get(`backups/${sanitizedId}`);
    },
    getAll: () => arr('backups', { ttl: 60000 }),
    delete: async (backupId) => {
      const sanitizedId = String(backupId).replace(/[.#$[\]/]/g, '_');
      await remove(`backups/${sanitizedId}`);
    }
  };

  // DEVICE REGISTRATION
  const DEVICE_REGISTRATION = {
    _sanitizeFingerprint: (fp) => {
      let sanitized = String(fp).replace(/[.#$[\]/]/g, '_');
      if (!isNaN(parseInt(sanitized[0]))) {
        sanitized = 'd_' + sanitized;
      }
      return sanitized;
    },

    isDeviceRegistered: async (deviceFingerprint) => {
      const cacheKey = `device_registered_${deviceFingerprint}`;
      const cached = cache.get(cacheKey);
      if (cached) return cached;
      
      const allStudents = await getAllStudents();
      const sanitizedFp = DEVICE_REGISTRATION._sanitizeFingerprint(deviceFingerprint);
      
      for (const student of allStudents) {
        if (student.devices && student.devices[sanitizedFp]) {
          const response = { registered: true, studentId: student.studentId, studentName: student.name };
          cache.set(cacheKey, response, 60000);
          return response;
        }
      }
      
      cache.set(cacheKey, { registered: false }, 60000);
      return { registered: false };
    },
    
    registerDevice: async (studentId, deviceFingerprint, deviceInfo) => {
      const sanitizedFp = DEVICE_REGISTRATION._sanitizeFingerprint(deviceFingerprint);
      const student = await STUDENTS.get(studentId);
      if (!student) throw new Error('Student not found');
      
      let devices = student.devices || {};
      devices[sanitizedFp] = {
        registeredAt: Date.now(),
        lastUsed: Date.now(),
        userAgent: deviceInfo.userAgent,
        deviceName: deviceInfo.deviceName || navigator.platform || 'Unknown',
        isPrimary: true,
        originalFingerprint: deviceFingerprint
      };
      
      await STUDENTS.update(studentId, {
        devices: devices,
        primaryDeviceFingerprint: sanitizedFp,
        lastDeviceCheck: Date.now()
      });
      
      cache.invalidatePattern(`device_registered_${deviceFingerprint}`);
      cache.invalidatePattern(`student_by_id_${studentId}`);
    },
    
    unregisterDevice: async (studentId, deviceFingerprint = null) => {
      const student = await STUDENTS.get(studentId);
      if (!student) return;
      
      let devices = student.devices || {};
      
      if (deviceFingerprint) {
        const sanitizedFp = DEVICE_REGISTRATION._sanitizeFingerprint(deviceFingerprint);
        delete devices[sanitizedFp];
        cache.invalidatePattern(`device_registered_${deviceFingerprint}`);
      } else {
        devices = {};
      }
      
      await STUDENTS.update(studentId, { 
        devices: devices,
        primaryDeviceFingerprint: null,
        webAuthnCredentialId: null,
        webAuthnData: null,
        lastBiometricReset: Date.now(),
        biometricResetReason: 'device_reset'
      });
      
      cache.invalidatePattern(`student_by_id_${studentId}`);
    },
    
    getStudentDevices: async (studentId) => {
      const student = await STUDENTS.get(studentId);
      if (!student || !student.devices) return [];
      return Object.entries(student.devices).map(([fp, info]) => ({
        fingerprint: fp,
        ...info
      }));
    },
    
    updateDeviceLastUsed: async (studentId, deviceFingerprint) => {
      const student = await STUDENTS.get(studentId);
      if (!student || !student.devices) return;
      
      const sanitizedFp = DEVICE_REGISTRATION._sanitizeFingerprint(deviceFingerprint);
      if (student.devices[sanitizedFp]) {
        student.devices[sanitizedFp].lastUsed = Date.now();
        await STUDENTS.update(studentId, { devices: student.devices });
      }
    }
  };

  // STUDENTS (Optimized)
  const STUDENTS = {
    getAll: () => arr('students', { ttl: 30000 }),
    
    get: (id) => get(`students/${k(id)}`, { ttl: 30000 }),
    
    set: (id, d) => set(`students/${k(id)}`, d),
    
    update: (id, d) => update(`students/${k(id)}`, d),
    
    delete: (id) => remove(`students/${k(id)}`),
    
    byEmail: async (email) => {
      if (!email) return null;
      const indexed = await indexManager.getStudentByEmail(email);
      if (indexed) return indexed;
      
      const all = await getAllStudents();
      return all.find(s => s.email === email) || null;
    },
    
    byStudentId: async (id) => {
      const cacheKey = `student_by_id_${id}`;
      const cached = cache.get(cacheKey);
      if (cached) return cached;
      
      const indexed = await indexManager.getStudentById(id);
      if (indexed) {
        cache.set(cacheKey, indexed, 60000);
        return indexed;
      }
      
      const all = await getAllStudents();
      const upperId = id?.toUpperCase();
      const student = all.find(s => s.studentId && s.studentId.toUpperCase() === upperId) || null;
      
      if (student) {
        cache.set(cacheKey, student, 60000);
      }
      return student;
    },
    
    addDevice: (id, deviceFingerprint) => {
      const sanitizedFp = DEVICE_REGISTRATION._sanitizeFingerprint(deviceFingerprint);
      return set(`students/${k(id)}/devices/${sanitizedFp}`, {
        registeredAt: Date.now(),
        lastUsed: Date.now(),
        userAgent: navigator.userAgent
      });
    },
    
    hasDevice: async (id, deviceFingerprint) => {
      const sanitizedFp = DEVICE_REGISTRATION._sanitizeFingerprint(deviceFingerprint);
      return !!(await get(`students/${k(id)}/devices/${sanitizedFp}`, { ttl: 5000 }));
    },
    
    registerWebAuthn: async (id, credentialId, clientDataJSON, attestationObject) => {
      await update(`students/${k(id)}`, {
        webAuthnCredentialId: credentialId,
        webAuthnRegisteredAt: Date.now(),
        webAuthnRegistered: true
      });
      cache.invalidatePattern(`student_by_id_${id}`);
    },
    
    hasWebAuthn: async (id) => {
      const student = await STUDENTS.get(id);
      return !!(student && student.webAuthnCredentialId);
    },
    
    updateWebAuthnLastUse: (id) => update(`students/${k(id)}`, { lastWebAuthnUse: Date.now() }),
    
    updateBiometricUse: (id, method) => update(`students/${k(id)}`, {
      lastBiometricUse: Date.now(),
      lastVerificationMethod: method
    }),
    
    updatePassword: (id, newHash) => update(`students/${k(id)}`, { pwHash: newHash }),
    
    setActive: (id, active) => update(`students/${k(id)}`, { active: active, lastActiveAt: Date.now() }),
    
    getAttendanceStats: async (studentId, lecId = null, courseCode = null) => {
      const cacheKey = `attendance_stats_${studentId}_${lecId || 'all'}_${courseCode || 'all'}`;
      const cached = cache.get(cacheKey);
      if (cached) return cached;
      
      const allSessions = await SESSION.getAll();
      
      let totalPresent = 0;
      let totalSessions = 0;
      const courses = new Map();
      
      for (const session of allSessions) {
        if (lecId && session.lecFbId !== lecId) continue;
        if (courseCode && session.courseCode !== courseCode) continue;
        
        const records = session.records ? Object.values(session.records) : [];
        const attended = records.some(r => r.studentId && r.studentId.toUpperCase() === studentId.toUpperCase());
        
        if (attended || session.active === false) {
          const courseNorm = session.courseCode;
          if (!courses.has(courseNorm)) {
            courses.set(courseNorm, {
              courseCode: session.courseCode,
              courseName: session.courseName,
              totalSessions: 0,
              attended: 0
            });
          }
          
          const course = courses.get(courseNorm);
          course.totalSessions++;
          totalSessions++;
          
          if (attended) {
            course.attended++;
            totalPresent++;
          }
        }
      }
      
      const coursesArray = Array.from(courses.values()).map(c => ({
        ...c,
        percentage: c.totalSessions > 0 ? Math.round((c.attended / c.totalSessions) * 100) : 0
      }));
      
      const result = {
        totalSessions,
        totalPresent,
        attendancePercentage: totalSessions > 0 ? Math.round((totalPresent / totalSessions) * 100) : 0,
        courses: coursesArray
      };
      
      cache.set(cacheKey, result, 60000);
      return result;
    },
  };

  // RESET TOKENS
  const RESET = {
    set: (email, d) => set(`resets/${k(email)}`, d),
    get: (email) => get(`resets/${k(email)}`),
    delete: (email) => remove(`resets/${k(email)}`),
  };

  // BIOMETRIC RESET
  const BIOMETRIC_RESET = {
    get: async (token) => {
      const data = await get('biometricResets');
      return data ? data[token] : null;
    },
    set: async (token, data) => {
      await set(`biometricResets/${token}`, data);
    },
    update: async (token, data) => {
      await update(`biometricResets/${token}`, data);
    },
    getAllForStudent: async (studentId) => {
      const all = await arr('biometricResets');
      return all.filter(r => r.studentId === studentId);
    },
    getAllForLecturer: async (lecturerId) => {
      const all = await arr('biometricResets');
      return all.filter(r => r.lecturerId === lecturerId);
    },
    delete: async (token) => {
      await remove(`biometricResets/${token}`);
    },
  };

  // STATS
  const STATS = {
    incrementCheckins: async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const statsRef = fb()?.ref('stats');
      if (statsRef) {
        await statsRef.transaction((current) => {
          if (!current) {
            return {
              totalCheckins: 1,
              dailyCheckins: { [today]: 1 },
              lastUpdated: Date.now()
            };
          }
          current.totalCheckins = (current.totalCheckins || 0) + 1;
          current.dailyCheckins = current.dailyCheckins || {};
          current.dailyCheckins[today] = (current.dailyCheckins[today] || 0) + 1;
          current.lastUpdated = Date.now();
          return current;
        });
      } else {
        const stats = await get('stats') || {};
        stats.totalCheckins = (stats.totalCheckins || 0) + 1;
        stats.dailyCheckins = stats.dailyCheckins || {};
        stats.dailyCheckins[today] = (stats.dailyCheckins[today] || 0) + 1;
        stats.lastUpdated = Date.now();
        await set('stats', stats);
      }
      
      cache.invalidatePattern('stats');
    },
    
    getStats: () => get('stats', { ttl: 10000 }),
    
    getDailyStats: async (days = 7) => {
      const stats = await STATS.getStats();
      if (!stats || !stats.dailyCheckins) return [];
      
      const result = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        result.push({
          date: dateStr,
          count: stats.dailyCheckins[dateStr] || 0
        });
      }
      return result;
    }
  };

  // MESSAGES
  const MESSAGES = {
    getCourseMessages: async (lecId, courseCode, year, semester) => {
      const path = `messages/course/${lecId}/${courseCode}_${year}_${semester}`;
      const data = await get(path);
      if (!data) return [];
      return Object.values(data).sort((a, b) => b.timestamp - a.timestamp);
    },
    
    sendCourseMessage: async (lecId, courseCode, year, semester, senderId, senderName, message, isAnnouncement = false) => {
      const messageId = Date.now().toString() + Math.random().toString(36).substr(2, 4);
      const path = `messages/course/${lecId}/${courseCode}_${year}_${semester}/${messageId}`;
      const messageData = {
        id: messageId,
        senderId: senderId,
        senderName: senderName,
        message: message,
        timestamp: Date.now(),
        isAnnouncement: isAnnouncement,
        replies: []
      };
      await set(path, messageData);
      cache.invalidatePattern(`messages/course/${lecId}/${courseCode}_${year}_${semester}`);
      return messageData;
    },
    
    addReply: async (lecId, courseCode, year, semester, messageId, senderId, senderName, replyText) => {
      const path = `messages/course/${lecId}/${courseCode}_${year}_${semester}/${messageId}`;
      const message = await get(path);
      if (message) {
        const replies = message.replies || [];
        replies.push({
          senderId: senderId,
          senderName: senderName,
          message: replyText,
          timestamp: Date.now()
        });
        await update(path, { replies: replies });
        cache.invalidatePattern(`messages/course/${lecId}/${courseCode}_${year}_${semester}`);
        return true;
      }
      return false;
    },
    
    getDepartmentMessages: async (department) => {
      const path = `messages/department/${department}`;
      const data = await get(path);
      if (!data) return [];
      return Object.values(data).sort((a, b) => b.timestamp - a.timestamp);
    },
    
    sendDepartmentMessage: async (department, senderId, senderName, senderRole, message) => {
      const messageId = Date.now().toString() + Math.random().toString(36).substr(2, 4);
      const path = `messages/department/${department}/${messageId}`;
      const messageData = {
        id: messageId,
        senderId: senderId,
        senderName: senderName,
        senderRole: senderRole,
        message: message,
        timestamp: Date.now(),
        replies: []
      };
      await set(path, messageData);
      cache.invalidatePattern(`messages/department/${department}`);
      return messageData;
    }
  };

  // Helper functions
  const normalizeCourseCode = (code) => {
    return String(code || '').toUpperCase().replace(/\s/g, '');
  };

  const getCurrentAcademicPeriod = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    let semester = 1;
    if (month >= 1 && month <= 6) semester = 2;
    return { year, semester };
  };

  // Performance utilities
  const getCacheStats = () => cache.getStats();
  const clearCache = (pattern = null) => {
    if (pattern) {
      cache.invalidatePattern(pattern);
    } else {
      cache.clear();
    }
  };
  
  // Periodic maintenance
  if (typeof window !== 'undefined') {
    setInterval(async () => {
      await SESSION.endExpiredSessions();
      console.log('[DB] Maintenance: Cleaned expired sessions');
    }, 5 * 60 * 1000);
  }

  /* ═══════════════════════════════════════════════════════════════════
     EXPORTS - All methods return ARRAYS for backward compatibility
  ═══════════════════════════════════════════════════════════════════ */
  
  return {
    // Core operations
    get,
    set,
    update,
    remove,
    push,
    arr,
    listen,
    exists,
    batchWrite,
    
    // Performance utilities
    getCacheStats,
    clearCache,
    
    // Collections
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
    BIOMETRIC_RESET,
    DEVICE_REGISTRATION,
    MESSAGES,
    
    // Helpers
    getCurrentAcademicPeriod,
    indexManager
  };
})();

// Log cache stats periodically for monitoring
if (typeof window !== 'undefined') {
  setInterval(() => {
    const stats = DB.getCacheStats();
    if (stats.hits + stats.misses > 0) {
      console.log('[DB Cache]', stats);
    }
  }, 60000);
}

console.log('[DB] Optimized version loaded - maintains backward compatibility');
