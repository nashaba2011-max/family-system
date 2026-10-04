/* ===== تسجيل عضو جديد: نموذج ← ترحيب وشروط ← طلب للإدارة ===== */
const JOIN = {step:1, data:{}};
let TERMS_CACHE = null;

async function loadTerms(){
  if(TERMS_CACHE !== null) return TERMS_CACHE;
  const {data, error} = await db.rpc("fa_get_terms");
  TERMS_CACHE = error ? "" : (data || "");
  return TERMS_CACHE;
}
/* يحوّل نص الشروط إلى فقرات: السطر القصير في أول الفقرة عنوان، والأسطر المرقّمة قائمة */
function termsHtml(txt){
  return String(txt || "").replace(/\r/g, "").split(/\n\s*\n/).map(blk => {
    const L = blk.split("\n").map(x => x.trim()).filter(Boolean); if(!L.length) return "";
    const head = L.length > 1 && L[0].length <= 50 && !/[.،؟!]$/.test(L[0]) ? L.shift() : "";
    const items = L.filter(x => /^\d+[.)-]\s*/.test(x)), plain = L.filter(x => !/^\d+[.)-]\s*/.test(x));
    return `${head ? `<h4>${esc(head)}</h4>` : ""}${plain.map(x => `<p>${esc(x)}</p>`).join("")}${items.length ? `<ol>${items.map(x => `<li>${esc(x.replace(/^\d+[.)-]\s*/, ""))}</li>`).join("")}</ol>` : ""}`;
  }).join("");
}

