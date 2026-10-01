/* ===== التنقل والدخول والشاشات العامة ===== */
const ROUTES = {
  home:     {title:"الرئيسية", render:renderHome},
  add:      {title:"إضافة سجل", render:() => renderSerialGate("add"), perm:"add"},
  edit:     {title:"تعديل سجل", render:() => renderSerialGate("edit"), perm:"edit"},
  delete:   {title:"حذف سجل", render:() => renderSerialGate("delete"), perm:"delete"},
  rec:      {title:"الملف الكامل", render:id => renderRecord(+id)},
  new:      {title:"سجل جديد", render:serial => renderRecord(null, +serial), perm:"add"},
  list:     {title:"البحث والملفات", render:renderList},
  family:   {title:"الأسرة", render:id => renderFamily(+id)},
  tree:     {title:"شجرة العائلة", render:id => renderTree(id ? +id : null)},
  reports:  {title:"التقارير", render:renderReports},
  report:   {title:"تقرير", render:key => renderReport(key)},
  whatsapp: {title:"مراسلة واتساب", render:renderWhatsapp},
  settings: {title:"الإعدادات والقوائم", render:renderSettings, admin:true},
  users:    {title:"المستخدمون", render:renderUsers, admin:true},
  data:     {title:"استيراد وتصدير", render:renderData},
};
let currentHash = "", skipGuard = false, restoring = false;

