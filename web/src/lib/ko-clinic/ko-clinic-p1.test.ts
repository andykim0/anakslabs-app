import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { KO_CLINIC_FLOW_MEASURE_CSS } from '@/components/site-renderer/ClinicFlowSection';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { featureLayoutById } from '@/lib/layout';
import {
  compileKoClinicSite,
  extractIndependentOriginalText,
  extractKoClinicPage,
  koClinicSlugForSourceUrl,
} from '.';

const STATIC_HTML = `<!doctype html><html lang="ko"><body>
  <header><img src="/n_images/common/logo.png" alt="EDOM 이담외과의원"><nav>메뉴</nav></header>
  <main>
    <div class="sub_tit"><div class="main_tit"><h2><em>하</em><em>지</em><em>정</em><em>맥</em><em>류</em></h2></div></div>
    <div class="content_wrap">
      <section><h3>하지정맥류의 원인</h3>
        <p>정맥 혈액순환 장애에 관한 원문 문장입니다.</p>
        <ul><li>노화</li><li>가족력</li></ul>
        <img src="/n_images/sub/vein.jpg" alt="하지정맥류의 원인">
        <img src="/n_images/common/scroll.png" alt="scroll">
      </section>
    </div>
  </main>
  <footer>대표자와 사업자번호</footer>
</body></html>`;

const NEWS_HTML = `<!doctype html><html lang="ko"><body><main>
  <div class="sub_tit"><h2>공지사항</h2></div>
  <div class="content_wrap"><table class="board_view">
    <tr><th>제 목</th><td><div>진료 안내 원문</div></td></tr>
    <tr><th>작성자</th><td>이담외과</td><th>작성일</th><td>23-08-14 14:35</td></tr>
    <tr><td class="viewContentTD"><span id="writeContents"><p>원문 진료 안내입니다.</p></span></td></tr>
  </table><div class="board_button"><a href="./board.php?bo_table=news&amp;wr_id=2" title="다음 원문">이 전</a></div></div>
</main></body></html>`;

const PRAISE_HTML = `<meta charset="utf-8"><script>alert('치료 후기, 치료 결과 열람은\\n의료법에 의거, 로그인 후 가능합니다.');</script>`;

const COUNSEL_HTML = `<!doctype html><html lang="ko"><body><main>
  <div class="sub_tit"><h2>전문의상담</h2></div>
  <div class="content_wrap"><table class="board_view">
    <tr><th>제 목</th><td><div>공개 상담 제목</div></td></tr>
    <tr><th>진료과목</th><td>혈관외과</td><th>작성일자</th><td>2024-06-20</td></tr>
    <tr><td class="viewContentTD"><span id="writeContents"><p>공개 상담 질문 원문입니다.</p></span></td></tr>
  </table><div id="commentContents">
    <span style="color:#1466a5">전문의 답변</span>
    <div style="line-height:1.7"><p>공개 답변 원문입니다.</p><textarea>숨은 입력 폼</textarea></div>
  </div></div>
</main></body></html>`;

test('KO source extraction preserves source blocks and classifies only explicit UI chrome', () => {
  const page = extractKoClinicPage({
    html: STATIC_HTML,
    sourceUrl: 'https://edomclinic.com/page/sub1_1_1.php',
  });
  assert.equal(page.title.text, '하지정맥류');
  assert.equal(page.businessName?.text, 'EDOM 이담외과의원');
  assert.deepEqual(
    page.blocks.map((block) => block.text),
    ['하지정맥류의 원인', '정맥 혈액순환 장애에 관한 원문 문장입니다.', '노화', '가족력'],
  );
  assert.equal(page.blocks.every((block) => block.sourceSha256.length === 64), true);
  assert.equal(page.images.find((image) => image.sourceUrl.endsWith('/vein.jpg'))?.classification, 'content');
  assert.equal(page.images.find((image) => image.sourceUrl.endsWith('/scroll.png'))?.classification, 'ui-chrome');
});