function openJoin(){
  JOIN.step = 1;
  JOIN.data = {email:$("#lEmail").value.trim().toLowerCase()};
  const d = $("#dJoin"); drawJoin(); d.showModal();
}
function drawJoin(){
  const b = $("#joinBody"), D = JOIN.data;
  $("#joinSteps").innerHTML = ["بياناتك", "الشروط", "تم الإرسال"].map((t, i) => `<span class="${i + 1 === JOIN.step ? "on" : i + 1 < JOIN.step ? "done" : ""}"><b>${i + 1}</b>${t}</span>`).join("");
  if(JOIN.step === 1){
    b.innerHTML = `
      <p class="muted" style="margin-top:0">سجّل بياناتك، ثم اقرأ شروط البرنامج ووافق عليها ليصل طلبك إلى الإدارة.</p>
      <form id="joinForm" novalidate class="join-form">
        <div class="field req"><label for="jName">الاسم الكامل</label><input class="inp" id="jName" maxlength="120" autocomplete="name" value="${esc(D.name || "")}" placeholder="مثال: ياسر عمار احمد النشابة"></div>
        <div class="field req"><label for="jEmail">البريد الإلكتروني</label><input class="inp ltr" id="jEmail" type="email" inputmode="email" autocomplete="username" maxlength="160" value="${esc(D.email || "")}"></div>
        <div class="field req"><label for="jPhone">رقم الهاتف</label><input class="inp ltr" id="jPhone" type="tel" inputmode="tel" maxlength="30" autocomplete="tel" value="${esc(D.phone || "")}" placeholder="3xxxxxxx"></div>
        <div class="field"><label for="jRel">صلتك بالعائلة</label><input class="inp" id="jRel" maxlength="200" value="${esc(D.relation || "")}" placeholder="مثال: ابن عمار احمد علي، أو زوجة فلان"></div>
        <div class="grid2">
          <div class="field req"><label for="jPass">كلمة السر</label><input class="inp ltr" id="jPass" type="password" autocomplete="new-password" minlength="6"></div>
          <div class="field req"><label for="jPass2">تأكيد كلمة السر</label><input class="inp ltr" id="jPass2" type="password" autocomplete="new-password" minlength="6"></div>
        </div>
        <div class="err" id="jErr" role="alert"></div>
        <button class="btn primary block" type="submit">متابعة</button>
      </form>`;
    setTimeout(() => (D.name ? $("#jPass") : $("#jName")).focus(), 30);
    $("#joinForm").onsubmit = e => {
      e.preventDefault();
      const v = {name:$("#jName").value.trim(), email:$("#jEmail").value.trim().toLowerCase(), phone:$("#jPhone").value.trim(), relation:$("#jRel").value.trim()};
      const p1 = $("#jPass").value, p2 = $("#jPass2").value, err = m => { $("#jErr").textContent = m; };
      if(v.name.split(/\s+/).length < 2) return err("اكتب اسمك الكامل (الاسم واسم الأب على الأقل)");
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return err("اكتب بريداً إلكترونياً صحيحاً");
      if(!/^\+?[\d\s-]{7,}$/.test(v.phone)) return err("اكتب رقم هاتف صحيحاً");
      if(p1.length < 6) return err("كلمة السر 6 أحرف على الأقل");
      if(p1 !== p2) return err("كلمتا السر غير متطابقتين");
      Object.assign(JOIN.data, v, {password:p1}); JOIN.step = 2; drawJoin();
    };
  }else if(JOIN.step === 2){
    b.innerHTML = `
      <div class="join-hello"><b>أهلاً بك يا ${esc(D.name.split(/\s+/)[0])}</b><span>يسعدنا انضمامك إلى برنامج عائلة النشابة</span></div>
      <div class="terms" id="jTerms" tabindex="0"><div class="spin"></div></div>
      <label class="check join-accept"><input type="checkbox" id="jAgree"> قرأت الشروط والقوانين وأوافق عليها</label>
      <div class="err" id="jErr" role="alert"></div>
      <div class="join-acts"><button class="btn" type="button" id="jBack">رجوع</button><button class="btn primary" type="button" id="jSend" disabled>أوافق وأرسل الطلب</button></div>`;
    loadTerms().then(t => { const el = $("#jTerms"); if(el) el.innerHTML = termsHtml(t) || '<p class="muted">تعذر تحميل الشروط، حاول مرة ثانية.</p>'; });
    $("#jAgree").onchange = e => { $("#jSend").disabled = !e.target.checked; };
    $("#jBack").onclick = () => { JOIN.step = 1; drawJoin(); };
    $("#jSend").onclick = sendJoin;
  }else{
    const st = D.result;
    const wa = waLink(CONTACT_WA, `السلام عليكم، سجلت طلب انضمام لبرنامج عائلة النشابة.\nالاسم: ${D.name}\nالبريد: ${D.email}\nالهاتف: ${D.phone}${D.relation ? "\nصلتي بالعائلة: " + D.relation : ""}`);
    b.innerHTML = st === "member" ? `
      <div class="join-done"><span class="jd-ic ok">✓</span><b>بريدك مضاف في البرنامج مسبقاً</b><p>ادخل ببريدك وكلمة السر التي كتبتها الآن.</p>
      <button class="btn primary block" type="button" id="jClose">الذهاب لتسجيل الدخول</button></div>` : `
      <div class="join-done"><span class="jd-ic">✓</span><b>تم إرسال طلبك إلى الإدارة</b>
      <p>ستراجع الإدارة طلبك وتحدد صلاحياتك. بعد الموافقة تستطيع الدخول ببريدك <b class="ltr">${esc(D.email)}</b> وكلمة السر التي اخترتها.</p>
      <a class="btn wa block" href="${esc(wa)}" target="_blank" rel="noopener">أبلغ الإدارة عبر واتساب (اختياري)</a>
      <button class="btn block" type="button" id="jClose">إغلاق</button></div>`;
    $("#jClose").onclick = () => { $("#dJoin").close(); $("#lEmail").value = D.email; $("#lPass").focus(); };
  }
}
async function sendJoin(){
  const D = JOIN.data, btn = $("#jSend"), err = m => { $("#jErr").textContent = m; };
  btn.disabled = true; btn.textContent = "جارٍ الإرسال…";
  try{
    const su = await db.auth.signUp({email:D.email, password:D.password, options:{data:{full_name:D.name}, emailRedirectTo:location.href.split("#")[0]}});
    if(su.error && !/already registered|already exists/i.test(su.error.message)) throw su.error;
    const {data, error} = await db.rpc("fa_request_join", {p_name:D.name, p_email:D.email, p_phone:D.phone, p_relation:D.relation || "", p_note:""});
    if(error) throw error;
    if(data === "busy") throw new Error("طلبات كثيرة الآن، حاول بعد قليل");
    if(su.data?.session && data !== "member") await db.auth.signOut();
    D.result = data; D.password = ""; JOIN.step = 3; drawJoin();
  }catch(e){ err(errMsg(e)); btn.disabled = false; btn.textContent = "أوافق وأرسل الطلب"; }
}
/* رسالة واضحة عند محاولة الدخول قبل موافقة الإدارة */
async function pendingLoginMessage(email){
  const {data} = await db.rpc("fa_request_status", {p_email:email});
  if(data === "pending") return "طلبك قيد المراجعة لدى الإدارة — ستتمكن من الدخول بعد الموافقة";
  if(data === "rejected") return "لم تتم الموافقة على طلب الانضمام. للاستفسار تواصل مع الإدارة";
  return "";
}

