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
@media (prefers-reduced-motion: reduce) {
  .anaks-site [data-m] { animation: none !important; transition: none !important; }
  .anaks-site [data-m="reveal"].m-hide, .anaks-site [data-m="mask"].m-hide { opacity: 1 !important; transform: none !important; clip-path: none !important; }
}
`;

/** 의존성 0 IIFE. data-* 속성만 읽어 동작. JS 미로드 시 콘텐츠는 CSS 기본값(보임). */
export const MOTION_RUNTIME = `(function(){
  try{
    var mm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    if(mm && mm.matches) return; /* reduced-motion: CSS가 최종 상태로 처리 */
    if(!('IntersectionObserver' in window)) return; /* IO 없으면 보임 유지 */
    var q = function(s){ return Array.prototype.slice.call(document.querySelectorAll('.anaks-site '+s)); };
    /* reveal + mask: 초기화 시점에 숨김 부여 후 진입 시 표시 */
    var reveals = q('[data-m="reveal"]').concat(q('[data-m="mask"]'));
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
    /* ken-burns/marquee: 뷰포트 밖 정지 */
    var lio = new IntersectionObserver(function(es){
      es.forEach(function(e){ e.target.style.animationPlayState = e.isIntersecting ? 'running' : 'paused'; }); });
    q('[data-m="kenburns"]').concat(q('[data-m="marquee"]')).forEach(function(el){ lio.observe(el); });
  }catch(_){/* 모션 실패는 콘텐츠에 영향 없음 */}
})();`;
