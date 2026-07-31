import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import { KO_CLINIC_FLOW_MEASURE_CSS } from '@/components/site-renderer/ClinicFlowSection';
import { ClinicStickyBooking } from '@/components/site-renderer/ClinicStickyBooking';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { featureLayoutById } from '@/lib/layout';
import {
  compileKoClinicSite,
  extractIndependentOriginalText,
  extractKoClinicPage,
  KO_CLINIC_DENSITY_CONTRACT,
  koClinicSlugForSourceUrl,
} from '.';
import type { KoClinicOptimizedImage } from './contracts';
import { normalizeKoClinicText } from './source-extraction';

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

const MINT_BOARD_HTML = `<!doctype html><html lang="ko"><body>
  <div class="sub_tit"><div class="main_tit">
    <ul class="depth"><li>커뮤니티</li><li>민트병원TV</li></ul>
    <h2><em>민트병원TV</em></h2>
  </div></div>
  <div class="content_wrap">
    <table class="board_view">
      <tr><th>제 목</th><td><div>원문 미디어 제목</div></td></tr>
      <tr><th>작성자</th><td>이담외과</td><th>작성일자</th><td>23-08-20 01:12</td></tr>
      <tr><td><span id="writeContents">
        <h3><em>Dialysis vessel</em><p>오래 아껴 써야 할 원문입니다.</p></h3>
      </span></td></tr>
    </table>
    <div class="board_list"><ul><li>게시판 목록 위젯 문구</li></ul></div>
  </div>
</body></html>`;

const HOME_COMPOUND_HTML = `<!doctype html><html lang="ko"><body><main>
  <div class="sub_tit"><h2>이담병원</h2></div>
  <div class="content_wrap"><ul>
    <li><a><div><em>01.</em> <span>하지정맥류</span></div><div><h4>하지정맥류</h4><p>하지정맥류 원문 본문</p></div> <span><em>자세히보기</em></span></a></li>
    <li><a><div><em>02.</em> <span>투석혈관</span></div><div><h4>투석혈관</h4><p>투석혈관 원문 본문</p></div> <span><em>자세히보기</em></span></a></li>
    <li><a><div><em>03.</em> <span>당뇨발</span></div><div><h4>당뇨발</h4><p>당뇨발 원문 본문</p></div> <span><em>자세히보기</em></span></a></li>
    <li><a><div><em>04.</em> <span>장기질환 케어</span></div><div><h4>장기질환 케어</h4><p>장기질환 케어 원문 본문</p></div> <span><em>자세히보기</em></span></a></li>
    <li><a><div><span>Difference</span></div><div><h4>협진시스템 - 성형외과</h4><p>성형외과 협진 원문 본문</p></div> <span><em>자세히보기</em></span></a></li>
    <li><a><div><span>Difference</span></div><div><h4>협진시스템 - 정형외과</h4><p>정형외과 협진 원문 본문</p></div> <span><em>자세히보기</em></span></a></li>
  </ul></div>
</main></body></html>`;

const ANIMATED_HEADING_HTML = `<!doctype html><html lang="ko"><body><main>
  <div class="main_tit"><h2>
    <em data-scroll>당</em><em data-scroll>신</em><em data-scroll>의</em>
    <span style="padding:0 7px"></span>
    <em data-scroll>건</em>
    <em data-scroll>강</em><em data-scroll>에</em>
    <span style="padding:0 7px"></span>
    <em data-scroll>진</em><em data-scroll>심</em><em data-scroll>을</em>
    <span style="padding:0 7px"></span>
    <em data-scroll>담</em><em data-scroll>아</em>
  </h2></div>
  <div class="content_wrap"><p>원문 본문입니다.</p></div>
</main></body></html>`;