/* ===== شاشة المدير: طلبات الانضمام ===== */
const RQ = {tab:"pending", sel:{}};
async function refreshReqBadge(toastIt = false){
  if(!isAdmin()) return;
  const {count} = await db.from("fa_requests").select("id", {count:"exact", head:true}).eq("status", "pending");
  const b = $("#reqBadge"); if(b){ b.hidden = !count; b.textContent = count || ""; }
  if(toastIt && count){
    let shown = false; try{ shown = sessionStorage.getItem("fa-req-toast") === String(count); sessionStorage.setItem("fa-req-toast", String(count)); }catch(e){}
    if(!shown) toast(count === 1 ? "لديك طلب انضمام جديد بانتظار موافقتك" : `لديك ${count} طلبات انضمام بانتظار موافقتك`);
  }
}
async function renderRequests(){
  const v = $("#view");
  v.innerHTML = `<div class="page-h"><h2>طلبات الانضمام</h2><div class="acts"><button class="btn" id="rqTerms">تعديل الشروط والقوانين</button></div></div>
    <div class="ev-tabs" role="tablist">${[["pending","بانتظار الموافقة"],["approved","المقبولة"],["rejected","المرفوضة"]].map(([k, t]) => `<button role="tab" class="ev-tab ${RQ.tab === k ? "on" : ""}" data-t="${k}" aria-selected="${RQ.tab === k}">${t}</button>`).join("")}</div>
    <div id="rqBody"><div class="spin"></div></div>`;
  $$(".ev-tab").forEach(b => b.onclick = () => { RQ.tab = b.dataset.t; renderRequests(); });
  $("#rqTerms").onclick = editTerms;
  const {data, error} = await db.from("fa_requests").select("*").eq("status", RQ.tab).order("created_at", {ascending:false});
  if(!$("#rqBody")) return;
  if(error){ $("#rqBody").innerHTML = `<p class="err">${esc(errMsg(error))}</p>`; return; }
  if(!data.length){ $("#rqBody").innerHTML = `<div class="empty card">${RQ.tab === "pending" ? "لا توجد طلبات جديدة" : "لا توجد طلبات"}</div>`; return; }
  const when = t => fmtDate(new Date(t).toLocaleDateString("en-CA", {timeZone:"Asia/Bahrain"}));
  $("#rqBody").innerHTML = data.map(r => {
    const s = RQ.sel[r.id] || (RQ.sel[r.id] = {add:false, edit:false, del:false, family:true, person:null, role:"user"});
    const pp = s.person && S.byId.get(s.person);
    return `<article class="card rq-card" data-id="${r.id}">
      <div class="rq-h"><div><b class="rq-name">${esc(r.full_name)}</b><small>طلب بتاريخ ${when(r.created_at)} · وافق على الشروط</small></div>
        ${r.status !== "pending" ? `<span class="chip ${r.status === "approved" ? "" : "dead"}">${r.status === "approved" ? "مقبول" : "مرفوض"}${r.decided_at ? " · " + when(r.decided_at) : ""}</span>` : ""}</div>
      <dl class="rq-info">
        <div><dt>البريد</dt><dd class="ltr">${esc(r.email)}</dd></div>
        <div><dt>الهاتف</dt><dd class="ltr">${esc(r.phone || "—")}</dd></div>
        <div><dt>صلته بالعائلة</dt><dd>${esc(r.relation || "—")}</dd></div>
      </dl>
      ${r.status === "pending" ? `
      <div class="rq-perms">
        <div class="rq-row"><span class="rq-lbl">سجله في العائلة</span><button type="button" class="btn small" data-act="link">${pp ? nm(pp, fullName(pp, 4)) + ` <small class="muted">#${pp.serial}</small>` : "اختيار السجل…"}</button></div>
        <div class="rq-row"><span class="rq-lbl">الصلاحيات</span>
          <label class="check"><input type="checkbox" data-k="role" ${s.role === "admin" ? "checked" : ""}> مدير</label>
          <label class="check"><input type="checkbox" data-k="add" ${s.add ? "checked" : ""} ${s.role === "admin" ? "disabled" : ""}> إضافة</label>
          <label class="check"><input type="checkbox" data-k="edit" ${s.edit ? "checked" : ""} ${s.role === "admin" ? "disabled" : ""}> تعديل</label>
          <label class="check"><input type="checkbox" data-k="del" ${s.del ? "checked" : ""} ${s.role === "admin" ? "disabled" : ""}> حذف</label>
          <label class="check" title="يرى أسرته وسلسلة آبائه فقط، والشجرة كاملة بالأسماء"><input type="checkbox" data-k="family" ${s.family && s.role !== "admin" ? "checked" : ""} ${s.role === "admin" ? "disabled" : ""}> أسرته فقط</label>
        </div>
        <p class="muted rq-hint">بدون أي صلاحية يكون العضو «مشاهدة فقط». خيار «أسرته فقط» يحتاج ربطه بسجله.</p>
      </div>
      <div class="rq-acts"><button class="btn primary" type="button" data-act="ok">موافقة وإضافة العضو</button><button class="btn danger" type="button" data-act="no">رفض</button>
        ${r.phone ? `<a class="btn wa" href="${esc(waLink(r.phone, `السلام عليكم ${r.full_name.split(/\s+/)[0]}، بخصوص طلب انضمامك لبرنامج عائلة النشابة`))}" target="_blank" rel="noopener">واتساب</a>` : ""}</div>` :
      r.status === "approved" && r.phone ? `<div class="rq-acts"><a class="btn wa" href="${esc(waLink(r.phone, `السلام عليكم ${r.full_name.split(/\s+/)[0]}، تمت الموافقة على طلب انضمامك لبرنامج عائلة النشابة. تستطيع الدخول الآن ببريدك وكلمة السر التي اخترتها:\n${location.href.split("#")[0]}`))}" target="_blank" rel="noopener">إبلاغه بالموافقة عبر واتساب</a></div>` : ""}
    </article>`;
  }).join("");
  $("#rqBody").onchange = e => {
    const c = e.target.closest("[data-k]"); if(!c) return;
    const id = +c.closest(".rq-card").dataset.id, s = RQ.sel[id], k = c.dataset.k;
    if(k === "role") s.role = c.checked ? "admin" : "user"; else s[k] = c.checked;
    if(k === "role") renderRequests();
  };
  $("#rqBody").onclick = async e => {
    const b = e.target.closest("[data-act]"); if(!b) return;
    const card = b.closest(".rq-card"), id = +card.dataset.id, s = RQ.sel[id], r = data.find(x => x.id === id);
    if(b.dataset.act === "link"){
      const p = await pickPerson(`سجل ${r.full_name} في العائلة`, {allowNone:true});
      if(p === null) return; s.person = p ? p.id : null; return renderRequests();
    }
    if(b.dataset.act === "no"){
      if(!await ask("رفض الطلب", `رفض طلب انضمام ${r.full_name}؟`, {okText:"رفض", danger:true})) return;
      const {error} = await db.rpc("fa_reject_request", {p_id:id});
      if(error) return toast(errMsg(error), true);
      toast("تم رفض الطلب"); refreshReqBadge(); return renderRequests();
    }
    if(b.dataset.act === "ok"){
      if(s.family && s.role !== "admin" && !s.person) return toast("اختر سجله في العائلة أولاً، أو ألغِ «أسرته فقط»", true);
      const rights = s.role === "admin" ? "مدير (كل الصلاحيات)" : [s.add && "إضافة", s.edit && "تعديل", s.del && "حذف"].filter(Boolean).join("، ") || "مشاهدة فقط";
      if(!await ask("الموافقة على العضو", `إضافة ${r.full_name} بصلاحية: ${rights}${s.family && s.role !== "admin" ? " · أسرته فقط" : ""}؟`, {okText:"موافقة"})) return;
      const {data:res, error} = await db.rpc("fa_approve_request", {p_id:id, p_role:s.role, p_add:s.add, p_edit:s.edit, p_delete:s.del, p_person:s.person, p_family_only:s.family && s.role !== "admin"});
      if(error) return toast(errMsg(error), true);
      toast(res === "no_account" ? "تمت الموافقة — لكن لم يُنشأ حسابه بعد، اطلب منه التسجيل مرة ثانية بنفس البريد" : "تمت الموافقة وأُضيف العضو");
      refreshReqBadge(); RQ.tab = "approved"; renderRequests();
    }
  };
}
async function editTerms(){
  const t = await loadTerms();
  modal("الشروط والقوانين", `<div class="field"><label for="tmTxt">النص الذي يظهر للعضو الجديد قبل إرسال طلبه</label><textarea class="inp" id="tmTxt" rows="16" maxlength="8000">${esc(t)}</textarea></div>
    <p class="muted" style="font-size:13px">اترك سطراً فارغاً بين الأقسام. الأسطر التي تبدأ برقم (1. 2. …) تظهر قائمة مرقّمة.</p>`,
    {foot:`<button class="btn" type="button" onclick="this.closest('dialog').close()">إلغاء</button><button class="btn primary" type="button" id="tmSave">حفظ</button>`});
  $("#tmSave").onclick = async () => {
    const val = $("#tmTxt").value;
    const {error} = await db.from("fa_settings").upsert([{key:"terms", value:val, updated_at:new Date().toISOString(), updated_by:S.email}], {onConflict:"key"});
    if(error) return toast(errMsg(error), true);
    TERMS_CACHE = val; $("#dModal").close(); toast("تم حفظ الشروط");
  };
}
