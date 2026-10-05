/* ===== شاشة الملف الكامل (إضافة / تعديل / عرض) ===== */
const R = {p:null, isNew:false, editable:false, spouses:[], photoBlob:null, photoRemoved:false};

const TABS = [
  ["t1","البيانات الشخصية"],["t2","النسب والزواج"],["t3","السكن والاتصال"],["t4","التعليم والعمل"],["t5","الحالة والصحة"],["t6","الملاحظات"],
];
const TAB_FIELDS = {
  t1:["serial","cpr","name1","name2","name3","name4","name5","name6","family","branch","affiliation","nickname","gender","birth_date","_age","birth_place"],
  t3:["phone","phone2","email","governorate","area","house_no","flat_no","road_no","block_no"],
  t4:["education","specialization","job","workside","hobby"],
  t5:["status","death_date","burial_place","marital","blood"],
};

function fieldHtml(k, v){
  const ro = !R.editable;
  if(k === "_age") return `<div class="field"><label for="f__age">العمر</label><input class="inp" id="f__age" readonly tabindex="-1" value="${esc(ageOf(R.p))}"></div>`;
  const f = FIELDS[k], id = "f_" + k, req = ["serial","name1"].includes(k);
  const dead = ["death_date","burial_place"].includes(k);
  let ctl;
  if(f.type === "textarea") ctl = `<textarea class="inp" id="${id}" name="${k}" maxlength="8000" ${ro ? "readonly" : ""}>${esc(v)}</textarea>`;
  else if(f.opts || (f.lk && !f.free)){
    let opts = f.opts || (k === "area" ? areasOf(R.p.governorate) : lk(f.lk));
    if(v && !opts.includes(v)) opts = opts.concat([v]); // قيمة قديمة غير موجودة في القائمة
    ctl = `<select class="inp${f.ltr ? " ltr" : ""}" id="${id}" name="${k}" ${ro ? "disabled" : ""}>${k === "status" ? "" : '<option value=""></option>'}${opts.map(o => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  }else if(f.lk && f.free){
    const sug = [...new Set([...lk(f.lk), ...S.people.map(x => x[k]).filter(Boolean)])];
    ctl = `<input class="inp" id="${id}" name="${k}" value="${esc(v)}" maxlength="80" list="dl_${k}" autocomplete="off" ${ro ? "readonly" : ""}><datalist id="dl_${k}">${sug.map(o => `<option value="${esc(o)}">`).join("")}</datalist>`;
  }else{
    const t = k === "serial" ? "number" : f.type || "text";
    const extra = k === "serial" ? ' inputmode="numeric" min="1"' : k === "cpr" ? ' inputmode="numeric" maxlength="9"' : t === "tel" ? ' inputmode="tel" maxlength="15"' : ' maxlength="80"';
    ctl = `<input class="inp${f.ltr || ["serial","cpr"].includes(k) ? " ltr" : ""}" id="${id}" name="${k}" type="${t}" value="${esc(v)}"${extra} ${ro ? "readonly" : ""}>`;
  }
  return `<div class="field${req ? " req" : ""}" data-k="${k}" ${dead && R.p.status !== "متوفى" ? "hidden" : ""}><label for="${id}">${esc(f.label)}</label>${ctl}<div class="ferr" id="e_${k}"></div></div>`;
}
function linkHtml(key, label, person, nameOnly){
  const has = person || nameOnly;
  return `<div class="field"><label>${label}</label><div class="linkf">
    <button type="button" class="pv ${has ? "" : "empty"}" data-link="${key}" ${R.editable ? "" : "disabled"}>${person ? nm(person, fullName(person, 4)) + ` <small class="muted">#${person.serial}</small>` : nameOnly ? esc(nameOnly) + ' <small class="muted">(غير مسجل)</small>' : R.editable ? "اختر من السجلات…" : "—"}</button>
    ${person ? `<a class="btn small" href="#/rec/${person.id}" title="فتح السجل">فتح</a>` : ""}
    ${has && R.editable ? `<button type="button" class="btn small" data-unlink="${key}" aria-label="إزالة">✕</button>` : ""}</div></div>`;
}

async function renderRecord(id, newSerial){
  R.photoBlob = null; R.photoRemoved = false;
  if(id){
    const p = S.byId.get(id);
    if(!p){ $("#view").innerHTML = isRestricted() ? `<div class="card narrow empty">لا تملك صلاحية الاطلاع على بيانات هذا الفرد. <a href="#/tree">العودة للشجرة</a></div>` : `<div class="card narrow empty">السجل غير موجود — ربما حُذف. <a href="#/list">العودة للبحث</a></div>`; return; }
    R.p = {...p}; R.isNew = false; R.editable = can("edit");
    R.spouses = S.spouses.filter(s => s.person_id === p.id).map(s => ({ord:s.ord, spouse_id:s.spouse_id, spouse_name:s.spouse_name || ""}));
  }else{
    if(S.bySerial.get(newSerial)){ location.hash = "#/rec/" + S.bySerial.get(newSerial).id; return; }
    R.p = {serial:newSerial, status:"على قيد الحياة", family:lk("family")[0] || "", branch:lk("branch")[0] || ""};
    R.isNew = true; R.editable = can("add"); R.spouses = [];
  }
  drawRecord();
}
function drawRecord(activeTab){
  const p = R.p, tab = activeTab || $(".tab.on")?.dataset.tab || "t1";
  const f = S.byId.get(p.father_id), m = S.byId.get(p.mother_id);
  $("#crumb").textContent = R.isNew ? "سجل جديد" : "الملف الكامل";
  $("#view").innerHTML = `
    <div class="page-h"><h2>${R.isNew ? "سجل جديد" : R.editable ? "تعديل السجل" : "الملف الكامل"}</h2>
      <div class="acts" ${R.isNew ? "hidden" : ""}>
        <a class="btn small" href="#/family/${p.id}">الأسرة</a>
        <a class="btn small" href="#/tree/${p.id}">الشجرة</a>
        <button class="btn small" type="button" id="rRepS">تقرير مختصر</button>
        <button class="btn small" type="button" id="rRepL">تقرير مطوّل</button>
        ${waLink(p.phone) ? `<a class="btn small wa" target="_blank" rel="noopener" href="${esc(waLink(p.phone))}">واتساب</a>` : ""}
        ${can("delete") ? `<button class="btn small danger" type="button" id="rDel">حذف</button>` : ""}
      </div></div>
    <div class="rec-top">
      <div class="photo" id="rPhoto" role="${R.editable ? "button" : "img"}" tabindex="${R.editable ? 0 : -1}" aria-label="الصورة الشخصية">${R.editable ? "إضافة صورة" : "لا توجد صورة"}</div>
      <input type="file" id="rFile" accept="image/*" hidden>
      <div class="rec-name"><h2 id="rTitle" class="${gcls(p)}">${esc(longName(p) || "اسم جديد")}</h2>
        <div class="meta"><span class="chip gold">رقم ${esc(p.serial)}</span>${p.gender ? `<span class="chip ${isM(p) ? "" : "f"}">${esc(p.gender)}</span>` : ""}${isDead(p) ? '<span class="chip dead">متوفى</span>' : ""}${ageOf(p) !== "" ? `<span class="chip">${ageOf(p)} سنة</span>` : ""}${p.branch ? `<span class="chip">فرع ${esc(p.branch)}</span>` : ""}${p.affiliation === "منتسب بالزواج" ? '<span class="chip inlaw">منتسب بالزواج</span>' : ""}</div>
        ${R.editable ? "" : '<p class="muted" style="font-size:13px;margin:6px 0 0">للعرض فقط — ليست لديك صلاحية التعديل.</p>'}
      </div>
      ${R.editable && !R.isNew ? `<button class="btn small" type="button" id="rRmPhoto" ${p.photo_path ? "" : "hidden"}>حذف الصورة</button>` : ""}
    </div>
    <div class="tabs" role="tablist">${TABS.map(([k, t]) => `<button type="button" role="tab" class="tab ${k === tab ? "on" : ""}" data-tab="${k}" aria-selected="${k === tab}">${t}</button>`).join("")}</div>
    <form id="recForm" novalidate>
      <div class="tabpane" data-pane="t1" ${tab === "t1" ? "" : "hidden"}><div class="fgrid">${TAB_FIELDS.t1.map(k => fieldHtml(k, p[k] ?? "")).join("")}</div>
        <p class="muted" style="font-size:13px">عند اختيار الأب من تبويب «النسب والزواج» تُعبّأ أسماء الأجداد والعائلة والفرع تلقائياً.</p></div>
      <div class="tabpane" data-pane="t2" ${tab === "t2" ? "" : "hidden"}>
        <div class="fgrid">
          ${linkHtml("father_id", "الأب", f)}
          ${linkHtml("mother_id", "الأم", m, !m && p.mother_name)}
          ${!m && R.editable ? `<div class="field"><label for="f_mother_name">أو اكتب اسم الأم (إن لم تكن مسجلة)</label><input class="inp" id="f_mother_name" name="mother_name" value="${esc(p.mother_name || "")}" maxlength="120"></div>` : ""}
        </div>
        <h3 style="font-size:16px;margin:20px 0 10px;color:var(--brand-d)">${isM(p) ? "الزوجات (حتى 4)" : "الزوج"}</h3>
        <div id="spBox">${spouseRows()}</div>
        ${derivedHtml()}
      </div>
      <div class="tabpane" data-pane="t3" ${tab === "t3" ? "" : "hidden"}><div class="fgrid">${TAB_FIELDS.t3.map(k => fieldHtml(k, p[k] ?? "")).join("")}</div></div>
      <div class="tabpane" data-pane="t4" ${tab === "t4" ? "" : "hidden"}><div class="fgrid">${TAB_FIELDS.t4.map(k => fieldHtml(k, p[k] ?? "")).join("")}</div></div>
      <div class="tabpane" data-pane="t5" ${tab === "t5" ? "" : "hidden"}><div class="fgrid">${TAB_FIELDS.t5.map(k => fieldHtml(k, p[k] ?? "")).join("")}</div></div>
      <div class="tabpane" data-pane="t6" ${tab === "t6" ? "" : "hidden"}><div class="fgrid">${fieldHtml("notes", p.notes ?? "").replace('class="field', 'class="field wide')}</div>
        ${p.updated_at ? `<p class="muted" style="font-size:13px">آخر تعديل ${fmtDate(p.updated_at.slice(0, 10))}${p.updated_by ? " بواسطة " + esc(p.updated_by) : ""}</p>` : ""}</div>
      <div class="savebar" ${R.editable ? "" : "hidden"}>
        <button class="btn primary" type="submit" id="rSave">${R.isNew ? "حفظ السجل" : "حفظ التعديلات"}</button>
        <button class="btn" type="button" id="rCancel">${R.isNew ? "إلغاء" : "تراجع عن التعديلات"}</button>
        <span class="dirty" id="rDirty" ${S.dirty ? "" : "hidden"}>● تعديلات غير محفوظة</span><span class="sp"></span>
        <span class="err" id="rErr" role="alert"></span>
      </div>
    </form>`;
  bindRecord();
  loadPhoto();
}
function spouseRows(){
  const word = isM(R.p) ? "الزوجة" : "الزوج", n = isM(R.p) ? 4 : 1;
  let h = "";
  for(let i = 1; i <= Math.max(n, ...R.spouses.map(s => s.ord)); i++){
    const s = R.spouses.find(x => x.ord === i) || {ord:i, spouse_id:null, spouse_name:""};
    const sp = S.byId.get(s.spouse_id);
    h += `<div class="spouse-row"><span class="n">${i}</span>
      <div class="linkf"><button type="button" class="pv ${sp ? "" : "empty"}" data-sp="${i}" ${R.editable ? "" : "disabled"}>${sp ? nm(sp, fullName(sp, 4)) + ` <small class="muted">#${sp.serial}</small>` : R.editable ? `اختر ${word} من السجلات…` : "—"}</button></div>
      <input class="inp sp-name" data-spname="${i}" placeholder="أو اكتب الاسم إن لم يكن مسجلاً" value="${esc(sp ? "" : s.spouse_name)}" ${sp || !R.editable ? "disabled" : ""} aria-label="اسم ${word} ${i}">
      ${R.editable && (sp || s.spouse_name) ? `<button type="button" class="btn small" data-spclr="${i}" aria-label="إزالة">✕</button>` : "<span></span>"}</div>`;
  }
  return h;
}
function derivedHtml(){
  const p = R.p; if(R.isNew && !p.father_id && !p.mother_id) return "";
  const f = S.byId.get(p.father_id), m = S.byId.get(p.mother_id);
  const lnk = x => x ? `<a href="#/rec/${x.id}">${nm(x, fullName(x, 3))}</a>` : "—";
  const others = p.id ? S.spouses.filter(s => s.spouse_id === p.id).map(s => S.byId.get(s.person_id)).filter(Boolean) : [];
  const kids = p.id ? childrenOf(p) : [];
  // الجد/الجدة يُقرآن من سجل الأب أو الأم؛ زر «ربط» يحدّث سجل الوالد مباشرة
  const slot = (label, parent, key, side) => {
    const gp = parent && S.byId.get(parent[key]);
    const canLink = parent && R.editable && can("edit");
    const btn = canLink ? ` <button type="button" class="btn small" data-gp="${parent.id}:${key}">${gp ? "تغيير" : "+ ربط"}</button>` : "";
    const empty = parent ? "—" : `<small class="muted">اربط ${side} أولاً</small>`;
    return `<div><span>${label}: </span>${gp ? lnk(gp) : empty}${btn}</div>`;
  };
  return `<div class="derived">
    ${slot("الجد لأب", f, "father_id", "الأب")}
    ${slot("الجدة لأب", f, "mother_id", "الأب")}
    ${slot("الجد لأم", m, "father_id", "الأم")}
    ${slot("الجدة لأم", m, "mother_id", "الأم")}
    ${others.length ? `<div><span>${isM(p) ? "مسجل زوجاً لـ" : "مسجلة زوجة لـ"}: </span>${others.map(lnk).join("، ")}</div>` : ""}
    ${kids.length ? `<div class="wide" style="grid-column:1/-1"><span>الأبناء (${kids.length}): </span>${kids.map(k => `<a href="#/rec/${k.id}">${esc(k.name1)}</a>`).join("، ")}</div>` : ""}
  </div>`;
}
async function loadPhoto(){
  const box = $("#rPhoto"); if(!box) return;
  if(R.photoBlob){ box.style.backgroundImage = `url(${URL.createObjectURL(R.photoBlob)})`; box.textContent = ""; return; }
  if(R.photoRemoved || !R.p.photo_path) return;
  const url = await photoUrl(R.p.photo_path);
  if(url && $("#rPhoto") === box){ box.style.backgroundImage = `url("${url}")`; box.textContent = ""; }
}
function setDirty(v){ S.dirty = v; const d = $("#rDirty"); if(d) d.hidden = !v; }

function readForm(){
  $$("#recForm [name]").forEach(el => { R.p[el.name] = el.value.trim(); });
  $$("[data-spname]").forEach(el => { const i = +el.dataset.spname; const s = R.spouses.find(x => x.ord === i);
    if(el.disabled) return;
    if(s) s.spouse_name = el.value.trim(); else if(el.value.trim()) R.spouses.push({ord:i, spouse_id:null, spouse_name:el.value.trim()}); });
}
function bindRecord(){
  const form = $("#recForm");
  $$(".tab").forEach(t => t.onclick = () => {
    $$(".tab").forEach(x => { x.classList.toggle("on", x === t); x.setAttribute("aria-selected", x === t); });
    $$(".tabpane").forEach(pn => pn.hidden = pn.dataset.pane !== t.dataset.tab);
  });
  form.addEventListener("input", e => { if(R.editable) setDirty(true);
    if(["name1","name2","name3","name4","name5","name6","family","gender"].includes(e.target.name)){ readForm(); $("#rTitle").textContent = longName(R.p) || "اسم جديد"; $("#rTitle").className = gcls(R.p); }
    if(e.target.name === "birth_date" || e.target.name === "death_date"){ readForm(); $("#f__age").value = ageOf(R.p); }
  });
  form.addEventListener("change", e => {
    const n = e.target.name; if(R.editable) setDirty(true);
    if(n === "governorate"){ readForm(); if(R.p.area && govOfArea(R.p.area) !== R.p.governorate) R.p.area = "";
      $("#f_area").innerHTML = '<option value=""></option>' + areasOf(R.p.governorate).map(o => `<option ${o === R.p.area ? "selected" : ""}>${esc(o)}</option>`).join(""); }
    if(n === "area"){ const g = govOfArea(e.target.value); if(g){ $("#f_governorate").value = g; R.p.governorate = g; } }
    if(n === "status"){ const d = e.target.value === "متوفى"; $$('[data-k="death_date"],[data-k="burial_place"]').forEach(x => x.hidden = !d); }
    if(n === "gender"){ readForm(); $("#spBox").innerHTML = spouseRows(); }
  });
  form.onsubmit = e => { e.preventDefault(); saveRecord(); };
  $("#rCancel").onclick = async () => {
    if(R.isNew){ if(!S.dirty || await ask("إلغاء", "تجاهل السجل الجديد؟", {danger:true})){ S.dirty = false; location.hash = "#/home"; } return; }
    if(S.dirty && !(await ask("تراجع", "إلغاء كل التعديلات غير المحفوظة؟", {danger:true}))) return;
    setDirty(false); renderRecord(R.p.id);
  };
  // الربط بالأب والأم
  form.addEventListener("click", async e => {
    const l = e.target.closest("[data-link]");
    if(l && R.editable){
      readForm(); const key = l.dataset.link, isF = key === "father_id";
      const p = await pickPerson(isF ? "اختيار الأب" : "اختيار الأم", {filter: x => x.id !== R.p.id && x.gender !== (isF ? "أنثى" : "ذكر") && !(R.p.id && isDescendant(R.p.id, x.id))});
      if(!p) return;
      R.p[key] = p.id;
      if(isF){ R.p.name2 = p.name1 || ""; R.p.name3 = p.name2 || ""; R.p.name4 = p.name3 || ""; R.p.name5 = p.name4 || ""; R.p.name6 = p.name5 || "";
        if(p.family) R.p.family = p.family; if(p.branch) R.p.branch = p.branch;
        if(!R.p.mother_id){ const w = spousesOf(p).filter(s => s.person); if(w.length === 1){ R.p.mother_id = w[0].person.id; R.p.mother_name = ""; } }
        toast("رُبط الأب وعُبّئت أسماء الأجداد والعائلة"); }
      else R.p.mother_name = "";
      setDirty(true); drawRecord("t2"); return;
    }
    const u = e.target.closest("[data-unlink]");
    if(u){ readForm(); R.p[u.dataset.unlink] = null; if(u.dataset.unlink === "mother_id") R.p.mother_name = ""; setDirty(true); drawRecord("t2"); return; }
    const gpb = e.target.closest("[data-gp]");
    if(gpb){
      readForm(); const [pid, key] = gpb.dataset.gp.split(":"); const parent = S.byId.get(+pid); const isF = key === "father_id";
      const pick = await pickPerson(`${isF ? "اختيار الجد" : "اختيار الجدة"} — ${isF ? "أبو" : "أم"} ${fullName(parent, 3)}`,
        {filter: x => x.id !== parent.id && x.gender !== (isF ? "أنثى" : "ذكر") && !isDescendant(parent.id, x.id)});
      if(!pick) return;
      const upd = {[key]: pick.id};
      if(isF && !parent.name2){ upd.name2 = pick.name1; upd.name3 = pick.name2 || null; upd.name4 = pick.name3 || null; upd.name5 = pick.name4 || null; upd.name6 = pick.name5 || null; }
      const {data, error} = await db.from("f4_people").update(upd).eq("id", parent.id).select().single();
      if(error){ toast(errMsg(error), true); return; }
      upsertLocal(data); toast(`تم الربط في سجل ${fullName(parent, 3)} ✓`);
      const dirty = S.dirty; drawRecord("t2"); setDirty(dirty); return;
    }
    const sp = e.target.closest("[data-sp]");
    if(sp && R.editable){
      readForm(); const i = +sp.dataset.sp;
      const pick = await pickPerson(isM(R.p) ? `اختيار الزوجة ${i}` : "اختيار الزوج", {filter: x => x.id !== R.p.id && x.gender !== (isM(R.p) ? "ذكر" : "أنثى")});
      if(!pick) return;
      if(R.spouses.some(s => s.spouse_id === pick.id && s.ord !== i)){ toast("هذا الشخص مضاف مسبقاً", true); return; }
      const s = R.spouses.find(x => x.ord === i);
      if(s){ s.spouse_id = pick.id; s.spouse_name = ""; } else R.spouses.push({ord:i, spouse_id:pick.id, spouse_name:""});
      setDirty(true); $("#spBox").innerHTML = spouseRows(); return;
    }
    const c = e.target.closest("[data-spclr]");
    if(c){ readForm(); R.spouses = R.spouses.filter(s => s.ord !== +c.dataset.spclr); setDirty(true); $("#spBox").innerHTML = spouseRows(); }
  });
  // الصورة
  const ph = $("#rPhoto");
  if(R.editable){ ph.onclick = () => $("#rFile").click(); ph.onkeydown = e => { if(e.key === "Enter" || e.key === " "){ e.preventDefault(); $("#rFile").click(); } }; }
  $("#rFile").onchange = async e => {
    const file = e.target.files[0]; if(!file) return;
    if(!file.type.startsWith("image/")){ toast("اختر ملف صورة", true); return; }
    try{ R.photoBlob = await compressImage(file); R.photoRemoved = false; setDirty(true); loadPhoto(); if($("#rRmPhoto")) $("#rRmPhoto").hidden = false; }
    catch(err){ toast("تعذر قراءة الصورة", true); }
  };
  if($("#rRmPhoto")) $("#rRmPhoto").onclick = () => { R.photoBlob = null; R.photoRemoved = true; ph.style.backgroundImage = ""; ph.textContent = "إضافة صورة"; $("#rRmPhoto").hidden = true; setDirty(true); };
  if($("#rRepS")){
    $("#rRepS").onclick = async () => printHtml(await personReport(S.byId.get(R.p.id), false));
    $("#rRepL").onclick = async () => printHtml(await personReport(S.byId.get(R.p.id), true));
  }
  if($("#rDel")) $("#rDel").onclick = () => deletePerson(S.byId.get(R.p.id), () => { S.dirty = false; location.hash = "#/list"; });
}

function validate(p){
  const errs = {};
  const serial = parseInt(p.serial, 10);
  if(!(serial > 0)) errs.serial = "رقم التسلسل مطلوب";
  else { const ex = S.bySerial.get(serial); if(ex && ex.id !== p.id) errs.serial = `الرقم مستخدم لـ «${fullName(ex, 3)}»`; }
  if(!p.name1) errs.name1 = "الاسم الأول مطلوب";
  if(p.cpr && !/^\d{9}$/.test(p.cpr)) errs.cpr = "الرقم الشخصي 9 أرقام";
  else if(p.cpr){ const ex = S.people.find(x => x.cpr === p.cpr && x.id !== p.id); if(ex) errs.cpr = `مسجل لـ «${fullName(ex, 3)}»`; }
  ["phone","phone2"].forEach(k => { if(p[k] && !/^\+?\d{8,15}$/.test(p[k].replace(/[\s-]/g, ""))) errs[k] = "رقم هاتف غير صحيح (8 أرقام على الأقل)"; });
  if(p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) errs.email = "بريد غير صحيح";
  if(p.birth_date && p.birth_date > todayISO()) errs.birth_date = "تاريخ الميلاد في المستقبل";
  if(p.death_date && p.birth_date && p.death_date < p.birth_date) errs.death_date = "تاريخ الوفاة قبل الميلاد";
  return errs;
}
const TAB_OF = k => Object.entries(TAB_FIELDS).find(([, a]) => a.includes(k))?.[0] || "t1";

async function saveRecord(){
  if(!R.editable) return;
  readForm(); const p = R.p;
  $$(".ferr").forEach(x => x.textContent = ""); $("#rErr").textContent = "";
  const errs = validate(p), keys = Object.keys(errs);
  if(keys.length){
    keys.forEach(k => { const el = $("#e_" + k); if(el) el.textContent = errs[k]; });
    const t = TAB_OF(keys[0]); $(`.tab[data-tab="${t}"]`).click(); $("#f_" + keys[0])?.focus();
    $("#rErr").textContent = "راجع الحقول المظللة"; return;
  }
  const row = {};
  DATA_COLS.forEach(k => { if(k in p || k in FIELDS){ let v = p[k]; if(typeof v === "string") v = v.trim(); row[k] = v === "" || v === undefined ? null : v; } });
  row.serial = parseInt(p.serial, 10);
  if(row.phone) row.phone = row.phone.replace(/[\s-]/g, ""); if(row.phone2) row.phone2 = row.phone2.replace(/[\s-]/g, "");
  if(row.status !== "متوفى"){ row.death_date = null; row.burial_place = null; }
  // الانتساب تلقائياً إن تُرك فارغاً: ابن/بنت لأحد من العائلة، أو من عائلة النشابة = من العائلة
  if(!row.affiliation){
    const par = [S.byId.get(row.father_id), S.byId.get(row.mother_id)].filter(Boolean);
    if(par.some(x => x.affiliation === "من العائلة") || /^النشاب[ةه]$/.test(row.family || "")) row.affiliation = "من العائلة";
    else if(R.spouses.some(s => S.byId.get(s.spouse_id)?.affiliation === "من العائلة")) row.affiliation = "منتسب بالزواج";
  }
  if(row.mother_id) row.mother_name = null;
  delete row.photo_path;
  const btn = $("#rSave"); btn.disabled = true; btn.textContent = "جاري الحفظ…";
  try{
    let saved;
    if(R.isNew){ const {data, error} = await db.from("f4_people").insert(row).select().single(); if(error) throw error; saved = data; }
    else { const {data, error} = await db.from("f4_people").update(row).eq("id", p.id).select().single(); if(error) throw error; saved = data; }
    // الصورة
    if(R.photoBlob){
      const path = `${saved.id}/${Date.now()}.jpg`;
      const {error} = await db.storage.from(PHOTO_BUCKET).upload(path, R.photoBlob, {contentType:"image/jpeg"});
      if(error) toast("حُفظ السجل لكن تعذر رفع الصورة: " + errMsg(error), true);
      else { const old = saved.photo_path; const {data} = await db.from("f4_people").update({photo_path:path}).eq("id", saved.id).select().single(); if(data) saved = data; if(old) db.storage.from(PHOTO_BUCKET).remove([old]); }
    }else if(R.photoRemoved && saved.photo_path){
      const old = saved.photo_path; const {data} = await db.from("f4_people").update({photo_path:null}).eq("id", saved.id).select().single(); if(data) saved = data; db.storage.from(PHOTO_BUCKET).remove([old]);
    }
    // الأزواج
    const want = R.spouses.filter(s => s.spouse_id || (s.spouse_name || "").trim()).map(s => ({person_id:saved.id, ord:s.ord, spouse_id:s.spouse_id || null, spouse_name:s.spouse_id ? null : s.spouse_name.trim()}));
    const del = await db.from("f4_spouses").delete().eq("person_id", saved.id); if(del.error) throw del.error;
    let newSp = [];
    if(want.length){ const {data, error} = await db.from("f4_spouses").insert(want).select(); if(error) throw error; newSp = data; }
    S.spouses = S.spouses.filter(s => s.person_id !== saved.id).concat(newSp);
    upsertLocal(saved);
    const wasNew = R.isNew;
    setDirty(false); R.photoBlob = null; R.photoRemoved = false;
    toast(wasNew ? "تم حفظ السجل الجديد ✓" : "تم حفظ التعديلات ✓");
    if(wasNew){ R.isNew = false; skipGuard = true; location.hash = "#/rec/" + saved.id; }
    else { R.p = {...saved}; R.editable = can("edit"); drawRecord($(".tab.on")?.dataset.tab); }
  }catch(err){
    $("#rErr").textContent = errMsg(err); toast(errMsg(err), true);
  }finally{
    const b = $("#rSave"); if(b){ b.disabled = false; b.textContent = R.isNew ? "حفظ السجل" : "حفظ التعديلات"; }
  }
}
