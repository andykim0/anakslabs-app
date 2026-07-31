# -*- coding: utf-8 -*-
"""Builds /private/tmp/robustness-spec.md from failure characteristics ALREADY RECORDED
in the segment reports. No new measurement. Counts are computed here, never hand-tallied."""
from collections import Counter, defaultdict

# (id, url, market, seg, type, access[], structure[], scale[], platform, grade, note)
S = []
def add(i,u,m,seg,t,acc,st,sc,pf,g,note=""):
    S.append(dict(id=i,url=u,market=m,seg=seg,type=t,access=acc,struct=st,scale=sc,plat=pf,grade=g,note=note))

M="미기록"
# ---------- KR segment-01 ----------
add("01","ahnkang.com","KR","kr-01","전문병원(재활·통증)",["진입 레이어 팝업 3개(하네스가 display 억제)","히어로 배경 지연 로딩 실패(회차 재현)"],["H1 부재"],["1.4화면(1스크린 스플래시)"],M,"L3","지연 로딩 실패로 휘도가 139↔225로 뒤집힘")
add("02","leegajeong.com","KR","kr-01","미확인",["죽은 도메인 — DNS A레코드 없음(리졸버 2곳), curl 000"],[],[],M,"L4")
add("03","gwgclinic.co.kr","KR","kr-01","미확인",["죽은 도메인 — DNS A레코드 없음(www 포함), curl 000"],[],[],M,"L4")
add("04","saekimps.co.kr","KR","kr-01","성형외과",["진입 팝업 2개"],[],["9.4화면"],M,"L2")
add("05","ekwangdong.co.kr","KR","kr-01","종합병원",[],["H1 부재"],["9.8화면"],M,"L2")
add("06","eng.grandsurgery.com","KR","kr-01","성형외과",[],["캐러셀 매장 — 최상위 풀폭 밴드가 히어로 슬라이드(복제 포함)로 잡혀 자동 섹션 분해 실패","H1 부재"],["6.6화면"],M,"L3")
add("07","andps.co.kr","KR","kr-01","성형외과",["히어로 슬라이더 이미지 지연 로딩 실패(휘도 119↔35)"],["캐러셀 매장 — 자동 섹션 분해 실패","H1 부재 · H2 렌더 크기 0(비표시 마크업)","큰 글자 전부 이미지 → 헤딩 스케일 측정 불가"],["8.7화면에 본문 1,722자(텍스트 극소)"],M,"L3")
add("08","ilovegangnam.com","KR","kr-01","다과클리닉(피부·성형)",["홈이 단일 시술 상세 랜딩으로 리다이렉트","캡처 상한(24,000px) 초과 → 상단 43%만 측정"],["헤딩 태그 전무(h1·h2·h3 모두 부재)","본문 435자가 전부 이미지 → 텍스트 전수 grep 불성립"],["문서 높이 56,474px · 62.7화면(조사 전체 최장)"],M,"L3","블록 5종을 '없음'이 아닌 '미확인'으로 남길 수밖에 없었던 사례")
add("09","beautyskin.kr","KR","kr-01","피부과",[],["H1 부재"],["10.6화면 · 본문 12,192자 · 이미지 447"],M,"L2")
add("10","goruda.co.kr","KR","kr-01","치과",["홈이 /index_intro.php 지점 선택 게이트로 리다이렉트"],["헤딩 태그 없음(제목 전부 이미지) → 타입 스케일 전부 미확인"],["1.0화면(조사 전체 최단)"],".php","L3")
add("11","slseoulhospital.com","KR","kr-01","정형외과척추",[],["H1 부재"],["7.5화면"],M,"L2")
add("12","doctorpetit.com","KR","kr-01","기타(미용시술 브랜드)",[],["H1 12px로 위계 역전(H3 50px) → 정상 스케일 미확인"],["2.5화면 지점목록 게이트 · 이미지 0"],M,"L2")
add("13","velyb.kr","KR","kr-01","피부과",[],["DOM 은닉/총량 괴리 — 본문 97,433자가 8.2화면에 압축(이벤트·지점 목록 대량 나열)","H1 부재"],["이미지 904 · 슬라이드 844"],M,"L4")
add("14","corea1.co.kr","KR","kr-01","기타(체형·비만)",["진입 팝업 자동 억제 실패 → 히어로 중앙을 가린 채 캡처"],["H1 부재(H2/본문 9.33배)"],["9.0화면"],M,"L4")
# ---------- KR segment-02 ----------
add("15","makeps.com","KR","kr-02","미확인",["HTTP 200이나 본문이 nginx 기본 404 문서 · innerText 19자"],[],[],M,"L4")
add("16","misoro.kr","KR","kr-02","한의원",[],["h1Count=0"],["1.5화면 2분할 질환 게이트웨이 LP · img 태그 0"],M,"L3")
add("17","iniqueps.com","KR","kr-02","성형외과",["진입 팝업"],["히어로 카피가 이미지에 구워짐 → 텍스트 색 측정 불가(textLum=null)"],["8.1화면"],M,"L2")
add("18","kseye.co.kr","KR","kr-02","안과",["http→www 무한 리다이렉트(50회 초과)","프로모션 팝업 2장이 히어로 좌측을 덮어 휘도 0.351(중간)→제거 후 0.301(다크)로 판정 변동"],[],["1.0화면 전면 스플래시 게이트 · innerText 77자(팝업 제외 29자)"],M,"L4")
add("19","faceps.com","KR","kr-02","성형외과",[],[],["5.3화면"],M,"L1")
add("20","champodonamu.com","KR","kr-02","전문병원(척추·관절·뇌)",["진입 팝업이 뷰포트 전체를 덮어 섹션 휘도를 전부 0.53 부근으로 왜곡(전환 14회→재측정 후 정상)"],[],["23.0화면(KR 표본 최장) · 섹션 21 · 슬라이드 185"],M,"L4")
add("21","limedent.com","KR","kr-02","치과",["비표준 포트 9006으로 리다이렉트"],["히어로 카피가 이미지에 구워짐 → DOM 최대 글자 17px"],["6.5화면"],M,"L3")
add("22","marbleps.com","KR","kr-02","성형외과",["진입 팝업(cross-popup-slider) 억제 후 측정"],["히어로 캐러셀이나 DOM 슬라이드 카운트 0(커스텀)"],["6.6화면 · 슬라이드 228(KR 1위)"],M,"L2")
add("23","ppeum1.com","KR","kr-02","기타(미용 커머스형)",["지점 사이트로 리다이렉트(sinnonhyeon.ppeum.com)"],["데스크톱 전용 레이아웃 없음 — 1440px에서도 570px 모바일 컬럼만 렌더"],["1.3화면 · innerText 515자"],M,"L3")
add("24","hooclinic.co.kr","KR","kr-02","한의원",["진입 팝업 억제 후 측정"],[],["12.0화면"],M,"L2")
add("25","cnuclinic.co.kr","KR","kr-02","피부과",[],["DOM 은닉 — 12화면 중 6,900px(7.7화면)이 본문 0자 스크롤 핀 드라이버이고 실내용은 position:fixed 레이어에서 교체(GSAP ScrollTrigger)"],["12.1화면(실질 콘텐츠 4.4화면) · innerText 655자"],M,"L4")
add("26","rebornps.com","KR","kr-02","성형외과",["익명 딤 레이어(1440×900 fixed) + 진입 팝업 → 히어로 휘도 0.184(다크)로 오판, 제거 후 0.903(라이트)로 정반대 반전"],["전후사진 블록이 MEMBERS ONLY 로그인 게이팅"],["7.2화면"],M,"L4")
add("27","ysfirst.com","KR","kr-02","미확인",["http/https·www 5개 변형 전부 연결 실패(curl 000)"],[],[],M,"L4")
# ---------- KR segment-03 ----------
add("28","kingsdental.co.kr","KR","kr-03","미확인",["DNS NXDOMAIN(apex·www 둘 다)"],[],[],M,"L4")
add("29","lamar180.com","KR","kr-03","미확인",["200이나 본문이 JS 리다이렉트 스텁 · 이전 도메인이 모든 클라이언트에 403"],[],[],M,"L4")
add("30","reandyoung.co.kr","KR","kr-03","미확인",["DNS NXDOMAIN"],[],[],M,"L4")
add("31","smileface.dental","KR","kr-03","치과",[],[],["19.3화면(kr-03 최장) · 의미섹션 13 / raw 20"],"GSAP+ScrollTrigger·slick","L1")
add("32","deesse.co.kr","KR","kr-03","성형외과",["좌상단 레이어 팝업(오늘 하루 열지 않음)"],[],["6.8화면"],"AOS·GSAP","L2")
add("33","sproposeps.com","KR","kr-03","미확인",["DNS NXDOMAIN"],[],[],M,"L4")
add("34","vennskincare.co.kr","KR","kr-03","대상 아님(화장품 이커머스)",[],[],["6.3화면"],"AOS·GSAP","제외")
add("35","meclinicbeauty.com","KR","kr-03","미확인",["DNS NXDOMAIN"],[],[],M,"L4")
add("36","startps.com","KR","kr-03","성형외과",["레이어 팝업 2~3장이 히어로를 덮음 → 휘도 0.558(오염) vs 0.459(순수)"],["히어로 텍스트가 이미지에 구워짐","섹션 8개가 본문 0자 = 완전 이미지 슬라이스형(홈 총 1,137자)","의료진 페이지 본문 0자 · 이미지 18장"],["8.9화면"],"AOS·GSAP","L4")
add("37","medicubesignature.com","KR","kr-03","피부과",["http 접속이 리다이렉트 루프(ERR_TOO_MANY_REDIRECTS) — https만 정상"],[],["5.3화면 · 의미섹션 6(kr-03 최소)"],"AOS·GSAP","L4")
add("38","sdule.co.kr","KR","kr-03","피부과",[],["히어로 슬라이드 유무 미확인","리빌 지속·이징이 인라인 전환으로 노출되지 않아 미확인"],["7.3화면"],"imweb(아임웹)","L2")
add("39","erumeye.co.kr","KR","kr-03","안과",[],[],["7.1화면"],"AOS·GSAP","L1")
add("40","yjain.co.kr","KR","kr-03","한의원",[],["본문 0자 섹션 6개 = 홈이 사실상 이미지 슬라이스 나열(섹션당 평균 50자)"],["7.9화면"],"AOS·GSAP","L3")
# ---------- KR segment-04 ----------
add("41","iddc.co.kr","KR","kr-04","치과",[],["본문 대부분이 이미지에 구워짐(3,410px 밴드에 텍스트 393자 / 이미지 46)"],["6.4화면"],".php","L3")
add("42","jwbeauty.com","KR","kr-04","성형외과",["전체화면 딤 스크림(알파 0.7) + 레이어 팝업 → 히어로 0.254(오염) vs 해제 후 0.308"],["시각적 대제목 상당수가 이미지 · 마크업 h1 0개","전후사진 수술 전 이미지가 로그인 게이팅"],["9.9화면"],M,"L4")
add("43","kosleep.com","KR","kr-04","기타(수면클리닉)",["진입 팝업 1개(오늘 하루 보지 않기)"],[],["9.4화면"],"bxSlider","L2")
add("44","rubyps.co.kr","KR","kr-04","성형외과",["진입 팝업 자동 해제 실패 → 픽셀 마스킹(히어로 유효 68.8%)","리스트 URL이 그룹 관문 스플래시 — 본 홈은 /index.php"],["관문 페이지 h1 0 · 폼 0 · 앵커 1","전후사진 수술 전 이미지가 로그인 게이팅"],["관문 1.0화면 / 본 홈 9.5화면"],".php","L4")
add("45","mrbigclinic.com","KR","kr-04","대상 아님(태국어 물리치료)",[],[],["8.7화면"],"Shopify","제외")
add("46","everm.net","KR","kr-04","치과",[],["마크업 h1 0개"],["9.7화면"],"WordPress(Salient·Revolution·WPBakery)","L2")
add("47","sooamc.com","KR","kr-04","기타(동물병원)",[],["스크롤 가로채기 — fullPage.js가 html/body overflow hidden, window.scrollTo·휠 모두 무효(scrollY 0 고정). 표준 하네스는 히어로만 12회 반복 렌더하는 무효 결과"],["12.0화면(900×12 섹션 스냅)"],"fullPage.js·GSAP·slick","L4")
add("48","jk-withme.com","KR","kr-04","다과클리닉(성형·피부)",["진입 팝업 2개 — 전체화면 딤 스크림 + 이벤트 팝업"],["마크업 h1 0개"],["8.6화면"],"WordPress(Beaver Builder)","L4")
add("49","eyejak.co.kr","KR","kr-04","성형외과",["진입 팝업 1개","https 미전환(HTTP 유지)"],["카피가 전부 이미지에 구워짐 → DOM 최대 헤딩 14px"],["5.4화면"],".php","L3")
add("50","bocelle.com","KR","kr-04","미확인",["도메인 만료 — 등록대행사 안내 페이지 반환(타이틀이 만료 고지)"],[],["0.7화면"],M,"L4")
add("51","withme-medi.com","KR","kr-04","기타(요양병원)",["비표준 포트 9010으로 리다이렉트","진입 팝업 1개"],["h1 태그 8개(SEO 남용)"],["7.1화면"],".php","L2")
add("52","resexy.co.kr","KR","kr-04","산부인과",["진입 팝업 1개","https 미전환"],["카피가 전부 이미지 → DOM 최대 헤딩 14px · h1 0개 · 본문 12px"],["데스크톱 3.3 vs 모바일 8.7화면(2.6배 격차, 별도 m/ 사이트)"],".php","L3")
add("53","glowell.co.kr","KR","kr-04","기타(모발이식)",[],["대제목이 이미지 → DOM 최대 헤딩 14px"],["5.3화면"],".php","L3")
add("54","gangnamhifu.com","KR","kr-04","미확인",["DNS NXDOMAIN(로컬·8.8.8.8 동일) · ERR_NAME_NOT_RESOLVED"],[],[],M,"L4")
# ---------- KR segment-target ----------
add("B01","edomclinic.com","KR","kr-target","다과클리닉(혈관·정형·성형·외과·내과)",["홈 최종 URL이 intro.php 게이트웨이"],["가시 헤딩 11개가 전부 이미지(텍스트 0자) · 최대 실텍스트 19px"],["본문 119자 · 1화면"],".php","L3","엔진의 원본 사이트")
add("B02","seoulchuk.com","KR","kr-target","전문병원(척추·관절 외 7센터)",[],["H1(36px)<H2(48px) 위계 역전"],[],M,"L2")
add("B03","nanoori.co.kr","KR","kr-target","전문병원(척추·관절)",["팝업"],["H1 16px로 본문 18px보다 작은 역전","홈이 풀페이지 패널 덱"],[],M,"L2")
add("B04","wooridul.co.kr","KR","kr-target","전문병원(척추)",["팝업"],["H1 computed 0px(숨김) → unverified","의료진 페이지 1,238자에 이름·직함 토큰 0개"],["장문 아티클 단일 블록 11,514자"],"GSAP·slick","L2")
add("B05","himchanhospital.com","KR","kr-target","전문병원(관절·척추)",["팝업"],["가시 헤딩이 1개뿐이고 그마저 이미지(텍스트 0자)","의료진 페이지 3,416자·이미지 253장인데 이름 토큰 0개"],["첫 화면 대형 이미지 5장"],M,"L3")
add("B06","bumin.co.kr","KR","kr-target","종합병원",[],[],["홈 총 텍스트 722자 · 의미섹션 1개(타깃 최소 구성)"],M,"L3")
add("B07","jaseng.co.kr","KR","kr-target","전문병원(한방 척추·관절)",["팝업"],["가시 헤딩 1개가 이미지(텍스트 0자)"],["첫 화면 대형 이미지 17장 · 20개 지점 선택자"],"GSAP+ScrollTrigger","L3")
add("B08","mokhuri.com","KR","kr-target","전문병원(한방 척추)",[],["H1 12px = 본문 12px(위계 부재) · 최대 실텍스트 26px"],["첫 화면 대형 이미지 11장"],M,"L2")
add("B10","barunsesang.co.kr","KR","kr-target","전문병원(척추·관절 외 5축)",["crawl-delay 5초 승계(요청 간격 제한)","진입 팝업 4장"],["H1 computed 12px에 텍스트 0자 → unverified","이미지 헤딩 2개"],["첫 화면 대형 이미지 31장 · slick 8·슬라이드 90"],"slick","L3")
add("B11","yesonhospital.com","KR","kr-target","전문병원(9개 센터)",["팝업"],["H1 computed 0px(숨김, 텍스트 28자 보유) → unverified"],["홈 총 텍스트 785자 · 의미섹션 2개"],M,"L2")
add("B12","spine21.co.kr","KR","kr-target","전문병원(척추·관절)",["https 인증서 CN 불일치(ERR_CERT_COMMON_NAME_INVALID)로 렌더 실패 → http로 재측정","팝업 2장"],["H1 30px에 텍스트 0자","의료진 페이지 613자에 이름 토큰 0개(정보가 이미지로만 존재)"],[],M,"L4")
add("B13","nowhospital.co.kr","KR","kr-target","전문병원(관절·척추)",[],["H1 32px에 텍스트 0자 → unverified","의료진 페이지 2,924자에 이름·직함 토큰 0개"],[],M,"L2")
add("B14","daehang.com","KR","kr-target","전문병원(대장항문)",[],["H1 0px(숨김) + 본문 후보도 computed 0px → H1·본문 모두 unverified","의료진 링크 자동 선택이 병원소식 기사로 오탐"],[],M,"L2")
add("B16","mintir.com","KR","kr-target","전문병원(인터벤션 영상의학)",[],["H1 computed 0px(숨김) · H2 없음 · 최대 실텍스트 22.4px","가시 헤딩 2개뿐이고 시각적 제목은 전부 이미지"],["첫 화면 대형 이미지 6장"],M,"L3")
add("B17","hanaent.co.kr","KR","kr-target","전문병원(이비인후과)",["팝업"],["H1 computed 0px(숨김) → unverified"],["의미섹션 3개로 압축"],M,"L2")
add("B36","snubh.org","KR","kr-target","종합병원",[],["H1 12px 텍스트 0자 · H2 computed 1px → 둘 다 unverified","의료진 페이지가 검색 인터페이스(이름 토큰 0개, 명단은 조회 후 로드)"],["최대 실텍스트 32px"],M,"L2")
add("B37","samsunghospital.com","KR","kr-target","종합병원",[],["H1 24px·H2 18px 둘 다 텍스트 0자 → unverified","의료진 페이지 747자 검색 폼 랜딩"],["최대 실텍스트 26px · 의미섹션 2개"],M,"L2")
add("B38","amc.seoul.kr","KR","kr-target","종합병원",[],["H1 36px에 텍스트 0자 → unverified","의료진 페이지 1,986자에 이름 토큰 0개(조회형)"],[],M,"L2")
add("B39","sev.severance.healthcare","KR","kr-target","종합병원",[],["H1 16px 텍스트 0자 · H2 computed 0px → 둘 다 unverified(DOM 헤딩 위계 부재)","의료진 찾기 370자에 이름 토큰 0개"],[],M,"L2")
# ---------- US dental ----------
add("D01","aventuradentalarts.com","US","us-dental","치과(심미·보철)",[],["스티키 핀 섹션 3개"],["20.5화면(US 최장)"],M,"L3")
add("D02","grandstreetdental.com","US","us-dental","치과(심미)",[],["헤딩 서체 계열 미확인(커스텀 서체명·폴백 없음)"],["9.1화면"],M,"L1")
add("D03","zen.dentist","US","us-dental","치과(종합)",[],["단일 섹션 본문 3,872자"],["11.5화면"],M,"L1")
add("D04","thegleamery.com","US","us-dental","치과(심미·투명교정)",["전체화면 프로모션 모달(1440×900 fixed) → 렌더 휘도 기반 밝기 판정 전면 무효"],[],["14.1화면"],M,"L4")
add("D05","statenislandoralsurgery.us","US","us-dental","치과(구강악안면외과)",[],["정밀 섹션 분할 실패 → 휘도 표본 4점으로 축소"],["모바일 24.5화면(US 모바일 최장)"],M,"L3")
add("D06","advancedperioatl.com","US","us-dental","치과(치주·임플란트)",[],["1차 섹션 분할 실패 → 2차 프로브로 재측정, 휘도 표본 1점"],["10.0화면"],"GSAP+ScrollTrigger","L3")
add("D07","villagedentaldtc.com","US","us-dental","치과(종합)",[],["1차 섹션 분할 실패 → 2차 프로브, 휘도 표본 1점"],["9.1화면"],M,"L3")
add("D08","fornidental.com","US","us-dental","치과(종합)",[],["1차 섹션 분할 실패 → 2차 프로브, 휘도 표본 1점"],["8.7화면"],M,"L3")
add("D09","docmac.com","US","us-dental","치과(심미)",[],[],["6.9화면"],M,"L1")
add("D10","dentologie.com","US","us-dental","치과(종합)",[],[],["8.4화면"],M,"L1")
add("D11","thetoothco.com","US","us-dental","치과(심미·디지털)",[],["AOS 속성 5건이 선언됐으나 관측 상태 변화 0"],["7.4화면"],"AOS","L1")
add("D-x1","perlsmile.co","US","us-dental(제외)","치과",["HTTP 429(요청 차단) · 본문 0바이트"],[],[],M,"L4")
add("D-x2","jacksonfamilydental.com","US","us-dental(제외)","치과",["도메인 판매 파킹 페이지"],[],[],M,"L4")
add("D-x3","firesidedc.com","US","us-dental(제외)","대상 아님(B2B 조달)",[],[],[],M,"제외")
# ---------- US aesthetic ----------
add("A01","millercosmeticsurgery.com","US","us-aesthetic","성형외과",[],["히어로 헤드라인이 텍스트가 아니라 이미지 → H1 픽셀 측정 불가(히어로 최대 실텍스트 18px)"],["11.7화면"],M,"L2")
add("A02","drmadnani.com","US","us-aesthetic","성형외과(안면)",["구독 유도 모달"],["갤러리 섹션이 캡처 시 미렌더"],["9.3화면"],M,"L2")
add("A03","parkcitydermatology.com","US","us-aesthetic","피부과",["당일 시술 안내 모달 + 리뷰 팝업"],[],["4.8화면"],M,"L2")
add("A04","moderndermct.com","US","us-aesthetic","피부과",["쿠키 동의 배너(수락하지 않음)"],[],["5.5화면"],M,"L1")
add("A05","carencampbellmd.com","US","us-aesthetic","피부과",[],["전후사진 판정 불가 — 갤러리성 링크가 커머스 경로와 구분되지 않음"],["10.5화면"],M,"L1")
add("A06","benjamineye.com","US","us-aesthetic","안과",[],["DOM 은닉/총량 괴리 — DOM 본문 133,000자·이미지 227개인데 실제 표시는 8.2화면. 숨은 패널·대형 메뉴가 총량 오염 → 밀도 전면 미확인"],["8.2화면"],M,"L4")
add("A07","maloneyshamievision.com","US","us-aesthetic","안과",[],["히어로 슬라이드가 인디케이터·화살표 없는 자동 크로스페이드 → 장수 판정에 전환 중간 상태 캡처 필요"],["16.3화면(US 에스테틱 최장)"],M,"L2")
# ---------- US ortho ----------
add("O01","modernorthopedics.org","US","us-ortho","정형외과척추",[],["본문 없는 대형 다크 밴드 1개(3.2화면)가 헤드리스에서 미렌더 가능성 → 밴드 유형 미확인"],["10.1화면(실효 약 7화면)"],M,"L3")
add("O02","seancallowaymd.com","US","us-ortho","정형외과척추",[],[],["3.4화면(US ortho 최단)"],M,"L1")
add("O03","discmdgroup.com","US","us-ortho","정형외과척추",["히어로 위에 예약 유도 팝업 모달이 겹쳐 노출"],[],["10.7화면"],M,"L2")
add("O04","osmsgb.com","US","us-ortho","정형외과척추",["신규 지점 오픈 공지 팝업"],["리뷰 위젯 섹션에 아이콘이 다량 삽입돼 이미지 개수 계측 무의미","모션 라이브러리는 로드되나 리빌 대상 요소 미검출 → 리빌 미확인"],["8.4화면"],M,"L2")
add("O05","midorthoneuro.com","US","us-ortho","정형외과척추",[],["영상 임베드 1개가 헤드리스 렌더 시 공백"],["6.3화면"],M,"L2")
add("O06","orthospinecenters.com","US","us-ortho","정형외과척추",[],[],["5.5화면"],M,"L1")
add("O07","goldenstateortho.com","US","us-ortho","정형외과척추",["앱 유도 팝업 2종 + 운영 공지 밴드"],[],["7.7화면"],M,"L2")
add("O08","syracuseherniacenter.com","US","us-ortho","외과",[],["히어로 캐러셀 구조·재생 컨트롤은 검출되나 렌더 시 장면 전환 없음 → 슬라이드 장수 미확인"],["5.5화면"],M,"L2")

