# Pattern Library — ui-ux-designer

Read on demand by `ui-ux-designer` only, when the current task's scope overlaps an entry below. See `CLAUDE.md` § Agent Self-Update Protocol for edit rules.

---

## Staking Page v2 (2026-08-10)

**Task**: DEEP CORE 게임 중심의 스테이킹 페이지 재설계 — 비주얼/디자인 토큰 작업

**Deliverables**:

1. **`docs/patterns/staking-v2-design-tokens.md`** — 종합 비주얼 가이드
   - 5개 블록 (STAGE/YIELD PANEL/VAULT BAR/RIG BAR/INLINE NOTICES) 레이아웃 & 간격
   - 상태칩 vs 비활성 버튼 구분
   - 수령 슬롯 3가지 상태 (UNAVAILABLE/DISABLED/ENABLED) 색상/커서 정의
   - 밴드폭 0 포지션 동치 렌더링 (비밴드와 픽셀 동일)
   - 모바일/태블릿/데스크톱 반응형 규칙
   - 다크/라이트 모드 색상 매핑
   - 시트 (S-STAKE/S-POS/S-YIELD) 상세 스타일
   - 인라인 고지 배치 우선순위

2. **`docs/patterns/staking-v2-implementation-guide.md`** — React 구현 가이드
   - Staking.tsx 의사 코드 (페이지 레이아웃)
   - YieldPanel / VaultControlBar / InlineNotices 컴포넌트 예시
   - 수령 슬롯 상태 결정 로직
   - 시트 3단 흐름 (STEP 1/2/3) 구현
   - 밴드 미터 UI (BM-1~BM-4 규칙)
   - 포지션 행 (접힌/펼친) 구현
   - 다크/라이트 모드 패턴
   - i18n 카피 키 매핑
   - Staking.tsx 삭제 항목 목록

3. **`web/src/app/globals.css`** (라인 393~) — Semantic 상태 토큰 추가
   ```
   .state-chip-unavailable / .state-button-disabled / .state-button-enabled
   .notice-critical / .notice-info / .notice-success / .notice-error
   .control-button
   + .light 모드 override + DEEP CORE 챕터 팔레트
   ```

**Key Design Rules**:
- L-1 고지와 상태는 인라인, 작업은 시트
- L-3 실화폐 ↔ 게임 영역 절대 분리 (두 개 컨트롤 바)
- L-6 레이아웃 단일성 (배치 재구성 금지)
- L-8 밴드 UI는 밴드가 있을 때만 (밴드폭 0 금지)
- EG-1 밴드폭 0 포지션 동치 렌더 (기존 계약도 신규와 동일)
- PS-A/B/C 3개 티어별 라벨/상태 분기

**Technology**:
- TailwindCSS v4 arbitrary values + globals.css semantic tokens
- IBM Plex Sans/Mono (기존 stack)
- lucide-react 아이콘
- no hardcoded locale formatting on amounts (font-mono 문자열 그대로)

**Scope Boundary**:
- ✅ 토큰 정의, 색상, 간격, 타이포, 반응형 규칙
- ❌ React 컴포넌트 구현 (web-wallet-expert), 비즈니스 로직, API 호출

**Dependencies**:
- `docs/specs/staking-page-v2-screen-flow-frd.md` (product-planner)
- `docs/specs/deep-core-07-art-style-guide.md` (game-designer)

---

### Design tokens
- `web/src/index.css` was an orphaned pre-rebrand stylesheet (different font stack, no light theme, never imported anywhere) — removed. If you ever see a new unimported CSS file appear, don't assume it's dead without checking imports first; this one was confirmed via grep before deletion.