function parseHash(){
  const [name = "home", ...args] = location.hash.replace(/^#\/?/, "").split("/");
  return {name: ROUTES[name] ? name : "home", args: args.map(decodeURIComponent)};
}
async function route(){
  if(!S.me) return;
  if(restoring){ restoring = false; return; } // رجوع بعد إلغاء الخروج — نبقي التعديلات كما هي
  if(S.dirty && !skipGuard && location.hash !== currentHash){
    if(!(await ask("تغييرات غير محفوظة", "لم تحفظ التعديلات. الخروج بدون حفظ؟", {okText:"خروج بدون حفظ", danger:true}))){
      restoring = true; location.hash = currentHash; return;
    }
    S.dirty = false;
  }
  skipGuard = false; S.dirty = false; currentHash = location.hash;
  const {name, args} = parseHash(), r = ROUTES[name];
  closeNav();
  $$("[data-nav]").forEach(a => a.classList.toggle("on", a.dataset.nav === name));
  $("#crumb").textContent = r.title;
  const v = $("#view");
  if((r.perm && !can(r.perm)) || (r.admin && !isAdmin())){
    v.innerHTML = `<div class="card narrow"><h3>غير مسموح</h3><p>ليست لديك صلاحية «${esc(r.title)}». اطلب من المدير تفعيلها لك.</p><a class="btn" href="#/home">العودة للرئيسية</a></div>`;
    return;
  }
  window.scrollTo(0, 0);
  try{ await r.render(...args); }
  catch(err){ console.error(err); v.innerHTML = `<div class="card narrow"><p class="err">${esc(errMsg(err))}</p><button class="btn" onclick="location.reload()">إعادة المحاولة</button></div>`; }
  v.focus({preventScroll:true});
}
window.addEventListener("hashchange", route);
window.addEventListener("beforeunload", e => { if(S.dirty){ e.preventDefault(); e.returnValue = ""; } });
document.addEventListener("click", e => {
  const o = e.target.closest("[data-open]");
  if(o){ e.preventDefault(); const d = o.closest("dialog"); if(d) d.close(); location.hash = "#/rec/" + o.dataset.open; }
});

/* القائمة الجانبية على الجوال */
function closeNav(){ $("#sidenav").classList.remove("open"); $("#scrim").hidden = true; $("#navBtn").setAttribute("aria-expanded", "false"); }
$("#navBtn").onclick = () => { const o = !$("#sidenav").classList.contains("open"); $("#sidenav").classList.toggle("open", o); $("#scrim").hidden = !o; $("#navBtn").setAttribute("aria-expanded", String(o)); };
$("#scrim").onclick = closeNav;

/* الوضع الليلي */
(function(){ let t = null; try{ t = localStorage.getItem("fa-theme"); }catch(e){} if(t) document.documentElement.dataset.theme = t; })();
$("#themeBtn").onclick = () => {
  const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const nx = cur === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = nx;
  try{ localStorage.setItem("fa-theme", nx); }catch(e){}
};

/* ===== الدخول ===== */
$("#loginForm").onsubmit = async e => {
  e.preventDefault(); const btn = $("#lBtn"); $("#lErr").textContent = "";
  const email = $("#lEmail").value.trim().toLowerCase(), password = $("#lPass").value;
  if(!email || !password){ $("#lErr").textContent = "أدخل البريد وكلمة السر"; return; }
  btn.disabled = true; btn.textContent = "جاري الدخول…";
  try{ const {error} = await db.auth.signInWithPassword({email, password}); if(error) throw error; }
  catch(err){ $("#lErr").textContent = errMsg(err); }
  finally{ btn.disabled = false; btn.textContent = "دخول"; }
};
$("#lForgot").onclick = async () => {
  const email = $("#lEmail").value.trim().toLowerCase();
  if(!email){ $("#lErr").textContent = "اكتب بريدك أولاً ثم اضغط «نسيت كلمة السر»"; return; }
  const {error} = await db.auth.resetPasswordForEmail(email, {redirectTo: location.href.split("#")[0]});
  $("#lErr").textContent = error ? errMsg(error) : "أرسلنا رابط تعيين كلمة السر إلى بريدك";
};
$("#lSignup").onclick = async () => {
  const email = $("#lEmail").value.trim().toLowerCase(), password = $("#lPass").value;
  if(!email || password.length < 6){ $("#lErr").textContent = "اكتب بريدك (الذي أضافه المدير) وكلمة سر جديدة من 6 أحرف على الأقل، ثم اضغط «أنشئ كلمة سر»"; return; }
  const {data, error} = await db.auth.signUp({email, password, options:{emailRedirectTo: location.href.split("#")[0]}});
  if(error){ $("#lErr").textContent = errMsg(error); return; }
  $("#lErr").textContent = data.session ? "" : "تم إنشاء الحساب — افتح رسالة التأكيد في بريدك ثم ادخل";
};
$("#logoutBtn").onclick = async () => {
  if(S.dirty && !(await ask("تغييرات غير محفوظة", "الخروج سيلغي التعديلات. متابعة؟", {danger:true}))) return;
  S.dirty = false; await db.auth.signOut();
};

let booted = false;
db.auth.onAuthStateChange((event, session) => {
  if(event === "PASSWORD_RECOVERY"){
    setTimeout(async () => {
      const p = await ask("كلمة سر جديدة", "اكتب كلمة السر الجديدة (6 أحرف على الأقل)", {input:true, type:"password"});
      if(p){ const {error} = await db.auth.updateUser({password:p}); toast(error ? errMsg(error) : "تم تغيير كلمة السر", !!error); }
    }, 0);
  }
  if(!session){ booted = false; S.me = null; $("#app").hidden = true; $("#vLogin").hidden = false; return; }
  if(booted) return; booted = true;
  setTimeout(() => boot(session), 0); // خارج نداء المصادقة لتجنب التعليق
});

async function boot(session){
  S.email = (session.user.email || "").toLowerCase();
  $("#vLogin").hidden = true; $("#app").hidden = false;
  $("#view").innerHTML = `<div class="spin" aria-label="جاري التحميل"></div>`;
  try{
    const {data, error} = await db.from("fa_users").select("*").eq("email", S.email).maybeSingle();
    if(error) throw error;
    if(!data){
      $("#view").innerHTML = `<div class="card narrow"><h3>الحساب غير مفعّل</h3><p>البريد <b class="ltr">${esc(S.email)}</b> غير مضاف إلى البرنامج بعد. اطلب من المدير إضافتك من شاشة «المستخدمون».</p><button class="btn" type="button" id="noRoleOut">تسجيل الخروج</button></div>`;
      $("#noRoleOut").onclick = () => db.auth.signOut(); return;
    }
    S.me = data;
    applyPerms();
    await loadAll();
    currentHash = location.hash;
    route();
  }catch(err){
    $("#view").innerHTML = `<div class="card narrow"><p class="err">${esc(errMsg(err))}</p><button class="btn" type="button" onclick="location.reload()">إعادة المحاولة</button></div>`;
  }
}
function applyPerms(){
  $$("[data-perm]").forEach(el => el.hidden = !can(el.dataset.perm));
  $$("[data-admin]").forEach(el => el.hidden = !isAdmin());
  const rights = isAdmin() ? "مدير" : ["add","edit","delete"].filter(can).map(p => ({add:"إضافة", edit:"تعديل", delete:"حذف"}[p])).join("، ") || "مشاهدة فقط";
  $("#whoAmI").innerHTML = `<b>${esc(S.me.display_name || "مرحباً")}</b><span class="ltr" style="display:block;text-align:start">${esc(S.email)}</span>${esc(rights)}`;
}

/* ===== الرئيسية ===== */
const ICON = {
  add:'<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>', edit:'<path d="M4 20h4l11-11-4-4L4 16z"/>',
  del:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', search:'<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  tree:'<rect x="9" y="2.5" width="6" height="5" rx="1"/><rect x="2.5" y="16.5" width="6" height="5" rx="1"/><rect x="15.5" y="16.5" width="6" height="5" rx="1"/><path d="M12 7.5V12M5.5 16.5V12h13v4.5"/>',
  rep:'<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7M9 8h3"/>', wa:'<path d="M4 20l1.4-4A8 8 0 1 1 8 18.7z"/>',
  set:'<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.6 6.5-5.6s5.9 2 6.5 5.6"/>', data:'<path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 17v3h16v-3"/>',
  cake:'<path d="M4 21h16v-8H4zM4 16c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 4 0M12 13V9M12 6.5a1.2 1.2 0 0 1 0-2.5"/>',
};
const tile = (href, ic, t, s, attr = "") => `<a class="tile" href="${href}" ${attr}><span class="ic"><svg viewBox="0 0 24 24">${ICON[ic]}</svg></span><b>${t}</b><small>${s}</small></a>`;
function renderHome(){
  const P = S.people, alive = P.filter(p => !isDead(p)).length;
  const m = P.filter(p => p.gender === "ذكر").length, f = P.filter(p => p.gender === "أنثى").length;
  const fams = new Set(P.filter(p => childrenOf(p).length && isM(p)).map(p => p.id)).size;
  const mon = +todayISO().slice(5, 7);
  const bdays = P.filter(p => p.birth_date && !isDead(p) && +p.birth_date.slice(5, 7) === mon).length;
  const recent = P.slice().sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || "")).slice(0, 6);
  $("#view").innerHTML = `
    <div class="page-h"><h2>أهلاً ${esc(S.me.display_name || "")}</h2><div class="acts"><a class="btn primary" href="#/add" data-perm="add">+ إضافة سجل</a><a class="btn" href="#/list">بحث</a></div></div>
    <div class="stats">
      <div class="stat gold"><b>${P.length}</b><span>إجمالي الأفراد</span></div>
      <div class="stat"><b>${alive}</b><span>على قيد الحياة</span></div>
      <div class="stat"><b>${P.length - alive}</b><span>متوفون</span></div>
      <div class="stat"><b>${m}</b><span>ذكور</span></div>
      <div class="stat"><b>${f}</b><span>إناث</span></div>
      <div class="stat"><b>${fams}</b><span>آباء لهم أبناء</span></div>
    </div>
    <div class="tiles">
      ${tile("#/add","add","إضافة سجل","ملف جديد برقم تسلسل", 'data-perm="add"')}
      ${tile("#/edit","edit","تعديل سجل","بالرقم أو بالاسم", 'data-perm="edit"')}
      ${tile("#/delete","del","حذف سجل","مع تأكيد قبل الحذف", 'data-perm="delete"')}
      ${tile("#/list","search","البحث والملفات","فرز حسب المنطقة والفرع والحالة")}
      ${tile("#/tree","tree","شجرة العائلة","الأبناء والأحفاد تلقائياً")}
      ${tile("#/reports","rep","التقارير",`${REPORTS.length} تقريراً جاهزاً للطباعة`)}
      ${tile("#/report/birthdays","cake","أعياد الميلاد",`${bdays} هذا الشهر`)}
      ${tile("#/whatsapp","wa","مراسلة واتساب","رسالة جماعية للأفراد")}
      ${tile("#/settings","set","الإعدادات والقوائم","المناطق والمؤهلات والوظائف…", "data-admin")}
      ${tile("#/users","users","المستخدمون","صلاحيات الإضافة والتعديل والحذف", "data-admin")}
      ${tile("#/data","data","استيراد وتصدير","Excel")}
    </div>
    ${recent.length ? `<div class="sec-h">آخر السجلات المحدّثة</div><div class="plist">${recent.map(p => personBtn(p, p.updated_at ? "حُدّث " + fmtDate(p.updated_at.slice(0, 10)) : "")).join("")}</div>` : ""}`;
  applyPerms();
}

