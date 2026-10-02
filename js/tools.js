/* ===== الإعدادات، المستخدمون، الاستيراد والتصدير، واتساب ===== */

/* ---------- الإعدادات والقوائم ---------- */
const LK_COL = {governorate:"governorate", area:"area", branch:"branch", family:"family", nickname:"nickname", marital:"marital", blood:"blood",
  education:"education", specialization:"specialization", job:"job", workside:"workside", hobby:"hobby", birthplace:"birth_place", burial:"burial_place"};
let LK_KIND = "area", LK_GOV = "";
function renderSettings(){
  $("#view").innerHTML = `
    <div class="page-h"><h2>الإعدادات والقوائم</h2></div>
    <p class="muted" style="margin-top:0">هذه القوائم تظهر كخيارات في شاشة السجل. تعديل اسم عنصر يحدّث السجلات التي تستخدمه.</p>
    <div class="tabs" role="tablist">${Object.entries(LOOKUP_KINDS).map(([k, v]) => `<button type="button" class="tab ${k === LK_KIND ? "on" : ""}" data-kind="${k}">${v.label} <small class="muted">(${(S.lookups[k] || []).length})</small></button>`).join("")}</div>
    <div id="lkBox"></div>`;
  $$("[data-kind]").forEach(b => b.onclick = () => { LK_KIND = b.dataset.kind; renderSettings(); });
  drawLookups();
}
function drawLookups(){
  const k = LK_KIND, def = LOOKUP_KINDS[k], isArea = k === "area";
  let rows = S.lookups[k] || [];
  if(isArea && LK_GOV) rows = rows.filter(r => r.parent === LK_GOV);
  const used = v => S.people.filter(p => p[LK_COL[k]] === v).length;
  $("#lkBox").innerHTML = `
    <form class="card toolbar" id="lkForm" novalidate style="align-items:flex-end">
      <div class="field" style="flex:2 1 200px"><label for="lkName">إضافة إلى «${def.label}»</label><input class="inp" id="lkName" maxlength="80" required placeholder="الاسم الجديد"></div>
      ${isArea ? `<div class="field" style="flex:1 1 180px"><label for="lkParent">المحافظة</label><select class="inp" id="lkParent">${lk("governorate").map(g => `<option ${g === LK_GOV ? "selected" : ""}>${esc(g)}</option>`).join("")}</select></div>` : ""}
      <button class="btn primary" type="submit">إضافة</button>
    </form>
    ${isArea ? `<div class="toolbar"><select class="inp" id="lkGov" style="max-width:260px" aria-label="تصفية حسب المحافظة">${opt(lk("governorate"), LK_GOV, "كل المحافظات")}</select></div>` : ""}
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>الاسم</th>${isArea ? "<th>المحافظة</th>" : ""}<th>مستخدم في</th><th style="text-align:end">إجراءات</th></tr></thead><tbody>
      ${rows.length ? rows.map(r => `<tr><td><b>${esc(r.name)}</b></td>${isArea ? `<td>${esc(r.parent || "")}</td>` : ""}<td class="num">${used(r.name)} سجل</td>
        <td style="text-align:end;white-space:nowrap"><button class="btn small" data-up="${r.id}" aria-label="تحريك للأعلى">▲</button> <button class="btn small" data-down="${r.id}" aria-label="تحريك للأسفل">▼</button>
        <button class="btn small" data-ren="${r.id}">تعديل</button> <button class="btn small danger" data-del="${r.id}">حذف</button></td></tr>`).join("")
        : `<tr><td colspan="4" class="empty">القائمة فارغة — أضف أول عنصر من الأعلى</td></tr>`}
    </tbody></table></div>`;
  if($("#lkGov")) $("#lkGov").onchange = e => { LK_GOV = e.target.value; drawLookups(); };
  $("#lkForm").onsubmit = async e => {
    e.preventDefault(); const name = $("#lkName").value.trim(); if(!name) return;
    const list = S.lookups[k] || [];
    const row = {kind:k, name, parent:isArea ? $("#lkParent").value : null, sort:list.reduce((m, x) => Math.max(m, x.sort), 0) + 1};
    const {data, error} = await db.from("fa_lookups").insert(row).select().single();
    if(error){ toast(error.code === "23505" ? "هذا الاسم موجود في القائمة" : errMsg(error), true); return; }
    (S.lookups[k] ||= []).push(data); toast("تمت الإضافة"); renderSettings(); $("#lkName")?.focus();
  };
  $("#lkBox").querySelector("tbody").onclick = async e => {
    const b = e.target.closest("button"); if(!b) return;
    const list = S.lookups[k], id = +(b.dataset.up || b.dataset.down || b.dataset.ren || b.dataset.del), r = list.find(x => x.id === id);
    if(b.dataset.del){
      const n = used(r.name);
      if(!(await ask("حذف من القائمة", `حذف «${r.name}»؟${n ? ` السجلات الـ${n} التي تستخدمه تبقى كما هي.` : ""}`, {okText:"حذف", danger:true}))) return;
      const {error} = await db.from("fa_lookups").delete().eq("id", id); if(error) return toast(errMsg(error), true);
      S.lookups[k] = list.filter(x => x.id !== id); renderSettings(); return;
    }
    if(b.dataset.ren){
      const name = await ask("تعديل الاسم", `الاسم الجديد بدل «${r.name}»`, {input:true, value:r.name}); if(name === null || !name.trim()) return;
      const upd = {name:name.trim()};
      if(isArea){ const g = await ask("المحافظة", "اكتب المحافظة", {input:true, value:r.parent || ""}); if(g !== null && g.trim()) upd.parent = g.trim(); }
      const {data, error} = await db.from("fa_lookups").update(upd).eq("id", id).select().single();
      if(error) return toast(error.code === "23505" ? "هذا الاسم موجود في القائمة" : errMsg(error), true);
      const old = r.name; Object.assign(r, data);
      if(old !== data.name && used(old)){
        const col = LK_COL[k]; const res = await db.from("fa_people").update({[col]:data.name}).eq(col, old).select();
        if(res.error) toast("تعذر تحديث السجلات: " + errMsg(res.error), true); else res.data.forEach(upsertLocal);
      }
      if(k === "governorate"){ const res = await db.from("fa_lookups").update({parent:data.name}).eq("kind", "area").eq("parent", old).select(); if(!res.error) res.data.forEach(x => Object.assign(S.lookups.area.find(a => a.id === x.id) || {}, x)); }
      toast("تم التعديل"); renderSettings(); return;
    }
    const i = list.indexOf(r), j = b.dataset.up ? i - 1 : i + 1;
    if(j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((x, n) => x.sort = n + 1);
    const res = await Promise.all([list[i], list[j]].map(x => db.from("fa_lookups").update({sort:x.sort}).eq("id", x.id)));
    if(res.some(x => x.error)) toast("تعذر حفظ الترتيب", true);
    drawLookups();
  };
}

/* ---------- المستخدمون ---------- */
async function renderUsers(){
  $("#view").innerHTML = `
    <div class="page-h"><h2>المستخدمون والصلاحيات</h2></div>
    <form class="card" id="uForm" novalidate>
      <h3>إضافة مستخدم</h3>
      <div class="fgrid">
        <div class="field req"><label for="uEmail">البريد الإلكتروني</label><input class="inp ltr" id="uEmail" type="email" required></div>
        <div class="field"><label for="uName">الاسم</label><input class="inp" id="uName" maxlength="60"></div>
        <div class="field"><label for="uRole">النوع</label><select class="inp" id="uRole"><option value="user">مستخدم</option><option value="admin">مدير (كل الصلاحيات)</option></select></div>
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin:10px 0">
        <label class="check"><input type="checkbox" id="uAdd" checked> إضافة</label>
        <label class="check"><input type="checkbox" id="uEdit" checked> تعديل</label>
        <label class="check"><input type="checkbox" id="uDel"> حذف</label>
      </div>
      <div class="err" id="uErr"></div>
      <button class="btn primary" type="submit">إضافة المستخدم</button>
      <p class="muted" style="font-size:13px;margin-bottom:0">بعد الإضافة: يفتح المستخدم رابط البرنامج، يكتب بريده وكلمة سر جديدة، ويضغط «أول مرة؟ أنشئ كلمة سر». المستخدم بدون أي صلاحية يستطيع المشاهدة والتقارير فقط.</p>
    </form>
    <div class="card"><div class="tbl-wrap" style="border:0"><table class="tbl"><thead><tr><th>البريد</th><th>الاسم</th><th>النوع</th><th>إضافة</th><th>تعديل</th><th>حذف</th><th></th></tr></thead><tbody id="uBody"><tr><td colspan="7"><div class="spin"></div></td></tr></tbody></table></div></div>`;
  const load = async () => {
    const {data, error} = await db.from("fa_users").select("*").order("created_at");
    if(error){ $("#uBody").innerHTML = `<tr><td colspan="7" class="err">${esc(errMsg(error))}</td></tr>`; return; }
    $("#uBody").innerHTML = data.map(u => { const me = u.email === S.email, adm = u.role === "admin";
      const cb = f => `<input type="checkbox" data-u="${esc(u.email)}" data-f="${f}" ${u[f] || adm ? "checked" : ""} ${adm || me ? "disabled" : ""} aria-label="${f}">`;
      return `<tr><td class="ltr" style="text-align:start">${esc(u.email)}</td><td>${esc(u.display_name || "")}</td>
        <td><select class="inp" data-u="${esc(u.email)}" data-f="role" ${me ? "disabled" : ""} style="min-width:110px"><option value="user" ${adm ? "" : "selected"}>مستخدم</option><option value="admin" ${adm ? "selected" : ""}>مدير</option></select></td>
        <td>${cb("can_add")}</td><td>${cb("can_edit")}</td><td>${cb("can_delete")}</td>
        <td style="text-align:end">${me ? '<span class="muted" style="font-size:13px">أنت</span>' : `<button class="btn small danger" type="button" data-rm="${esc(u.email)}">إزالة</button>`}</td></tr>`; }).join("");
  };
  $("#uRole").onchange = e => { const a = e.target.value === "admin"; ["#uAdd","#uEdit","#uDel"].forEach(s => { $(s).checked = a || $(s).checked; $(s).disabled = a; }); };
  $("#uForm").onsubmit = async e => {
    e.preventDefault(); $("#uErr").textContent = "";
    const email = $("#uEmail").value.trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ $("#uErr").textContent = "اكتب بريداً صحيحاً"; return; }
    const adm = $("#uRole").value === "admin";
    const row = {email, display_name:$("#uName").value.trim() || null, role:$("#uRole").value, can_add:adm || $("#uAdd").checked, can_edit:adm || $("#uEdit").checked, can_delete:adm || $("#uDel").checked};
    const {error} = await db.from("fa_users").insert(row);
    if(error){ $("#uErr").textContent = error.code === "23505" ? "هذا البريد مضاف مسبقاً" : errMsg(error); return; }
    toast("تمت إضافة المستخدم"); $("#uForm").reset(); load();
  };
  $("#uBody").onchange = async e => {
    const el = e.target.closest("[data-u]"); if(!el) return;
    const f = el.dataset.f, v = f === "role" ? el.value : el.checked;
    const upd = {[f]:v}; if(f === "role" && v === "admin") Object.assign(upd, {can_add:true, can_edit:true, can_delete:true});
    const {error} = await db.from("fa_users").update(upd).eq("email", el.dataset.u);
    toast(error ? errMsg(error) : "تم الحفظ", !!error); load();
  };
  $("#uBody").onclick = async e => {
    const b = e.target.closest("[data-rm]"); if(!b) return;
    if(!(await ask("إزالة مستخدم", `إزالة ${b.dataset.rm} من البرنامج؟`, {okText:"إزالة", danger:true}))) return;
    const {error} = await db.from("fa_users").delete().eq("email", b.dataset.rm);
    toast(error ? errMsg(error) : "تمت الإزالة", !!error); load();
  };
  load();
}