const CONTEXT_IMAGE_HTML = `<!doctype html><html lang="ko"><body><main>
  <div class="sub_tit"><h2>이담병원</h2></div>
  <div class="content_wrap"><ul>
    <li><img src="/doctor-a.jpg" alt="의료진 A"><h4>의료진 A</h4><p>의료진 A 원문입니다.</p></li>
    <li><img src="/doctor-b.jpg" alt="의료진 B"><h4>의료진 B</h4><p>의료진 B 원문입니다.</p></li>
    <li><img src="/doctor-c.jpg" alt="의료진 C"><h4>단독 사진</h4></li>
  </ul></div>
</main></body></html>`;

const TV_19_MISSING_BODY = '여름철에는 ‘하지정맥류’ 검사·치료를 위해 병원을 찾는 사람들이 많아진다. 평소엔 인지하지 못했으나, 옷차림이 짧아지면서 다리에 울퉁불퉁 튀어나온 혈관들이 보이기 때문이다. 문제는 하지정맥류 환자 중 혈관이 튀어나오지 않는 경우도 적지 않다는 점이다. 이는 하지정맥류를 방치하는 원인이 되기도 한다. 지난달 22일 헬스조선 공식 유튜브와 네이버TV 채널에서는 ‘하지정맥류‘를 주제로 헬스조선 건강똑똑 라이브가 진행됐다. 라이브에 출연한 이담외과의원 김현규 대표원장은 하지정맥류의 원인, 증상, 치료법, 예방법 등에 대해 설명하는 한편, 실시간 질의응답을 통해 하지정맥류와 관련된 다양한 궁금증을 함께 풀어봤다. 영상은 헬스조선 공식 유튜브와 네이버TV 채널에서 다시 볼 수 있다. (중략) ▼▼영상 보러가기▼▼ https://youtu.be/JP_CPoF3QU8 ▼▼기사 원문 보러가기▼▼ https://n.news.naver.com/mnews/article/346/0000053076?sid=103';
const TV_19_NESTED_INLINE_HTML = `<!doctype html><html lang="ko"><body><main>
  <div class="sub_tit"><h2>이담미디어</h2></div>
  <div class="content_wrap"><table class="board_view">
    <tr><th>제 목</th><td><div>하지정맥류 원문 기사</div></td></tr>
    <tr><td><span id="writeContents">
      <p>헬스조선 건강똑똑 라이브 &lt;하지정맥류&gt; 편</p>
      <div><span>여름철에는 ‘하지정맥류’ 검사·치료를 위해 병원을 찾는 사람들이 많아진다. 평소엔 인지하지 못했으나, 옷차림이 짧아지면서 다리에 울퉁불퉁 튀어나온 혈관들이 보이기 때문이다. 문제는 하지정맥류 환자 중 혈관이 튀어나오지 않는 경우도 적지 않다는 점이다. 이는 하지정맥류를 방치하는 원인이 되기도 한다.</span></div>
      <div><span>지난달 22일 헬스조선 공식 유튜브와 네이버TV 채널에서는 ‘하지정맥류‘를 주제로 헬스조선 건강똑똑 라이브가 진행됐다. 라이브에 출연한 이담외과의원 김현규 대표원장은 하지정맥류의 원인, 증상, 치료법, 예방법 등에 대해 설명하는 한편, 실시간 질의응답을 통해 하지정맥류와 관련된 다양한 궁금증을 함께 풀어봤다. 영상은 헬스조선 공식 유튜브와 네이버TV 채널에서 다시 볼 수 있다.</span></div>
      <div><span>(중략)</span></div>
      <div><span>▼▼영상 보러가기▼▼</span><br><span>https://youtu.be/JP_CPoF3QU8</span></div>
      <div><span>▼▼기사 원문 보러가기▼▼</span><br><span>https://n.news.naver.com/mnews/article/346/0000053076?sid=103</span></div>
    </span></td></tr>
  </table></div>
</main></body></html>`;