/* ===== بوابة رقم التسلسل (إضافة / تعديل / حذف) ===== */
function renderSerialGate(mode){
  const T = {add:["إضافة سجل","أدخل رقم التسلسل للسجل الجديد. اقترحنا الرقم التالي المتاح.","متابعة"],
             edit:["تعديل سجل","أدخل رقم التسلسل، أو ابحث بالاسم.","فتح السجل"],
             delete:["حذف سجل","أدخل رقم تسلسل السجل المراد حذفه، أو ابحث بالاسم.","عرض السجل"]}[mode];
  $("#view").innerHTML = `
    <div class="page-h"><h2>${T[0]}</h2></div>
    <form class="card narrow" id="gate" novalidate>
      <p class="muted" style="margin-top:0">${T[1]}</p>
      <div class="field req"><label for="gSerial">رقم التسلسل</label><input class="inp ltr" id="gSerial" type="number" inputmode="numeric" min="1" required value="${mode === "add" ? nextSerial() : ""}"></div>
      <div class="err" id="gErr" role="alert"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
        <button class="btn primary" type="submit">${T[2]}</button>
        ${mode !== "add" ? `<button class="btn" type="button" id="gFind">بحث بالاسم…</button>` : ""}
        <a class="btn" href="#/home">رجوع</a>
      </div>
      <div id="gOut"></div>
    </form>`;
  const inp = $("#gSerial"); inp.focus(); inp.select();
  const go = p => mode === "delete" ? showDeleteCard(p) : (location.hash = "#/rec/" + p.id);
  $("#gate").onsubmit = e => {
    e.preventDefault(); $("#gErr").textContent = ""; $("#gOut").innerHTML = "";
    const n = parseInt(inp.value, 10);
    if(!(n > 0)){ $("#gErr").textContent = "أدخل رقم تسلسل صحيح"; return; }
    const ex = S.bySerial.get(n);
    if(mode === "add"){
      if(ex){ $("#gErr").innerHTML = `هذا الرقم مسجل مسبقاً لـ «${esc(fullName(ex))}». <a href="#/rec/${ex.id}">فتح السجل</a>`; return; }
      location.hash = "#/new/" + n; return;
    }
    if(!ex){ $("#gErr").textContent = `لا يوجد سجل برقم ${n}`; return; }
    go(ex);
  };
  if($("#gFind")) $("#gFind").onclick = async () => { const p = await pickPerson("اختيار السجل"); if(p){ inp.value = p.serial; go(p); } };
}
function showDeleteCard(p){
  const kids = childrenOf(p), sp = spousesOf(p);
  $("#gOut").innerHTML = `<div class="notice" style="margin-top:14px">
    <div style="display:flex;gap:10px;align-items:center">${avatar(p)}<div><b>${esc(longName(p))}</b><br><small>#${p.serial}${p.cpr ? " · " + esc(p.cpr) : ""}</small></div></div>
    <p style="margin:10px 0 4px">سيُحذف هذا السجل نهائياً. ${kids.length ? `<b>${kids.length}</b> من الأبناء سيبقون في البرنامج لكن بدون ربط بهذا الوالد.` : ""} ${sp.length ? `وسيُلغى ربط ${sp.length} زواج.` : ""}</p>
    <button class="btn danger-fill" type="button" id="gDel">حذف السجل</button></div>`;
  $("#gDel").onclick = () => deletePerson(p, () => { $("#gOut").innerHTML = ""; $("#gSerial").value = ""; });
}
async function deletePerson(p, after){
  if(!(await ask("تأكيد الحذف", `هل أنت متأكد من حذف سجل «${fullName(p)}» رقم ${p.serial}؟`, {okText:"نعم، احذف", danger:true}))) return;
  if(!(await ask("تأكيد أخير", "لا يمكن التراجع عن الحذف. متابعة؟", {okText:"حذف نهائي", danger:true}))) return;
  const {error} = await db.from("fa_people").delete().eq("id", p.id);
  if(error){ toast(errMsg(error), true); return; }
  if(p.photo_path) db.storage.from(PHOTO_BUCKET).remove([p.photo_path]);
  S.people = S.people.filter(x => x.id !== p.id);
  S.people.forEach(x => { if(x.father_id === p.id) x.father_id = null; if(x.mother_id === p.id) x.mother_id = null; });
  S.spouses = S.spouses.filter(s => s.person_id !== p.id).map(s => s.spouse_id === p.id ? {...s, spouse_id:null, spouse_name:s.spouse_name || fullName(p)} : s);
  S.sel.delete(p.id); indexPeople();
  toast("تم حذف السجل"); after && after();
}

