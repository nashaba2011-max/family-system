/* اختبارات تلقائية لـ«شجرة العائلة 4» — تعمل على نسخة اختبار ببيانات وهمية (tests/.harness)
   التشغيل: bash tests/run.sh   */
const PW = process.env.PW_PATH;
const { chromium } = await import(PW ? `${PW}/playwright/index.mjs` : "playwright");
const BASE = process.env.BASE_URL || "http://localhost:8765/";
const ADMIN = "admin@test.bh", MEMBER = "fahad@test.bh";

const results = [];
let browser;

/* ---------- أدوات ---------- */
async function fresh(){
  const ctx = await browser.newContext({viewport:{width:1280, height:900}, reducedMotion:"reduce"});
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", e => page.errors.push("خطأ في الصفحة: " + e.message));
  page.on("console", m => { if(m.type() === "error" && !/favicon|ERR_FILE_NOT_FOUND|wa\.me/.test(m.text())) page.errors.push("console: " + m.text()); });
  page.on("dialog", d => d.dismiss());
  await page.goto(BASE);
  await page.waitForFunction(() => window.OFFLINE && document.querySelector("#lEmail"));
  return {ctx, page};
}
async function login(page, email){
  await page.fill("#lEmail", email); await page.fill("#lPass", "x");
  await page.click("#lBtn");
  await page.waitForSelector("#app:not([hidden])", {timeout:10000});
  await page.waitForFunction(() => !document.getElementById("gate") && typeof S !== "undefined" && S.people && S.people.length, null, {timeout:10000});
}
async function go(page, hash){ await page.evaluate(h => { location.hash = h; }, hash); await page.waitForTimeout(500); }
async function askVisible(page){ return page.evaluate(() => document.querySelector("#dAsk")?.open ? document.querySelector("#askMsg").textContent : null); }
async function answer(page, yes){ await page.click(yes ? "#askYes" : "#askNo"); await page.waitForTimeout(300); }
const tables = (page, t) => page.evaluate(t => OFFLINE.tables[t], t);
function assert(cond, msg){ if(!cond) throw new Error(msg); }

async function test(name, fn){
  const {ctx, page} = await fresh();
  const t0 = Date.now();
  try{
    await fn(page, ctx);
    assert(!page.errors.length, page.errors.join(" | "));
    results.push({name, ok:true, ms:Date.now() - t0});
  }catch(e){
    results.push({name, ok:false, ms:Date.now() - t0, err:e.message.split("\n")[0]});
    try{ await page.screenshot({path:`tests/.results/${results.length}.png`}); }catch(_){}
  }
  await ctx.close();
}

/* ---------- الاختبارات ---------- */
browser = await chromium.launch();

await test("الدخول وفتح الرئيسية", async page => {
  await login(page, ADMIN);
  assert((await page.textContent("#view")).includes("شجرة العائلة"), "الرئيسية لم تظهر");
});

await test("إضافة سجل جديد (الجنسية تلقائية للذكر)", async page => {
  await login(page, ADMIN);
  await go(page, "#/new/11");
  await page.fill("#f_name1", "سلمان"); await page.fill("#f_name2", "خالد"); await page.fill("#f_family", "التجربة");
  await page.selectOption("#f_gender", "ذكر");
  await page.click("#rSave"); await page.waitForTimeout(800);
  const r = (await tables(page, "f4_people")).find(p => p.name1 === "سلمان");
  assert(r, "السجل لم يُحفظ"); assert(r.serial === 11, "رقم التسلسل " + r.serial);
  assert(r.nationality === "بحريني", "الجنسية " + r.nationality);
  assert((await page.evaluate(() => location.hash)).startsWith("#/rec/"), "لم ينتقل إلى الملف بعد الحفظ");
});

