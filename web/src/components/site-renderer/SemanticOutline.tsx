/**
 * [v3 Phase 7] 시맨틱 아웃라인 — 자유배치 캔버스(절대좌표 <p> 나열)만으로는
 * 검색엔진·답변엔진·AI가 문서 구조(제목 계층·질문·목록)를 읽기 어렵다.
 * 화면에는 보이지 않지만(스크린리더/크롤러는 읽는) 구조화된 개요를 함께 렌더한다:
 *  - <h1> 사이트 제목 1개
 *  - 섹션마다 <h2> + 본문 요약, menu는 <ul>, faq는 <h3>질문?</h3><p>답</p>
 * 순수 서버 컴포넌트 — 서빙/Export 동일 출력. 기존 캔버스 렌더러는 건드리지 않는다.
 */
import type { Section, SiteConfig } from '@/lib/types/site';
import { findPage, homePage } from '@/lib/types/site';

const SR_ONLY: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

const LIST_OUTLINE_SECTION_TYPES: ReadonlySet<Section['type']> = new Set([
  'menu',
  'features',
  'pricing',
  'team',
  'cases',
  'gallery',
]);

function texts(section: Section): string[] {
  return section.elements
    .filter((el) => el.kind === 'text')
    .slice()
    .sort((a, b) => a.frame.y - b.frame.y || a.frame.x - b.frame.x)
    .map((el) => (el.kind === 'text' ? el.text.trim() : ''))
    .filter(Boolean);
}

function SectionOutline({ section }: { section: Section }) {
  const body = texts(section);
  const sources = section.elements.filter(
    (element) => element.kind === 'button' && /^https:\/\//iu.test(element.href) && /^출처\s*·/u.test(element.label),
  );
  const sourceNodes = sources.map((source) => source.kind === 'button' ? (
    <cite key={source.id}>
      <a href={source.href}>{source.label}</a>
    </cite>
  ) : null);
  if (section.acts?.length) {
    return (
      <section aria-label={section.name}>
        <h2>{section.name}</h2>
        {section.acts.map((act, index) => (
          <article key={`${section.id}-outline-act-${index}`}>
            <h3>{act.heading}</h3>
            <p>{act.body}</p>
          </article>
        ))}
        {sourceNodes}
      </section>
    );
  }
  // 섹션명 = h2 (첫 텍스트가 섹션명과 겹치면 중복 노출은 무방)
  const faqLike = section.type === 'faq'
    || section.id.includes('faq')
    || /(?:FAQ|자주\s*묻는\s*질문)/iu.test(section.name);
  if (faqLike) {
    const items: React.ReactNode[] = [];
    for (let i = 0; i < body.length; i++) {
      if (/[?？]\s*$/.test(body[i])) {
        items.push(<h3 key={`q-${i}`}>{body[i]}</h3>);
        if (body[i + 1] && !/[?？]\s*$/.test(body[i + 1])) {
          items.push(<p key={`a-${i}`}>{body[i + 1]}</p>);
          i++;
        }
      } else {
        items.push(<p key={`p-${i}`}>{body[i]}</p>);
      }
    }
    return (
      <section aria-label={section.name}>
        <h2>{section.name}</h2>
        {items}
        {sourceNodes}
      </section>
    );
  }

  if (LIST_OUTLINE_SECTION_TYPES.has(section.type) && body.length > 0) {
    return (
      <section aria-label={section.name}>
        <h2>{section.name}</h2>
        <ul>
          {body.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
        {sourceNodes}
      </section>
    );
  }

  return (
    <section aria-label={section.name}>
      <h2>{section.name}</h2>
      {body.map((t, i) => (
        <p key={i}>{t}</p>
      ))}
      {sourceNodes}
    </section>
  );
}

export function SemanticOutline({ config, pageSlug = '' }: { config: SiteConfig; pageSlug?: string }) {
  const info = config.businessInfo;
  // [v4] 선택 페이지 스코프 — 홈은 <h1>=사이트 제목, 서브페이지는 <h1>=페이지 title
  const page = findPage(config, pageSlug) ?? homePage(config);
  const isHome = page.slug === '';
  const title = isHome
    ? info?.businessName?.trim() || config.meta.title || info?.ownerName || '사이트'
    : page.title;
  const sections = page.sections.filter((s) => !s.hidden);

  return (
    <div style={SR_ONLY} aria-hidden={false}>
      <h1>{title}</h1>
      {isHome && config.meta.description ? <p>{config.meta.description}</p> : null}
      {sections.map((s) => (
        <SectionOutline key={s.id} section={s} />
      ))}
    </div>
  );
}
