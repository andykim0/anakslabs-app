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
/* cinematic은 progressive enhancement: no-JS/reduced 기본은 정적 poster, ready 이후에만 pin. */
.anaks-site [data-cinematic-layout="desktop"] { height: var(--cinematic-static-height); }
.anaks-site [data-cinematic-layout="desktop"] [data-m-pin] { position: relative; height: 100%; overflow: hidden; }
.anaks-site.m-cinematic-ready [data-cinematic-layout="desktop"] {
  height: var(--cinematic-scroll-height); min-height: 240svh;
}
.anaks-site.m-cinematic-ready [data-cinematic-layout="desktop"] [data-m-pin] {
  position: sticky; top: 0; height: min(100svh, var(--cinematic-static-height));
}
.anaks-site [data-cinematic-layout="mobile"] [data-m-mobile-pin] {
  position: absolute; inset: 0; height: 100%; overflow: hidden; z-index: 0;
}
.anaks-site.m-cinematic-ready [data-cinematic-layout="mobile"] [data-m-mobile-pin] {
  position: sticky; inset: auto; top: 0; height: 100svh; margin-bottom: -100svh;
}
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
.anaks-site [data-m="videohero"], .anaks-site [data-m="cinematicvideo"] { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity calc(700ms * var(--m-dur-scale)) ease; }
/* split-text: 히어로 헤드라인 단어 등장 (reveal와 동일 hide/show, 인라인 블록) */
.anaks-site [data-m="splitword"] { display: inline-block; white-space: pre; }
.anaks-site [data-m="storyword"] { display: inline-block; white-space: pre; }
.anaks-site.m-cinematic-ready [data-m="storyword"],
.anaks-site.m-cinematic-ready [data-m-story] {
  opacity: var(--story-opacity, 1);
  transform: translate3d(0, calc(var(--story-y, 0px) + var(--cinematic-parallax-y, 0px)), 0);
  will-change: transform, opacity;
}
.anaks-site.m-cinematic-ready [data-m-cinematic-layer]:not([data-m-story]) {
  transform: translate3d(0, var(--cinematic-parallax-y, 0px), 0);
  will-change: transform;
}
.anaks-site.m-cinematic-ready [data-m-cinematic-media] {
  transform: scale(var(--cinematic-scale, 1));
  clip-path: inset(var(--cinematic-clip, 0%) round 24px);
  transform-origin: 50% 50%; will-change: transform, clip-path;
}
/* ---------- [SS3] 페이지 관통 다막 무대 ----------
   기본(no-JS/reduced)은 poster + 시맨틱 article 세로 스택. ready에서만 데스크 pin/막 전환으로 향상한다. */