await test("تكرار الاسم: المدير يُسأل ويستطيع الإلغاء", async page => {
  await login(page, ADMIN);
  await go(page, "#/new/12");
  await page.fill("#f_name1", "فهد"); await page.fill("#f_name2", "خالد"); await page.fill("#f_name3", "جاسم"); await page.fill("#f_family", "التجربة");
  await page.click("#rSave"); await page.waitForTimeout(500);
  const msg = await askVisible(page);
  assert(msg && msg.includes("مسجل مسبقاً"), "لم تظهر رسالة التكرار");
  await answer(page, false);
  const n = (await tables(page, "f4_people")).filter(p => p.name1 === "فهد" && p.name2 === "خالد").length;
  assert(n === 1, "حُفظ الاسم المكرر (" + n + ")");
  await page.evaluate(() => { S.dirty = false; });
});

await test("تكرار الاسم: العضو يُمنع ويُطلب منه مراجعة الإدارة", async page => {
  await login(page, MEMBER);
  await go(page, "#/new/0");
  await page.fill("#f_name1", "عمر"); await page.fill("#f_name2", "فهد"); await page.fill("#f_name3", "خالد"); await page.fill("#f_family", "التجربة");
  await page.click("#rSave"); await page.waitForTimeout(500);
  const msg = await askVisible(page);
  assert(msg && msg.includes("مراجعة الإدارة"), "لم تظهر رسالة المنع: " + msg);
  assert(await page.isHidden("#askNo"), "زر الإلغاء ظاهر — يجب أن يكون المنع نهائياً");
  await answer(page, true);
  const n = (await tables(page, "f4_people")).filter(p => p.name1 === "عمر").length;
  assert(n === 1, "حُفظ الاسم المكرر");
  await page.evaluate(() => { S.dirty = false; });
});

await test("الملاحظات تقبل نصاً طويلاً بلا حد", async page => {
  await login(page, ADMIN);
  await go(page, "#/rec/3");
  await page.click('.tab[data-tab="t6"]');
  const long = "ملاحظة ".repeat(1500); // أكثر من 9000 حرف
  await page.fill("#f_notes", long);
  await page.click("#rSave"); await page.waitForTimeout(800);
  const r = (await tables(page, "f4_people")).find(p => p.id === 3);
  assert(r.notes && r.notes.length === long.trim().length, "طول المحفوظ " + (r.notes || "").length);
  assert(!(await page.getAttribute("#f_notes", "maxlength")), "ما زال للملاحظات حد أقصى");
});

await test("حذف سجل مرتبط بزواج يحذف الزواج بلا خطأ", async page => {
  await login(page, ADMIN);
  await go(page, "#/delete");
  await page.fill("#gSerial", "5"); await page.keyboard.press("Enter"); await page.waitForTimeout(400);
  await page.click("#gDel"); await page.waitForTimeout(300);
  await answer(page, true); await answer(page, true); await page.waitForTimeout(500);
  const people = await tables(page, "f4_people"), sp = await tables(page, "f4_spouses");
  assert(!people.some(p => p.id === 5), "السجل لم يُحذف");
  assert(!sp.some(s => s.spouse_id === 5 || s.person_id === 5), "بقي ربط زواج يشير للمحذوف");
  assert(people.find(p => p.id === 6).mother_id == null, "بقي الابن مربوطاً بأم محذوفة");
  const toast = await page.evaluate(() => document.querySelector(".toast.bad")?.textContent || "");
  assert(!toast, "ظهرت رسالة خطأ: " + toast);
});

await test("شجرة العائلة: الصورة تملأ بطاقة صاحبها", async page => {
  await page.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 60; c.height = 80; c.getContext("2d").fillRect(0, 0, 60, 80);
    const b = await new Promise(r => c.toBlob(r, "image/jpeg")); await OFFLINE.putFile("f4-photos", "10/photo.jpg", b);
  });
  await login(page, ADMIN);
  await go(page, "#/tree/1"); await page.waitForTimeout(800);
  await page.evaluate(() => $("#tOpen")?.click()); await page.waitForTimeout(500);
  const card = await page.$('.pcard.ph-full[data-tfull="10"]');
  assert(card, "بطاقة صاحب الصورة ليست بشكل الصورة الكاملة");
  const ph = await card.evaluate(e => e.style.getPropertyValue("--ph"));
  assert(ph.includes("url("), "الصورة لم تُحمَّل في البطاقة");
  const plain = await page.$$('.pcard.ph-full:not([data-tfull="10"])');
  assert(!plain.length, "ظهرت صورة كاملة لشخص بلا صورة");
});

