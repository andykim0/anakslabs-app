export interface KoClinicBoardProfile {
  pathname: string;
  tableParam: string;
  articleIdParam: string;
  labels: Readonly<Record<string, string>>;
}

export interface KoClinicSourceProfile {
  id: string;
  headingSelectors: readonly string[];
  contentRootSelectors: readonly string[];
  breadcrumbSelectors: readonly string[];
  breadcrumbLocator?: string;
  businessNameSelectors: readonly string[];
  businessNameLocator?: string;
  fallbackHomeTitle?: string;
  homePaths: readonly string[];
  board?: KoClinicBoardProfile;
}

/**
 * The former EDOM-only selectors are now an explicit profile. Keeping this
 * profile byte-for-byte equivalent preserves the fixed import regression case.
 */
export const EDOM_KO_CLINIC_SOURCE_PROFILE: KoClinicSourceProfile = Object.freeze({
  id: 'edomclinic-v1',
  headingSelectors: [
    '.sub_tit .main_tit h2',
    '.main_tit h2',
    'main h1',
    'main h2',
    'h1',
    'h2',
  ],
  contentRootSelectors: ['.content_wrap', 'main'],
  breadcrumbSelectors: [
    '.main_tit .breadcrumb li',
    '.main_tit .depth li',
  ],
  breadcrumbLocator: '.main_tit:source-breadcrumb',
  businessNameSelectors: ['img[alt*="이담"]'],
  businessNameLocator: 'img[alt*="이담"]@alt',
  fallbackHomeTitle: '이담병원',
  homePaths: ['/', '/main.php'],
  board: {
    pathname: '/bbs/board.php',
    tableParam: 'bo_table',
    articleIdParam: 'wr_id',
    labels: {
      customer: '고객의 소리',
      edu: '학술활동',
      news: '공지사항',
      photo: '이담with스타',
      praise: '칭찬합니다',
      pub_counsel: '전문의상담',
      story: '이벤트',
      tv: '이담미디어',
    },
  },
});

/**
 * Conservative generic parsing: standard semantic containers only, with no
 * assumptions about EDOM paths or board query names.
 */
export const GENERIC_KO_CLINIC_SOURCE_PROFILE: KoClinicSourceProfile = Object.freeze({
  id: 'generic-medical-v1',
  headingSelectors: ['main h1', 'article h1', 'main h2', 'article h2', 'h1', 'h2'],
  contentRootSelectors: ['main', 'article', '[role="main"]'],
  breadcrumbSelectors: [
    '[aria-label="breadcrumb"] li',
    '.breadcrumb li',
  ],
  businessNameSelectors: [
    'header img[alt]',
    'meta[property="og:site_name"]',
  ],
  homePaths: ['/', '/index.html', '/index.htm', '/index.php'],
});

export interface KoClinicRoutingProfile {
  id: string;
  homePaths: readonly string[];
  exactPathSlugs: Readonly<Record<string, string>>;
  contentPathPrefix?: string;
  contentExtension?: string;
  board?: Pick<KoClinicBoardProfile, 'pathname' | 'tableParam' | 'articleIdParam'>;
}

export const EDOM_KO_CLINIC_ROUTING_PROFILE: KoClinicRoutingProfile = Object.freeze({
  id: 'edomclinic-v1',
  homePaths: ['/', '/main.php'],
  exactPathSlugs: {
    '/index02.php': 'center-surgery',
    '/index03.php': 'center-internal-medicine',
    '/index04.php': 'center-spine-joint',
    '/index05.php': 'center-plastic-skin',
    '/page/sub1_1_1.php': 'center-vascular',
    '/page/sub1_5.php': 'directions',
  },
  contentPathPrefix: '/page/',
  contentExtension: '.php',
  board: {
    pathname: '/bbs/board.php',
    tableParam: 'bo_table',
    articleIdParam: 'wr_id',
  },
});

export const GENERIC_KO_CLINIC_ROUTING_PROFILE: KoClinicRoutingProfile = Object.freeze({
  id: 'generic-medical-v1',
  homePaths: ['/', '/index.html', '/index.htm', '/index.php'],
  exactPathSlugs: {},
});
