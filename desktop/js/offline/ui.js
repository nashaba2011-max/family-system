/* ===== صفحة «النسخة المكتبية»: التحديث من الموقع، النسخ الاحتياطي، الاستعادة ===== */
ROUTES.offline = {title:"النسخة المكتبية", render:renderOffline, admin:true};

const offFmt = iso => { try{ return new Date(iso).toLocaleString("ar-BH", {dateStyle:"medium", timeStyle:"short"}); }catch(e){ return iso || ""; } };
function offStamp(){ try{ return localStorage.getItem("ft-offline-saved-at"); }catch(e){ return null; } }
function offSynced(){ try{ return localStorage.getItem("ft-offline-synced-at"); }catch(e){ return null; } }

function renderOffline(){
  const T = OFFLINE.tables, nFiles = OFFLINE.files.size;
  const people = (T.f4_people || []).length, withPhoto = (T.f4_people || []).filter(p => p.photo_path).length;
  $("#view").innerHTML = `
    <div class="page-h"><h2>النسخة المكتبية</h2></div>
    <div class="off-grid">
      <section class="card off-card">
        <h3>هذا الكمبيوتر</h3>
        <p class="muted">البرنامج يعمل هنا بدون إنترنت، وكل التعديلات تُحفظ على هذا الجهاز فقط ولا تصل إلى الموقع.</p>
        <dl class="off-dl">
          <div><dt>السجلات</dt><dd>${people}</dd></div>
          <div><dt>الصور والملفات المحفوظة</dt><dd>${nFiles}</dd></div>
          <div><dt>آخر حفظ</dt><dd>${esc(offFmt(offStamp()) || "—")}</dd></div>
          <div><dt>آخر تحديث من الموقع</dt><dd>${esc(offSynced() ? offFmt(offSynced()) : "لم يتم بعد")}</dd></div>
        </dl>
        ${withPhoto > nFiles ? `<p class="off-warn">يوجد ${withPhoto} سجلاً لها صور، والصور لم تُنزّل بعد. استخدم «تحديث من الموقع» مرة واحدة وأنت متصل بالإنترنت لتنزيلها.</p>` : ""}
      </section>

      <section class="card off-card">
        <h3>تحديث من الموقع</h3>
        <p class="muted">يحتاج الإنترنت. يُنزّل آخر نسخة من سجلات «شجرة العائلة 4» وكل الصور والملفات إلى هذا الكمبيوتر. <b>تُستبدل البيانات الموجودة هنا</b>، فإن كانت لديك تعديلات محلية فاحفظ نسخة احتياطية أولاً.</p>
        <form id="offSync" class="off-form" autocomplete="off">
          <label for="offEmail">بريد المدير في الموقع</label><input class="inp ltr" id="offEmail" type="email" value="${esc(S.email || "")}" required>
          <label for="offPass">كلمة سر الموقع</label><input class="inp ltr" id="offPass" type="password" required>
          <button class="btn primary" type="submit" id="offGo">تحديث الآن</button>
          <div class="off-out" id="offOut" role="status"></div>
        </form>
      </section>

      <section class="card off-card">
        <h3>نسخة احتياطية</h3>
        <p class="muted">ملف واحد فيه كل السجلات والصور. احفظه في مكان آمن (فلاش أو OneDrive)، وتستطيع استعادته على هذا الكمبيوتر أو على كمبيوتر آخر.</p>
        <div class="off-acts"><button class="btn primary" type="button" id="offSave">حفظ نسخة احتياطية</button>
          <label class="btn" for="offFile">استعادة من ملف…</label><input type="file" id="offFile" accept=".json,application/json" hidden></div>
        <div class="off-out" id="offOut2" role="status"></div>
      </section>
    </div>`;

  $("#offSync").onsubmit = async e => { e.preventDefault(); await offSyncNow($("#offEmail").value.trim().toLowerCase(), $("#offPass").value); };
  $("#offSave").onclick = async () => {
    const out = $("#offOut2"); out.textContent = "جارٍ تجهيز الملف…";
    try{
      const data = await OFFLINE.exportAll();
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], {type:"application/json"}));
      a.download = `شجرة-العائلة-نسخة-احتياطية-${todayISO()}.json`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      out.textContent = "تم حفظ الملف في مجلد التنزيلات (Downloads).";
    }catch(err){ out.textContent = errMsg(err); }
  };
  $("#offFile").onchange = async e => {
    const f = e.target.files[0]; if(!f) return; const out = $("#offOut2");
    if(!(await ask("استعادة نسخة احتياطية", "ستُستبدل كل البيانات الموجودة على هذا الكمبيوتر بمحتوى الملف. متابعة؟", {okText:"استعادة", danger:true}))){ e.target.value = ""; return; }
    out.textContent = "جارٍ الاستعادة…";
    try{ await OFFLINE.importAll(JSON.parse(await f.text())); await loadAll(); out.textContent = "تمت الاستعادة."; toast("تمت الاستعادة"); setTimeout(() => location.reload(), 600); }
    catch(err){ out.textContent = "تعذّرت الاستعادة: " + errMsg(err); }
  };
}

