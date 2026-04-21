/* db.js — Database abstraction (Firebase + demo mode)
   FIREBASE MODE: all reads/writes go to Firebase Realtime DB
   DEMO MODE: localStorage + BroadcastChannel across tabs
*/
'use strict';

const DB = (() => {
  const fb = () => window._db;
  const k  = s => String(s).replace(/[.#$[\]/]/g, '_');

  /* ══ FIREBASE ══ */
  const fbGet    = async p => { const s = await fb().ref(p).once('value'); return s.val() ?? null; };
  const fbSet    = (p, v)  => fb().ref(p).set(v);
  const fbUpdate = (p, v)  => fb().ref(p).update(v);
  const fbRemove = p       => fb().ref(p).remove();
  const fbPush   = (p, v)  => fb().ref(p).push(v);
  const fbListen = (p, cb) => { const ref=fb().ref(p),fn=s=>cb(s.val()); ref.on('value',fn); return ()=>ref.off('value',fn); };

  /* ══ DEMO store ══ */
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

  const SA = {
    get:    ()    => get('sa'),
    exists: async () => !!(await get('sa/id')),
    set:    d     => set('sa',d),
    update: d     => update('sa',d),
  };
  const CA = {
    getAll:  ()          => arr('cas'),
    get:     uid         => get(`cas/${uid}`),
    set:     (uid,d)     => set(`cas/${uid}`,d),
    update:  (uid,d)     => update(`cas/${uid}`,d),
    delete:  uid         => remove(`cas/${uid}`),
    byEmail: async e     => { const a=await arr('cas');return a.find(c=>c.email===e)||null; },
  };
  const LEC = {
    getAll:  ()          => arr('lecs'),
    get:     uid         => get(`lecs/${uid}`),
    set:     (uid,d)     => set(`lecs/${uid}`,d),
    delete:  uid         => remove(`lecs/${uid}`),
    byEmail: async e     => { const a=await arr('lecs');return a.find(l=>l.email===e)||null; },
  };
  const TA = {
    getAll:       ()         => arr('tas'),
    get:          uid        => get(`tas/${uid}`),
    set:          (uid,d)    => set(`tas/${uid}`,d),
    update:       (uid,d)    => update(`tas/${uid}`,d),
    byEmail:      async e    => { const a=await arr('tas');return a.find(t=>t.email===e)||null; },
    setInvite:    (key,d)    => set(`taInvites/${k(key)}`,d),
    updateInvite: (key,d)    => update(`taInvites/${k(key)}`,d),
    inviteByCode: async code => { const all=await get('taInvites');if(!all)return null;return Object.entries(all).find(([,v])=>v.code===code)||null; },
  };
  const UID = {
    getAll:  ()         => arr('uids'),
    get:     id         => get(`uids/${k(id)}`),
    set:     (id,d)     => set(`uids/${k(id)}`,d),
    update:  (id,d)     => update(`uids/${k(id)}`,d),
  };
  const SESSION = {
    get:     id         => get(`sessions/${id}`),
    set:     (id,d)     => set(`sessions/${id}`,d),
    update:  (id,d)     => update(`sessions/${id}`,d),
    delete:  id         => remove(`sessions/${id}`),
    getAll:  ()         => arr('sessions'),
    byLec:   async uid  => { const a=await arr('sessions');return a.filter(s=>s.lecFbId===uid); },
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
  };
  const BACKUP = {
    save: (lecId,sessId,d) => set(`backup/${k(lecId)}/${sessId}`,d),
  };

  /* ══ STUDENTS — permanent registration for cross-device identity ══ */
  const STUDENTS = {
    getAll:       ()          => arr('students'),
    get:          id          => get(`students/${k(id)}`),
    set:          (id,d)      => set(`students/${k(id)}`, d),
    update:       (id,d)      => update(`students/${k(id)}`, d),
    delete:       id          => remove(`students/${k(id)}`),
    byEmail:      async e     => { const a=await arr('students'); return a.find(s=>s.email===e) || null; },
    byStudentId:  async id    => { 
      const a = await arr('students'); 
      const upperId = id.toUpperCase();
      return a.find(s => s.studentId && s.studentId.toUpperCase() === upperId) || null;
    },
    addDevice:    (id,fp)     => set(`students/${k(id)}/devices/${k(fp)}`, Date.now()),
    hasDevice:    async(id,fp)=> !!(await get(`students/${k(id)}/devices/${k(fp)}`)),
    getDevices:   async id    => { const v=await get(`students/${k(id)}/devices`); return v || {}; },
  };

  /* ══ RESET TOKENS — for forgot password ══ */
  const RESET = {
    set:    (email,d)  => set(`resets/${k(email)}`,d),
    get:    email      => get(`resets/${k(email)}`),
    delete: email      => remove(`resets/${k(email)}`),
  };

  return { SA, CA, LEC, TA, UID, SESSION, BACKUP, STUDENTS, RESET };
})();