import io,sys
out=io.StringIO()
W=out.write

grades=Counter(s["grade"] for s in S)
graded=[s for s in S if s["grade"].startswith("L")]
n_all=len(S); n_graded=len(graded)
def pct(a,b): return f"{a}/{b} ({round(100*a/b)}%)"

W("# 견고성 테스트 명세 — 측정 완료 사이트 기반 장애 프로필\n\n")
W("> **목표 전환**: 제품 지표를 \"평균 구성을 잘 재현하는가\"에서 **\"임의의 병원 URL을 넣었을 때 오류 없이 돌아가는가\"**로 옮긴다.\n")
W("> 이 문서는 **새 측정을 하지 않았다.** 아래 모든 장애 특성은 `kr-survey/segment-*.md` 5개 파일과 `us-survey/segment-*.md` 4개 파일에\n")
W("> **이미 기록된 내용만** 추출·재배열한 것이다. 원 리포트에 기록이 없는 항목은 `미기록`으로 남겼고 추정으로 채우지 않았다.\n")
W("> **난이도 등급은 전부 추정치다.** 파이프라인을 실제로 돌린 결과가 아니라, 기록된 장애 특성을 아래 규칙에 대입해 산출한 값이다.\n\n---\n\n")

W("## 0. 표본 범위 — 리드가 말한 79곳과의 차이\n\n")
W("| 출처 | 사이트 수 |\n|---|---:|\n")
segs=Counter(s["seg"] for s in S)
for k in ["kr-01","kr-02","kr-03","kr-04","kr-target","us-dental","us-dental(제외)","us-aesthetic","us-ortho"]:
    W(f"| `{k}` | {segs[k]} |\n")