test('independent S_orig path retains content but excludes predeclared chrome', () => {
  const original = extractIndependentOriginalText({
    html: STATIC_HTML,
    sourceUrl: 'https://edomclinic.com/page/sub1_1_1.php',
  });
  assert.equal(original.included.includes('하지정맥류'), true);
  assert.equal(original.included.includes('하지 정맥류'), false);
  assert.equal(original.included.some((text) => text.includes('정맥 혈액순환 장애')), true);
  assert.equal(original.included.includes('메뉴'), false);
  assert.equal(original.included.some((text) => text.includes('대표자')), false);
});

test('headings with direct text are not compacted and board aliases keep verbatim labels', () => {
  const mixedHeadingHtml = STATIC_HTML.replace(
    '<h2><em>하</em><em>지</em><em>정</em><em>맥</em><em>류</em></h2>',
    '<h2><span>E</span>fficient <span>D</span>esign for <span>O</span>ptimized <span>M</span>edical Method</h2>',
  );
  const headed = extractKoClinicPage({
    html: mixedHeadingHtml,
    sourceUrl: 'https://edomclinic.com/page/sub4_1_1.php',
  });
  assert.equal(headed.title.text, 'Efficient Design for Optimized Medical Method');
  assert.equal(
    extractIndependentOriginalText({
      html: mixedHeadingHtml,
      sourceUrl: 'https://edomclinic.com/page/sub4_1_1.php',
    }).included.includes('Efficient Design for Optimized Medical Method'),
    true,
  );

  const counsel = extractKoClinicPage({
    html: COUNSEL_HTML,
    sourceUrl: 'https://edomclinic.com/bbs/board.php?bo_table=pub_counsel&wr_id=1',
  });
  assert.deepEqual(
    counsel.blocks
      .filter((block) => ['category', 'published_date'].includes(block.kind))
      .map((block) => [block.sourceLabel, block.text]),
    [['진료과목', '혈관외과'], ['작성일자', '2024-06-20']],
  );
  assert.equal(counsel.blocks.some((block) => block.text === '전문의 답변'), true);
  assert.equal(counsel.blocks.some((block) => block.text === '공개 답변 원문입니다.'), true);
  assert.equal(counsel.blocks.some((block) => block.text.includes('숨은 입력 폼')), false);
});

test('prose article catalog accepts one source item without a minimum-content disappearance', () => {
  const prose = featureLayoutById('features.prose-article');
  assert.equal(prose.content.minimumItems, 1);
  assert.equal(prose.bands.wide.flow, 'prose-article');
  assert.equal(prose.mediaContract.role, 'referential-figure');
});