/* ---------- الاستيراد والتصدير ---------- */
const XL_EXTRA = {father:"رقم الأب", mother:"رقم الأم", spouses:"الأزواج/الزوجات"};
function personToRow(p){
  const r = {};
  Object.entries(FIELDS).forEach(([k, f]) => { r[f.xl] = p[k] ?? ""; });
  r[XL_EXTRA.father] = S.byId.get(p.father_id)?.serial ?? "";
  r[XL_EXTRA.mother] = S.byId.get(p.mother_id)?.serial ?? "";
  r[XL_EXTRA.spouses] = spousesOf(p).filter(s => s.own).map(spouseLabel).join("، ");
  return r;
}
async function exportPeople(list, name){
  if(!list.length){ toast("لا توجد سجلات للتصدير", true); return; }
  try{ await exportXlsx(list.map(personToRow), "الأفراد", name + "-" + todayISO()); }
  catch(err){ toast(errMsg(err), true); }
}
let IMP = null;
function renderData(){
  $("#view").innerHTML = `
    <div class="page-h"><h2>استيراد وتصدير</h2></div>
    <div class="card"><h3>تصدير</h3>
      <p class="muted" style="margin-top:0">ملف Excel فيه كل الحقول، مع أرقام تسلسل الأب والأم لإعادة الاستيراد لاحقاً.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" type="button" id="xAll">تصدير كل السجلات (${S.people.length})</button>
      <button class="btn" type="button" id="xTpl">تنزيل قالب فارغ للاستيراد</button></div></div>
    <div class="card" ${isAdmin() ? "" : "hidden"}><h3>استيراد من Excel</h3>
      <p class="muted" style="margin-top:0">استخدم نفس عناوين أعمدة القالب. السطر الذي رقم تسلسله موجود <b>يُحدَّث</b>، والجديد <b>يُضاف</b>. عمودا «رقم الأب» و«رقم الأم» يربطان الأبناء تلقائياً.</p>
      <input type="file" id="impFile" accept=".xlsx,.xls,.csv" class="inp">
      <div id="impOut" style="margin-top:12px"></div>
      <button class="btn primary" type="button" id="impGo" disabled style="margin-top:10px">تنفيذ الاستيراد</button></div>`;
  $("#xAll").onclick = () => exportPeople(S.people, "سجل-العائلة-كامل");
  $("#xTpl").onclick = async () => { try{ await loadScript(XLSX_URL); const ws = XLSX.utils.aoa_to_sheet([Object.values(FIELDS).map(f => f.xl).concat([XL_EXTRA.father, XL_EXTRA.mother])]); const wb = XLSX.utils.book_new(); wb.Workbook = {Views:[{RTL:true}]}; XLSX.utils.book_append_sheet(wb, ws, "الأفراد"); XLSX.writeFile(wb, "قالب-استيراد-العائلة.xlsx"); }catch(err){ toast(errMsg(err), true); } };
  $("#impFile").onchange = readImport;
  $("#impGo").onclick = runImport;
}
function xlDate(v){
  if(v === "" || v == null) return null;
  if(v instanceof Date && !isNaN(v)) return new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  if(typeof v === "number"){ const d = new Date(Math.round((v - 25569) * 864e5)); return d.toISOString().slice(0, 10); }
  const s = String(v).trim(); let m;
  if((m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  if((m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/))) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if((m = s.match(/^(\d{4})$/))) return `${m[1]}-01-01`;
  return undefined;
}
async function readImport(e){
  const file = e.target.files[0]; IMP = null; $("#impGo").disabled = true; if(!file) return;
  $("#impOut").innerHTML = '<div class="spin"></div>';
  try{
    await loadScript(XLSX_URL);
    const wb = XLSX.read(await file.arrayBuffer(), {cellDates:true});
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:""});
    const xl2k = Object.fromEntries(Object.entries(FIELDS).map(([k, f]) => [norm(f.xl), k]));
    const rows = [], errs = [], serials = new Set();
    raw.forEach((r, i) => {
      const o = {}, line = i + 2; let fa = null, mo = null;
      Object.entries(r).forEach(([h, v]) => {
        const hk = norm(h);
        if(hk === norm(XL_EXTRA.father)) fa = parseInt(v, 10) || null;
        else if(hk === norm(XL_EXTRA.mother)) mo = parseInt(v, 10) || null;
        else if(xl2k[hk]) o[xl2k[hk]] = typeof v === "string" ? v.trim() : v;
      });
      if(Object.values(o).every(v => v === "" || v == null)) return;
      const serial = parseInt(o.serial, 10);
      if(!(serial > 0)){ errs.push(`سطر ${line}: رقم التسلسل مفقود`); return; }
      if(serials.has(serial)){ errs.push(`سطر ${line}: رقم التسلسل ${serial} مكرر في الملف`); return; }
      if(!o.name1){ errs.push(`سطر ${line}: الاسم الأول مفقود`); return; }
      const row = {};
      Object.keys(FIELDS).forEach(k => { if(k in o){ let v = o[k]; if(v === "") v = null; if(v != null && typeof v !== "string" && !["birth_date","death_date"].includes(k)) v = String(v); row[k] = v; } });
      row.serial = serial;
      for(const k of ["birth_date","death_date"]) if(k in o){ const d = xlDate(o[k]); if(d === undefined){ errs.push(`سطر ${line}: تاريخ غير مفهوم «${o[k]}»`); return; } row[k] = d; }
      if(row.cpr != null){ row.cpr = String(row.cpr).replace(/\D/g, ""); if(!/^\d{9}$/.test(row.cpr)){ errs.push(`سطر ${line}: الرقم الشخصي يجب أن يكون 9 أرقام`); return; } }
      if(row.gender && !["ذكر","أنثى"].includes(row.gender)){ const g = norm(row.gender); row.gender = /^(ذكر|m|male)$/.test(g) ? "ذكر" : /^(انثي|f|female)$/.test(g) ? "أنثى" : null; }
      if(row.affiliation != null) row.affiliation = /زواج|نسيب|صهر/.test(row.affiliation) ? "منتسب بالزواج" : /عائل|نسب/.test(row.affiliation) ? "من العائلة" : null;
      if(row.status != null) row.status = /متوف/.test(row.status) ? "متوفى" : "على قيد الحياة";
      if(row.area && !row.governorate) row.governorate = govOfArea(row.area) || null;
      serials.add(serial); rows.push({row, fa, mo});
    });
    const upd = rows.filter(x => S.bySerial.has(x.row.serial)).length;
    IMP = {rows};
    $("#impOut").innerHTML = `<div class="notice ${errs.length ? "" : "okbox"}">جاهز: <b>${rows.length - upd}</b> سجل جديد، و<b>${upd}</b> تحديث لسجلات موجودة.${errs.length ? `<br>سيتم تجاهل ${errs.length} سطر:<br>${errs.slice(0, 15).map(esc).join("<br>")}${errs.length > 15 ? "<br>…" : ""}` : ""}</div>`;
    $("#impGo").disabled = !rows.length;
  }catch(err){ $("#impOut").innerHTML = `<p class="err">${esc(errMsg(err))}</p>`; }
}
async function runImport(){
  if(!IMP) return;
  if(!(await ask("تأكيد الاستيراد", `استيراد ${IMP.rows.length} سجل؟ السجلات الموجودة بنفس رقم التسلسل ستُحدَّث.`, {okText:"استيراد"}))) return;
  const btn = $("#impGo"); btn.disabled = true; btn.textContent = "جاري الاستيراد…";
  try{
    for(let i = 0; i < IMP.rows.length; i += 200){
      const batch = IMP.rows.slice(i, i + 200).map(x => x.row);
      const {data, error} = await db.from("fa_people").upsert(batch, {onConflict:"serial"}).select(); if(error) throw error;
      data.forEach(upsertLocal);
    }
    const links = IMP.rows.filter(x => x.fa || x.mo).map(x => {
      const me = S.bySerial.get(x.row.serial), f = S.bySerial.get(x.fa), m = S.bySerial.get(x.mo);
      return me && {id:me.id, father_id:f && f.id !== me.id ? f.id : me.father_id ?? null, mother_id:m && m.id !== me.id ? m.id : me.mother_id ?? null};
    }).filter(Boolean);
    for(const l of links){ const {data, error} = await db.from("fa_people").update({father_id:l.father_id, mother_id:l.mother_id}).eq("id", l.id).select().single(); if(!error) upsertLocal(data); }
    toast(`تم استيراد ${IMP.rows.length} سجل ✓`); renderData();
  }catch(err){ toast(errMsg(err), true); btn.disabled = false; btn.textContent = "تنفيذ الاستيراد"; }
}