/* ===== البحث والملفات ===== */
const LIST = {q:"", gender:"", status:"", gov:"", area:"", branch:"", family:"", marital:"", page:0, sort:"serial"};
const PAGE = 50;
function filterPeople(F = LIST){
  const words = norm(F.q).split(" ").filter(Boolean), t = norm(F.q);
  return S.people.filter(p =>
    (!F.gender || p.gender === F.gender) && (!F.status || p.status === F.status) &&
    (!F.gov || p.governorate === F.gov) && (!F.area || p.area === F.area) &&
    (!F.branch || p.branch === F.branch) && (!F.family || p.family === F.family) &&
    (!F.marital || p.marital === F.marital) &&
    (!words.length || String(p.serial) === t || (p.cpr || "").includes(t) || (p.phone || "").includes(t) || (p.phone2 || "").includes(t) ||
      words.every(w => norm([longName(p), p.nickname, p.branch].join(" ")).split(" ").some(x => x.startsWith(w)))));
}
function opt(list, val, all){ return `<option value="">${all}</option>` + list.map(o => `<option ${o === val ? "selected" : ""}>${esc(o)}</option>`).join(""); }
function renderList(){
  $("#view").innerHTML = `
    <div class="page-h"><h2>البحث والملفات</h2><div class="acts">
      <button class="btn" type="button" id="lExport">تصدير Excel</button>
      <button class="btn" type="button" id="lPrint">طباعة القائمة</button>
      <a class="btn primary" href="#/add" data-perm="add">+ إضافة</a></div></div>
    <div class="toolbar">
      <input class="inp grow" id="fQ" type="search" placeholder="الاسم، رقم التسلسل، الرقم الشخصي أو الهاتف…" aria-label="بحث" value="${esc(LIST.q)}">
      <select class="inp" id="fGender" aria-label="الجنس">${opt(["ذكر","أنثى"], LIST.gender, "كل الجنسين")}</select>
      <select class="inp" id="fStatus" aria-label="الحالة">${opt(["على قيد الحياة","متوفى"], LIST.status, "كل الحالات")}</select>
      <select class="inp" id="fGov" aria-label="المحافظة">${opt(lk("governorate"), LIST.gov, "كل المحافظات")}</select>
      <select class="inp" id="fArea" aria-label="المنطقة">${opt(areasOf(LIST.gov), LIST.area, "كل المناطق")}</select>
      <select class="inp" id="fBranch" aria-label="الفرع">${opt(lkUsed("branch"), LIST.branch, "كل الفروع")}</select>
      <select class="inp" id="fFamily" aria-label="العائلة">${opt(lkUsed("family"), LIST.family, "كل العائلات")}</select>
      <select class="inp" id="fMarital" aria-label="الحالة الاجتماعية">${opt(lk("marital"), LIST.marital, "كل الحالات الاجتماعية")}</select>
    </div>
    <div class="toolbar" style="align-items:center">
      <span class="muted" id="lCount"></span><span style="flex:1"></span>
      <span class="muted" id="lSel"></span>
      <button class="btn small" type="button" id="lSelAll">تحديد النتائج</button>
      <button class="btn small" type="button" id="lSelNone">إلغاء التحديد</button>
      <a class="btn small wa" href="#/whatsapp">واتساب للمحددين</a>
    </div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th style="width:36px"><span class="sr" hidden>تحديد</span></th><th>#</th><th>الاسم</th><th class="hm">الأب / الأم</th><th>الحالة</th><th class="hm">العمر</th><th class="hm">المنطقة</th><th class="hm">الهاتف</th>
    </tr></thead><tbody id="lBody"></tbody></table></div>
    <div class="pager" id="lPager"></div>`;
  applyPerms();
  const bind = (id, key, reset) => $(id).addEventListener(id === "#fQ" ? "input" : "change", e => { LIST[key] = e.target.value; LIST.page = 0; if(reset) reset(); drawList(); });
  bind("#fQ","q"); bind("#fGender","gender"); bind("#fStatus","status"); bind("#fArea","area"); bind("#fBranch","branch"); bind("#fFamily","family"); bind("#fMarital","marital");
  bind("#fGov","gov", () => { LIST.area = ""; $("#fArea").innerHTML = opt(areasOf(LIST.gov), "", "كل المناطق"); });
  $("#lSelAll").onclick = () => { filterPeople().forEach(p => S.sel.add(p.id)); drawList(); };
  $("#lSelNone").onclick = () => { S.sel.clear(); drawList(); };
  $("#lExport").onclick = () => exportPeople(filterPeople(), "قائمة-الأفراد");
  $("#lPrint").onclick = () => printHtml(reportFrame("قائمة الأفراد", filterNote(LIST), peopleTable(filterPeople(), ["serial","name","parents","age","area","phone"])));
  $("#lBody").addEventListener("click", e => {
    const cb = e.target.closest("input[type=checkbox]");
    if(cb){ cb.checked ? S.sel.add(+cb.dataset.id) : S.sel.delete(+cb.dataset.id); $("#lSel").textContent = S.sel.size ? `${S.sel.size} محدد` : ""; return; }
    const tr = e.target.closest("tr[data-id]"); if(tr) location.hash = "#/rec/" + tr.dataset.id;
  });
  drawList(); $("#fQ").focus();
}
function parentsText(p){
  const f = S.byId.get(p.father_id), m = S.byId.get(p.mother_id);
  return [f ? shortName(f) : "", m ? shortName(m) : (p.mother_name || "")].filter(Boolean).join(" / ");
}
function drawList(){
  const rows = filterPeople(), pages = Math.max(1, Math.ceil(rows.length / PAGE));
  LIST.page = Math.min(LIST.page, pages - 1);
  const slice = rows.slice(LIST.page * PAGE, LIST.page * PAGE + PAGE);
  $("#lCount").textContent = `${rows.length} من ${S.people.length} سجل`;
  $("#lSel").textContent = S.sel.size ? `${S.sel.size} محدد` : "";
  $("#lBody").innerHTML = slice.length ? slice.map(p => `<tr class="click" data-id="${p.id}">
      <td><input type="checkbox" data-id="${p.id}" ${S.sel.has(p.id) ? "checked" : ""} aria-label="تحديد ${esc(p.name1)}"></td>
      <td class="num">${p.serial}</td>
      <td><div style="display:flex;gap:8px;align-items:center">${avatar(p, "sm")}<b>${esc(fullName(p, 4))}</b></div></td>
      <td class="hm">${esc(parentsText(p))}</td>
      <td>${isDead(p) ? '<span class="chip dead">متوفى</span>' : '<span class="chip">حي</span>'}</td>
      <td class="num hm">${ageOf(p)}</td><td class="hm">${esc(p.area || "")}</td><td class="ltr hm" style="text-align:start">${esc(p.phone || "")}</td></tr>`).join("")
    : `<tr><td colspan="8" class="empty">لا توجد سجلات مطابقة للبحث</td></tr>`;
  $("#lPager").innerHTML = pages > 1 ? `<button class="btn small" ${LIST.page ? "" : "disabled"} id="pPrev">السابق</button><span class="muted">صفحة ${LIST.page + 1} من ${pages}</span><button class="btn small" ${LIST.page < pages - 1 ? "" : "disabled"} id="pNext">التالي</button>` : "";
  if($("#pPrev")){ $("#pPrev").onclick = () => { LIST.page--; drawList(); }; $("#pNext").onclick = () => { LIST.page++; drawList(); }; }
}

