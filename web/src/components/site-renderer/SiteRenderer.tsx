/**
 * 발행된 SiteConfig → 실제 사이트 렌더 (서버 컴포넌트, JS 최소).
 *
 * 스케일링 전략:
 *  - 루트에 `container-type: inline-size` → 하위의 모든 cqw 단위가
 *    루트 폭 기준 퍼센트로 해석된다. 좌표/크기/폰트를 px/1440*100 cqw로
 *    환산하면 어떤 폭에서도 1440 디자인이 비례 축소/확대 (SSR 안전, JS 측정 0).
 *  - 대시보드 미리보기에서 좁은 컨테이너에 넣어도 그대로 비례 렌더.
 *
 * mode:
 *  - 'desktop' | 'mobile': 해당 레이아웃만 (에디터/대시보드 미리보기용)
 *  - 'auto'(기본): 두 레이아웃을 모두 렌더하고 Tailwind 브레이크포인트로 전환
 *    (hidden md:block / md:hidden) — <768px에서는 y순 세로 스택 재배치.
 */
import type { CSSProperties } from 'react';
import type { MotionTier, SiteConfig } from '@/lib/types/site';
import { findPage, homePage } from '@/lib/types/site';
import { resolveMotionPlan, intensityFactors, planIsActive } from '@/lib/motion/apply';
import { MOTION_CSS, MOTION_RUNTIME } from '@/lib/motion/runtime';
import {
  motionContextFromConfig,
  resolveMotionArtDirectionProfile,
  resolveMotionSignaturePlan,
  type MotionAssetProvenance,
} from '@/lib/motion/signatures';
import { googleFontUrls, needsPretendard, PRETENDARD_CSS_URL } from './fonts';
import { SectionCanvas } from './SectionCanvas';
import { SectionStack } from './SectionStack';
import { ScrollytellingStage } from './ScrollytellingStage';
import {
  consumedSectionIds,
  isRenderableMotionScene,
  MotionSignatureRenderer,
  sceneSourceSectionsAreSafe,
} from './MotionSignatureRenderer';
import { motionSceneMayOwnLcp } from '@/lib/export/motion-scene-assets';

export type SiteRendererMode = 'desktop' | 'mobile' | 'auto';

/** 사이트 공통 베이스 CSS — hover 마이크로 인터랙션은 CSS로만 (JS 금지) */
const BASE_CSS = `
.anaks-site, .anaks-site *, .anaks-site *::before, .anaks-site *::after { box-sizing: border-box; }
.anaks-site { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
.anaks-site a { -webkit-tap-highlight-color: transparent; }
.anaks-btn { transition: transform 0.25s ease, opacity 0.25s ease, box-shadow 0.25s ease; }
.anaks-btn:hover { transform: translateY(-2px); opacity: 0.92; }
.anaks-btn[data-variant="solid"]:hover { box-shadow: 0 12px 28px -10px rgba(0, 0, 0, 0.45); }
.anaks-btn[data-variant="ghost"]:hover { text-decoration: underline; }
@media (prefers-reduced-motion: reduce) {
  .anaks-btn { transition: none; }
  .anaks-btn:hover { transform: none; }
}
`;

/**
 * [T1] 앵커 보정 런타임(의존성 0) — mode 'auto'는 데스크톱/모바일 레이아웃을 모두 렌더하는데
 * 섹션 id는 데스크톱에만 있어, 모바일 뷰포트에서 '#sec-x' 클릭 시 display:none 타깃이 선점돼
 * 스크롤이 무반응이었다(⑤). 같은 해시의 후보(#id, [data-anchor=id]) 중 '보이는' 요소로 스크롤.
 * no-JS: 데스크톱은 네이티브 앵커로 동작(모바일 no-JS만 미지원 — 콘텐츠는 전부 가시).
 */
const ANCHOR_RUNTIME = `(function(){
  document.addEventListener('click', function(e){
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
  });
})();`;

/**
 * AI 생성 customCss를 사이트 루트 클래스로 스코프.
 * CSS 중첩(nesting)으로 감싸 내부 셀렉터가 전부 `.anaks-site` 하위로 한정된다.
 * `</` 시퀀스는 제거해 <style> 태그 탈출 방지.
 */
function scopeCustomCss(customCss: string | undefined): string {
  if (!customCss?.trim()) return '';
  return `\n.anaks-site {\n${customCss.replace(/<\//g, '')}\n}`;
}