W(f"| **합계** | **{n_all}** |\n\n")
W("- 리드가 말한 **79곳**은 KR 목록 54곳 + US 25곳으로 보인다. 그런데 지시가 `segment-*.md` **전부**였고, 그 사이 `kr-survey/segment-target.md`(19곳)와\n")
W(f"  `us-survey/segment-dental.md`의 11번째 카드·제외 3곳이 추가돼 **실제 기록된 URL은 {n_all}건**이다. 79가 아니라 {n_all}을 분모로 썼다.\n")
W(f"- 이 중 **{n_graded}건**만 등급을 매겼다. 나머지 {n_all-n_graded}건(`vennskincare.co.kr` 화장품 이커머스 · `mrbigclinic.com` 태국어 물리치료 · `firesidedc.com` B2B 조달)은\n")
W("  **병원 사이트가 아니어서 대상에서 제외**했다. 다만 \"아무 URL이나 들어온다\"는 전제에서는 이런 오입력도 실제로 발생하므로 표에는 남겼다.\n\n---\n\n")

W("## 1. 난이도 등급 규칙 (적용한 그대로)\n\n")
W("리드가 준 4단계를 그대로 쓰되, 판정이 갈리는 지점은 아래처럼 못박고 기계적으로 적용했다. **한 사이트가 여러 조건에 걸리면 가장 높은 등급을 준다.**\n\n")
W("| 등급 | 트리거 (리포트에 기록된 것만) |\n|---|---|\n")
W("| **L4 실패 예상** | 죽은 도메인(DNS NXDOMAIN·연결 실패·404 스텁·파킹·만료) · 403 · 429 · TLS 인증서 오류 · 무한 리다이렉트 / **전체화면 딤·모달이 기록됐거나, 팝업 때문에 측정값이 오염·반전됐거나, 자동 해제에 실패했다고 기록된 곳** / DOM 은닉(표시량↔DOM 총량 괴리) / 스크롤 가로채기 |\n")
W("| **L3 어려움** | 본문·제목이 이미지화(본문 0자 섹션 다수, \"카피 전부 이미지\") / 캐러셀 매장(히어로 슬라이드가 최상위 밴드로 잡혀 섹션 분해 실패) / 섹션 자동 분할 실패 / 극단 규모(≥20화면, ≤1.5화면, 캡처 상한 초과) / 지연 로딩·헤드리스 미렌더 |\n")
W("| **L2 주의** | H1 부재·0px 숨김·텍스트 0자 / 헤딩 위계 역전 / 제목 일부만 이미지 / 진입 팝업이 기록됐으나 오염은 기록되지 않음 / 슬라이드·리빌 유무 미확인 |\n")
W("| **L1 통과 예상** | 위 어디에도 걸린 기록이 없음 |\n\n")
W("**규칙에서 내가 판단한 두 지점**(리드 원문에 없어 임의로 정한 것이므로 이견이 있으면 되돌린다):\n\n")
W("1. **무한 리다이렉트를 L4에 넣었다.** `kseye.co.kr`·`medicubesignature.com`은 https로는 정상이지만 **http URL이 그대로 들어오면 루프에 빠진다.** \"아무 URL이나 넣는다\"가 전제이므로 실패로 잡는 게 맞다고 봤다.\n")
W("2. **전체화면 딤이 기록된 곳은 자동 해제에 성공했어도 L4다.** `jk-withme.com`은 닫기 클릭으로 해제돼 오염이 0%였지만, 딤 스크림이 존재한다는 사실 자체가 해제 로직이 없는 파이프라인에서는 곧 실패다. 반대로 소형 레이어 팝업만 기록된 곳은 L2에 뒀다.\n\n---\n\n")