test('KO compiler is deterministic, holds praise, and keeps US locale absent', () => {
  const pages = [
    extractKoClinicPage({
      html: STATIC_HTML.replace(
        '<h2><em>하</em><em>지</em><em>정</em><em>맥</em><em>류</em></h2>',
        '<h2>이담병원 홈</h2>',
      ),
      sourceUrl: 'https://edomclinic.com/',
    }),
    extractKoClinicPage({
      html: STATIC_HTML,
      sourceUrl: 'https://edomclinic.com/page/sub1_1_1.php',
    }),
    extractKoClinicPage({
      html: NEWS_HTML,
      sourceUrl: 'https://edomclinic.com/bbs/board.php?bo_table=news&wr_id=1',
    }),
    extractKoClinicPage({
      html: PRAISE_HTML,
      sourceUrl: 'https://edomclinic.com/bbs/board.php?bo_table=praise&wr_id=1',
    }),
  ].map((page) => ({ ...page, images: [] }));
  const first = compileKoClinicSite({ pages, images: [] });
  const second = compileKoClinicSite({ pages, images: [] });
  assert.deepEqual(first, second);
  assert.equal(first.config.meta.locale, undefined);
  assert.equal(first.config.clinicMaster?.demoPitchLocale, 'ko-owner');
  assert.equal(first.publicationHolds.length, 1);
  assert.equal(first.publicationHolds[0].ruleId, 'medical-treatment-testimonial');
  assert.equal(first.config.pages.some((page) => page.slug.includes('praise')), false);
  assert.equal(first.config.pages.some((page) => page.slug === 'community'), true);
  assert.equal(new Set(first.config.pages.map((page) => page.title)).size, first.config.pages.length);
  assert.deepEqual(
    first.config.pages.filter((page) => page.showInNav).map((page) => page.slug),
    ['', 'center-vascular', 'community'],
  );
  assert.equal(
    first.config.pages
      .flatMap((page) => page.sections)
      .some((section) => section.sectionLayout?.resolvedId === 'features.prose-article'),
    true,
  );
  const news = first.config.pages.find((page) => page.slug === 'community-news-1');
  assert.ok(news);
  assert.equal(news.id.startsWith('ko-clinic-article-'), true);
  const html = renderToStaticMarkup(createElement(SiteRenderer, {
    config: first.config,
    pageSlug: 'community-news-1',
    interactive: false,
    animate: false,
  }));
  assert.match(html, /data-ko-clinic="1"/u);
  assert.match(html, /작성자/u);
  assert.match(html, /23-08-14 14:35/u);
  assert.match(html, /features\.prose-article/u);
  assert.doesNotMatch(html, /Book Appointment/u);
  const homeHtml = renderToStaticMarkup(createElement(SiteRenderer, {
    config: first.config,
    pageSlug: '',
    interactive: false,
    animate: false,
  }));
  assert.match(homeHtml, /예약 시스템을 연결하면 예약 기능이 활성화됩니다\./u);
  assert.match(homeHtml, /white-space:\s*normal !important/u);
  const englishHtml = renderToStaticMarkup(createElement(SiteRenderer, {
    config: {
      ...first.config,
      clinicMaster: first.config.clinicMaster
        ? { ...first.config.clinicMaster, demoPitchLocale: 'en' }
        : undefined,
    },
    pageSlug: '',
    interactive: false,
    animate: false,
  }));
  assert.doesNotMatch(englishHtml, /max-width:\s*30em/u);
  const communityHtml = renderToStaticMarkup(createElement(SiteRenderer, {
    config: first.config,
    pageSlug: 'community',
    interactive: false,
    animate: false,
  }));
  assert.match(communityHtml, /<h1[^>]*>[\s\S]*커뮤니티/u);
  assert.match(communityHtml, /상담 접수 안내/u);
});

test('a two-image source page preserves its hero and article image placements', () => {
  const page = extractKoClinicPage({
    html: STATIC_HTML.replace(
      '<img src="/n_images/common/scroll.png" alt="scroll">',
      '<img src="/n_images/sub/second.jpg" alt="두 번째 원문 이미지">'
        + '<img src="/n_images/common/scroll.png" alt="scroll">',
    ),
    sourceUrl: 'https://edomclinic.com/page/sub1_1_1.php',
  });
  const contentImages = page.images.filter((image) => image.classification === 'content');
  assert.equal(contentImages.length, 2);
  const images = contentImages.map((image, index) => ({
    sourceUrl: image.sourceUrl,
    publicPath: `/clinic/edom/test-${index + 1}.webp`,
    sourceSha256: `${index + 1}`.repeat(64),
    optimizedSha256: `${index + 3}`.repeat(64),
    sourceBytes: 1_024,
    optimizedBytes: 512,
    width: 1_200,
    height: 800,
    alt: image.alt,
    analysis: {
      version: 1 as const,
      engine: 'apple-vision-v1' as const,
      recognizedLineCount: 0,
      recognizedCharacterCount: 0,
      textAreaRatio: 0,
      textDense: false,
      heroTextRegionLuminance: 0.3,
    },
  }));
  const compilation = compileKoClinicSite({ pages: [page], images });
  const serialized = JSON.stringify(compilation.config);
  assert.match(serialized, /\/clinic\/edom\/test-1\.webp/u);
  assert.match(serialized, /\/clinic\/edom\/test-2\.webp/u);
  const sourcePage = compilation.config.pages.find((candidate) => (
    candidate.slug === 'center-vascular'
  ));
  assert.equal(sourcePage?.sections[0].background.image?.src, '/clinic/edom/test-1.webp');
  assert.equal(sourcePage?.sections[0].background.image?.overlayOpacity, 0.78);
});

