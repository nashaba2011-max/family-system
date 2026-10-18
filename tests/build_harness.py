"""يبني نسخة اختبار من «شجرة العائلة 4» تعمل بقاعدة بيانات محلية وبيانات وهمية.
الاستعمال: python3 tests/build_harness.py   (ينشئ tests/.harness/)"""
import os, re, shutil, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "tests", ".harness")
shutil.rmtree(OUT, ignore_errors=True)
shutil.copytree(os.path.join(ROOT, "tree4"), OUT)
os.makedirs(os.path.join(OUT, "js", "test"), exist_ok=True)
shutil.copy(os.path.join(ROOT, "tests", "fixture.js"), os.path.join(OUT, "js", "test", "fixture.js"))
shutil.copytree(os.path.join(ROOT, "desktop", "vendor"), os.path.join(OUT, "vendor"))

db = open(os.path.join(ROOT, "desktop", "js", "offline", "localdb.js"), encoding="utf-8").read()
def patch(a, b):
    global db
    if a not in db: sys.exit("harness patch failed: " + a[:60])
    db = db.replace(a, b, 1)
# الدخول في وضع الاختبار: أي مستخدم في f4_users بدون كلمة سر
patch("      email = (email || \"\").trim().toLowerCase();\n      if(!password)",
      "      email = (email || \"\").trim().toLowerCase();\n"
      "      if(window.__TEST_MODE){ const tu = tbl(\"f4_users\").find(x => x.email === email); if(!tu) return {data:null, error:err(\"Invalid login credentials\")};\n"
      "        session = {user:{id:email, email}, access_token:\"test\"}; try{ localStorage.setItem(SKEY, JSON.stringify(session)); }catch(e){} emit(\"SIGNED_IN\", session); return {data:{session, user:session.user}, error:null}; }\n"
      "      if(!password)")
# البيانات الأولية من الملف الوهمي
patch("      Object.keys(saved || {}).forEach(k => T[k] = saved[k]);",
      "      const src0 = saved || (window.__TEST_FIXTURE ? JSON.parse(JSON.stringify(window.__TEST_FIXTURE)) : {});\n      Object.keys(src0).forEach(k => T[k] = src0[k]);")
patch("    if(session && !tbl(\"f4_users\").some(u => u.email === session.user.email && u.role === \"admin\")) session = null;",
      "    if(session && !tbl(\"f4_users\").some(u => u.email === session.user.email && (u.role === \"admin\" || window.__TEST_MODE))) session = null;")
# f4_edit_ids كما في الخادم: الشخص وذريته وأزواجهم
patch("    f4_edit_ids: () => ({data:tbl(\"f4_people\").map(p => p.id), error:null}),",
      "    f4_edit_ids: () => { const u = tbl(\"f4_users\").find(x => x.email === me()); if(!u || !u.person_id) return {data:[], error:null};\n"
      "      const P = tbl(\"f4_people\"), des = new Set([u.person_id]); let grew = true;\n"
      "      while(grew){ grew = false; P.forEach(c => { if(!des.has(c.id) && (des.has(c.father_id) || des.has(c.mother_id))){ des.add(c.id); grew = true; } }); }\n"
      "      const ids = new Set(des); tbl(\"f4_spouses\").forEach(s => { if(des.has(s.person_id) && s.spouse_id) ids.add(s.spouse_id); if(des.has(s.spouse_id)) ids.add(s.person_id); });\n"
      "      P.forEach(c => { if(des.has(c.father_id) && c.mother_id) ids.add(c.mother_id); if(des.has(c.mother_id) && c.father_id) ids.add(c.father_id); });\n"
      "      return {data:[...ids], error:null}; },")
open(os.path.join(OUT, "js", "test", "localdb.js"), "w", encoding="utf-8").write(db)

h = open(os.path.join(OUT, "index.html"), encoding="utf-8").read()
h = re.sub(r'<link rel="preconnect"[^>]*>\n', "", h)
h = re.sub(r'<link href="https://fonts.googleapis.com[^>]*>\n', "", h)
h = h.replace('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>',
              '<script>window.__TEST_MODE = true;</script>\n<script src="js/test/fixture.js"></script>\n<script src="js/test/localdb.js"></script>')
if "js/test/localdb.js" not in h: sys.exit("harness: supabase script tag not found")
open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(h)
c = open(os.path.join(OUT, "js", "config.js"), encoding="utf-8").read()
c = re.sub(r'const XLSX_URL = "[^"]*";', 'const XLSX_URL = "vendor/xlsx.full.min.js";', c)
open(os.path.join(OUT, "js", "config.js"), "w", encoding="utf-8").write(c)
print("harness ready:", OUT)