W("## 2. ★ 사이트별 장애 프로필\n\n")
W("`미기록` = 원 리포트가 그 항목을 다루지 않았다는 뜻이다. 장애가 없다는 뜻이 아니다.\n\n")
W("| # | URL | 시장 | 진료유형 | 접근 장애 | 구조 장애 | 규모 장애 | 플랫폼 힌트 | 등급 |\n")
W("|---|---|---|---|---|---|---|---|---|\n")
for s in S:
    a=" · ".join(s["access"]) or "—"
    st=" · ".join(s["struct"]) or "—"
    sc=" · ".join(s["scale"]) or "—"
    W(f"| {s['id']} | `{s['url']}` | {s['market']} | {s['type']} | {a} | {st} | {sc} | {s['plat']} | **{s['grade']}** |\n")
W("\n---\n\n")

W("## 3. ★ 난이도 등급별 집계 — `ENGINE-ROBUST` 출발 지표\n\n")
W(f"등급 대상 **{n_graded}곳**(비병원 3곳 제외) 기준.\n\n")
W("| 등급 | 곳 | 비율 | 의미 |\n|---|---:|---:|---|\n")
lbl={"L1":"통과 예상","L2":"주의","L3":"어려움","L4":"실패 예상"}
mean={"L1":"접근 정상 · 텍스트 기반 · 표준 규모. 기록된 장애 없음",
      "L2":"결과는 나오되 제목·위계가 비거나 팝업이 끼어 **일부 필드가 빈다**",
      "L3":"결과가 나와도 **조용히 틀린다** — 본문이 이미지라 추출량이 실제와 다르고, 섹션 분해가 어긋난다",
      "L4":"**결과가 아예 안 나오거나 정반대로 나온다** — 페치 실패 또는 렌더 오염"}