.anaks-site [data-ss-stage] {
  position: relative; height: var(--ss-scroll-height); background: var(--ss-stage-bg);
  contain: layout paint;
}
.anaks-site [data-ss-pin] { position: relative; }
.anaks-site [data-ss-media] { position: relative; height: var(--ss-static-height); min-height: 360px; overflow: hidden; }
.anaks-site [data-ss-act-list] { position: relative; z-index: 2; }
.anaks-site [data-ss-act] {
  position: relative; min-height: 240px; display: flex; align-items: center;
  padding: clamp(48px, 8vw, 120px); color: var(--ss-stack-text); background: var(--ss-stack-bg);
}
.anaks-site [data-ss-copy] { width: min(820px, 100%); margin: 0 auto; }
.anaks-site [data-ss-heading] { margin: 0; font-family: var(--ss-heading-font); font-size: clamp(2rem, 5vw, 5rem); line-height: 1.12; }
.anaks-site [data-ss-body] { margin: 24px 0 0; max-width: 680px; font-size: clamp(1rem, 1.5vw, 1.35rem); line-height: 1.75; }
.anaks-site [data-ss-word] { display: inline-block; white-space: pre; }
.anaks-site.m-scrollytelling-ready [data-ss-stage] { height: var(--ss-scroll-height); }
.anaks-site.m-scrollytelling-ready [data-ss-pin] { position: sticky; top: 0; height: 100svh; overflow: hidden; }
.anaks-site.m-scrollytelling-ready [data-ss-media] { position: absolute; inset: 0; height: auto; min-height: 0; }
.anaks-site.m-scrollytelling-ready [data-ss-act-list] { position: absolute; inset: 0; }
.anaks-site.m-scrollytelling-ready [data-ss-act] {
  position: absolute; inset: 0; min-height: 0; opacity: var(--ss-act-opacity, 1);
  transform: translate3d(0, var(--ss-act-y, 0px), 0); color: var(--ss-text); background: transparent;
  will-change: transform, opacity; pointer-events: none;
}
.anaks-site.m-scrollytelling-ready [data-ss-word] {
  opacity: var(--ss-word-opacity, 1); transform: translate3d(0, var(--ss-word-y, 0px), 0);
  will-change: transform, opacity;
}
.anaks-site.m-scrollytelling-ready [data-ss-stage][data-ss-mode="mobile"] { height: auto; }
.anaks-site.m-scrollytelling-ready [data-ss-stage][data-ss-mode="mobile"] [data-ss-pin] { position: relative; top: auto; height: auto; overflow: visible; }
.anaks-site.m-scrollytelling-ready [data-ss-stage][data-ss-mode="mobile"] [data-ss-media] {
  position: sticky; inset: auto; top: 0; height: 100svh; min-height: 0; margin-bottom: -100svh;
}
.anaks-site.m-scrollytelling-ready [data-ss-stage][data-ss-mode="mobile"] [data-ss-act-list] { position: relative; inset: auto; }
.anaks-site.m-scrollytelling-ready [data-ss-stage][data-ss-mode="mobile"] [data-ss-act] {
  position: relative; inset: auto; min-height: 100svh; pointer-events: auto;
}
@media (max-width: 767.98px) {
  .anaks-site.m-scrollytelling-ready [data-ss-stage][data-ss-mode="auto"] { height: auto; }
  .anaks-site.m-scrollytelling-ready [data-ss-stage][data-ss-mode="auto"] [data-ss-pin] { position: relative; top: auto; height: auto; overflow: visible; }
  .anaks-site.m-scrollytelling-ready [data-ss-stage][data-ss-mode="auto"] [data-ss-media] {
    position: sticky; inset: auto; top: 0; height: 100svh; min-height: 0; margin-bottom: -100svh;
  }
  .anaks-site.m-scrollytelling-ready [data-ss-stage][data-ss-mode="auto"] [data-ss-act-list] { position: relative; inset: auto; }
  .anaks-site.m-scrollytelling-ready [data-ss-stage][data-ss-mode="auto"] [data-ss-act] {
    position: relative; inset: auto; min-height: 100svh; pointer-events: auto;
  }
}
.anaks-site.m-scrollytelling-static [data-ss-stage] { height: auto; contain: none; }
.anaks-site.m-scrollytelling-static [data-ss-video] { display: none !important; }
@media (prefers-reduced-motion: reduce) {
  .anaks-site [data-ss-stage] { height: auto !important; contain: none; }
}
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
  .anaks-site [data-m="cinematicvideo"] { display: none !important; }
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
    var q = function(s){ return Array.prototype.slice.call(document.querySelectorAll('.anaks-site '+s)); };
    var root = document.querySelector('.anaks-site');
    var hasScrollytelling = q('[data-ss-stage]').length>0;
    var mm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    if(mm && mm.matches){ if(root){ root.classList.remove('m-cinematic-ready'); root.classList.remove('m-scrollytelling-ready'); root.classList.add('m-scrollytelling-static'); } return; } /* 정적 poster */
    if(!('IntersectionObserver' in window)){ if(root&&hasScrollytelling) root.classList.add('m-scrollytelling-static'); return; } /* IO 없으면 스택 유지 */
    var connection0=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
    var reportedCores=navigator.hardwareConcurrency;
    var cores0=typeof reportedCores==='number'&&Number.isFinite(reportedCores)?reportedCores:0;
    var scrollytellingCapable=!(connection0&&connection0.saveData)&&cores0>=4;
    if(root){
      root.classList.add('m-cinematic-ready');
      if(hasScrollytelling){
        root.classList.toggle('m-scrollytelling-ready',scrollytellingCapable);
        root.classList.toggle('m-scrollytelling-static',!scrollytellingCapable);
      }
    }
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

    function startCinematicLoop(v){
      v.__anaksPlayback='loop'; v.loop=true; v.autoplay=true; v.setAttribute('autoplay','');
      v.setAttribute('data-playback-state','loop');
      if(v.__anaksIntersecting){ var play=v.play&&v.play(); if(play&&play.catch) play.catch(function(){}); }
    }
    function syncCinematicProgress(el,p){
      var v=el.querySelector('video[data-m-cinematic-video][data-playback="scrub"]');
      if(!v || v.__anaksPlayback!=='scrub' || !v.duration || v.seeking) return;
      var target=Math.min(v.duration,Math.max(0,p*v.duration));
      if(Math.abs((v.currentTime||0)-target)<0.025) return;
      v.__anaksSeekStarted=(window.performance&&performance.now)?performance.now():Date.now();
      try{ v.currentTime=target; }catch(_){ startCinematicLoop(v); }
    }
    function localProgress(node,p){
      var start=parseFloat(node.getAttribute('data-story-start')||'0');
      var end=parseFloat(node.getAttribute('data-story-end')||'1');
      if(end<=start) return p>=start?1:0;
      return Math.min(1,Math.max(0,(p-start)/(end-start)));
    }
    function syncCinematicStory(el,p){
      if(el.hasAttribute('data-ss-stage') && (!root || !root.classList.contains('m-scrollytelling-ready'))) return;
      var stories=el.__anaksStoryEls||(el.__anaksStoryEls=Array.prototype.slice.call(el.querySelectorAll('[data-m="storyword"],[data-m-story]')));
      stories.forEach(function(node){
        var local=localProgress(node,p);
        node.style.setProperty('--story-opacity',local.toFixed(4));
        node.style.setProperty('--story-y',((1-local)*18*amp0).toFixed(2)+'px');
      });
      var layers=el.__anaksCinematicLayers||(el.__anaksCinematicLayers=Array.prototype.slice.call(el.querySelectorAll('[data-m-cinematic-layer]')));
      layers.forEach(function(layer){
        var depth=parseFloat(layer.getAttribute('data-m-depth')||'0');
        var y=Math.sin(p*Math.PI)*-24*depth*amp0;
        layer.style.setProperty('--cinematic-parallax-y',y.toFixed(2)+'px');
      });
      var phase=Math.min(1,Math.max(0,p/0.32));
      var scale=0.92+phase*0.08; var clip=(1-phase)*4;
      var media=el.__anaksCinematicMedia||(el.__anaksCinematicMedia=Array.prototype.slice.call(el.querySelectorAll('[data-m-cinematic-media]')));
      media.forEach(function(node){
        node.style.setProperty('--cinematic-scale',scale.toFixed(4));
        node.style.setProperty('--cinematic-clip',clip.toFixed(3)+'%');
      });
    }
    function syncScrollytelling(el,p){
      if(!el.hasAttribute('data-ss-stage') || !root || !root.classList.contains('m-scrollytelling-ready')) return;
      var acts=el.__anaksActs||(el.__anaksActs=Array.prototype.slice.call(el.querySelectorAll('[data-ss-act]')));
      acts.forEach(function(act,index){
        var start=parseFloat(act.getAttribute('data-act-start')||'0');
        var end=parseFloat(act.getAttribute('data-act-end')||'1');
        var span=Math.max(0.0001,end-start); var fade=Math.min(0.06,span*0.22); var opacity=1;
        if(index===0 && p<=start+fade) opacity=1;
        else if(index===acts.length-1 && p>=end-fade) opacity=1;
        else if(p<start-fade || p>end+fade) opacity=0;
        else if(p<start+fade) opacity=(p-(start-fade))/(fade*2);
        else if(p>end-fade) opacity=1-(p-(end-fade))/(fade*2);
        opacity=Math.min(1,Math.max(0,opacity));
        act.style.setProperty('--ss-act-opacity',opacity.toFixed(4));
        act.style.setProperty('--ss-act-y',((1-opacity)*22*amp0).toFixed(2)+'px');
        var local=Math.min(1,Math.max(0,(p-start)/span));
        var words=act.__anaksWords||(act.__anaksWords=Array.prototype.slice.call(act.querySelectorAll('[data-ss-word]')));
        words.forEach(function(word,wordIndex){
          var count=Math.max(1,words.length); var ws=(wordIndex/count)*0.62; var we=Math.min(1,ws+0.28);
          var wp=wordIndex===0?1:(we<=ws?(local>=ws?1:0):Math.min(1,Math.max(0,(local-ws)/(we-ws))));
          word.style.setProperty('--ss-word-opacity',wp.toFixed(4));
          word.style.setProperty('--ss-word-y',((1-wp)*16*amp0).toFixed(2)+'px');
        });
        var counter=act.querySelector('[data-ss-count]');
        if(counter){
          var to=parseFloat(counter.getAttribute('data-count-to')||'0');
          var decimals=parseInt(counter.getAttribute('data-count-decimals')||'0',10);
          if(Number.isFinite(to)){
            var current=to*local;
            counter.textContent=decimals>0
              ? current.toLocaleString(undefined,{minimumFractionDigits:decimals,maximumFractionDigits:decimals})
              : Math.round(current).toLocaleString();
          }
        }
      });
    }

    /* ---- [V2] 진행도 드라이버: nearest scroll root + passive scroll + rAF coalescing. ---- */
    var progressEls = q('[data-m-progress]').filter(function(el){
      return !el.hasAttribute('data-ss-stage') || !!(root&&root.classList.contains('m-scrollytelling-ready'));
    });
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
        syncCinematicProgress(el,p);
        syncCinematicStory(el,p);
        syncScrollytelling(el,p);
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
    /* ---- [V3] cinematic video: desktop scrub / mobile pinned loop / seek 실패 loop 폴백. ---- */
    if(window.__anaksCinematicDispose){ try{ window.__anaksCinematicDispose(); }catch(_){} }
    var cinematicVideos=q('video[data-m-cinematic-video]').filter(function(v){
      if(v.hasAttribute('data-ss-video') && (!root || !root.classList.contains('m-scrollytelling-ready'))){
        v.__anaksPlayback='poster'; v.setAttribute('data-playback-state','poster'); v.style.opacity='0'; if(v.pause)v.pause(); return false;
      }
      return true;
    });
    if(cinematicVideos.length){
      var cinemaCleanups=[], cinemaTimers=[];
      function on(v,name,fn){ v.addEventListener(name,fn); cinemaCleanups.push(function(){v.removeEventListener(name,fn);}); }
      function canDesktopScrub(v){
        var fine=window.matchMedia&&window.matchMedia('(pointer: fine)').matches;
        var stage=v.closest&&v.closest('[data-ss-stage]');
        var forcedMobile=stage&&stage.getAttribute('data-ss-mode')==='mobile';
        return v.getAttribute('data-playback')==='scrub' && !forcedMobile && !!fine && window.innerWidth>=768 && !(connection0&&connection0.saveData) && cores0>=4;
      }
      cinematicVideos.forEach(function(v){
        v.muted=true; v.defaultMuted=true; v.setAttribute('playsinline',''); v.__anaksIntersecting=false;
        v.__anaksPlayback=canDesktopScrub(v)?'scrub':'loop';
        v.setAttribute('data-playback-state',v.__anaksPlayback);
        if(v.__anaksPlayback==='scrub'){ v.loop=false; v.autoplay=false; v.removeAttribute('autoplay'); if(v.pause)v.pause(); }
        var reveal=function(){ v.style.opacity='1'; };
        var failPoster=function(){ v.__anaksPlayback='poster'; v.style.opacity='0'; if(v.pause)v.pause(); };
        on(v,'loadeddata',reveal); on(v,'playing',reveal); on(v,'error',failPoster);
        on(v,'seeked',function(){
          reveal();
          if(v.__anaksPlayback!=='scrub' || v.__anaksSeekStarted==null) return;
          var now=(window.performance&&performance.now)?performance.now():Date.now();
          if(now-v.__anaksSeekStarted>350) v.__anaksSlowSeeks=(v.__anaksSlowSeeks||0)+1;
          else v.__anaksSlowSeeks=0;
          v.__anaksSeekStarted=null;
          if(v.__anaksSlowSeeks>=2) startCinematicLoop(v);
        });
      });
      var cinemaIo=new IntersectionObserver(function(es){ es.forEach(function(e){
        var v=e.target; v.__anaksIntersecting=e.isIntersecting;
        if(!e.isIntersecting){ if(v.pause)v.pause(); return; }
        if(v.readyState===0){ v.preload='metadata'; if(v.load)v.load(); }
        if(v.__anaksPlayback==='loop') startCinematicLoop(v);
        else if(v.__anaksPlayback==='scrub'){
          if(v.pause)v.pause();
          var timer=setTimeout(function(){ if(v.__anaksPlayback==='scrub' && !v.duration) startCinematicLoop(v); },5000);
          cinemaTimers.push(timer);
        }
      }); },{threshold:0.1});
      cinematicVideos.forEach(function(v){ cinemaIo.observe(v); });
      window.__anaksCinematicDispose=function(){
        cinemaIo.disconnect();
        cinemaCleanups.forEach(function(off){off();}); cinemaCleanups.length=0;
        cinemaTimers.forEach(function(timer){clearTimeout(timer);}); cinemaTimers.length=0;
        cinematicVideos.forEach(function(v){ if(v.pause)v.pause(); });
      };
    }
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
