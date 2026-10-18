-- اختبارات صلاحيات قاعدة البيانات لـ«شجرة العائلة 4» (سياسات RLS)
-- تعمل داخل معاملة واحدة تُلغى بالكامل في النهاية، فلا تغيّر أي بيانات حقيقية.
-- النتيجة تظهر في رسالة الخطأ النهائية: «RESULTS: …» (الخطأ مقصود لإلغاء كل التغييرات).
do $t$
declare
  r text := ''; n int; ok int := 0; bad int := 0;
  a bigint; m bigint; c bigint; s bigint; u bigint;
  mem text := 'test-member-rls@example.invalid';
  adm text := (select email from f4_users where role = 'admin' order by email limit 1);
begin
  -- تجهيز بيانات وهمية (كمالك قاعدة البيانات)
  insert into f4_people(name1, family, gender, created_by) values ('اختبار-جد', 'اختبار', 'ذكر', 'x') returning id into a;
  insert into f4_people(name1, family, gender, father_id, created_by) values ('اختبار-عضو', 'اختبار', 'ذكر', a, 'x') returning id into m;
  insert into f4_people(name1, family, gender, father_id, created_by) values ('اختبار-ابن', 'اختبار', 'ذكر', m, 'x') returning id into c;
  insert into f4_people(name1, family, gender, father_id, created_by) values ('اختبار-أخ', 'اختبار', 'ذكر', a, 'x') returning id into s;
  insert into f4_people(name1, family, gender, created_by) values ('اختبار-غريب', 'غريب', 'ذكر', 'x') returning id into u;
  insert into f4_users(email, display_name, role, can_add, can_edit, can_delete, person_id) values (mem, 'عضو اختبار', 'user', true, true, true, m);

  -- ===== العضو =====
  perform set_config('request.jwt.claims', json_build_object('email', mem, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  update f4_people set notes = 't' where id = c; get diagnostics n = row_count;
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' ✗ العضو لا يستطيع تعديل ابنه;'; end if;
  update f4_people set notes = 't' where id = m; get diagnostics n = row_count;
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' ✗ العضو لا يستطيع تعديل نفسه;'; end if;
  update f4_people set notes = 't' where id = a; get diagnostics n = row_count;
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' ✗ العضو عدّل أباه;'; end if;
  update f4_people set notes = 't' where id = s; get diagnostics n = row_count;
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' ✗ العضو عدّل أخاه;'; end if;
  update f4_people set notes = 't' where id = u; get diagnostics n = row_count;
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' ✗ العضو عدّل شخصاً غريباً;'; end if;

  select count(*) into n from f4_people where id = a;
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' ✗ العضو لا يرى بيانات أبيه;'; end if;
  select count(*) into n from f4_people where id = s;
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' ✗ العضو لا يرى بيانات أخيه;'; end if;
  select count(*) into n from f4_people where id = u;
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' ✗ العضو يرى بيانات شخص غريب;'; end if;
  select count(*) into n from f4_users where email <> mem;
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' ✗ العضو يرى حسابات الآخرين;'; end if;

  delete from f4_people where id = m; get diagnostics n = row_count;
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' ✗ العضو حذف سجله الشخصي;'; end if;
  delete from f4_people where id = a; get diagnostics n = row_count;
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' ✗ العضو حذف أباه;'; end if;

  update f4_settings set value = value where key = 'bday_msg'; get diagnostics n = row_count;
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' ✗ العضو عدّل الإعدادات;'; end if;
  update f4_users set role = 'admin' where email = mem; get diagnostics n = row_count;
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' ✗ العضو رفع صلاحياته إلى مدير;'; end if;

  begin
    insert into f4_people(name1, family, gender, father_id, serial) values ('اختبار-حفيد', 'اختبار', 'ذكر', c, 1);
    select count(*) into n from f4_people where name1 = 'اختبار-حفيد' and serial <> 1;
    if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' ✗ العضو اختار رقم التسلسل بنفسه;'; end if;
  exception when others then bad := bad + 1; r := r || ' ✗ العضو لا يستطيع إضافة حفيد: ' || sqlerrm || ';'; end;

  delete from f4_people where id = c; get diagnostics n = row_count;
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' ✗ العضو لا يستطيع حذف ابنه;'; end if;

  -- ===== غير مسجّل =====
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{}', true);
  select count(*) into n from f4_people;
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' ✗ الزائر غير المسجّل يرى السجلات;'; end if;

  -- ===== المدير =====
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('email', adm, 'role', 'authenticated')::text, true);
  update f4_people set notes = 't' where id = u; get diagnostics n = row_count;
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' ✗ المدير لا يستطيع تعديل أي سجل;'; end if;
  select count(*) into n from f4_users;
  if n > 1 then ok := ok + 1; else bad := bad + 1; r := r || ' ✗ المدير لا يرى المستخدمين;'; end if;
  delete from f4_people where id = s; get diagnostics n = row_count;
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' ✗ المدير لا يستطيع الحذف;'; end if;

  raise exception 'RESULTS: % نجح، % فشل.%', ok, bad, r;
end $t$;
