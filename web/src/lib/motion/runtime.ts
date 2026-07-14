/**
 * [motion-system 2단계] 모션 토큰 — CSS + 의존성 0 바닐라 런타임 (문자열 상수).
 *
 * 두 소비 경로 공용:
 *  ① 호스팅(app/s/[domain]): SiteRenderer가 <style>{MOTION_CSS} + 클라이언트가 MOTION_RUNTIME 로드
 *  ② 정적 내보내기(render-static): HTML에 <style>{MOTION_CSS} + 인라인 <script>{MOTION_RUNTIME}
 * framer-motion·React 없음. 애니메이션 속성은 transform/opacity/clip-path/textContent만 → CLS 0.
 * 스코프: `.anaks-site` 하위만. reduced-motion은 CSS가 전 기법 무효화(최종 상태 즉시 표시).
 */

export const MOTION_CSS = `
.anaks-site { --m-amp: 1; --m-dur-scale: 1; }
.anaks-site [data-m-progress] { --scroll-progress: 0; }
/* scroll-reveal / mask-reveal: 기본 보임. 숨김은 런타임이 .m-hide로만 부여(no-JS=보임) */
.anaks-site [data-m="reveal"].m-hide { opacity: 0; transform: translateY(calc(26px * var(--m-amp))); }
.anaks-site [data-m="reveal"].m-show { opacity: 1; transform: none;
  transition: opacity calc(600ms * var(--m-dur-scale)) cubic-bezier(.22,1,.36,1),
              transform calc(600ms * var(--m-dur-scale)) cubic-bezier(.22,1,.36,1); }
.anaks-site [data-m="mask"] { overflow: hidden; }
.anaks-site [data-m="mask"].m-hide { clip-path: inset(0 100% 0 0); }
.anaks-site [data-m="mask"].m-show { clip-path: inset(0 0 0 0);
  transition: clip-path calc(720ms * var(--m-dur-scale)) cubic-bezier(.22,1,.36,1); }
/* ken-burns: 배경 이미지 슬로우 줌 (콘텐츠 안 가림). 뷰포트 밖은 런타임이 play-state 정지 */
.anaks-site [data-m="kenburns"] { animation: anaks-kenburns calc(22s * var(--m-dur-scale)) ease-in-out infinite alternate; transform-origin: 50% 50%; will-change: transform; }
@keyframes anaks-kenburns { from { transform: scale(1); } to { transform: scale(calc(1 + 0.08 * var(--m-amp))); } }
/* ---------- [3단계] Premium ---------- */
/* video-hero: 배경 영상. 기본 opacity 0 → 재생 성공 시에만 노출(런타임). no-JS·reduced-motion·로드실패면
   0 유지 → 뒤의 poster <img>가 그대로 보임(빈 화면 리스크 원천 차단). */
.anaks-site [data-m="videohero"] { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity calc(700ms * var(--m-dur-scale)) ease; }
/* split-text: 히어로 헤드라인 단어 등장 (reveal와 동일 hide/show, 인라인 블록) */
.anaks-site [data-m="splitword"] { display: inline-block; white-space: pre; }
.anaks-site [data-m="splitword"].m-hide { opacity: 0; transform: translateY(calc(18px * var(--m-amp))); }
.anaks-site [data-m="splitword"].m-show { opacity: 1; transform: none;
  transition: opacity calc(520ms * var(--m-dur-scale)) cubic-bezier(.22,1,.36,1),
              transform calc(520ms * var(--m-dur-scale)) cubic-bezier(.22,1,.36,1); }
/* parallax: 레이어 translateY는 런타임이 인라인 transform으로 (GPU 힌트만 CSS) */
.anaks-site [data-m="parallax"] [data-m-depth] { will-change: transform; }
/* spotlight: 커서 추적 빛 (다크 섹션 한정 — 계획 단계에서 강제). 커서 좌표는 런타임 --mx/--my */
.anaks-site [data-m="spotlight"] { position: relative; }
.anaks-site [data-m="spotlight"]::before { content: ""; position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background: radial-gradient(40cqw circle at calc(var(--mx, 0.5) * 100%) calc(var(--my, 0.5) * 100%),
    rgba(255,255,255, calc(0.12 * var(--m-amp))), transparent 60%); }
/* stacking-cards: 카드가 scale+rise로 제자리에 안착(절대 캔버스 모델 내 정직 구현 — 진짜 pin-sticky는
   흐름 레이아웃 프리미티브 필요, 4단계 이월). reveal와 동일 hide/show IO 사용. */
.anaks-site [data-m="stacking"] { position: relative; }
.anaks-site [data-m="stackcard"].m-hide { opacity: 0; transform: translateY(calc(40px * var(--m-amp))) scale(0.96); }
.anaks-site [data-m="stackcard"].m-show { opacity: 1; transform: none;
  transition: opacity calc(680ms * var(--m-dur-scale)) cubic-bezier(.22,1,.36,1),
              transform calc(680ms * var(--m-dur-scale)) cubic-bezier(.22,1,.36,1); }
/* marquee: 흐름 띠 (트랙 복제로 심리스 루프, 복제는 aria-hidden). 뷰포트 밖은 런타임이 정지 */
.anaks-site .anaks-mq { overflow: hidden; width: 100%; }
.anaks-site .anaks-mq-track { display: flex; width: max-content; align-items: center; }
.anaks-site [data-m="marquee"] .anaks-mq-track { animation: anaks-marquee calc(32s * var(--m-dur-scale)) linear infinite; will-change: transform; }
@keyframes anaks-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) {
  .anaks-site [data-m] { animation: none !important; transition: none !important; }
  .anaks-site [data-m="marquee"] .anaks-mq-track { animation: none !important; }
  .anaks-site [data-m="reveal"].m-hide, .anaks-site [data-m="mask"].m-hide,
  .anaks-site [data-m="splitword"].m-hide, .anaks-site [data-m="stackcard"].m-hide { opacity: 1 !important; transform: none !important; clip-path: none !important; }
  .anaks-site [data-m="spotlight"]::before { display: none !important; }
}
`;