for g in ["L1","L2","L3","L4"]:
    W(f"| **{g} {lbl[g]}** | {grades[g]} | {round(100*grades[g]/n_graded)}% | {mean[g]} |\n")
W(f"| 합계 | {n_graded} | 100% | |\n\n")
W(f"**출발선: L1 {round(100*grades['L1']/n_graded)}% · L4 {round(100*grades['L4']/n_graded)}%.** ")
W(f"현재 상태를 그대로 두면 임의 병원 URL {n_graded}건 중 **{grades['L4']}건({round(100*grades['L4']/n_graded)}%)이 실패**하고, ")
W(f"**{grades['L3']+grades['L4']}건({round(100*(grades['L3']+grades['L4'])/n_graded)}%)은 결과를 신뢰할 수 없다**는 추정이다.\n\n")

def has(s,keys,fields=("access","struct","scale")):
    blob=" ".join(sum([s[f] for f in fields],[]))
    return any(k in blob for k in keys)
# market split
W("### 시장별\n\n| 시장 | L1 | L2 | L3 | L4 | 합 | L1 비율 | L4 비율 |\n|---|---:|---:|---:|---:|---:|---:|---:|\n")
for mk in ["KR","US"]:
    row=[s for s in graded if s["market"]==mk]
    c=Counter(x["grade"] for x in row); n=len(row)
    W(f"| {mk} | {c['L1']} | {c['L2']} | {c['L3']} | {c['L4']} | {n} | {round(100*c['L1']/n)}% | {round(100*c['L4']/n)}% |\n")