await test("الصور الكاملة: مفتاح المدير يشغّلها ويوقفها للجميع", async page => {
  await login(page, ADMIN);
  await go(page, "#/tree/1"); await page.waitForTimeout(800);
  await page.evaluate(() => $("#tOpen")?.click()); await page.waitForTimeout(400);
  assert(await page.$('.pcard.ph-full[data-tfull="10"]'), "الصورة الكاملة ليست مفعّلة افتراضياً");
  assert((await page.getAttribute("#tFull", "aria-checked")) === "true", "المفتاح لا يظهر مفعّلاً");
  await page.click("#tFull"); await page.waitForTimeout(500);
  assert(!(await page.$(".pcard.ph-full")), "بقيت صورة كاملة بعد الإيقاف");
  assert(await page.$('.pcard[data-tfull="10"]'), "اختفت بطاقة صاحب الصورة");
  assert((await page.getAttribute("#tFull", "aria-checked")) === "false", "المفتاح لم يتحول إلى متوقف");
  assert(await page.$('.pcard[data-tfull="10"] .av.has-ph'), "الصورة الصغيرة لا تظهر عند الإيقاف");
  let st = (await tables(page, "f4_settings")).find(s => s.key === "tree_full");
  assert(st && st.value === "0", "الإيقاف لم يُحفظ");
  await page.click("#tFull"); await page.waitForTimeout(500);
  assert(await page.$('.pcard.ph-full[data-tfull="10"]'), "التفعيل لم يرجع الصورة الكاملة");
  st = (await tables(page, "f4_settings")).find(s => s.key === "tree_full");
  assert(st && st.value === "1", "التفعيل لم يُحفظ");
});

await test("الصور الكاملة: العضو لا يرى المفتاح ويتبع اختيار المدير", async page => {
  await page.evaluate(() => OFFLINE.tables.f4_settings.push({key:"tree_full", value:"0", updated_at:new Date().toISOString(), updated_by:"admin@test.bh"}));
  await login(page, MEMBER);
  await go(page, "#/tree/1"); await page.waitForTimeout(800);
  assert(!(await page.$("#tFull")), "المفتاح ظاهر للعضو");
  assert(!(await page.$(".pcard.ph-full")), "العضو يرى الصور الكاملة رغم إيقافها");
});

await test("مراسلة واتساب: أزرار المجموعات و«إرسال للتالي»", async (page, ctx) => {
  await login(page, ADMIN);
  await go(page, "#/whatsapp");
  await page.selectOption("#waSrc", "all"); await page.waitForTimeout(300);
  await page.click('#waGroups [data-g="f"]'); await page.waitForTimeout(200);
  const cnt = await page.textContent("#waCount");
  assert(/محدد 3 من/.test(cnt), "عدد الإناث المحددات: " + cnt);
  const [popup] = await Promise.all([ctx.waitForEvent("page", {timeout:3000}).catch(() => null), page.click("#waNext")]);
  assert(popup, "لم تُفتح محادثة واتساب");
  assert((await page.textContent("#waNextMsg")).includes("1 من 3"), "رسالة التقدم غير صحيحة");
  await page.click("#waNone"); await page.waitForTimeout(200);
  assert((await page.textContent("#waCount")).includes("لم تحدد"), "إلغاء التحديد لم يعمل");
});