/* ===== الأسرة (الوالدان، الإخوة، الأبناء، الأحفاد، الأجداد) ===== */
function renderFamily(id){
  const p = S.byId.get(id); if(!p){ $("#view").innerHTML = `<div class="card narrow empty">السجل غير موجود</div>`; return; }
  const f = S.byId.get(p.father_id), m = S.byId.get(p.mother_id);
  const gp = [[f && S.byId.get(f.father_id), "الجد لأب"], [f && S.byId.get(f.mother_id), "الجدة لأب"], [m && S.byId.get(m.father_id), "الجد لأم"], [m && S.byId.get(m.mother_id), "الجدة لأم"]].filter(x => x[0]);
  const sib = siblingsOf(p), kids = childrenOf(p), gens = descendantsByGen(p), sp = spousesOf(p), anc = lineChain(p);
  const grp = (t, items) => `<div class="fam-grp"><h4>${t} (${items.length})</h4>${items.length ? `<div class="plist">${items.join("")}</div>` : '<p class="muted" style="margin:0">لا يوجد</p>'}</div>`;
  $("#view").innerHTML = `
    <div class="page-h"><h2>أسرة ${esc(fullName(p, 3))}</h2><div class="acts">
      <a class="btn" href="#/rec/${p.id}">الملف الكامل</a><a class="btn" href="#/tree/${p.id}">الشجرة من هنا</a></div></div>
    <div class="card">
      ${grp("الوالدان", [f && personBtn(f, "الأب"), m && personBtn(m, "الأم")].filter(Boolean).concat(!m && p.mother_name ? [`<div class="pbtn" style="cursor:default"><span class="av sm f">${esc(p.mother_name.charAt(0))}</span><span><b>${esc(p.mother_name)}</b><small>الأم · غير مسجلة</small></span></div>`] : []))}
      ${grp("الأجداد", gp.map(([x, t]) => personBtn(x, t)))}
      ${grp(isM(p) ? "الزوجات" : "الأزواج", sp.map(s => s.person ? personBtn(s.person, s.ord ? (isM(p) ? "الزوجة " : "الزوج ") + s.ord : "") : `<div class="pbtn" style="cursor:default"><span class="av sm">${esc(s.name.charAt(0))}</span><span><b>${esc(s.name)}</b><small>غير مسجل</small></span></div>`))}
      ${grp("الإخوة والأخوات", sib.map(x => personBtn(x, siblingKind(p, x))))}
      ${grp("الأبناء", kids.map(x => personBtn(x, isM(x) ? "ابن" : "بنت")))}
      ${gens.slice(1).map((g, i) => grp(i === 0 ? "الأحفاد" : `الجيل ${i + 3}`, g.map(x => personBtn(x, shortName(S.byId.get(x.father_id) || S.byId.get(x.mother_id)))))).join("")}
      ${anc.length ? `<div class="fam-grp"><h4>سلسلة النسب من جهة الأب (${anc.length})</h4><p style="margin:0;line-height:2">${[p, ...anc].map(x => `<a href="#/rec/${x.id}">${esc(x.name1)}</a>`).join(" بن ")}${anc.at(-1).family ? " " + esc(anc.at(-1).family) : ""}</p></div>` : ""}
    </div>`;
}