W("\n**KR이 US보다 확연히 어렵다.** ")
kr=[s for s in graded if s["market"]=="KR"]; us=[s for s in graded if s["market"]=="US"]
ckr=Counter(x["grade"] for x in kr); cus=Counter(x["grade"] for x in us)
W(f"L4가 KR {round(100*ckr['L4']/len(kr))}% vs US {round(100*cus['L4']/len(us))}%, ")
W(f"L1이 KR {round(100*ckr['L1']/len(kr))}% vs US {round(100*cus['L1']/len(us))}%다. ")
us_dead=[x for x in us if has(x,["DNS","연결 실패","404 문서","파킹","도메인 만료","403","429"])]
us_img=[x for x in us if has(x,["이미지에 구워","전부 이미지","이미지 슬라이스"])]
us_cert=[x for x in us if has(x,["인증서"])]
us_hij=[x for x in us if has(x,["스크롤 가로채기","핀 드라이버"])]
W(f"US {len(us)}곳에서 페치 단계 실패는 **{len(us_dead)}건**(도메인 파킹 1 · HTTP 429 1)뿐이고, ")
W(f"**인증서 오류 {len(us_cert)}건 · 스크롤 가로채기 {len(us_hij)}건 · 본문 이미지화 {len(us_img)}건**이다. ")
W("KR에서 가장 비싼 세 가지 장애가 US 표본에는 아예 없다.\n\n")

W("### 세그먼트별\n\n| 세그먼트 | L1 | L2 | L3 | L4 | 합 |\n|---|---:|---:|---:|---:|---:|\n")
for k in ["kr-01","kr-02","kr-03","kr-04","kr-target","us-dental","us-dental(제외)","us-aesthetic","us-ortho"]:
    row=[s for s in graded if s["seg"]==k]
    if not row: continue
    c=Counter(x["grade"] for x in row)
    W(f"| `{k}` | {c['L1']} | {c['L2']} | {c['L3']} | {c['L4']} | {len(row)} |\n")
W("\n")

# failure frequency
W("---\n\n## 4. 장애 유형별 출현 빈도\n\n")
def count_if(fn): return [s for s in graded if fn(s)]
CAT=[
 ("죽은 도메인 / 파킹 / 404스텁 / 연결 실패",["DNS","연결 실패","404 문서","파킹","도메인 만료","403"]),
 ("무한 리다이렉트 / 리다이렉트 루프",["무한 리다이렉트","리다이렉트 루프"]),
 ("TLS 인증서 오류",["인증서"]),
 ("HTTP 429 / 요청 차단 / crawl-delay",["429","crawl-delay"]),
 ("진입 팝업·모달 (전부)",["팝업","모달","딤 스크림","딤 레이어"]),
 ("  └ 그중 전체화면 딤·오염·해제 실패",["전체화면 딤","딤 스크림","딤 레이어","오염","해제 실패","억제 실패","왜곡","전면 무효","판정 변동"]),
 ("비표준 포트 리다이렉트",["비표준 포트"]),
 ("제목·본문이 이미지",["이미지에 구워","전부 이미지","이미지 슬라이스","헤딩이 1개뿐이고 그마저 이미지","시각적 제목은 전부 이미지","헤드라인이 텍스트가 아니라 이미지","제목 전부 이미지","이미지 헤딩"]),
 ("H1 부재 / 0px 숨김 / 텍스트 0자",["H1 부재","h1 0개","h1Count=0","0px","텍스트 0자","헤딩 태그 없음","헤딩 태그 전무","H1 12px","H1 16px"]),
 ("헤딩 위계 역전",["역전"]),
 ("섹션 자동 분할·분해 실패 (캐러셀 매장 포함)",["분해 실패","분할 실패"]),
 ("DOM 은닉 / 표시량↔총량 괴리 / 스크롤 가로채기",["DOM 은닉","총량 괴리","스크롤 가로채기","핀 드라이버"]),
 ("지연 로딩 실패 / 헤드리스 미렌더",["지연 로딩","미렌더"]),
 ("로그인 게이팅",["로그인 게이팅","MEMBERS ONLY"]),
 ("의료진 페이지 텍스트 0자 / 이름 토큰 0개",["이름 토큰 0","이름·직함 토큰 0","의료진 페이지 본문 0자","검색 인터페이스","검색 폼 랜딩"]),
 ("게이트웨이·스플래시 홈 (콘텐츠 없음)",["게이트","게이트웨이","스플래시","관문"]),
 ("캡처 상한 초과 / ≥20화면",["캡처 상한","20.5화면","23.0화면","62.7화면","24.5화면"]),
]
W("| 장애 유형 | 곳 | 비율(분모 %d) |\n|---|---:|---:|\n"%n_graded)
for name,keys in CAT:
    hits=[s for s in graded if has(s,keys)]
    W(f"| {name} | {len(hits)} | {round(100*len(hits)/n_graded)}% |\n")