const TV_46_MISSING_CAPTIONS = '개원 4년째인 김현규 이담외과 대표원장은 AI 의료 시대에도 인간적인 병원을 지향하면서 환자 행복을 위해 최선을 다하고 있다고 밝혔다. 혈관외과 전문의인 김 원장이 직접 혈관질환에 대해 설명하고 있다. 김용학 기자 김현규 이담외과 대표원장이 시술하고 있다. 김현규 이담외과 대표원장(왼쪽 두 번째)이 당뇨발 협진팀과 함께 포즈를 취하고 있다. 이담외과 제공';
const TV_46_FIGCAPTION_HTML = `<!doctype html><html lang="ko"><body><main>
  <div class="sub_tit"><h2>이담미디어</h2></div>
  <div class="content_wrap"><table class="board_view">
    <tr><th>제 목</th><td><div>담담한 만남 원문 기사</div></td></tr>
    <tr><td><span id="writeContents">
      <p>김현규 이담외과 대표원장, 혈관외과 전문의…개원 4년 맞아</p>
      <figure><img src="/one.jpg" alt=""><figcaption>개원 4년째인 김현규 이담외과 대표원장은 AI 의료 시대에도 인간적인 병원을 지향하면서 환자 행복을 위해 최선을 다하고 있다고 밝혔다. 혈관외과 전문의인 김 원장이 직접 혈관질환에 대해 설명하고 있다. 김용학 기자</figcaption></figure>
      <figure><img src="/two.jpg" alt=""><figcaption>김현규 이담외과 대표원장이 시술하고 있다.</figcaption></figure>
      <figure><img src="/three.jpg" alt=""><figcaption>김현규 이담외과 대표원장(왼쪽 두 번째)이 당뇨발 협진팀과 함께 포즈를 취하고 있다. 이담외과 제공</figcaption></figure>
    </span></td></tr>
  </table></div>
</main></body></html>`;

function renderExtractedPage(
  page: ReturnType<typeof extractKoClinicPage>,
  images: Parameters<typeof compileKoClinicSite>[0]['images'] = [],
): ReturnType<typeof parse> {
  const compilation = compileKoClinicSite({ pages: [page], images });
  const slug = koClinicSlugForSourceUrl(page.sourceUrl);
  return parse(renderToStaticMarkup(createElement(SiteRenderer, {
    config: compilation.config,
    pageSlug: slug,
    mode: 'desktop',
    interactive: false,
    animate: false,
  })));
}

function renderedTextBlocks(root: ReturnType<typeof parse>) {
  return root.querySelectorAll(
    '[data-clinic-flow-item-heading],[data-clinic-flow-copy]',
  );
}

function optimizedFixtureImages(
  sourceUrls: readonly string[],
): Parameters<typeof compileKoClinicSite>[0]['images'] {
  return sourceUrls.map((sourceUrl, index) => ({
    sourceUrl,
    publicPath: `/ko-clinic/test-${index + 1}.webp`,
    sourceSha256: String(index + 1).padStart(64, '0'),
    optimizedSha256: String(index + 11).padStart(64, '0'),
    sourceBytes: 100,
    optimizedBytes: 80,
    width: 1200,
    height: 800,
    alt: '',
    analysis: {
      version: 1,
      engine: 'apple-vision-v1',
      recognizedLineCount: 0,
      recognizedCharacterCount: 0,
      textAreaRatio: 0,
      textDense: false,
      heroTextRegionLuminance: 0.5,
    },
  }));
}

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

test('independent S_orig includes source page context and inline text beside nested blocks', () => {
  const original = extractIndependentOriginalText({
    html: MINT_BOARD_HTML,
    sourceUrl: 'https://edomclinic.com/bbs/board.php?bo_table=tv&wr_id=1',
  });
  assert.equal(original.included.includes('민트병원TV'), true);
  assert.equal(original.included.includes('Dialysis vessel'), true);
  assert.equal(original.included.includes('오래 아껴 써야 할 원문입니다.'), true);
  assert.equal(
    original.includedEvidence.some((entry) => (
      entry.selector === 'source-page-context'
      && entry.text === '민트병원TV'
    )),
    true,
  );
  assert.equal(original.included.includes('게시판 목록 위젯 문구'), false);
  assert.deepEqual(
    original.excluded
      .filter((entry) => entry.reason === 'board-list-widget')
      .map((entry) => entry.text),
    ['게시판 목록 위젯 문구'],
  );
});