/**
 * 의존성 0 IIFE. data-* 속성만 읽어 동작. JS 미로드 시 콘텐츠는 CSS 기본값(보임).
 * [3단계] 공통 모듈 확장: video(IO 재생/정지·poster 폴백) / pointer(--mx,--my·터치 비활성) /
 * scrollProgress(parallax 레이어·scroll-scrub 비디오 rAF lerp) / hover-video. 전부 뷰포트 밖 rAF 중단,
 * reduced-motion에서 전 모듈 정지(초기 early-return). 정적 내보내기 인라인 포함(2단계 경로 재사용).
 */
export const MOTION_RUNTIME = `(function(){
  try{
    var mm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    if(mm && mm.matches) return; /* reduced-motion: CSS가 최종 상태로 처리 */
    if(!('IntersectionObserver' in window)) return; /* IO 없으면 보임 유지 */
    var q = function(s){ return Array.prototype.slice.call(document.querySelectorAll('.anaks-site '+s)); };
    var root = document.querySelector('.anaks-site');
    var amp0 = root ? (parseFloat(getComputedStyle(root).getPropertyValue('--m-amp'))||1) : 1;
    /* reveal + mask + split-text 단어 + stacking 카드: 초기화 시점에 숨김 부여 후 진입 시 표시 */
    var reveals = q('[data-m="reveal"]').concat(q('[data-m="mask"]')).concat(q('[data-m="splitword"]')).concat(q('[data-m="stackcard"]'));
    reveals.forEach(function(el){ el.classList.add('m-hide'); });
    var io = new IntersectionObserver(function(es){
      es.forEach(function(e){ if(!e.isIntersecting) return; var el=e.target; io.unobserve(el);
        var d = parseInt(el.getAttribute('data-m-delay')||'0',10);
        setTimeout(function(){ el.classList.remove('m-hide'); el.classList.add('m-show'); }, d); });
    }, { rootMargin:'0px 0px -8% 0px', threshold:0.08 });
    reveals.forEach(function(el){ io.observe(el); });
    /* count-up: 진입 시 0→목표 (textContent) */
    var cio = new IntersectionObserver(function(es){
      es.forEach(function(e){ if(!e.isIntersecting) return; var el=e.target; cio.unobserve(el);
        var to = parseFloat(el.getAttribute('data-m-to')||'0');
        var pre = el.getAttribute('data-m-prefix')||''; var suf = el.getAttribute('data-m-suffix')||'';
        var dur=800, start=null;
        function step(ts){ if(!start)start=ts; var p=Math.min((ts-start)/dur,1);
          el.textContent = pre + Math.round(to*p).toLocaleString() + suf; if(p<1) requestAnimationFrame(step); }
        requestAnimationFrame(step); });
    }, { threshold:0.5 });
    q('[data-m="countup"]').forEach(function(el){ cio.observe(el); });
    /* ken-burns/marquee: 뷰포트 밖 정지 (CSS animation play-state) */
    var lio = new IntersectionObserver(function(es){
      es.forEach(function(e){ e.target.style.animationPlayState = e.isIntersecting ? 'running' : 'paused'; }); });
    q('[data-m="kenburns"]').concat(q('[data-m="marquee"] .anaks-mq-track')).forEach(function(el){ lio.observe(el); });

    /* ---- [V2] 진행도 드라이버: nearest scroll root + passive scroll + rAF coalescing. ---- */
    var progressEls = q('[data-m-progress]');
    if(window.__anaksProgressDispose){ try{ window.__anaksProgressDispose(); }catch(_){} }
    if(progressEls.length){
      var progressActive = [], progressTick = false, progressRoots = [];
      function scrollRootOf(el){
        var p=el.parentElement;
        while(p && p!==document.body && p!==document.documentElement){
          var oy=''; try{ oy=getComputedStyle(p).overflowY||''; }catch(_){}
          if(/auto|scroll|overlay/.test(oy) && p.scrollHeight>p.clientHeight) return p;
          p=p.parentElement;
        }
        return null;
      }
      function updateProgress(el){
        var rootEl=el.__anaksScrollRoot; var r=el.getBoundingClientRect();
        var rr=rootEl ? rootEl.getBoundingClientRect() : {top:0};
        var vh=rootEl ? rootEl.clientHeight : (window.innerHeight||document.documentElement.clientHeight||1);
        var travel=Math.max(1,r.height-vh); var top=r.top-rr.top;
        var p=Math.min(1,Math.max(0,-top/travel));
        el.style.setProperty('--scroll-progress',p.toFixed(4));
      }
      function progressFrame(){
        progressTick=false;
        for(var i=0;i<progressActive.length;i++) updateProgress(progressActive[i]);
      }
      function scheduleProgress(){
        if(progressTick) return; progressTick=true; requestAnimationFrame(progressFrame);
      }
      function listenRoot(rootEl){
        for(var i=0;i<progressRoots.length;i++) if(progressRoots[i]===rootEl) return;
        progressRoots.push(rootEl);
        (rootEl||window).addEventListener('scroll',scheduleProgress,{passive:true});
      }
      progressEls.forEach(function(el){
        el.__anaksScrollRoot=scrollRootOf(el); listenRoot(el.__anaksScrollRoot); updateProgress(el);
      });
      window.addEventListener('resize',scheduleProgress,{passive:true});
      var progressIo=new IntersectionObserver(function(es){
        es.forEach(function(e){
          var i=progressActive.indexOf(e.target);
          if(e.isIntersecting){ if(i<0) progressActive.push(e.target); }
          else { if(i>=0) progressActive.splice(i,1); updateProgress(e.target); }
        });
        if(progressActive.length) scheduleProgress();
      },{threshold:0});
      progressEls.forEach(function(el){ progressIo.observe(el); });
      window.__anaksProgressDispose=function(){
        progressIo.disconnect();
        for(var i=0;i<progressRoots.length;i++) (progressRoots[i]||window).removeEventListener('scroll',scheduleProgress);
        window.removeEventListener('resize',scheduleProgress);
        progressActive.length=0; progressRoots.length=0;
      };
    }

    /* ---- video 모듈: video-hero 배경 영상 IO 재생/정지. 로드 실패→poster(요소 숨김). ---- */
    q('video[data-m="videohero"]').forEach(function(v){
      v.muted = true; v.defaultMuted = true; v.setAttribute('playsinline','');
      v.addEventListener('playing', function(){ v.style.opacity='1'; }); /* 재생 시작해야 노출 */
      v.addEventListener('error', function(){ v.style.opacity='0'; });   /* 실패 → poster <img> 유지 */
      var pio = new IntersectionObserver(function(es){ es.forEach(function(e){
        if(e.isIntersecting){ var p=v.play&&v.play(); if(p&&p.catch)p.catch(function(){}); }
        else if(v.pause) v.pause();
      }); }, { threshold:0.1 });
      pio.observe(v);
    });
    /* ---- hover-video 모듈: 썸네일 hover 재생(데스크톱만). preload none은 마크업. ---- */
    if(!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)){
      q('video[data-m="hovervideo"]').forEach(function(v){
        v.muted=true; v.defaultMuted=true; v.setAttribute('playsinline','');
        v.addEventListener('mouseenter',function(){ var p=v.play&&v.play(); if(p&&p.catch)p.catch(function(){}); });
        v.addEventListener('mouseleave',function(){ if(v.pause){v.pause(); try{v.currentTime=0;}catch(_){}} });
      });
      /* ---- pointer 모듈: spotlight 섹션 로컬 커서 → --mx,--my (터치 비활성) ---- */
      q('[data-m="spotlight"]').forEach(function(sec){
        sec.addEventListener('pointermove', function(e){
          var r=sec.getBoundingClientRect(); if(!r.width||!r.height) return;
          sec.style.setProperty('--mx', ((e.clientX-r.left)/r.width).toFixed(4));
          sec.style.setProperty('--my', ((e.clientY-r.top)/r.height).toFixed(4));
        });
      });
    }
    /* ---- scrollProgress 모듈: parallax 레이어 + scroll-scrub 비디오 (rAF, 뷰포트 밖 중단) ---- */
    var scrubs = q('[data-m="scrollscrub"]');
    var plx = q('[data-m="parallax"]');
    var active = [], ticking = false;
    function doParallax(sec){
      var layers = Array.prototype.slice.call(sec.querySelectorAll('[data-m-depth]'));
      var r = sec.getBoundingClientRect(); var vh = window.innerHeight||1;
      var rel = ((r.top + r.height/2) - vh/2) / (vh/2 + r.height/2); /* -1..1 */
      layers.forEach(function(ly){
        var depth = parseFloat(ly.getAttribute('data-m-depth')||'0');
        ly.style.transform = 'translate3d(0,'+(rel*24*depth*amp0*-1).toFixed(2)+'px,0)';
      });
    }
    function doScrub(sec){
      var v = sec.querySelector('video[data-m-scrub]'); if(!v) return;
      var r = sec.getBoundingClientRect(); var total = r.height - (window.innerHeight||0);
      if(total<=0) return; var dur = v.duration||0; if(!dur) return;
      var p = Math.min(1, Math.max(0, -r.top/total));
      var target = p*dur; v._mt = (v._mt==null? target : v._mt + (target - v._mt)*0.15);
      try{ v.currentTime = v._mt; }catch(_){}
    }
    function frame(){
      for(var i=0;i<active.length;i++){
        var sec=active[i];
        if(sec.getAttribute('data-m')==='parallax') doParallax(sec); else doScrub(sec);
      }
      if(active.length) requestAnimationFrame(frame); else ticking=false;
    }
    if(scrubs.length || plx.length){
      var sio = new IntersectionObserver(function(es){
        es.forEach(function(e){ var i=active.indexOf(e.target);
          if(e.isIntersecting){ if(i<0) active.push(e.target); } else if(i>=0) active.splice(i,1); });
        if(active.length && !ticking){ ticking=true; requestAnimationFrame(frame); }
      }, { rootMargin:'0px' });
      scrubs.concat(plx).forEach(function(s){ sio.observe(s); });
    }
  }catch(_){/* 모션 실패는 콘텐츠에 영향 없음 */}
})();`;
