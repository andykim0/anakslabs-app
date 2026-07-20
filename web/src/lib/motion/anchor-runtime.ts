/**
 * mode="auto"에서 데스크톱/모바일 마크업이 함께 있을 때 보이는 앵커로 이동한다.
 * 정적 발행본은 이 문자열을 인라인으로 포함하고, App Router 문서는 클라이언트
 * 부트스트랩이 마운트 뒤 실행한다.
 */
export const ANCHOR_RUNTIME = `(function(){
  if(window.__anaksAnchorDispose) return;
  function onAnchorClick(e){
    var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if(!a) return;
    var id = a.getAttribute('href').slice(1);
    if(!id) return;
    var sel; try { sel = '#' + CSS.escape(id) + ',[data-anchor="' + id + '"]'; } catch(_) { return; }
    var els = document.querySelectorAll(sel);
    for(var i=0;i<els.length;i++){
      var el = els[i];
      if(el.getClientRects().length){ e.preventDefault(); el.scrollIntoView({behavior:'smooth',block:'start'}); return; }
    }
  }
  document.addEventListener('click', onAnchorClick);
  window.__anaksAnchorDispose = function(){
    document.removeEventListener('click', onAnchorClick);
    window.__anaksAnchorDispose = null;
  };
})();`;