test('KO extraction preserves the six verbatim home compound labels without reconstructed fragments', () => {
  const page = extractKoClinicPage({
    html: HOME_COMPOUND_HTML,
    sourceUrl: 'https://edomclinic.com/',
  });
  const listItems = page.blocks
    .filter((block) => block.kind === 'list_item')
    .map((block) => normalizeKoClinicText(block.text));
  assert.deepEqual(listItems, [
    '01. 하지정맥류 자세히보기',
    '02. 투석혈관 자세히보기',
    '03. 당뇨발 자세히보기',
    '04. 장기질환 케어 자세히보기',
    'Difference 자세히보기',
    'Difference 자세히보기',
  ]);
  assert.equal(listItems.includes('01. 자세히보기'), false);
  assert.equal(listItems.includes('02. 자세히보기'), false);
  assert.equal(listItems.includes('03. 자세히보기'), false);
  assert.equal(listItems.includes('04. 자세히보기'), false);

  const rendered = renderExtractedPage(page);
  const exactHeading = renderedTextBlocks(rendered).filter((element) => (
    normalizeKoClinicText(element.text).replace(/\s+/gu, ' ')
      === '01. 하지정맥류 자세히보기'
  ));
  assert.equal(exactHeading.length, 1, exactHeading.map((element) => element.toString()).join('\n'));
  const item = exactHeading[0].closest('[data-clinic-flow-item]');
  assert.ok(item);
  assert.equal(
    item.querySelectorAll('[data-clinic-flow-copy]').some((element) => (
      normalizeKoClinicText(element.text).includes('하지정맥류 원문 본문')
    )),
    true,
    'the source card compound and its nested source copy must share one render item',
  );
  assert.equal(
    rendered.querySelectorAll('h1,h2,h3').some((element) => (
      /^(?:Difference|EDAM Story|News)(?:\s+자세히보기)?$/u.test(
        normalizeKoClinicText(element.text).replace(/\s+/gu, ' '),
      )
    )),
    false,
  );
});

test('animated source characters keep a fine audit axis but render as one original display block', () => {
  const page = extractKoClinicPage({
    html: ANIMATED_HEADING_HTML,
    sourceUrl: 'https://edomclinic.com/',
  });
  assert.notEqual(
    normalizeKoClinicText(page.title.text),
    '당신의 건강에 진심을 담아',
  );
  assert.equal(page.title.render?.text, '당신의 건강에 진심을 담아');
  const compilation = compileKoClinicSite({ pages: [page], images: [] });
  assert.equal(compilation.renderIntegrity.violations.length, 0);
  const rendered = renderExtractedPage(page);
  assert.equal(
    rendered.querySelectorAll('h1').filter((heading) => (
      normalizeKoClinicText(heading.text).replace(/\s+/gu, ' ')
        === '당신의 건강에 진심을 담아'
    )).length,
    1,
  );
});

test('source-context images stay with their source cards instead of a related-image tail', () => {
  const page = extractKoClinicPage({
    html: CONTEXT_IMAGE_HTML,
    sourceUrl: 'https://edomclinic.com/',
  });
  const imageAssets = optimizedFixtureImages([
    'https://edomclinic.com/doctor-a.jpg',
    'https://edomclinic.com/doctor-b.jpg',
    'https://edomclinic.com/doctor-c.jpg',
  ]);
  const compilation = compileKoClinicSite({ pages: [page], images: imageAssets });
  const home = compilation.config.pages.find((candidate) => candidate.slug === '');
  assert.ok(home);
  assert.equal(
    home.sections.filter((section) => section.name.startsWith('관련 이미지')).length,
    0,
  );
  const rendered = renderExtractedPage(page, imageAssets);
  for (const name of ['의료진 A', '의료진 B']) {
    const heading = rendered.querySelectorAll('[data-clinic-flow-item-heading]')
      .find((element) => normalizeKoClinicText(element.text) === name);
    assert.ok(heading);
    assert.ok(heading.closest('[data-clinic-flow-item]')?.querySelector('img'));
  }
  assert.equal(
    rendered.querySelectorAll('[data-clinic-flow-item-heading]').some((element) => (
      normalizeKoClinicText(element.text) === '단독 사진'
    )),
    false,
  );
  const copyOnly = rendered.querySelectorAll('[data-clinic-flow-copy]').find((element) => (
    normalizeKoClinicText(element.text) === '단독 사진'
  ));
  assert.ok(copyOnly?.closest('[data-clinic-flow-item]')?.querySelector('img'));
});