export function SiteRenderer({
  config,
  mode = 'auto',
  interactive = true,
  animate,
  tier,
  siteId,
  motionOwnerId,
  motionAssets,
  pageSlug = '',
}: {
  config: SiteConfig;
  mode?: SiteRendererMode;
  /** [v4] 렌더할 페이지 slug (''=홈). 호출부가 존재를 사전 확인(서빙은 notFound) */
  pageSlug?: string;
  /**
   * [motion 3단계 — 이월부채: 렌더시점 티어 방어] 소유자 티어. 주면 resolveMotionPlan이
   * sanitizeMotion으로 프리셋을 강등(저장/발행 방벽 우회·DB 오염 대비, defense-in-depth).
   * 서빙(/s)·내보내기가 전달. 미지정 시 저장 방벽이 보장한 프리셋 신뢰.
   */
  tier?: MotionTier;
  /**
   * false면 버튼을 링크가 아닌 비대화형(<span>)으로 렌더한다.
   * 대시보드 미리보기(SitePreview)처럼 상위가 이미 <a>인 맥락에서
   * 앵커 중첩(하이드레이션 에러)을 막는다. 실서빙은 기본 true.
   */
  interactive?: boolean;
  /**
   * [motion-system 2단계] 모션 레이어 방출 여부(재정의). true면 config.motion.presetId 기준
   * data-m 속성 + MOTION_CSS + 바닐라 런타임을 방출한다. 미지정 시 interactive를 따른다.
   * false = 비실사이트 컨텍스트(에디터 프리뷰·대시보드 썸네일 등) → 모션 미방출(정적).
   * (Stage-1의 tier 게이팅은 제거 — 모션 유무·종류의 단일 소스는 프리셋 계획이다.)
   */
  animate?: boolean;
  /** [v3 Phase 3] 문의 폼 제출 대상 사이트 — 실서빙(/s/[domain])에서만 전달 */
  siteId?: string;
  /**
   * 민감한 시그니처용 서버 권위 소유자. URL/클라이언트 provenance 문자열만으로는 대체할 수 없다.
   * 미지정 시 before-after는 sanitizer에서 fail-closed 된다.
   */
  motionOwnerId?: string;
  /** 저장소에서 현재 사이트 소유권까지 검증한 자산 projection. 기본 빈 배열 = 민감 기능 비활성. */
  motionAssets?: readonly MotionAssetProvenance[];
}) {
  const shouldAnimate = animate ?? interactive;
  const { theme } = config;
  // [v4] 선택 페이지의 섹션만 렌더 (미매칭 시 홈으로 폴백 — 호출부가 사전 존재 확인)
  const page = findPage(config, pageSlug) ?? homePage(config);
  const sections = page.sections.filter((s) => !s.hidden);
  const fontUrls = googleFontUrls(theme.fonts.googleFonts);

  // v2 signature는 저장값을 곧바로 신뢰하지 않는다. 렌더 진입에서도 업종·tier·target·자산 소유권을
  // 재검증한다. tier/권위 자산이 빠진 호출은 basic/empty로 fail-closed 하되 ordinary sections는 보존한다.
  const signatureContext = motionContextFromConfig(config, tier ?? 'basic', {
    assets: motionAssets ?? [],
    ...(motionOwnerId ? { ownerId: motionOwnerId } : {}),
    ...(siteId ? { siteId } : {}),
    theme,
    playback: { renderMode: mode },
  });
  // Base and signature planning share the same authoritative projection. Otherwise a
  // verified sensitive scene could be stripped in the base pass and leave a duplicate
  // legacy video-hero active beside the later verified signature renderer.
  const signatureSanitizeOptions = {
    assets: motionAssets ?? [],
    ...(motionOwnerId ? { ownerId: motionOwnerId } : {}),
    ...(siteId ? { siteId } : {}),
    theme,
  };
  const plan = shouldAnimate
    ? resolveMotionPlan(config, tier ? { tier, signatureContext: signatureSanitizeOptions } : undefined)
    : undefined;
  const baseMotionActive = !!plan && planIsActive(plan);
  const signaturePlan = resolveMotionSignaturePlan(config, signatureContext);
  const signatureCandidate = signaturePlan.sceneByPage.get(page.id);
  const signatureScene = signatureCandidate && isRenderableMotionScene(signatureCandidate) &&
    sceneSourceSectionsAreSafe(signatureCandidate, sections)
    ? signatureCandidate
    : undefined;
  const signatureArt = signatureScene
    ? resolveMotionArtDirectionProfile(signatureScene.signatureId, signatureContext, signatureScene)
    : undefined;
  // Signature CSS is also its complete no-JS/reduced static layout; runtime remains optional enhancement.
  const motionCssNeeded = baseMotionActive || Boolean(signatureScene);
  const signatureMotionEnabled = Boolean(signatureScene) && config.motion?.intensity !== 'off';
  const motionActive = shouldAnimate && (baseMotionActive || signatureMotionEnabled);
  const css = BASE_CSS + scopeCustomCss(theme.customCss) + (motionCssNeeded ? MOTION_CSS : '');

  const rootStyle: CSSProperties = {
    containerType: 'inline-size',
    width: '100%',
    minHeight: '100dvh',
    backgroundColor: theme.palette.background,
    color: theme.palette.text,
    fontFamily: theme.fonts.body,
  };
  if (motionCssNeeded) {
    const f = intensityFactors(plan?.intensity ?? config.motion?.intensity ?? 'normal');
    (rootStyle as Record<string, string | number>)['--m-amp'] = f.amp;
    (rootStyle as Record<string, string | number>)['--m-dur-scale'] = f.durScale;
  }

  const showDesktop = mode === 'desktop' || mode === 'auto';
  const showMobile = mode === 'mobile' || mode === 'auto';
  // Structured signature wins over a legacy layout on the same page; persisted legacy IDs remain untouched
  // and continue through SectionCanvas/ScrollytellingStage when no v2 scene is valid.
  const hasScrollytelling = !signatureScene && !!plan && plan.scrollytellingSections.size > 0;
  const scrollytellingSection = hasScrollytelling
    ? sections.find((section) => plan?.scrollytellingSections.has(section.id))
    : undefined;
  const ordinarySections = scrollytellingSection
    ? sections.filter((section) => section.id !== scrollytellingSection.id)
    : sections;
  const signatureConsumed = signatureScene ? consumedSectionIds(signatureScene) : new Set<string>();

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {fontUrls.map((href) => (
        // React 19: precedence 지정 시 <head>로 호이스팅 + 중복 제거
        <link key={href} rel="stylesheet" href={href} precedence="default" />
      ))}
      {needsPretendard(theme) && <link rel="stylesheet" href={PRETENDARD_CSS_URL} precedence="default" />}
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="anaks-site" style={rootStyle}>
        {signatureScene && signatureArt ? (
          ordinarySections.map((section) => {
            if (section.id === signatureScene.sectionId) {
              return (
                <MotionSignatureRenderer
                  key={`signature:${signatureScene.signatureId}:${section.id}`}
                  scene={signatureScene}
                  theme={theme}
                  artDirection={signatureArt}
                  mode={mode}
                  isFirst={sections[0]?.id === section.id && motionSceneMayOwnLcp(signatureScene)}
                />
              );
            }
            if (signatureConsumed.has(section.id)) return null;
            return (
              <div key={section.id} data-signature-ordinary-section>
                {showDesktop && (
                  <div className={mode === 'auto' ? 'hidden md:block' : undefined}>
                    <SectionCanvas
                      section={section}
                      theme={theme}
                      isFirst={sections[0]?.id === section.id}
                      interactive={interactive}
                      plan={plan}
                      siteId={siteId}
                    />
                  </div>
                )}
                {showMobile && (
                  <div className={mode === 'auto' ? 'md:hidden' : undefined}>
                    <SectionStack
                      section={section}
                      theme={theme}
                      // auto contains both trees: only desktop receives eager/high so a page has one LCP candidate.
                      isFirst={mode === 'mobile' && sections[0]?.id === section.id}
                      interactive={interactive}
                      plan={plan}
                      siteId={siteId}
                    />
                  </div>
                )}
              </div>
            );
          })
        ) : scrollytellingSection ? (
          <ScrollytellingStage
            section={scrollytellingSection}
            theme={theme}
            isFirst={sections[0]?.id === scrollytellingSection.id}
            mode={mode}
          />
        ) : null}
        {!signatureScene && showDesktop && (
          <div className={mode === 'auto' ? 'hidden md:block' : undefined}>
            {ordinarySections.map((section) => (
              <SectionCanvas key={section.id} section={section} theme={theme} isFirst={sections[0]?.id === section.id} interactive={interactive} plan={plan} siteId={siteId} />
            ))}
          </div>
        )}
        {!signatureScene && showMobile && (
          <div className={mode === 'auto' ? 'md:hidden' : undefined}>
            {ordinarySections.map((section) => (
              <SectionStack
                key={section.id}
                section={section}
                theme={theme}
                // auto already rendered the desktop LCP image; never create a second eager/high candidate.
                isFirst={mode === 'mobile' && sections[0]?.id === section.id}
                interactive={interactive}
                plan={plan}
                siteId={siteId}
              />
            ))}
          </div>
        )}
      </div>
      {/* [motion-system 2단계] 의존성 0 바닐라 런타임 — SSR HTML·정적 내보내기 파싱 시 실행.
          에디터 프리뷰(client)는 animate=false라 미방출. React가 실행 안 하지만 SSR HTML은 브라우저가 파싱 시 실행. */}
      {motionActive && <script dangerouslySetInnerHTML={{ __html: MOTION_RUNTIME }} />}
      {/* [T1] auto 모드 앵커 보정 — 보이는 레이아웃의 섹션으로 스크롤(모바일 CTA 무반응 해소) */}
      {interactive && mode === 'auto' && <script dangerouslySetInnerHTML={{ __html: ANCHOR_RUNTIME }} />}
    </>
  );
}
