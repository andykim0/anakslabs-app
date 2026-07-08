# web/ — 아낙스랩스 Next.js 앱

아낙스랩스 SaaS의 Next.js 16(App Router) 애플리케이션입니다.

```bash
npm install
npm run dev       # http://localhost:3000 (MOCK_MODE=1 기본 — 키 없이 전체 데모)
npm run build     # 프로덕션 빌드
npx tsc --noEmit  # 타입 체크
```

문서는 저장소 루트를 참고하세요:

- [../README.md](../README.md) — 제품 개요 · 빠른 시작 · 아키텍처 · 디렉토리 구조
- [../CLAUDE.md](../CLAUDE.md) — 아키텍처 헌법 · 소유권 경계 · 불변식
- [../docs/SPEC.md](../docs/SPEC.md) — 요구사항 명세
- [../docs/SETUP.md](../docs/SETUP.md) — mock → 실연동 단계별 런북
- [../docs/STATUS.md](../docs/STATUS.md) — 빌드/검증/잔여 작업 현황
