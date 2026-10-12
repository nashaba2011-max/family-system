/* ===== ألعاب العائلة: بازل من صورة العائلة ===== */
function renderPuzzle(){
  const v = $("#view");
  v.innerHTML = `<div class="pz-wrap">
    <p class="pz-hint">اسحب القطع إلى مكانها على اللوح — تثبت القطعة تلقائياً عندما تقترب من موضعها الصحيح.</p>
    <iframe class="pz-frame" src="puzzle.html?v=1" title="لعبة البازل"></iframe>
  </div>`;
}