/* ---------- مراسلة واتساب ---------- */
const WA = {msg:"السلام عليكم {الاسم}،\n", src:"sel", branch:"", gov:"", sent:new Set()};
function renderWhatsapp(){
  if(!S.sel.size && WA.src === "sel") WA.src = "all";
  $("#view").innerHTML = `
    <div class="page-h"><h2>مراسلة واتساب</h2></div>
    <div class="card">
      <div class="field"><label for="waMsg">نص الرسالة</label><textarea class="inp" id="waMsg" maxlength="2000">${esc(WA.msg)}</textarea></div>
      <p class="muted" style="font-size:13px">اكتب <b>{الاسم}</b> ليُستبدل بالاسم الأول لكل شخص، و<b>{الاسم_الكامل}</b> للاسم الكامل.</p>
      <div class="toolbar" style="margin:0">
        <select class="inp" id="waSrc" aria-label="المستلمون"><option value="sel" ${WA.src === "sel" ? "selected" : ""}>المحددون من شاشة البحث (${S.sel.size})</option><option value="all" ${WA.src === "all" ? "selected" : ""}>كل الأحياء الذين لديهم هاتف</option></select>
        <select class="inp" id="waBranch" aria-label="الفرع" ${WA.src === "sel" ? "hidden" : ""}>${opt(lkUsed("branch"), WA.branch, "كل الفروع")}</select>
        <select class="inp" id="waGov" aria-label="المحافظة" ${WA.src === "sel" ? "hidden" : ""}>${opt(lk("governorate"), WA.gov, "كل المحافظات")}</select>
      </div>
    </div>
    <div class="notice" style="margin-top:14px">واتساب لا يسمح بالإرسال الجماعي التلقائي، لذلك اضغط «إرسال» لكل شخص؛ تنفتح المحادثة والرسالة جاهزة، ثم اضغط إرسال في واتساب.</div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>الاسم</th><th>الهاتف</th><th></th></tr></thead><tbody id="waBody"></tbody></table></div>`;
  $("#waMsg").oninput = e => { WA.msg = e.target.value; };
  $("#waSrc").onchange = e => { WA.src = e.target.value; renderWhatsapp(); };
  $("#waBranch").onchange = e => { WA.branch = e.target.value; drawWa(); };
  $("#waGov").onchange = e => { WA.gov = e.target.value; drawWa(); };
  $("#waBody").onclick = e => { const a = e.target.closest("[data-wa]"); if(!a) return;
    a.href = waLink(S.byId.get(+a.dataset.wa).phone, WA.msg.replaceAll("{الاسم_الكامل}", fullName(S.byId.get(+a.dataset.wa), 3)).replaceAll("{الاسم}", S.byId.get(+a.dataset.wa).name1));
    WA.sent.add(+a.dataset.wa); setTimeout(drawWa, 300); };
  drawWa();
}
function drawWa(){
  let list = WA.src === "sel" ? S.people.filter(p => S.sel.has(p.id)) : S.people.filter(p => !isDead(p) && (!WA.branch || p.branch === WA.branch) && (!WA.gov || p.governorate === WA.gov));
  const ok = list.filter(p => waNumber(p.phone)), bad = list.length - ok.length;
  $("#waBody").innerHTML = (ok.length ? ok.map(p => `<tr><td class="num">${p.serial}</td><td>${esc(fullName(p, 3))}</td><td class="ltr" style="text-align:start">${esc(p.phone)}</td>
      <td style="text-align:end">${WA.sent.has(p.id) ? '<span class="chip">✓ فُتحت</span> ' : ""}<a class="btn small wa" data-wa="${p.id}" href="#" target="_blank" rel="noopener">إرسال</a></td></tr>`).join("")
    : `<tr><td colspan="4" class="empty">${WA.src === "sel" ? "لم تحدد أحداً بعد — حدّد الأشخاص من شاشة «البحث والملفات»" : "لا يوجد أحد لديه رقم هاتف صحيح"}</td></tr>`)
    + (bad ? `<tr><td colspan="4" class="muted" style="font-size:13px">${bad} شخص بدون رقم هاتف صالح لم يظهروا في القائمة</td></tr>` : "");
}