W("\n")
top=sorted([(len([s for s in graded if has(s,k)]),n) for n,k in CAT if not n.startswith("  ")],reverse=True)[:3]
W("**가장 흔한 장애 3개**: " + " · ".join(f"**{n}** {c}곳" for c,n in top) + "\n\n")

W("---\n\n## 5. 플랫폼 힌트 — 판정 가능한 만큼만\n\n")
plats=Counter(s["plat"] for s in S)
W("| 플랫폼 힌트 | 곳 |\n|---|---:|\n")
for k,v in plats.most_common():
    W(f"| {k} | {v} |\n")
W(f"\n**{plats['미기록']}곳({round(100*plats['미기록']/n_all)}%)이 `미기록`이다.** 원 조사의 준수선이 **HTML/CSS 코드·클래스명 수집을 금지**했기 때문에,\n")
W("리포트에는 CMS를 특정할 만한 마크업 근거가 거의 남지 않았다. 위 표는 URL 경로(`.php`)·모션 라이브러리·푸터 문구 등\n")
W("**부수적으로 언급된 흔적만** 모은 것이라 플랫폼 분포로 읽으면 안 된다.\n\n")
W("- **그누보드(`bbs/board.php`) 판정은 전 리포트에서 단 1건도 불가능하다** — 아래 6절 참조.\n")
W("- `.php` 경로가 기록된 곳은 URL이 직접 인용된 경우뿐이다. 실제 PHP 사이트는 이보다 훨씬 많을 것이나 **세지 못한다.**\n\n")

W("---\n\n## 6. ★ 예상 실패 지점 — 이담 전용 가정의 실제 적용 범위\n\n")
W("파이프라인에 박혀 있는 이담(`edomclinic.com`) 전용 가정 3종을 전 리포트와 대조했다.\n\n")
W("| 엔진 가정 | 전 리포트 출현 | 성립 확인 | 성립 부정 |\n|---|---:|---:|---:|\n")
W("| `.main_tit` / `.content_wrap` (클래스명) | **0회** | **0곳** | **0곳** |\n")
W("| `sub{c}_{s}[_{d}].php` (URL 패턴) | **0회** | **0곳** | **0곳** |\n")
W("| `bo_table=tv/edu/story` (그누보드) | **0회** | **0곳** | **0곳** |\n\n")
W("세 토큰 모두 9개 리포트 전문에서 **출현 횟수 0**이다(Python `re.findall` 전수 확인). 여기서 결론은 두 갈래인데, 섞으면 안 된다.\n\n")
W("**확실한 것** — 이 코퍼스로는 **엔진 가정의 적용 범위를 단 한 곳도 확인할 수 없다.** 즉 현재 근거로 말할 수 있는 성립 곳 수는 **0곳**이다.\n\n")
W("**단정하면 안 되는 것** — 이 0은 \"99곳 중 0곳이 이담 구조다\"라는 **부정의 증거가 아니다.** 원 조사의 준수선이\n")
W("`HTML/CSS 코드·클래스명 수집 0`을 명시적으로 금지했기 때문에, **애초에 기록될 수 없는 항목**이었다. 코퍼스는 부정이 아니라 **침묵**한다.\n\n")
W("### 그래서 실제로 말할 수 있는 것\n\n")
phpsites=[s for s in S if ".php" in s["plat"] or any(".php" in x for x in s["access"]+s["struct"]+s["scale"])]
W(f"- **`.php` 경로가 실제로 인용된 곳: {len(phpsites)}곳** — {', '.join('`'+s['url']+'`' for s in phpsites)}\n")
W("  이것이 `sub{c}_{s}.php` 류 패턴이 **성립할 수도 있는 상한**이다. 성립 여부 자체는 미확인이다.\n")
W("- 나머지 사이트는 WordPress 2곳 · Shopify 1곳 · imweb 1곳만 확인됐고, **PHP인지 아닌지조차 기록이 없다.**\n\n")
W("### 즉시 해야 할 일\n\n")
W("1. **이 명세만으로 적용 범위를 결론내지 마라.** 클래스명·URL 템플릿·게시판 파라미터를 수집하는 **별도 1회 스캔**이 필요하다.\n")
W("   기존 조사와 목적이 달라(디자인 조사 → 파서 호환성 조사) 준수선도 다르게 잡아야 한다.\n")
W("2. 그 스캔 전까지 엔진의 이담 전용 셀렉터는 **하드코딩된 실패 지점**으로 간주하는 게 안전하다. 아래 3개 가정 모두 **fallback 경로가 없으면\n")
W("   이담 이외의 사이트에서 조용히 빈 결과를 낸다** — 예외를 던지지 않기 때문에 더 위험하다.\n\n")