test('KO board articles keep a verbatim H1, category eyebrow, and inline source figures', () => {
  const page = extractKoClinicPage({
    html: NEWS_HTML.replace(
      '</span>',
      '<img src="/board-source.jpg" alt="게시글 원문 사진"></span>',
    ),
    sourceUrl: 'https://edomclinic.com/bbs/board.php?bo_table=news&wr_id=1',
  });
  const sourceImage = page.images.find((image) => image.classification === 'content');
  assert.ok(sourceImage);
  const compilation = compileKoClinicSite({
    pages: [page],
    images: [{
      sourceUrl: sourceImage.sourceUrl,
      publicPath: '/clinic/edom/board-source.webp',
      sourceSha256: 'a'.repeat(64),
      optimizedSha256: 'b'.repeat(64),
      sourceBytes: 1_024,
      optimizedBytes: 512,
      width: 1_200,
      height: 800,
      alt: sourceImage.alt,
      analysis: {
        version: 1,
        engine: 'apple-vision-v1',
        recognizedLineCount: 0,
        recognizedCharacterCount: 0,
        textAreaRatio: 0,
        textDense: false,
        heroTextRegionLuminance: 0.3,
      },
    }],
  });
  const article = compilation.config.pages.find((candidate) => (
    candidate.slug === 'community-news-1'
  ));
  assert.ok(article);
  assert.equal(article.sections[0].background.image, undefined);
  const html = renderToStaticMarkup(createElement(SiteRenderer, {
    config: compilation.config,
    pageSlug: article.slug,
    interactive: false,
    animate: false,
  }));
  assert.match(html, /<h1[^>]*>\s*진료 안내 원문\s*<\/h1>/u);
  assert.match(html, /data-clinic-hero-kicker[^>]*>\s*공지사항/u);
  assert.doesNotMatch(html, /<h[23][^>]*>\s*진료 안내 원문\s*<\/h[23]>/u);
  assert.match(html, /<img[^>]+board-source\.webp/u);
  assert.match(
    html,
    /<section[^>]+data-clinic-flow-section="features\.prose-article"[^>]+aria-label="본문"/u,
  );
  assert.doesNotMatch(html, /<h2[^>]+data-clinic-flow-heading[^>]*>\s*본문\s*<\/h2>/u);
  assert.match(html, /<h2[^>]+data-clinic-flow-item-heading/u);

  const englishHtml = renderToStaticMarkup(createElement(SiteRenderer, {
    config: {
      ...compilation.config,
      clinicMaster: compilation.config.clinicMaster
        ? { ...compilation.config.clinicMaster, demoPitchLocale: 'en' }
        : undefined,
    },
    pageSlug: article.slug,
    interactive: false,
    animate: false,
  }));
  assert.match(englishHtml, /<h2[^>]+data-clinic-flow-heading[^>]*>\s*본문\s*<\/h2>/u);
  assert.match(englishHtml, /<h3[^>]+data-clinic-flow-item-heading/u);
});

test('KO prose article text selectors own the approved 30em measure', () => {
  assert.match(
    KO_CLINIC_FLOW_MEASURE_CSS,
    /\[data-ko-clinic\][\s\S]*features\.prose-article[\s\S]*:is\([\s\S]*data-clinic-flow-item-heading[\s\S]*data-clinic-flow-copy[\s\S]*max-width:\s*30em/u,
  );
});

test('source URL slug mapping is stable and preserves the empty home contract', () => {
  assert.equal(koClinicSlugForSourceUrl('https://edomclinic.com/main.php'), '');
  assert.equal(
    koClinicSlugForSourceUrl('https://edomclinic.com/bbs/board.php?wr_id=12&bo_table=news'),
    'community-news-12',
  );
});