test('KO extraction retains the actual tv-19 inline body beside nested block content', () => {
  const page = extractKoClinicPage({
    html: TV_19_NESTED_INLINE_HTML,
    sourceUrl: 'https://edomclinic.com/bbs/board.php?bo_table=tv&wr_id=19',
  });
  const extracted = normalizeKoClinicText(
    page.blocks
      .filter((block) => block.kind === 'paragraph')
      .map((block) => block.text)
      .join(' '),
  ).replace(/\s+/gu, ' ');
  assert.equal(extracted.includes(TV_19_MISSING_BODY), true, extracted);
  const rendered = renderExtractedPage(page);
  const containingBlocks = renderedTextBlocks(rendered).filter((element) => (
      normalizeKoClinicText(element.text).replace(/\s+/gu, ' ')
        .includes(TV_19_MISSING_BODY)
    ));
  assert.equal(
    containingBlocks.length,
    1,
    containingBlocks.map((element) => element.toString()).join('\n'),
  );
});

test('KO extraction retains the actual tv-46 figure captions', () => {
  const page = extractKoClinicPage({
    html: TV_46_FIGCAPTION_HTML,
    sourceUrl: 'https://edomclinic.com/bbs/board.php?bo_table=tv&wr_id=46',
  });
  const extracted = normalizeKoClinicText(
    page.blocks
      .filter((block) => block.kind === 'paragraph')
      .map((block) => block.text)
      .join(' '),
  );
  assert.equal(extracted.includes(TV_46_MISSING_CAPTIONS), true);
  const independent = extractIndependentOriginalText({
    html: TV_46_FIGCAPTION_HTML,
    sourceUrl: 'https://edomclinic.com/bbs/board.php?bo_table=tv&wr_id=46',
  });
  assert.deepEqual(
    independent.included.filter((text) => text.includes('김현규 이담외과 대표원장')),
    [
      '김현규 이담외과 대표원장, 혈관외과 전문의…개원 4년 맞아',
      '개원 4년째인 김현규 이담외과 대표원장은 AI 의료 시대에도 인간적인 병원을 지향하면서 환자 행복을 위해 최선을 다하고 있다고 밝혔다. 혈관외과 전문의인 김 원장이 직접 혈관질환에 대해 설명하고 있다. 김용학 기자',
      '김현규 이담외과 대표원장이 시술하고 있다.',
      '김현규 이담외과 대표원장(왼쪽 두 번째)이 당뇨발 협진팀과 함께 포즈를 취하고 있다. 이담외과 제공',
    ],
  );
  assert.equal(independent.included.includes(TV_46_MISSING_CAPTIONS), false);
  const rendered = renderExtractedPage(
    page,
    optimizedFixtureImages([
      'https://edomclinic.com/one.jpg',
      'https://edomclinic.com/two.jpg',
      'https://edomclinic.com/three.jpg',
    ]),
  );
  for (const caption of independent.included.filter((text) => (
    text.includes('김현규 이담외과 대표원장')
    && text !== '김현규 이담외과 대표원장, 혈관외과 전문의…개원 4년 맞아'
  ))) {
    assert.equal(
      renderedTextBlocks(rendered).filter((element) => (
        normalizeKoClinicText(element.text).includes(caption)
      )).length,
      1,
      caption,
    );
  }
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

test('legacy Mint breadcrumb labels remain source metadata without visible promotion', () => {
  const page = extractKoClinicPage({
    html: MINT_BOARD_HTML,
    sourceUrl: 'https://edomclinic.com/bbs/board.php?bo_table=tv&wr_id=1',
  });
  const compilation = compileKoClinicSite({ pages: [page], images: [] });
  const article = compilation.config.pages.find((candidate) => (
    candidate.slug === 'community-tv-1'
  ));
  assert.ok(article);
  const html = renderToStaticMarkup(createElement(SiteRenderer, {
    config: compilation.config,
    pageSlug: article.slug,
    interactive: false,
    animate: false,
  }));
  assert.match(html, /data-clinic-hero-kicker[^>]*>\s*이담미디어/u);
  assert.match(
    html,
    /<span hidden="" data-ko-clinic-source-breadcrumb="[^"]+">민트병원TV<\/span>/u,
  );
  assert.doesNotMatch(html, /<h[1-6][^>]*>[^<]*민트병원TV/u);
  assert.equal(
    article.sections.flatMap((section) => section.elements)
      .some((element) => element.kind === 'text' && element.text === '민트병원TV'),
    true,
  );
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

test('KO-D density limits are pinned to the declared 30-site survey quantiles', () => {
  assert.deepEqual(KO_CLINIC_DENSITY_CONTRACT, {
    version: 1,
    source: '/private/tmp/ko-survey/raw-measurements.json',
    sampleSize: 30,
    sectionBodyCharacters: {
      lower: 42,
      upper: 899,
      lowerQuantile: 'P10',
      upperQuantile: 'P90',
      sampleCount: 111,
    },
    homeSectionCount: {
      lower: 4,
      upper: 8,
      lowerQuantile: 'P25',
      upperQuantile: 'P90',
    },
    maximumConsecutiveImageLessSections: {
      value: 3,
      quantile: 'P90',
    },
  });
});

test('KO-D image manifest pins a bounded lowest-variance hero copy zone for every asset', () => {
  const manifest = JSON.parse(readFileSync(
    new URL('./edom-image-manifest.generated.json', import.meta.url),
    'utf8',
  )) as { assets: KoClinicOptimizedImage[] };
  assert.ok(manifest.assets.length > 0);
  for (const asset of manifest.assets) {
    const zone = asset.analysis.heroTextZone;
    assert.ok(zone, asset.publicPath);
    assert.equal(zone.method, 'local-luminance-variance-v1');
    assert.ok(zone.luminanceVariance <= zone.oppositeVariance, asset.publicPath);
    assert.ok(zone.x >= 0 && zone.y >= 0, asset.publicPath);
    assert.ok(zone.x + zone.width <= 1, asset.publicPath);
    assert.ok(zone.y + zone.height <= 1, asset.publicPath);
  }
});

test('KO-D hero consumes the generated text zone and exposes a single-image slider seam', () => {
  const page = extractKoClinicPage({
    html: STATIC_HTML.replace(
      '<h2><em>하</em><em>지</em><em>정</em><em>맥</em><em>류</em></h2>',
      '<h2>당신의건강에이롭도록진심을담아진료합니다</h2>',
    ),
    sourceUrl: 'https://edomclinic.com/page/sub1_1_1.php',
  });
  const sourceImage = page.images.find((image) => image.classification === 'content');
  assert.ok(sourceImage);
  const compilation = compileKoClinicSite({
    pages: [page],
    images: [{
      sourceUrl: sourceImage.sourceUrl,
      publicPath: '/clinic/edom/hero-zone-test.webp',
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
        heroTextZone: {
          version: 1,
          method: 'local-luminance-variance-v1',
          side: 'right',
          x: 0.54,
          y: 0.16,
          width: 0.38,
          height: 0.68,
          meanLuminance: 0.3,
          luminanceVariance: 0.01,
          oppositeVariance: 0.03,
        },
      },
    }],
  });
  const html = renderToStaticMarkup(createElement(SiteRenderer, {
    config: compilation.config,
    pageSlug: 'center-vascular',
    interactive: false,
    animate: false,
  }));
  assert.match(html, /data-clinic-hero-text-zone="right"/u);
  assert.match(html, /data-clinic-hero-slider="reserved"/u);
  assert.match(html, /data-clinic-hero-slide-count="1"/u);
  assert.match(html, /--ko-hero-zone-x:54%/u);
  assert.match(html, /<wbr\/>/u);
  assert.equal(
    parse(html).querySelector('h1')?.text.trim(),
    '당신의건강에이롭도록진심을담아진료합니다',
  );
});

test('KO-D sticky surface exposes only connected KO channels and leaves EN markup unchanged', () => {
  const pin = {
    version: 1 as const,
    masterId: 'premium-dental-v1' as const,
    accentPreset: 'clean-blue' as const,
    typographyPreset: 'clinic-neutral' as const,
    density: 'airy' as const,
    focus: 'balanced' as const,
    demoPitchLocale: 'ko-owner' as const,
    paletteSource: {
      version: 1 as const,
      kind: 'neutral' as const,
      sourceSha256: 'c'.repeat(64),
    },
    stockManifestVersion: 1,
  };
  const ko = renderToStaticMarkup(createElement(ClinicStickyBooking, {
    pin,
    locale: 'ko-KR',
    interactive: true,
    connectors: {
      catalogVersion: 1,
      items: [
        { id: 'tel', label: '전화 문의', href: 'tel:025472004', displayPhone: '02-547-2004' },
        {
          id: 'kakao-channel',
          label: '카카오 상담',
          href: 'https://pf.kakao.com/_source',
          channelId: '_source',
        },
        {
          id: 'naver-map',
          label: '오시는 길',
          href: 'https://map.naver.com/p/search/source',
          address: '원문 주소',
        },
      ],
    },
  }));
  const koRoot = parse(ko);
  assert.match(ko, /data-clinic-sticky-locale="ko-KR"/u);
  assert.equal((ko.match(/data-clinic-connector-id=/gu) ?? []).length, 3);
  assert.equal(
    koRoot.querySelector('[data-clinic-sticky-booking]')?.getAttribute('aria-disabled'),
    undefined,
  );
  assert.equal(koRoot.querySelectorAll('[aria-disabled="true"]').length, 0);
  assert.doesNotMatch(ko, /예약 시스템을 연결/u);

  const en = renderToStaticMarkup(createElement(ClinicStickyBooking, {
    pin,
    locale: 'en-US',
    interactive: false,
  }));
  assert.match(en, /Book Appointment/u);
  assert.match(en, /Booking activates when you connect your system\./u);
  assert.doesNotMatch(en, /data-clinic-connector-id=/u);
});

test('KO-D reveal contract stays subtle and reduced motion is a complete stop', () => {
  const previewRoute = readFileSync(
    new URL('../../app/preview/[token]/[[...path]]/page.tsx', import.meta.url),
    'utf8',
  );
  assert.match(KO_CLINIC_FLOW_MEASURE_CSS, /translateY\(24px\)/u);
  assert.match(KO_CLINIC_FLOW_MEASURE_CSS, /translateY\(16px\)/u);
  assert.match(KO_CLINIC_FLOW_MEASURE_CSS, /transition-duration:\s*280ms/u);
  assert.match(
    KO_CLINIC_FLOW_MEASURE_CSS,
    /prefers-reduced-motion:\s*reduce[\s\S]*opacity:\s*1 !important[\s\S]*transform:\s*none !important[\s\S]*transition:\s*none !important/u,
  );
  assert.doesNotMatch(KO_CLINIC_FLOW_MEASURE_CSS, /perspective|translateZ|parallax/iu);
  assert.match(
    previewRoute,
    /const koClinicMotion = isKoClinicImport && !isUsMedicalDemo;/u,
  );
  assert.match(previewRoute, /interactive=\{false\}[\s\S]*animate=\{koClinicMotion\}/u);
  assert.match(previewRoute, /interactive[\s\S]*animate=\{false\}/u);
});
