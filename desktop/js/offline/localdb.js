/* =====================================================================
   شجرة العائلة — النسخة المكتبية (بدون إنترنت)
   قاعدة بيانات محلية تحاكي واجهة Supabase التي يستخدمها البرنامج،
   وتحفظ كل شيء داخل المتصفح على هذا الكمبيوتر (IndexedDB).
   ===================================================================== */
(function(){
  const DB_NAME = "family-tree-offline", DB_VER = 1;
  const T = {};               // الجداول في الذاكرة: {table: [rows]}
  const FILES = new Map();    // "bucket/path" -> Blob
  const URLS = new Map();     // "bucket/path" -> blob: URL
  let idb = null, saveTimer = 0, readyResolve;
  const ready = new Promise(r => readyResolve = r);
  const authListeners = [];
  let session = null;

  /* ---------- مفاتيح وقيود الجداول ---------- */
  const PK = {f4_settings:["key"], f4_users:["email"], f4_game:["email"], f4_ad_likes:["ad_id","email"], f4_merge_map:["o"], f4_request_secrets:["request_id"], f4_qr_tokens:["email"]};
  const UNIQUE = {f4_spouses:[["person_id","ord"]], f4_lookups:[["kind","name"]], f4_people:[["cpr"],["serial"]], f4_bday_greets:[["person_id","year","sent_by"]]};
  const AUTO_ID = new Set(["f4_people","f4_spouses","f4_lookups","f4_media","f4_occasions","f4_requests","f4_visits","f4_heritage","f4_ads","f4_bday_greets"]);
  const now = () => new Date().toISOString();
  const me = () => session?.user?.email || null;
  const todayBH = () => new Date().toLocaleDateString("en-CA", {timeZone:"Asia/Bahrain"});
  const DEFAULTS = {
    f4_people: () => ({status:"على قيد الحياة", selected:false, created_at:now(), updated_at:now(), created_by:me()}),
    f4_ads: () => ({color:0, photos:[], owner_email:me(), status:"pending", featured:false, expires_at:new Date(Date.now() + 182 * 864e5).toISOString(), created_at:now(), updated_at:now()}),
    f4_bday_greets: () => ({sent_by:me(), sent_at:now()}),
    f4_heritage: () => ({created_by:me(), created_at:now()}),
    f4_lookups: () => ({sort:0}),
    f4_media: () => ({created_by:me(), created_at:now()}),
    f4_occasions: () => ({created_by:me(), created_at:now(), updated_at:now()}),
    f4_requests: () => ({accepted_terms_at:now(), status:"pending", created_at:now()}),
    f4_settings: () => ({value:"", updated_at:now(), updated_by:me()}),
    f4_users: () => ({role:"user", can_add:false, can_edit:false, can_delete:false, created_at:now(), family_only:true, frozen:false}),
    f4_visits: () => ({email:me(), visited_at:now()}),
    f4_ad_likes: () => ({email:me()}),
    f4_game: () => ({email:me(), visits:0, total:0, best:0, streak:0, plays:0, asked:[], disabled:false, updated_at:now()}),
  };
  const tbl = t => (T[t] ||= []);
  const keyOf = (t, r) => (PK[t] || ["id"]).map(k => r[k]).join("\u0001");
  const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
  const err = (message, code) => ({message, code});

  /* ---------- محاكاة مشغّلات قاعدة البيانات ---------- */
  function beforeWrite(t, row, old){
    if(t === "f4_people"){
      if(!old && (row.serial == null || row.serial === "")) row.serial = Math.max(0, ...tbl(t).map(p => +p.serial || 0)) + 1;
      if(row.gender === "ذكر") row.nationality = "بحريني"; else row.nationality = (row.nationality || "").trim() || null;
      row.updated_at = now(); row.updated_by = me();
    }
    if(t === "f4_occasions" && old){ row.updated_at = now(); row.updated_by = me(); }
    if(t === "f4_spouses"){
      if(row.spouse_id != null) row.spouse_nationality = null;
      else if(tbl("f4_people").some(p => p.id === row.person_id && p.gender === "أنثى")) row.spouse_nationality = "بحريني";
      else row.spouse_nationality = (row.spouse_nationality || "").trim() || null;
      if(row.spouse_id != null && row.spouse_id === row.person_id) throw err("new row for relation \"f4_spouses\" violates check constraint \"f4_spouses_check1\"", "23514");
      if(row.spouse_id == null && !(row.spouse_name || "").trim()) throw err("new row for relation \"f4_spouses\" violates check constraint \"f4_spouses_check\"", "23514");
    }
    for(const cols of UNIQUE[t] || []){
      if(cols.some(c => row[c] == null || row[c] === "")) continue;
      const clash = tbl(t).find(r => r !== old && cols.every(c => String(r[c]) === String(row[c])));
      if(clash) throw err(`duplicate key value violates unique constraint "${t}_${cols.join("_")}_key"`, "23505");
    }
  }
  /* الحذف المتتالي وتفريغ الروابط (ON DELETE CASCADE / SET NULL) */
  function afterDelete(t, row){
    const id = row.id;
    if(t === "f4_people"){
      T.f4_spouses = tbl("f4_spouses").filter(s => s.person_id !== id);
      tbl("f4_spouses").forEach(s => { if(s.spouse_id === id) s.spouse_id = null; });
      tbl("f4_people").forEach(p => { if(p.father_id === id) p.father_id = null; if(p.mother_id === id) p.mother_id = null; });
      T.f4_bday_greets = tbl("f4_bday_greets").filter(g => g.person_id !== id);
      ["f4_users","f4_requests","f4_heritage","f4_ads"].forEach(x => tbl(x).forEach(r => { if(r.person_id === id) r.person_id = null; }));
    }
    if(t === "f4_occasions") T.f4_media = tbl("f4_media").filter(m => m.occasion_id !== id);
    if(t === "f4_ads") T.f4_ad_likes = tbl("f4_ad_likes").filter(l => l.ad_id !== id);
  }

  /* ---------- منشئ الاستعلامات (يحاكي supabase-js) ---------- */
  class Q {
    constructor(t){ this.t = t; this.op = "select"; this.f = []; this.ord = []; this.rng = null; this.lim = null; this.one = null; this.ret = false; this.opts = {}; }
    select(cols, opts){ if(this.op === "select") this.opts = opts || {}; else this.ret = true; this.cols = cols; return this; }
    insert(rows){ this.op = "insert"; this.rows = rows; return this; }
    upsert(rows, o){ this.op = "upsert"; this.rows = rows; this.uo = o || {}; return this; }
    update(v){ this.op = "update"; this.vals = v; return this; }
    delete(){ this.op = "delete"; return this; }
    eq(c, v){ this.f.push(r => v == null ? r[c] == null : r[c] == v); return this; }
    neq(c, v){ this.f.push(r => r[c] != v); return this; }
    in(c, vs){ this.f.push(r => vs.some(v => r[c] == v)); return this; }
    is(c, v){ this.f.push(r => v === null ? r[c] == null : r[c] === v); return this; }
    gte(c, v){ this.f.push(r => r[c] >= v); return this; } lte(c, v){ this.f.push(r => r[c] <= v); return this; }
    gt(c, v){ this.f.push(r => r[c] > v); return this; } lt(c, v){ this.f.push(r => r[c] < v); return this; }
    match(o){ Object.entries(o).forEach(([c, v]) => this.eq(c, v)); return this; }
    order(c, o = {}){ this.ord.push([c, o.ascending !== false, o.nullsFirst]); return this; }
    range(a, b){ this.rng = [a, b]; return this; }
    limit(n){ this.lim = n; return this; }
    single(){ this.one = "single"; return this; }
    maybeSingle(){ this.one = "maybe"; return this; }
    then(res, rej){ return ready.then(() => this.run()).then(res, rej); }
    pick(r){
      if(!this.cols || this.cols === "*" || !r) return clone(r);
      const o = {}; this.cols.split(",").map(s => s.trim()).forEach(c => o[c] = r[c] ?? null); return clone(o);
    }
    sorted(list){
      if(!this.ord.length) return list;
      return list.slice().sort((a, b) => {
        for(const [c, asc, nf] of this.ord){
          const x = a[c], y = b[c];
          if(x == null && y == null) continue;
          if(x == null) return nf === false ? 1 : nf ? -1 : (asc ? 1 : -1);
          if(y == null) return nf === false ? -1 : nf ? 1 : (asc ? -1 : 1);
          const d = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ar");
          if(d) return asc ? d : -d;
        }
        return 0;
      });
    }
    run(){
      try{
        const t = this.t, rows = tbl(t), match = r => this.f.every(fn => fn(r));
        let out = [], count = null;
        if(this.op === "select"){
          out = this.sorted(rows.filter(match));
          count = out.length;
          if(this.rng) out = out.slice(this.rng[0], this.rng[1] + 1);
          if(this.lim != null) out = out.slice(0, this.lim);
          if(this.opts.head) return {data:null, error:null, count};
          out = out.map(r => this.pick(r));
        }else if(this.op === "insert" || this.op === "upsert"){
          const list = Array.isArray(this.rows) ? this.rows : [this.rows];
          const conflict = this.uo?.onConflict ? this.uo.onConflict.split(",").map(s => s.trim()) : (PK[t] || ["id"]);
          for(const raw of list){
            const r = {...(DEFAULTS[t] ? DEFAULTS[t]() : {}), ...clone(raw)};
            if(this.op === "upsert"){
              const ex = rows.find(x => conflict.every(c => r[c] != null && String(x[c]) === String(r[c])));
              if(ex){
                if(this.uo?.ignoreDuplicates) continue;
                const nr = {...ex, ...clone(raw)}; beforeWrite(t, nr, ex); Object.assign(ex, nr); out.push(clone(ex)); continue;
              }
            }
            if(AUTO_ID.has(t) && r.id == null) r.id = Math.max(0, ...rows.map(x => +x.id || 0)) + 1;
            beforeWrite(t, r, null);
            if(rows.some(x => keyOf(t, x) === keyOf(t, r))) throw err(`duplicate key value violates unique constraint "${t}_pkey"`, "23505");
            rows.push(r); out.push(clone(r));
          }
          persist();
        }else if(this.op === "update"){
          for(const r of rows.filter(match)){ const nr = {...r, ...clone(this.vals)}; beforeWrite(t, nr, r); Object.assign(r, nr); out.push(clone(r)); }
          persist();
        }else if(this.op === "delete"){
          const gone = rows.filter(match); T[t] = rows.filter(r => !gone.includes(r));
          gone.forEach(r => afterDelete(t, r)); out = gone.map(clone); persist();
        }
        if(this.op !== "select" && !this.ret && !this.one) return {data:null, error:null, count:null};
        if(this.one){
          if(out.length > 1 && this.one === "single") return {data:null, error:err("JSON object requested, multiple (or no) rows returned", "PGRST116")};
          if(!out.length) return this.one === "maybe" ? {data:null, error:null} : {data:null, error:err("JSON object requested, multiple (or no) rows returned", "PGRST116")};
          return {data:out[0], error:null};
        }
        return {data:out, error:null, count};
      }catch(e){ return {data:null, error:e.message ? e : err(String(e))}; }
    }
  }

  /* ---------- الدوال (RPC) ---------- */
  const norm = s => String(s ?? "").toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ").trim();
  const NOT_OFFLINE = () => ({data:null, error:err("هذه الخدمة تحتاج الإنترنت، وهي متاحة في الموقع فقط")});
  const RPC = {
    f4_get_terms: () => ({data:tbl("f4_settings").find(s => s.key === "terms")?.value ?? null, error:null}),
    f4_edit_ids: () => ({data:tbl("f4_people").map(p => p.id), error:null}),
    f4_tree_people: () => ({data:clone(tbl("f4_people")), error:null}),
    f4_tree_spouses: () => ({data:clone(tbl("f4_spouses")), error:null}),
    f4_request_status: ({p_email}) => { const r = tbl("f4_requests").filter(x => (x.email || "").toLowerCase() === (p_email || "").toLowerCase()).pop(); return {data:r ? r.status : null, error:null}; },
    f4_join_names: ({q}) => {
      const w = norm(q).split(" ").filter(Boolean); if(norm(q).length < 2) return {data:[], error:null};
      const P = tbl("f4_people"), byId = new Map(P.map(p => [p.id, p])), users = new Set(tbl("f4_users").map(u => u.person_id));
      const keys = ["name1","name2","name3","name4"];
      const res = P.filter(p => (p.status || "") !== "متوفى" && w.every((x, i) => i > 3 || norm(p[keys[i]]).startsWith(x)))
        .sort((a, b) => (a.name1 || "").localeCompare(b.name1 || "", "ar") || (a.name2 || "").localeCompare(b.name2 || "", "ar") || a.serial - b.serial).slice(0, 40)
        .map(p => { const f = byId.get(p.father_id); return {id:p.id, serial:p.serial, full_name:[p.name1,p.name2,p.name3,p.name4,p.name5,p.family].filter(Boolean).join(" "),
          parent:[f ? f.name1 : p.name2, f ? f.name2 : p.name3, f ? f.name3 : p.name4].filter(Boolean).join(" ") || null, gender:p.gender, taken:users.has(p.id)}; });
      return {data:res, error:null};
    },
    f4_visit_stats: () => {
      const V = tbl("f4_visits"), d = todayBH(), m = d.slice(0, 7), loc = v => new Date(v.visited_at).toLocaleDateString("en-CA", {timeZone:"Asia/Bahrain"});
      return {data:{total:V.length, today:V.filter(v => loc(v) === d).length, month:V.filter(v => loc(v).slice(0, 7) === m).length, visitors:new Set(V.map(v => v.email)).size}, error:null};
    },
    f4_visit_by_user: () => {
      const g = new Map(); tbl("f4_visits").forEach(v => { const x = g.get(v.email) || {email:v.email, count:0, max:null}; x.count++; if(!x.max || v.visited_at > x.max) x.max = v.visited_at; g.set(v.email, x); });
      return {data:[...g.values()], error:null};
    },
    f4_reject_request: ({p_id}) => { const r = tbl("f4_requests").find(x => x.id === p_id); if(r){ r.status = "rejected"; r.decided_at = now(); r.decided_by = me(); persist(); } return {data:null, error:null}; },
    f4_approve_request: ({p_id, p_role, p_add, p_edit, p_delete, p_person, p_family_only}) => {
      const r = tbl("f4_requests").find(x => x.id === p_id); if(!r) return {data:null, error:err("not found")};
      const e = (r.email || "").toLowerCase(), admin = p_role === "admin";
      const u = {email:e, display_name:r.full_name, role:admin ? "admin" : "user", can_add:!!p_add || admin, can_edit:!!p_edit || admin, can_delete:!!p_delete || admin, person_id:p_person ?? null, family_only:!!p_family_only && !admin};
      const ex = tbl("f4_users").find(x => x.email === e); if(ex) Object.assign(ex, u); else tbl("f4_users").push({...DEFAULTS.f4_users(), ...u});
      r.status = "approved"; r.decided_at = now(); r.decided_by = me(); persist();
      return {data:"no_account", error:null};
    },
    f4_game_board: () => ({data:[], error:null}),
    f4_game_hit: () => ({data:null, error:null}),
    f4_qr_list: () => ({data:[], error:null}),
    f4_qr_mine: NOT_OFFLINE, f4_qr_get: NOT_OFFLINE, f4_qr_for_person: NOT_OFFLINE, f4_qr_revoke: NOT_OFFLINE,
    f4_request_join: NOT_OFFLINE, f4_request_join2: NOT_OFFLINE, f4_self_register: NOT_OFFLINE,
  };

  /* ---------- الملفات (الصور والفيديو) ---------- */
  const fkey = (b, p) => b + "/" + String(p).replace(/^\/+/, "");
  function fileUrl(b, p){
    const k = fkey(b, p), blob = FILES.get(k); if(!blob) return null;
    if(!URLS.has(k)) URLS.set(k, URL.createObjectURL(blob));
    return URLS.get(k);
  }
  const storageApi = b => ({
    async upload(p, blob){ await ready; FILES.set(fkey(b, p), blob); URLS.delete(fkey(b, p)); await idbPut("files", fkey(b, p), blob); return {data:{path:p}, error:null}; },
    async remove(paths){ await ready; for(const p of paths){ FILES.delete(fkey(b, p)); URLS.delete(fkey(b, p)); await idbDel("files", fkey(b, p)); } return {data:paths, error:null}; },
    async download(p){ await ready; const x = FILES.get(fkey(b, p)); return x ? {data:x, error:null} : {data:null, error:err("الملف غير موجود على هذا الكمبيوتر")}; },
    async createSignedUrl(p){ await ready; const u = fileUrl(b, p); return u ? {data:{signedUrl:u}, error:null} : {data:null, error:err("Object not found")}; },
    async createSignedUrls(ps){ await ready; return {data:ps.map(p => ({path:p, signedUrl:fileUrl(b, p), error:fileUrl(b, p) ? null : "not found"})), error:null}; },
    getPublicUrl(p){ return {data:{publicUrl:fileUrl(b, p) || ""}}; },
  });

  /* ---------- الدخول المحلي ---------- */
  const SKEY = "ft-offline-session", PKEY = "ft-offline-pass";
  /* ---------- الاتصال بالموقع (للتشغيل الأول والتحديث) ---------- */
  const SRV = {url:"https://lzadmbjhcxqvafykntsp.supabase.co", key:"sb_publishable_X4VEzOBLuT8d-b7Tsz9IJQ_1QHW9BIe"};
  const SYNC_TABLES = ["f4_people","f4_spouses","f4_lookups","f4_settings","f4_users","f4_occasions","f4_media","f4_heritage","f4_bday_greets","f4_visits","f4_ads","f4_ad_likes","f4_game","f4_game_hits","f4_requests","f4_merge_map"];
  async function serverLogin(email, password){
    let r;
    try{ r = await fetch(`${SRV.url}/auth/v1/token?grant_type=password`, {method:"POST", headers:{apikey:SRV.key, "Content-Type":"application/json"}, body:JSON.stringify({email, password})}); }
    catch(e){ const x = new Error("لا يوجد اتصال بالموقع الآن. تأكد من الإنترنت وحاول مرة أخرى."); x.network = true; throw x; }
    const j = await r.json().catch(() => ({}));
    if(!r.ok || !j.access_token){ const x = new Error(/invalid/i.test(j.error_description || j.msg || j.error || "") ? "البريد أو كلمة السر غير صحيحة" : (j.error_description || j.msg || "تعذّر الدخول إلى الموقع")); x.bad = true; throw x; }
    return j.access_token;
  }
  async function syncFromServer(email, password, say = () => {}){
    email = (email || "").trim().toLowerCase();
    say("جارٍ الدخول إلى الموقع…");
    const token = await serverLogin(email, password);
    const AH = {apikey:SRV.key, Authorization:"Bearer " + token}, tables = {};
    for(const [n, t] of SYNC_TABLES.entries()){
      say(`جارٍ تنزيل البيانات… ${Math.round((n + 1) / SYNC_TABLES.length * 100)}٪`);
      let rows = [], from = 0;
      for(;;){
        const r = await fetch(`${SRV.url}/rest/v1/${t}?select=*`, {headers:{...AH, Range:`${from}-${from + 999}`, "Range-Unit":"items"}});
        if(!r.ok){ if(r.status === 404) break; throw new Error(`تعذّر تنزيل البيانات (${r.status})`); }
        const part = await r.json(); rows = rows.concat(part); if(part.length < 1000) break; from += 1000;
      }
      tables[t] = rows;
    }
    if(!(tables.f4_users || []).some(u => u.email === email && u.role === "admin")) throw new Error("هذا الحساب ليس مديراً في الموقع. النسخة المكتبية للمديرين فقط.");
    const thumb = p => p ? p.replace(/\.jpg$/, "_t.jpg") : "";
    const want = [];
    (tables.f4_people || []).forEach(p => p.photo_path && want.push(["f4-photos", p.photo_path]));
    (tables.f4_media || []).forEach(m => { if(m.path){ want.push(["f4-media", m.path]); if(m.kind === "photo") want.push(["f4-media", thumb(m.path)]); } });
    (tables.f4_heritage || []).forEach(h => { if(h.path){ want.push(["f4-media", h.path]); if(h.file_kind === "image") want.push(["f4-media", thumb(h.path)]); } });
    (tables.f4_ads || []).forEach(a => { [...(a.photos || []).flatMap(x => [x, thumb(x)]), a.logo_path].filter(Boolean).forEach(x => want.push(["f4-media", x])); });
    let ok = 0, miss = 0;
    for(const [b, p] of want){
      say(`جارٍ تنزيل الصور… ${ok + miss + 1} من ${want.length}`);
      try{
        const r = await fetch(`${SRV.url}/storage/v1/object/authenticated/${b}/${p.split("/").map(encodeURIComponent).join("/")}`, {headers:AH});
        if(!r.ok) throw 0; const blob = await r.blob(); FILES.set(fkey(b, p), blob); URLS.delete(fkey(b, p)); await idbPut("files", fkey(b, p), blob); ok++;
      }catch(e){ miss++; }
    }
    Object.keys(T).forEach(k => delete T[k]); Object.entries(tables).forEach(([k, v]) => T[k] = v);
    await saveNow();
    await setHash(email, password);
    try{ localStorage.setItem("ft-offline-synced-at", now()); }catch(e){}
    return {people:(tables.f4_people || []).length, files:ok, missed:miss};
  }
  function getHashes(){ try{ return JSON.parse(localStorage.getItem(PKEY) || "{}"); }catch(e){ return {}; } }
  async function setHash(email, password){ const h = getHashes(); h[email] = await sha(email + "|" + password); try{ localStorage.setItem(PKEY, JSON.stringify(h)); }catch(e){} }

  async function sha(s){ const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
  const emit = (ev, s) => authListeners.forEach(fn => { try{ fn(ev, s); }catch(e){ console.error(e); } });
  const auth = {
    onAuthStateChange(fn){ authListeners.push(fn); ready.then(() => fn(session ? "SIGNED_IN" : "INITIAL_SESSION", session)); return {data:{subscription:{unsubscribe(){}}}}; },
    async getSession(){ await ready; return {data:{session}, error:null}; },
    async signInWithPassword({email, password}){
      await ready;
      email = (email || "").trim().toLowerCase();
      if(!password) return {data:null, error:err("اكتب كلمة السر")};
      const btn = document.getElementById("lBtn"), say = m => { if(btn) btn.textContent = m; };
      /* التشغيل الأول: لا توجد بيانات بعد — تُنزّل من الموقع بحساب المدير */
      if(!tbl("f4_users").length){
        try{ await syncFromServer(email, password, say); }
        catch(e){ return {data:null, error:err(e.message)}; }
      }else{
        const u = tbl("f4_users").find(x => x.email === email);
        if(!u || u.role !== "admin") return {data:null, error:err("هذه النسخة المكتبية لمديري البرنامج فقط. اكتب بريد المدير.")};
        const h = await sha(email + "|" + password), saved = getHashes();
        if(saved[email] && saved[email] !== h) return {data:null, error:err("Invalid login credentials")};
        if(!saved[email]){
          /* أول دخول لهذا المدير على هذا الجهاز: نتحقق من كلمة سر الموقع إن وُجد إنترنت */
          say("جارٍ التحقق…");
          try{ await serverLogin(email, password); }
          catch(e){ if(e.bad) return {data:null, error:err(e.message)}; if(password.length < 4) return {data:null, error:err("اكتب كلمة سر من 4 أحرف على الأقل")}; }
          await setHash(email, password);
        }
      }
      session = {user:{id:email, email}, access_token:"local"};
      try{ localStorage.setItem(SKEY, JSON.stringify(session)); }catch(e){}
      emit("SIGNED_IN", session); return {data:{session, user:session.user}, error:null};
    },
    async signOut(){ session = null; try{ localStorage.removeItem(SKEY); }catch(e){} emit("SIGNED_OUT", null); return {error:null}; },
    async updateUser({password}){
      if(!session) return {error:err("سجّل الدخول أولاً")};
      let saved = {}; try{ saved = JSON.parse(localStorage.getItem(PKEY) || "{}"); }catch(e){}
      saved[session.user.email] = await sha(session.user.email + "|" + password);
      try{ localStorage.setItem(PKEY, JSON.stringify(saved)); }catch(e){}
      return {data:{user:session.user}, error:null};
    },
    async resetPasswordForEmail(){ return {error:err("في النسخة المكتبية: اضغط «نسيت كلمة السر» من شاشة الدخول لمسح كلمة السر المحلية")}; },
    async verifyOtp(){ return {error:err("غير متاح بدون إنترنت")}; },
  };

  /* ---------- التخزين الدائم (IndexedDB) ---------- */
  function idbOpen(){
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = () => { const d = r.result; if(!d.objectStoreNames.contains("kv")) d.createObjectStore("kv"); if(!d.objectStoreNames.contains("files")) d.createObjectStore("files"); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  const idbReq = (store, mode, fn) => new Promise((res, rej) => { const tx = idb.transaction(store, mode); const st = tx.objectStore(store); const q = fn(st); tx.oncomplete = () => res(q?.result); tx.onerror = () => rej(tx.error); });
  const idbPut = (s, k, v) => idbReq(s, "readwrite", st => st.put(v, k));
  const idbDel = (s, k) => idbReq(s, "readwrite", st => st.delete(k));
  const idbGet = (s, k) => idbReq(s, "readonly", st => st.get(k));
  function persist(){ clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 250); }
  async function saveNow(){ clearTimeout(saveTimer); if(idb) await idbPut("kv", "tables", JSON.parse(JSON.stringify(T))); try{ localStorage.setItem("ft-offline-saved-at", now()); }catch(e){} }
  window.addEventListener("beforeunload", () => { if(saveTimer) saveNow(); });

  async function boot(){
    try{
      idb = await idbOpen();
      const saved = await idbGet("kv", "tables");
      Object.keys(saved || {}).forEach(k => T[k] = saved[k]);
      try{ if(navigator.storage?.persist) await navigator.storage.persist(); }catch(e){}
      await new Promise((res, rej) => { const tx = idb.transaction("files"); const st = tx.objectStore("files"); const c = st.openCursor();
        c.onsuccess = () => { const cur = c.result; if(cur){ FILES.set(cur.key, cur.value); cur.continue(); } else res(); }; c.onerror = () => rej(c.error); });
    }catch(e){
      console.error(e);
      setTimeout(() => alertBar("تعذّر فتح التخزين المحلي في هذا المتصفح، فلن تُحفظ التعديلات. افتح البرنامج من Microsoft Edge أو Google Chrome."), 800);
    }
    try{ session = JSON.parse(localStorage.getItem(SKEY) || "null"); }catch(e){ session = null; }
    if(session && !tbl("f4_users").some(u => u.email === session.user.email && u.role === "admin")) session = null;
    readyResolve();
  }
  function alertBar(msg){ const d = document.createElement("div"); d.style.cssText = "position:fixed;inset:auto 12px 12px;z-index:99999;background:#b3261e;color:#fff;padding:12px 16px;border-radius:12px;font:600 15px Tajawal,sans-serif"; d.textContent = msg; document.body.appendChild(d); }

  /* ---------- واجهة للنسخ الاحتياطي والمزامنة ---------- */
  window.OFFLINE = {
    ready, tables:T, files:FILES,
    async exportAll(){ await ready; const files = {}; for(const [k, b] of FILES) files[k] = await blobToData(b); return {app:"family-tree-offline", version:1, saved_at:now(), tables:clone(T), files}; },
    async importAll(obj){
      await ready; if(!obj || !obj.tables) throw new Error("الملف ليس نسخة احتياطية من البرنامج");
      Object.keys(T).forEach(k => delete T[k]); Object.entries(obj.tables).forEach(([k, v]) => T[k] = v);
      FILES.clear(); URLS.clear(); await idbReq("files", "readwrite", st => st.clear());
      for(const [k, d] of Object.entries(obj.files || {})){ const b = await (await fetch(d)).blob(); FILES.set(k, b); await idbPut("files", k, b); }
      await saveNow();
    },
    async replaceTables(tables){ await ready; Object.entries(tables).forEach(([k, v]) => T[k] = v); await saveNow(); },
    async putFile(bucket, path, blob){ await ready; FILES.set(fkey(bucket, path), blob); URLS.delete(fkey(bucket, path)); await idbPut("files", fkey(bucket, path), blob); },
    hasFile:(bucket, path) => FILES.has(fkey(bucket, path)),
    async resetPasswords(){ try{ localStorage.removeItem(PKEY); }catch(e){} },
    syncFromServer, isEmpty:() => !tbl("f4_users").length,
  };
  const blobToData = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });


  /* ---------- التنزيلات: نافذة «حفظ باسم» في Edge/Chrome، أو تنزيل عادي كبديل ---------- */
  const origClick = HTMLAnchorElement.prototype.click;
  const toData = b => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
  async function saveBlob(blob, name){
    if(window.showSaveFilePicker){
      try{
        const ext = (name.match(/\.(\w+)$/) || [])[1] || "";
        const h = await showSaveFilePicker({suggestedName:name, types:ext ? [{description:name, accept:{[blob.type || "application/octet-stream"]:["." + ext]}}] : undefined});
        const w = await h.createWritable(); await w.write(blob); await w.close(); return;
      }catch(e){ if(e && e.name === "AbortError") return; }
    }
    const x = document.createElement("a"); x.href = await toData(blob); x.download = name; x.style.display = "none"; document.body.appendChild(x); origClick.call(x); setTimeout(() => x.remove(), 1000);
  }
  HTMLAnchorElement.prototype.click = function(){
    if(location.protocol === "file:" && this.hasAttribute("download") && /^(blob|data):/.test(this.href)){
      const name = this.getAttribute("download") || "ملف";
      fetch(this.href).then(r => r.blob()).then(b => saveBlob(b, name)).catch(e => console.error(e));
      return;
    }
    return origClick.call(this);
  };

  window.supabase = {createClient: () => ({
    from: t => new Q(t),
    rpc: async (name, args = {}) => { await ready; const fn = RPC[name]; return fn ? fn(args) : {data:null, error:err("غير متاح في النسخة المكتبية: " + name)}; },
    storage: {from: storageApi},
    auth,
    functions: {invoke: async () => ({data:null, error:err("هذه الخدمة تحتاج الإنترنت")})},
  })};
  boot();
})();
