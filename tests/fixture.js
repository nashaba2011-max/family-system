/* بيانات تجريبية وهمية للاختبارات فقط — ليست بيانات العائلة الحقيقية */
(function(){
  const now = "2026-01-01T00:00:00Z";
  const P = (id, serial, name1, name2, name3, gender, father_id = null, mother_id = null, extra = {}) =>
    ({id, serial, name1, name2, name3, name4:null, name5:null, name6:null, family:"التجربة", gender, father_id, mother_id, status:"على قيد الحياة",
      phone:null, birth_date:null, affiliation:"من العائلة", created_at:now, updated_at:now, created_by:"admin@test.bh", nationality:gender === "ذكر" ? "بحريني" : null, ...extra});
  const thisMonth = new Date().toISOString().slice(5, 7);
  window.__TEST_FIXTURE = {
    f4_people: [
      P(1, 1, "جاسم", "حمد", "سالم", "ذكر", null, null, {status:"متوفى"}),
      P(2, 2, "مريم", "علي", "حسن", "أنثى", null, null, {family:"الغريب", affiliation:"منتسب بالزواج", status:"متوفى"}),
      P(3, 3, "خالد", "جاسم", "حمد", "ذكر", 1, 2, {phone:"33000001", birth_date:`1970-${thisMonth}-15`}),
      P(4, 4, "سارة", "جاسم", "حمد", "أنثى", 1, 2, {phone:"33000002"}),
      P(5, 5, "نورة", "يوسف", "أحمد", "أنثى", null, null, {family:"البعيد", affiliation:"منتسب بالزواج", phone:"33000003"}),
      P(6, 6, "فهد", "خالد", "جاسم", "ذكر", 3, 5, {phone:"33000004"}),
      P(7, 7, "ليلى", "خالد", "جاسم", "أنثى", 3, 5, {phone:"33000005"}),
      P(8, 8, "عمر", "فهد", "خالد", "ذكر", 6, null, {phone:"33000006"}),
      P(9, 9, "ناصر", "جاسم", "حمد", "ذكر", 1, 2, {phone:"33000007"}),
      P(10, 10, "بدر", "ناصر", "جاسم", "ذكر", 9, null, {phone:"33000008", photo_path:"10/photo.jpg"}),
    ],
    f4_spouses: [
      {id:1, person_id:1, ord:1, spouse_id:2, spouse_name:null, spouse_nationality:null},
      {id:2, person_id:2, ord:1, spouse_id:1, spouse_name:null, spouse_nationality:null},
      {id:3, person_id:3, ord:1, spouse_id:5, spouse_name:null, spouse_nationality:null},
      {id:4, person_id:5, ord:1, spouse_id:3, spouse_name:null, spouse_nationality:null},
    ],
    f4_users: [
      {email:"admin@test.bh", display_name:"المدير التجريبي", role:"admin", can_add:true, can_edit:true, can_delete:true, person_id:null, family_only:false, frozen:false, created_at:now},
      {email:"fahad@test.bh", display_name:"فهد", role:"user", can_add:true, can_edit:true, can_delete:true, person_id:6, family_only:true, frozen:false, created_at:now},
    ],
    f4_lookups: [{id:1, kind:"governorate", name:"المحرق", sort:1, parent:null}, {id:2, kind:"branch", name:"الفرع الأول", sort:1, parent:null}],
    f4_settings: [{key:"bday_msg", value:"كل عام وأنت بخير يا {الاسم}\n{المرسل}", updated_at:now, updated_by:"admin@test.bh"}],
    f4_occasions: [], f4_media: [], f4_heritage: [], f4_bday_greets: [], f4_visits: [], f4_ads: [], f4_ad_likes: [],
    f4_game: [], f4_game_hits: [], f4_requests: [], f4_merge_map: [],
  };
})();
