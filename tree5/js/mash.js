/* تصميم «المشربية» — حركات GSAP وتمرير Lenis الناعم لبطاقات الرئيسية والبنر */
(function(){
  "use strict";
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var G = typeof window.gsap !== "undefined";
  if(G) document.documentElement.classList.add("mash-js");

  /* تمرير ناعم — لا يتدخل في القوائم والنوافذ والشجرة التي لها تمرير خاص */
  try{
    if(!reduce && typeof window.Lenis !== "undefined" && matchMedia("(pointer:fine)").matches){
      var lenis = new Lenis({lerp:.1, prevent:function(node){
        for(var n = node; n && n !== document.body; n = n.parentElement){
          if(n.tagName === "DIALOG" || n.classList.contains("sidenav")) return true;
          var cs = getComputedStyle(n);
          if(/(auto|scroll)/.test(cs.overflowY + cs.overflowX) && (n.scrollHeight > n.clientHeight + 2 || n.scrollWidth > n.clientWidth + 2)) return true;
        }
        return false;
      }});
      (function raf(t){ lenis.raf(t); requestAnimationFrame(raf); })(performance.now());
      window.addEventListener("hashchange", function(){ lenis.scrollTo(0, {immediate:true}); });
    }
  }catch(e){}

  /* شرارات ذهبية */
  var cv, cx, sp = [], run = false;
  function fx(){
    if(cv) return;
    cv = document.createElement("canvas"); cv.id = "mashFx"; document.body.appendChild(cv); cx = cv.getContext("2d");
    var size = function(){ var d = devicePixelRatio || 1; cv.width = innerWidth * d; cv.height = innerHeight * d; cx.setTransform(d,0,0,d,0,0); };
    size(); addEventListener("resize", size);
  }
  function loop(now){
    cx.clearRect(0, 0, innerWidth, innerHeight);
    sp = sp.filter(function(s){
      var p = (now - s.t) / 480; if(p >= 1) return false;
      var e = p * (2 - p), d = e * 28, l = 13 * (1 - e);
      cx.strokeStyle = "#d9b874"; cx.lineWidth = 2; cx.lineCap = "round"; cx.beginPath();
      cx.moveTo(s.x + d * Math.cos(s.a), s.y + d * Math.sin(s.a)); cx.lineTo(s.x + (d + l) * Math.cos(s.a), s.y + (d + l) * Math.sin(s.a)); cx.stroke();
      return true;
    });
    if(sp.length) requestAnimationFrame(loop); else run = false;
  }
  function spark(x, y){ if(reduce) return; fx(); var t = performance.now(); for(var i = 0; i < 10; i++) sp.push({x:x, y:y, a:i * Math.PI / 5, t:t}); if(!run){ run = true; requestAnimationFrame(loop); } }

  function rosette(svg){
    if(svg.childElementCount) return;
    var s = "";
    for(var i = 0; i < 16; i++) s += '<rect x="-60" y="-60" width="120" height="120" fill="none" stroke="#c49a45" stroke-opacity=".35" transform="rotate(' + (i * 11.25) + ')"/>';
    for(var j = 0; j < 8; j++) s += '<rect x="-30" y="-30" width="60" height="60" fill="none" stroke="#f1d796" stroke-opacity=".45" transform="rotate(' + (j * 11.25) + ')"/>';
    svg.innerHTML = s;
    if(G && !reduce) gsap.to(svg, {rotate: svg.classList.contains("r2") ? -360 : 360, duration:120, repeat:-1, ease:"none", transformOrigin:"50% 50%"});
  }

  function bindTile(t){
    if(t.dataset.mash) return; t.dataset.mash = "1";
    var ic = t.querySelector(".ic");
    if(G && !reduce){
      t.addEventListener("pointerenter", function(){ gsap.to(t, {y:-10, duration:.4, ease:"power3.out"}); gsap.to(ic, {rotate:45, scale:1.1, duration:.6, ease:"back.out(2)"}); });
      t.addEventListener("pointerleave", function(){ gsap.to(t, {y:0, duration:.5, ease:"power3.out"}); gsap.to(ic, {rotate:0, scale:1, duration:.6, ease:"back.out(2)"}); });
    }
    t.addEventListener("click", function(e){
      if(reduce || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      var href = t.getAttribute("href"); if(!href || href.charAt(0) !== "#") return;
      e.preventDefault();
      var r = t.getBoundingClientRect();
      if(G){
        for(var i = 0; i < 2; i++){
          var s = document.createElement("span"); s.className = "mash-rg"; s.style.left = (e.clientX - r.left) + "px"; s.style.top = (e.clientY - r.top) + "px"; t.appendChild(s);
          gsap.fromTo(s, {scale:0, opacity:1}, {scale:26, opacity:0, duration:.7, delay:i * .1, ease:"power2.out", onComplete:(function(n){ return function(){ n.remove(); }; })(s)});
        }
      }
      t.classList.add("on"); spark(e.clientX, e.clientY);
      setTimeout(function(){ t.classList.remove("on"); location.hash = href; }, 260);
    });
  }

  function enhance(){
    var view = document.getElementById("view"); if(!view) return;
    var hero = view.querySelector(".hero-banner.mash");
    if(hero && !hero.dataset.mash){
      hero.dataset.mash = "1";
      hero.querySelectorAll(".hb-rose").forEach(rosette);
      if(G && !reduce) gsap.from(hero.querySelectorAll(".hb-orn,.hb-facts,.hb-acts"), {y:16, opacity:0, duration:.7, stagger:.08, delay:.25, ease:"power3.out"});
    }
    var tiles = view.querySelectorAll(".tile.arch:not([data-mash])");
    if(!tiles.length) return;
    tiles.forEach(bindTile);
    if(G && !reduce) gsap.from(tiles, {y:40, scale:.92, duration:.7, stagger:{each:.04, from:"center"}, ease:"back.out(1.6)", clearProps:"scale"});
  }

  function start(){
    var view = document.getElementById("view"); if(!view) return;
    new MutationObserver(enhance).observe(view, {childList:true});
    enhance();
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