await test("أعياد الميلاد: اختيار عدد أيام التنبيه", async page => {
  await page.evaluate(() => {
    const d = new Date(Date.now() + 5 * 864e5).toLocaleDateString("en-CA", {timeZone:"Asia/Bahrain"});
    OFFLINE.tables.f4_people.find(p => p.id === 4).birth_date = "1990" + d.slice(4);
  });
  await login(page, ADMIN);
  await go(page, "#/home"); await page.waitForTimeout(800);
  let card = await page.textContent("#bdayCard");
  assert(!card.includes("سارة"), "ظهر عيد ميلاد بعد 5 أيام والتنبيه يوم واحد");
  await page.selectOption("#bdDays", "7"); await page.waitForTimeout(800);
  card = await page.textContent("#bdayCard");
  assert(card.includes("سارة") && card.includes("بعد 5 أيام"), "لم يظهر عيد الميلاد بعد اختيار 7 أيام");
  const st = (await tables(page, "f4_settings")).find(s => s.key === "bday_days");
  assert(st && st.value === "7", "الإعداد لم يُحفظ");
});

await test("صلاحيات العضو: يعدّل نفسه وأسرته فقط", async page => {
  await login(page, MEMBER);
  assert(await page.isHidden('#sidenav [data-nav="users"]'), "صفحة المستخدمين ظاهرة للعضو");
  assert(await page.isHidden('#sidenav [data-nav="settings"]'), "الإعدادات ظاهرة للعضو");
  await go(page, "#/rec/8");
  assert(await page.isVisible("#rSave"), "العضو لا يستطيع تعديل ابنه");
  await go(page, "#/rec/3");
  assert(!(await page.isVisible("#rSave")), "العضو يستطيع تعديل أبيه");
  await go(page, "#/rec/6");
  assert(!(await page.$("#rDel")), "العضو يستطيع حذف نفسه");
});

await test("الرئيسية: شريط آخر التحديثات يتحرك ويتوقف ويفتح السجل", async page => {
  await page.emulateMedia({reducedMotion:"no-preference"});
  await login(page, ADMIN);
  await go(page, "#/home"); await page.waitForTimeout(500);
  assert(await page.$(".nt .nt-chip[data-open]"), "شريط آخر التحديثات غير موجود");
  const anim = await page.$eval(".nt-track", e => getComputedStyle(e).animationName);
  assert(anim === "ntRun", "الشريط لا يتحرك");
  const hidden = await page.$$eval('.nt-set[aria-hidden="true"] button', bs => bs.every(b => b.tabIndex === -1));
  assert(hidden, "النسخة المكررة قابلة للتركيز بلوحة المفاتيح");
  await page.click("#ntPause");
  assert(await page.$("#ntTk.paused"), "زر الإيقاف لم يوقف الشريط");
  assert((await page.textContent("#ntPause")).includes("تشغيل"), "نص الزر لم يتغير");
  const id = await page.getAttribute(".nt-set:not([aria-hidden]) .nt-chip", "data-open");
  await page.click(`.nt-set:not([aria-hidden]) .nt-chip[data-open="${id}"]`, {force:true}); await page.waitForTimeout(500);
  assert((await page.evaluate(() => location.hash)).includes(id), "الضغط على الاسم لم يفتح السجل");
});

await test("التنقل في كل الصفحات بلا أخطاء", async page => {
  await login(page, ADMIN);
  for(const h of ["#/home", "#/list", "#/tree", "#/kinship", "#/reports", "#/events", "#/heritage", "#/whatsapp", "#/settings", "#/users", "#/requests", "#/data", "#/rec/3", "#/family/3", "#/about"]){
    await go(page, h);
    const txt = await page.textContent("#view");
    assert(txt && txt.trim().length > 10, "صفحة فارغة: " + h);
  }
});

await browser.close();

/* ---------- النتيجة ---------- */
const pass = results.filter(r => r.ok).length;
for(const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : "\n    ← " + r.err}`);
console.log(`\n${pass} من ${results.length} نجحت`);
process.exit(pass === results.length ? 0 : 1);