W("---\n\n## 7. 엔진이 깨질 지점 — 코퍼스가 직접 보여준 것\n\n")
W("클래스명 대조와 별개로, 기록된 장애만으로도 **파이프라인의 어느 단계가 무너지는지**는 특정된다.\n\n")
W("| 파이프라인 단계 | 무너뜨리는 입력 | 코퍼스 근거 |\n|---|---|---|\n")
W("| **페치** | DNS NXDOMAIN · 연결 실패 · 파킹 · 404 스텁 · 429 · 인증서 CN 불일치 · http 무한 리다이렉트 | KR 목록의 낡음이 결정적 — `kr-03`은 13곳 중 5곳(38%)이 죽은 도메인이다 |\n")
W("| **렌더** | 전체화면 딤·모달 · 자동 해제 실패 · 쿠키 배너 | 딤 레이어 하나가 히어로 판정을 `0.184 다크` ↔ `0.903 라이트`로 **완전히 뒤집은** 사례(`rebornps.com`)가 있다 |\n")
W("| **스크롤/수집** | fullPage.js 스크롤 가로채기 · GSAP 핀 드라이버 · 지연 로딩 실패 | `sooamc.com`은 `window.scrollTo`·마우스 휠 **둘 다 무효**여서 표준 하네스가 히어로만 12회 반복 렌더했다 |\n")
W("| **섹션 분해** | 히어로 슬라이드가 최상위 밴드로 잡힘 · 복제 슬라이드 · 마퀴 | US 치과 11곳 중 **4곳이 1차 섹션 분할 실패**로 2차 프로브가 필요했다 |\n")
W("| **텍스트 추출** | 본문·제목이 전부 이미지 · 본문 0자 섹션 | 이 상태에서는 \"블록 없음\"을 **부정할 수단이 사라진다**(`ilovegangnam.com`은 그래서 블록 5종을 미확인 처리) |\n")
W("| **제목/위계 추출** | H1 부재 · H1 computed 0px · H1 텍스트 0자 · H1<본문 역전 | 대형 종합병원 4곳(`snubh`·`samsunghospital`·`amc`·`severance`)이 **전부** H1·H2 unverified다 |\n")
W("| **밀도/분량 산출** | DOM 총량 ↔ 표시량 괴리 | `benjamineye.com` DOM 133,000자 vs 표시 8.2화면 · `velyb.kr` 본문 97,433자 vs 8.2화면 |\n")
W("| **하위 페이지(의료진)** | 텍스트 0자 · 이름 토큰 0개 · 검색 인터페이스 | 의료진 페이지에서 **이름을 텍스트로 못 얻는 사례가 반복**된다. 대형 병원은 명단이 조회 후 로드된다 |\n\n")

W("### 우선순위 제안 (L4 → L1 전환 효율 순)\n\n")
W("| 순위 | 조치 | 회수 가능한 곳(추정) |\n|---|---|---:|\n")
modal=[s for s in graded if s["grade"]=="L4" and has(s,["팝업","모달","딤"])]
dead=[s for s in graded if s["grade"]=="L4" and has(s,["DNS","연결 실패","404 문서","파킹","도메인 만료","403","429"])]
redir=[s for s in graded if s["grade"]=="L4" and has(s,["무한 리다이렉트","리다이렉트 루프","인증서"])]
hid=[s for s in graded if s["grade"]=="L4" and has(s,["DOM 은닉","총량 괴리","스크롤 가로채기","핀 드라이버"])]
W(f"| 1 | **팝업·딤 자동 해제**(닫기 문구 사전 + 전체화면 fixed 레이어 마스킹) | {len(modal)}곳 |\n")
W(f"| 2 | **URL 정규화**(https 우선 · 리다이렉트 상한 · 인증서 실패 시 http 폴백) | {len(redir)}곳 |\n")
W(f"| 3 | **스크롤 드라이버 대체**(fullPage/GSAP 감지 후 API·섹션 단위 구동) | {len(hid)}곳 |\n")
W(f"| 4 | 죽은 도메인 — 조치 불가, **입력 검증에서 조기 실패 처리** | {len(dead)}곳 |\n\n")
fix_union={s["url"] for s in modal+redir+hid}
dead_urls={s["url"] for s in dead}
recoverable=fix_union-dead_urls
W(f"\n1~3번은 서로 겹치는 사이트가 있어(예: `kseye.co.kr`는 무한 리다이렉트와 모달 오염을 둘 다 가짐) 단순 합산하면 안 된다. ")
W(f"중복을 제거하고 **도메인이 죽은 곳을 뺀 실제 회수 가능 대상은 {len(recoverable)}곳**이다 — L4 {grades['L4']}곳의 {round(100*len(recoverable)/grades['L4'])}%.\n\n")
W(f"남는 **{len(dead_urls)}곳은 도메인이 실제로 죽었거나 차단된 것이라 엔진이 고칠 수 있는 대상이 아니다.** ")
W("지표를 발표할 때 이 그룹을 분리하지 않으면, 엔진을 아무리 고쳐도 L4 비율이 내려가지 않아 개선이 보이지 않는다. ")
W(f"**엔진 책임 분모는 {n_graded}곳이 아니라 {n_graded-len(dead_urls)}곳으로 잡는 것을 권한다.**\n\n")

W("---\n\n## 8. 이 문서의 한계\n\n")
W("- **등급은 실행 결과가 아니라 추정이다.** 파이프라인을 이 URL들에 돌려본 적이 없다. 실행 결과와 다를 수 있고, 다르면 실행 결과가 맞다.\n")
W("- 원 리포트가 다루지 않은 장애는 여기에도 없다. `미기록`이 많다는 것은 **장애가 없다는 뜻이 아니라 그 항목을 아무도 보지 않았다는 뜻**이다.\n")
W("- 원 조사는 **홈 1페이지 기준**이다. 하위 페이지에서만 나타나는 장애(게시판 페이지네이션, 상세 페이지 템플릿 편차)는 이 표에 잡히지 않는다.\n")
W("  엔진 가정 3종 중 2종(`sub{c}_{s}.php`, `bo_table=`)은 **하위 페이지 패턴**이라, 홈 기준 조사로는 원리적으로 검증할 수 없었다.\n")
W("- KR 표본 54곳은 **한 대행사 포트폴리오**이고 19곳은 별도 선정이다. 장애 분포가 한국 병원 사이트 전체를 대표하지 않는다.\n")
W("- 측정 시점은 2026-07-31 1회다. 도메인 생사·팝업 유무는 시간이 지나면 달라진다.\n")

open("/private/tmp/robustness-spec.md","w").write(out.getvalue())
print("WROTE /private/tmp/robustness-spec.md")
print("총 URL:",n_all,"| 등급 대상:",n_graded)
print("등급:",dict(grades))
for mk in ["KR","US"]:
    row=[s for s in S if s["market"]==mk and s["grade"].startswith("L")]
    print(mk,dict(Counter(x["grade"] for x in row)),"n=",len(row))
print("top3:",top)
print("php sites:",[s['url'] for s in phpsites])
print("modal",len(modal),"redir",len(redir),"hid",len(hid),"dead",len(dead))