/* ===== شجرة العائلة ===== */
function treeKids(p){
  // الأبناء تحت الأب؛ وتحت الأم فقط إن لم يكن الأب مسجلاً
  return S.people.filter(c => isM(p) ? c.father_id === p.id : (c.mother_id === p.id && !S.byId.get(c.father_id)))
    .sort((a, b) => (a.birth_date || "9").localeCompare(b.birth_date || "9") || a.serial - b.serial);
}
function treeRoots(){ return S.people.filter(p => !S.byId.get(p.father_id) && !S.byId.get(p.mother_id) && treeKids(p).length); }
function renderTree(rootId){
  const roots = treeRoots().sort((a, b) => descCount(b) - descCount(a));
  const root = S.byId.get(rootId) || roots[0];
  $("#view").innerHTML = `
    <div class="page-h"><h2>شجرة العائلة</h2><div class="acts">
      <button class="btn small" type="button" id="tPick">البدء من شخص…</button>
      <button class="btn small" type="button" id="tOpen">فتح الكل</button>
      <button class="btn small" type="button" id="tClose">طي الكل</button>
      <button class="btn small" type="button" id="tPrint">نسخة للطباعة</button></div></div>
    ${roots.length > 1 ? `<div class="toolbar"><select class="inp" id="tRoot" aria-label="رأس الشجرة">${roots.map(r => `<option value="${r.id}" ${r.id === root?.id ? "selected" : ""}>${esc(fullName(r, 3))} — ${descCount(r)} من الذرية</option>`).join("")}${root && !roots.includes(root) ? `<option value="${root.id}" selected>${esc(fullName(root, 3))}</option>` : ""}</select></div>` : ""}
    <p class="muted" style="font-size:13px;margin:0 0 10px">الأبناء يظهرون تحت الأب وتحت الأم. الإطار المتقطع = متوفى، والإطار الباهت = يظهر كاملاً تحت أبيه. اضغط على الاسم لفتح الملف.</p>
    <div class="card tree" id="treeBox">${root ? `<ul>${nodeHtml(root, 0, new Set(), treeSet(root), false)}</ul>` : '<p class="empty">لا توجد روابط أب وأبناء بعد</p>'}</div>`;
  if($("#tRoot")) $("#tRoot").onchange = e => location.hash = "#/tree/" + e.target.value;
  $("#tPick").onclick = async () => { const p = await pickPerson("بداية الشجرة"); if(p) location.hash = "#/tree/" + p.id; };
  $("#tOpen").onclick = () => $$("#treeBox li>ul").forEach(u => { u.hidden = false; u.parentElement.querySelector(".tog").textContent = "−"; });
  $("#tClose").onclick = () => $$("#treeBox>ul>li>ul>li ul").forEach(u => { { u.hidden = true; u.parentElement.querySelector(".tog").textContent = "+"; } });
  $("#tPrint").onclick = () => { REP_ARGS.person = root?.id || null; location.hash = "#/report/tree"; };
  $("#treeBox").onclick = e => {
    const t = e.target.closest(".tog"); if(t && !t.classList.contains("leaf")){ const u = t.parentElement.querySelector(":scope>ul"); u.hidden = !u.hidden; t.textContent = u.hidden ? "+" : "−"; }
  };
}
/* كل ذرية الشخص من جهة الأب والأم */
function treeSet(root){
  const F = new Set([root.id]), q = [root];
  while(q.length){ const x = q.shift(); childrenOf(x).forEach(k => { if(!F.has(k.id)){ F.add(k.id); q.push(k); } }); }
  return F;
}
function descCount(p){ return treeSet(p).size - 1; }
/* أبناء العقدة: تحت الأب كاملين؛ وتحت الأم كاملين إلا إذا كان أبوهم ضمن نفس الشجرة (يظهر كإشارة فقط لتجنّب التكرار) */
function nodeKids(p, F){
  return childrenOf(p).filter(c => isM(p) ? c.father_id === p.id : c.mother_id === p.id)
    .map(c => ({p:c, ref: !isM(p) && !!c.father_id && F.has(c.father_id)}));
}
function nodeHtml(p, depth, seen, F, viaMother){
  if(seen.has(p.id)) return ""; seen.add(p.id);
  const kids = nodeKids(p, F);
  const sp = spousesOf(p).filter(s => s.person || s.name).map(s => s.person ? s.person.name1 : s.name.split(" ")[0]);
  const fa = viaMother && S.byId.get(p.father_id);
  const sub = [`#${p.serial}`, kids.length && `${kids.length} أبناء`, sp.length && `${isM(p) ? "زوجته" : "زوجها"} ${sp.join("، ")}`, fa && `ابن${isM(p) ? "" : "ة"} ${fa.name1} ${fa.name2 || ""}`.trim()].filter(Boolean).join(" · ");
  return `<li><button type="button" class="tog ${kids.length ? "" : "leaf"}" aria-label="فتح/طي">${depth < 2 ? "−" : "+"}</button><button type="button" class="node ${isM(p) ? "" : "f"} ${isDead(p) ? "dead" : ""}" data-open="${p.id}">${avatar(p, "sm")}<span><b>${esc(p.name1)}</b> <small>${esc(sub)}</small></span></button>
    ${kids.length ? `<ul ${depth < 2 ? "" : "hidden"}>${kids.map(k => k.ref ? refHtml(k.p) : nodeHtml(k.p, depth + 1, seen, F, !isM(p))).join("")}</ul>` : ""}</li>`;
}
function refHtml(c){
  const f = S.byId.get(c.father_id);
  return `<li><button type="button" class="tog leaf" tabindex="-1" aria-hidden="true"></button><button type="button" class="node ref ${isM(c) ? "" : "f"}" data-open="${c.id}">${avatar(c, "sm")}<span><b>${esc(c.name1)}</b> <small>#${c.serial} · يظهر تحت أبيه ${esc(f ? f.name1 : "")}</small></span></button></li>`;
}