/* تنزيل كل شيء من الموقع (يستبدل البيانات المحلية) */
async function offSyncNow(email, password){
  const out = $("#offOut"), btn = $("#offGo"), say = m => { out.textContent = m; };
  if(!navigator.onLine) return say("لا يوجد اتصال بالإنترنت الآن.");
  if(!(await ask("تحديث من الموقع", "ستُستبدل البيانات الموجودة على هذا الكمبيوتر بآخر نسخة من الموقع. متابعة؟", {okText:"تحديث"}))) return;
  btn.disabled = true;
  try{
    const r = await OFFLINE.syncFromServer(email, password, say);
    say(`تم التحديث: ${r.people} سجلاً، و${r.files} صورة وملف${r.missed ? ` (تعذّر ${r.missed})` : ""}. سيُعاد فتح البرنامج…`);
    setTimeout(() => location.reload(), 1500);
  }catch(err){ say(errMsg(err)); }
  finally{ btn.disabled = false; }
}

/* شريط صغير يوضح أنها النسخة المكتبية + رابط الصفحة في القائمة */
document.addEventListener("DOMContentLoaded", () => {
  const nav = document.querySelector('#sidenav a[data-nav="data"]');
  if(nav && !document.querySelector('[data-nav="offline"]')){
    const a = document.createElement("a"); a.href = "#/offline"; a.dataset.nav = "offline"; a.setAttribute("data-admin", "");
    a.innerHTML = `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>النسخة المكتبية`;
    nav.after(a);
  }
  const brand = document.querySelector(".brand span");
  if(brand && !brand.querySelector(".off-tag")){ const t = document.createElement("em"); t.className = "off-tag"; t.textContent = "مكتبي"; brand.appendChild(t); }
});

/* «نسيت كلمة السر» في النسخة المكتبية: تُمسح كلمة السر المحلية للبريد المكتوب، فتُعتمد كلمة السر التالية التي يكتبها المدير */
$("#lForgot").onclick = async () => {
  const email = $("#lEmail").value.trim().toLowerCase();
  if(!email){ $("#lErr").textContent = "اكتب بريدك أولاً ثم اضغط «نسيت كلمة السر»"; return; }
  if(!(await ask("نسيت كلمة السر", `ستُمسح كلمة السر المحفوظة على هذا الكمبيوتر للبريد ${email}، وتصبح كلمة السر التالية التي تكتبها هي الجديدة. متابعة؟`, {okText:"متابعة"}))) return;
  let saved = {}; try{ saved = JSON.parse(localStorage.getItem("ft-offline-pass") || "{}"); delete saved[email]; localStorage.setItem("ft-offline-pass", JSON.stringify(saved)); }catch(e){}
  $("#lErr").textContent = "تم. اكتب كلمة سر جديدة واضغط «دخول».";
};

/* ===== التشغيل الأول + تثبيت البرنامج ===== */
const isInstalled = () => matchMedia("(display-mode: standalone), (display-mode: window-controls-overlay)").matches || navigator.standalone === true;
let INSTALL_EVT = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); INSTALL_EVT = e; showInstall(); });
window.addEventListener("appinstalled", () => { INSTALL_EVT = null; $$(".inst-box").forEach(x => x.remove()); toast("تم تثبيت البرنامج ✓ تجده على سطح المكتب وفي قائمة ابدأ"); });
function showInstall(){
  if(isInstalled() || !INSTALL_EVT) return;
  const card = document.querySelector("#vLogin .login-card"); if(!card || card.querySelector(".inst-box")) return;
  const d = document.createElement("div"); d.className = "inst-box";
  d.innerHTML = `<b>ثبّت البرنامج على هذا الكمبيوتر</b><span>يفتح بأيقونة خاصة من سطح المكتب وقائمة ابدأ، ويعمل بدون إنترنت.</span><button class="btn primary block" type="button">تثبيت البرنامج</button>`;
  d.querySelector("button").onclick = async () => { const ev = INSTALL_EVT; if(!ev) return; ev.prompt(); const c = await ev.userChoice; if(c.outcome === "accepted") d.remove(); };
  card.prepend(d);
}
OFFLINE.ready.then(() => {
  showInstall();
  if(OFFLINE.isEmpty()){
    const f = document.querySelector("#loginForm"); if(!f || f.querySelector(".first-run")) return;
    const n = document.createElement("p"); n.className = "first-run";
    n.innerHTML = "<b>التشغيل الأول:</b> ادخل ببريد وكلمة سر الموقع (حساب مدير) وأنت متصل بالإنترنت، فيُنزّل البرنامج سجلات العائلة والصور إلى هذا الكمبيوتر. بعدها يعمل بدون إنترنت.";
    f.prepend(n);
    const lb = document.querySelector("#lBtn"); if(lb) lb.textContent = "دخول وتنزيل البيانات";
  }
});
