# 스테이킹 페이지 v2 — 디자인 토큰 & 비주얼 가이드

> 작성: `ui-ux-designer` · 2026-08-10 · 연계: `staking-page-v2-screen-flow-frd.md`
> 
> **이 문서는 TailwindCSS v4 토큰과 컴포넌트 스타일 규칙을 정의합니다.**
> 구현 담당(`web-wallet-expert`, `game-developer`)을 위한 참조 가이드입니다.

---

## 0. 원칙과 스코프

### 설계 원칙 (FRD 승계)
- **L-1 고지와 상태는 인라인, 작업은 시트**: 실화폐 수치/고지는 항상 노출, 폼/리스트는 시트
- **L-3 실화폐 ↔ 게임 영역 분리**: 두 개의 컨트롤 바로 시각적으로 명확히 구분
- **L-6 레이아웃 단일성**: 브레이크포인트별로 배치는 재구성하지 않음 (캔버스 높이, B2 그리드, 시트만 변함)
- **L-8 밴드 UI는 밴드가 있을 때만**: 밴드폭 0 또는 비밴드 포지션에 밴드 미터/옵션 표기 금지
- **EG-1 밴드폭 0 포지션 동치 렌더링**: 기존 계약 사용자도 신규 밴드 포지션과 **픽셀 단위로 동일**하게 표시

### 비주얼 기초 (art-style-guide 승계)
- **팔레트**: 기존 UI 토큰 완전 재사용 (배경 `#06132a`, 카드 `#112643`, 보더 `#1E3559`, 액센트 `#528dff`, 보조텍스트 `#8c90a0`)
- **챕터 팔레트**: 게임 리그/배경에만 적용. DOM UI는 기존 중성 팔레트 유지
- **타이포**: IBM Plex Sans(기본) / IBM Plex Mono(금액). 금액은 로케일 포맷팅 금지 — 서버 문자열 그대로 모노스페이스로 표시
- **다크/라이트**: 기존 override layer 구조 유지 (`globals.css` `.light` 클래스)
- **반응형**: 모바일 우선. `sm:`, `lg:` 브레이크포인트만 사용

---

## 1. 페이지 구조 — 5개 블록

```
/staking (max-w-4xl mx-auto px-4)
┌────────────────────────────────────────┐
│ Header (제목/설정 버튼)                 │  ← 기존 유지
├────────────────────────────────────────┤
│ 【B1】 STAGE — 캔버스 + HUD             │
│        h-[220px] sm:h-[300px] lg:h-[380px]
├────────────────────────────────────────┤
│ 【B2】 YIELD PANEL — 실화폐 수치        │
│        코인별 행 + 수령 슬롯 + 고지
├────────────────────────────────────────┤
│ 【B3】 VAULT BAR — 예치/포지션/내역     │
│        3-버튼 컨트롤 바 (실화폐)
├────────────────────────────────────────┤
│ 【B4】 RIG BAR — 크루/보급/기록         │
│        3-버튼 컨트롤 바 (게임)
├────────────────────────────────────────┤
│ 【B5】 INLINE NOTICES — 조건부 알림     │
│        점검/정산중지/만기/갱신 결과
└────────────────────────────────────────┘
```

**블록 간 간격 규칙**:
- B1 ↔ B2: `gap-4` (16px)
- B2 ↔ B3: `gap-3` (12px)
- B3 ↔ B4: `gap-2` (8px) — 같은 형태이므로 긴밀
- B4 ↔ B5: `gap-4` (16px)

---

## 2. B1 — STAGE (캔버스 + HUD)

### 컨테이너
```tailwind
div.
  w-full rounded-lg
  h-[220px] sm:h-[300px] lg:h-[380px]
  bg-[#112643]/70 border border-[#1E3559]
  overflow-hidden
```

**다크/라이트 모드**: 배경/보더는 자동 override. 캔버스 내부 콘텐츠는 게임 자산이므로 따로 조정 필요 없음.

### HUD 오버레이
- 위치: canvas 내 절대 위치 지정 (Phaser 씬 내)
- 스타일: 기존 구현 유지
- **신설**: `onOpenStake` prop (S-4 빈 상태 CTA)
- **신설**: `focusWellId` prop (시추정 상호 네비게이션)

---

## 3. B2 — YIELD PANEL (실화폐 수치)

### 패널 컨테이너
```tailwind
div.
  w-full bg-[#112643]/70 border border-[#1E3559]
  rounded-lg p-4 sm:p-6
  space-y-4
```

### 3.1 코인별 행 (YIELD ROW)

각 코인(현재 BANA만) 1행:

```tailwind
div.border-b border-[#1E3559]/50 pb-3 last:border-b-0
  space-y-2
```

#### 3.1.1 코인 헤더
```tailwind
div.flex items-center gap-2
  h-5 w-5 rounded-full bg-gradient-to-br from-[#fbbf24] to-[#f59e0b]  /* BANA gold */
  span.text-sm font-500 text-white  /* 코인명 */
```

#### 3.1.2 수치 그리드 (3수치 행)

**모바일** (`base`):
```tailwind
div.grid grid-cols-1 gap-3  /* 세로 스택 */
```

**태블릿+** (`sm` 이상):
```tailwind
div.grid grid-cols-3 gap-4
```

##### 각 수치 박스 (3개 동일)
```tailwind
div.space-y-1
  .label: text-xs font-600 text-[#8c90a0] uppercase tracking-wide
  .value: text-base sm:text-lg font-mono text-white
  .help:  text-xs text-[#8c90a0]/70 leading-tight
```

**수치 라벨 규칙** (FRD §3.2):

| 티어 | ① 라벨 | ① 설명키 | ② | ③ |
|------|--------|---------|-----|------|
| PS-A | `yield.recordedLabel` | `yield.recordedHelp` | "지갑 수령 완료" | "잠긴 원금" |
| PS-B/C | `yield.claimableLabel` | `yield.claimableHelp` | 동일 | 동일 |

**금액 포맷**: 서버 decimal 문자열 → **로케일 포맷팅 금지**. `font-mono`로 그대로 렌더.

#### 3.1.3 수령 슬롯 (CLAIM SLOT)

FRD §4.2.3의 3가지 상태:

**1) UNAVAILABLE (비버튼 상태칩)** — PS-A, 킬 스위치 OFF, 점검 중

```tailwind
div.
  inline-flex items-center gap-2 px-3 py-2 rounded-lg
  bg-[#1E3559]/40 border border-[#1E3559]/60
  cursor-not-allowed
  span.text-sm font-500 text-[#8c90a0]  /* 비활성 텍스트 */
```

> **"상태칩"이어야 하는 이유**: 비활성 버튼은 "조건만 채우면 눌린다"는 기대를 줌. 하지만 PS-A에서 클레임 레일 개설은 사용자가 할 수 없음. 상태칩은 **사실**을 전달함.

**2) DISABLED (비활성 버튼)** — PS-B + ① = 0

```tailwind
button.
  px-3 py-2 rounded-lg
  bg-[#1E3559]/30 border border-[#1E3559]/50
  text-sm font-600 text-[#8c90a0]
  cursor-not-allowed disabled:opacity-50
  inline-flex items-center gap-1.5
```

**3) ENABLED (활성 버튼)** — PS-B + ① > 0

```tailwind
button.
  px-3 py-2 rounded-lg
  bg-[#2E7DFF]/90 hover:bg-[#2E7DFF]
  border border-[#2E7DFF]
  text-sm font-600 text-white
  cursor-pointer
  transition-colors duration-200
```

dark/light mode에서는 기존 버튼 그래디언트 자동 적용 (silver/graphite).

**버튼 상태**:
- `UNAVAILABLE`: 비버튼 칩, "자세히" 링크 (필요한 경우 S-INFO로)
- `DISABLED`/`ENABLED`: 버튼 (클릭 시 확인 다이얼로그)

#### 3.1.4 상시 고지 (1줄, PS-C만)

```tailwind
div.text-xs text-[#8c90a0] leading-relaxed
  /* disclosure.noLoss */
```

위치: B2 하단. 접기/툴팁 금지.

### 3.2 빈 상태 (S-0, 포지션 이력 없음)

```tailwind
div.text-center py-6
  span.text-sm text-[#8c90a0]
    /* yield.empty */
```

---

## 4. B3 & B4 — 두 개의 컨트롤 바

### 원칙 (CB-1/CB-2/CB-3)
- **시각 계열 분리**: B3(실화폐)는 기본 버튼, B4(게임)는 기본 버튼 (표준 톤)
- **B3는 항상 렌더**: 게임 상태와 무관
- **B4는 기존 DeepCoreControlBar 그대로**: 3탭 (크루/보급/기록)

### B3 — VAULT BAR (실화폐)

```tailwind
div.grid grid-cols-3 gap-2 w-full
```

#### 버튼 타입 (3개 동일 스타일)

```tailwind
button.
  flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg
  bg-[#112643]/70 hover:bg-[#1e3459]
  border border-[#1E3559]
  text-[#afc6ff] hover:text-white text-xs font-bold
  transition-colors duration-200
  
  &:disabled {
    opacity-50 cursor-not-allowed
  }
```

#### 각 버튼
1. **[예치]** — S-STAKE 시트 열기
2. **[내 포지션 · N]** — S-POS 시트. N = ACTIVE 포지션 수. 배지 스타일:
   ```tailwind
   span.inline-flex ml-1
     bg-[#2E7DFF] text-white text-xs font-bold
     rounded-full w-5 h-5 items-center justify-center
   ```
3. **[수익 내역]** — S-YIELD 시트

### B4 — RIG BAR (게임)

기존 `DeepCoreControlBar` 구현 그대로. 스타일:

```tailwind
div.grid grid-cols-3 gap-2 w-full

button (3개) {
  flex items-center justify-center gap-1.5 py-2 rounded-xl
  bg-[#112643]/70 hover:bg-[#1e3459]
  border border-[#1E3559]
  text-[#afc6ff] hover:text-white text-xs font-bold
  transition-colors
}
```

---

## 5. B5 — INLINE NOTICES (조건부)

우선순위 순 (FRD §4.7):

### 배치 규칙
- **#1 점검** + **#2 정산 중지**: B2 위에 렌더 (`mb-2` 간격)
- **#3 만기 수령 안내** + **#4 자동 갱신 결과**: B5에 렌더

### 통지 스타일 (공통)

```tailwind
div.rounded-lg p-3 sm:p-4 border
  text-sm leading-relaxed
```

#### 점검 / 정산 중지 (경고)
```tailwind
.
  bg-[#1E3559]/40 border-[#1E3559]
  text-white
  icon: Info className="h-4 w-4 inline mr-1"
```

#### 만기 수령 안내 (정보)
```tailwind
.
  bg-[#2E7DFF]/15 border-[#2E7DFF]/50
  text-[#afc6ff]
```

#### 자동 갱신 결과 (성공/실패)

**성공**:
```tailwind
.
  bg-emerald-500/15 border-emerald-500/50
  text-emerald-200
  icon: Check className="h-4 w-4 inline mr-1"
```

**실패**:
```tailwind
.
  bg-rose-500/15 border-rose-500/50
  text-rose-200
  icon: AlertCircle className="h-4 w-4 inline mr-1"
  [닫기] button: text-rose-300 hover:text-rose-100
```

---

## 6. 모바일 반응형 규칙 (L-6)

### 브레이크포인트별 변화

| 요소 | 기본(모바일) | `sm` | `lg` |
|------|----------|------|------|
| **B1 캔버스 높이** | `h-[220px]` | `sm:h-[300px]` | `lg:h-[380px]` |
| **B2 수치 그리드** | 3수치 세로 | 3수치 3열 | 3수치 3열 |
| **B2 수령 슬롯 위치** | 수치 아래 | 우측 정렬 | 우측 정렬 |
| **B3/B4 버튼** | 전폭 3등분 | 전폭 3등분 | 전폭 3등분 |
| **시트** | 하단 바텀시트 | 하단 바텀시트 | 중앙 모달 `max-w-2xl` |
| **Padding** | `px-4 py-3` | `px-4 py-4` | `px-6 py-5` |

### 레이아웃 고정 (L-6)
- **배치 재구성 금지**: 2개의 레이아웃은 2개의 고지 표면을 의미하고, 하나는 반드시 뒤처짐.
- 블록 순서는 변하지 않음 (항상 B1 → B2 → B3 → B4 → B5)

---

## 7. 시트 (모달) 스타일

### S-STAKE 예치 시트 (STEP 1/2/3)

#### 컨테이너
```tailwind
div.rounded-lg bg-[#112643] border border-[#1E3559]
  sm:max-w-2xl sm:mx-auto
  space-y-4 p-4 sm:p-6
```

#### 헤더 (STEP 표시)
```tailwind
div.flex justify-between items-center
  h3.text-lg sm:text-xl font-bold text-white
  span.text-xs font-600 text-[#8c90a0]  /* STEP 1/2/3 */
```

#### STEP 1 상품 카드 (grid)

```tailwind
div.grid grid-cols-1 sm:grid-cols-2 gap-3

.card {
  bg-[#1E3559]/40 border border-[#1E3559]
  rounded-lg p-3 space-y-2
  cursor-pointer hover:border-[#2E7DFF] hover:bg-[#1E3559]/60
  transition-colors
}
```

**카드 요소**:
- 상품명: `text-sm font-600 text-white`
- 이율: `text-base font-mono text-[#2E7DFF]` (또는 밴드 미터)
- 약정: `text-xs text-[#8c90a0]`
- 잔여/마감: `text-xs font-600 text-rose-400` (full 칩)

**밴드 미터** (BM-1~BM-4):
```
일 0.100% ──●── 0.110%
기준(보장)  현재  최대
            0.104%
```

세 값 모두 **동일한 자간·크기·굵기** (최대만 크게 쓰는 금지).

#### STEP 2 금액 입력

```tailwind
div.space-y-3

input.
  w-full px-4 py-3 rounded-lg
  bg-[#020d24] border border-[#1E3559]
  text-white font-mono text-base
  placeholder-[#8c90a0]/50
  focus:outline-none focus:border-[#2E7DFF]
  transition-colors
```

**[최대] 버튼**:
```tailwind
button.
  text-xs font-600 text-[#2E7DFF] hover:text-white
  ml-2
```

**계약 조건 요약** (FRD §4.4):
```tailwind
div.text-xs text-[#8c90a0] bg-[#1E3559]/40 p-3 rounded
  /* 비밴드: "{days}일 기준 이자: {baseTotal} {coin}" */
  /* 밴드: "{days}일 기준: 기준 이자 {baseTotal}, 최대 이율 시 {maxTotal}" */
  /* 공통: "이 수치는 계약 이율에서 계산된 값이며 예측치가 아닙니다." */
```

#### STEP 3 체결 확인

```tailwind
div.space-y-4

.summary {
  bg-[#1E3559]/40 border border-[#1E3559]
  rounded-lg p-4 space-y-2
  text-sm
}

.disclosure {
  bg-rose-500/10 border border-rose-500/30
  rounded-lg p-4 text-sm text-rose-200
  /* 필수 고지 3종: contract / rate / prospective */
}

button.primary {
  w-full bg-[#2E7DFF] hover:bg-[#1a6aff]
  text-white font-600 py-3 rounded-lg
  transition-colors
}
```

**밴드 상품 필수 고지** (R-U13): 게임 숨김 상태/S-5에서도 반드시 표시 (DOM 존재).

### S-POS 내 포지션 시트

#### 접힌 행 (DEFAULT)

```tailwind
div.border-b border-[#1E3559]/50 py-3 last:border-b-0
  space-y-1
```

**레이아웃**:
```
[시추정 #3]  1,000 BANA · 30일 정기      기록됨 +2.4500   정산 12/30
             일 0.100%                   D-18 [ACTIVE]
             자동 갱신: 켜짐 · 2026-09-10                (토글)
```

**구성요소**:

1. **첫 줄**: 포지션 ID / 금액 / 약정
   ```tailwind
   div.flex items-center justify-between gap-2
     .left: text-sm font-600 text-white
     .right: text-xs text-[#8c90a0]
   ```

2. **둘째 줄**: 이율 (비밴드) 또는 밴드 미터 (밴드)
   ```tailwind
   div.text-xs font-mono text-[#2E7DFF]
     /* PR-3: 밴드만 "일 {base}% – {max}%" */
     /* 밴드폭 0은 단일 값만 */
   ```

3. **셋째 줄**: 진행도 / 상태
   ```tailwind
   div.text-xs text-[#8c90a0]
     /* PR-2: "정산 {settled}/{term}일" (경과일 아님) */
   ```

4. **자동 갱신** (활성화 시):
   ```tailwind
   div.text-xs text-[#8c90a0] flex items-center gap-2
     toggle: switch component
   ```

#### 펼친 상세 (EXPANDED)

```tailwind
div.bg-[#1E3559]/40 border-t border-[#1E3559] p-3 mt-2
  space-y-3
```

**항목**:
- 체결 스냅샷 (체결일 / 기준 이율 / 최대 가산 / 약정일수 / 만기일)
- 현재 조건과의 차이 (다를 때만, 1줄)
- 비밴드 사실 표기 (`band.noBandNote` — 상세에서만)
- 일별 내역 링크 (S-YIELD로 필터)
- 밴드 고지 (밴드 포지션만)

### S-YIELD 수익 내역 시트

#### 탭 (2개)

```tailwind
div.flex gap-2 border-b border-[#1E3559]
  button.py-2 px-3 text-sm font-600
    /* 활성: text-white border-b-2 border-[#2E7DFF] */
    /* 비활성: text-[#8c90a0] */
```

1. **일별 정산 내역**
2. **클레임 이력**

#### 일별 내역 행

```tailwind
div.border-b border-[#1E3559]/50 py-3 last:border-b-0
  grid grid-cols-[1fr_1fr_1fr] gap-3 text-sm
```

**컬럼**:
1. 날짜: `text-[#8c90a0]`
2. 포지션: `text-white font-500`
3. 금액: `text-white font-mono` (또는 PS-C에서 분해)

**분해 (PS-C만)** — 2줄:
```
기준 이자 +0.00123
가산 (진행도 45%) +0.00007
```

---

## 8. 상태칩 (State Chip) vs 비활성 버튼 차이

### 상태칩 (비버튼, UNAVAILABLE)

**시각적 특성**:
- 배경: 중립 회색 (`#1E3559/40`)
- 보더: 희미 (`#1E3559/60`)
- 텍스트: 보조 컬러 (`#8c90a0`)
- 커서: `not-allowed` (금지 사인)
- **클릭 불가**: `pointer-events-none`

**의미**: "조건을 충족할 수 없음. 이것은 시스템 상태입니다."

### 비활성 버튼 (DISABLED, 0원 대기)

**시각적 특성**:
- 배경: 약간 더 밝은 회색 (`#1E3559/30`)
- 보더: 중립 (`#1E3559/50`)
- 텍스트: 보조 컬러 (`#8c90a0`)
- 커서: `not-allowed`
- **구조**: 여전히 버튼 HTML 요소

**의미**: "조건만 충족되면 눌릴 수 있음. 사용자 행동 대기 중."

### 활성 버튼 (ENABLED, > 0원)

**시각적 특성**:
- 배경: 강한 파랑 (`#2E7DFF/90`)
- 보더: 동일 (`#2E7DFF`)
- 텍스트: 흰색
- 커서: `pointer`
- 호버: `#2E7DFF`

**의미**: "지금 누를 수 있음."

---

## 9. 밴드폭 0 포지션 처리 (EG-1)

### 원칙
**밴드폭 0인 전환 포지션(기존 계약)은 비밴드 포지션과 픽셀 단위로 동일하게 렌더.**

### 금지 항목
- "최대 +0.000%" 표기
- 회색 밴드 미터
- "밴드 상품으로 갈아타기" CTA
- 밴드 관련 옵션

### 구현 규칙

**S-POS 접힌 행**:
```
비밴드 포지션:  일 0.100%
밴드폭 0 포지션: 일 0.100%  ← 동일 (밴드 미터 없음)
```

**S-POS 펼친 상세**:
- `band.noBandNote` ("이 포지션은 고정 일이율이며 수익 밴드가 없습니다.") 
  → **상세에서만** 표시, 접힌 행에서 금지

**S-STAKE STEP 1 카드**:
- 밴드 상품에만 밴드 미터
- 비밴드 상품에는 단일 이율만

---

## 10. 다크 모드 / 라이트 모드

### 구조
- **기본**: 다크 모드 (hardcoded 색상)
- **오버레이**: `.light` 클래스가 `<html>`에 붙을 때 모든 색상 override (globals.css 유지)

### 신설 토큰이 필요한 경우
다음 패턴을 `globals.css`에 추가:

```css
/* 새 토큰 클래스 — 다크 모드 */
.some-new-token {
  background-color: #112643;
  border-color: #1E3559;
  color: #afc6ff;
}

/* 라이트 모드 override */
.light .some-new-token {
  background-color: #ffffff;
  border-color: #d3ddec;
  color: #39435a;
}
```

현재 주요 색상 매핑 (globals.css 유지):
- 배경: `#06132a` (다크) → `#eef2f8` (라이트)
- 카드: `#112643` (다크) → `#ffffff` (라이트)
- 보더: `#1E3559` (다크) → `#d3ddec` (라이트)
- 액센트: `#2E7DFF` (동일)
- 보조텍스트: `#8c90a0` (다크) → `#5b6576` (라이트)

---

## 11. 아이콘 & 배지

### 아이콘 출처
- **B3/B4 탭 아이콘**: `lucide-react` 또는 assetManifest
- **상태 아이콘**: `lucide-react` (Info, Check, AlertCircle, etc.)
- **게임 아이콘**: DEEP CORE 게임 자산 (TabButton fallback 참조)

### 배지 (ACTIVE 포지션 수)

```tailwind
span.inline-flex
  bg-[#2E7DFF] text-white
  text-xs font-bold
  rounded-full w-5 h-5
  items-center justify-center
```

---

## 12. 타이포그래피 (DEEP CORE 승계)

| 용도 | 폰트 | 크기 | 굵기 | 메모 |
|------|------|------|------|------|
| **본문 라벨** | IBM Plex Sans | 12px-14px | 500-600 | 텍스트 수치 라벨 |
| **헤딩** | IBM Plex Sans | 16px-20px | 600-700 | 섹션 제목 |
| **금액/수치** | IBM Plex Mono | 14px-16px | 400-600 | 로케일 포맷팅 금지 |
| **도움말/작은 텍스트** | IBM Plex Sans | 11px-12px | 400 | 보조 설명 |

---

## 13. 인라인 고지 (고지 판정)

FRD §10의 판정표에 따라 PS-A/B/C 및 게임 상태별로 다른 카피가 렌더됨. 카피 키는 `staking.*` 메시지 파일에서 관리.

**위치**:
- **B2 하단**: `disclosure.noLoss` (PS-C, 밴드 프로그램 ON)
- **B2 위**: `notice.maintenance`, `notice.workerPaused`
- **B5**: `claim.maturityNudge`, `autoRenew.*`
- **S-STAKE STEP 3**: `disclosure.contract`, `disclosure.rate`, `disclosure.prospective`

**렌더 규칙**:
- 접기 불가
- 툴팁 불가 (또는 선택적 [자세히] 링크만)
- 배치 변경 금지 (순서 고정)

---

## 14. 흐름별 비주얼 체크리스트

### UF-1 신규 사용자 최초 예치
- [ ] B2: `yield.empty` 1줄
- [ ] B3 [예치] 클릭 → S-STAKE STEP 1
- [ ] 성공 표시: 정보 수준 1줄 (축하 연출 금지)
- [ ] 게임 인트로: 수익률 언급 금지

### UF-2 일상 복귀
- [ ] 게임 인양 연출과 B2 ① 동시 갱신

### UF-3 클레임 (PS-B)
- [ ] 확인 다이얼로그 필수 (원탭 금지)
- [ ] 버튼 in-flight: 스피너 + 재탭 불가
- [ ] 성공: 1줄 결과, 연출 없음
- [ ] 실패: 사유 문구, 재시도 버튼 없음

### UF-4 만기
- [ ] 원금: 잠금 해제
- [ ] ①: 그대로 유지
- [ ] 자동 갱신 켜짐: 승계 포지션 생성

### UF-5 캔버스 ↔ 포지션 상호 이동
- [ ] 시추정 클릭 → S-POS 스크롤 + 2초 하이라이트
- [ ] 포지션 배지 클릭 → S-POS 닫힘 + 캔버스 카메라 이동

### UF-6 게임 숨김
- [ ] B1: 안내 + [표시] 버튼
- [ ] B4: 렌더 안 함
- [ ] B2/B3/시트: 완전히 동일
- [ ] S-STAKE STEP 3 고지: 그대로 표시

---

## 15. globals.css 신규 토큰

기존 토큰(배경/카드/보더/액센트/보조텍스트)으로 충분한지 검토 후, 필요 시만 추가. 현 단계에서는 **모두 기존 색상 조합으로 표현 가능** — TailwindCSS arbitrary values (`bg-[#...]`) 사용.

신규 토큰이 필요한 경우 (예: 특정 상태의 반복적 조합):
```css
@theme {
  --color-state-unavailable: #1E3559/40;
  --color-state-disabled: #1E3559/30;
  --color-state-enabled: #2E7DFF/90;
}
```

현재로서는 **추가 필요 없음**. Tailwind arbitrary values로 충분.

---

## 16. 구현 체크리스트 (web-wallet-expert / game-developer)

### UI/스타일
- [ ] B1 STAGE: h 반응형 + DeepCoreEmbed props 신설 (onOpenStake, focusWellId)
- [ ] B2 YIELD PANEL: 코인별 행 + 수치 그리드 (mobile/sm/lg) + 수령 슬롯 3상태 구현
- [ ] B2 상시 고지: PS-C일 때만 disclosure.noLoss 렌더
- [ ] B3 VAULT BAR: 3-버튼 그리드 + [내 포지션 · N] 배지
- [ ] B4 RIG BAR: 기존 DeepCoreControlBar 유지
- [ ] B5 INLINE NOTICES: 우선순위 + 조건부 렌더

### 시트
- [ ] S-STAKE: 3단 흐름 (상품/금액/확인) + 밴드 미터 + 계약 조건 요약
- [ ] S-POS: 접힌 행 + 펼친 상세 + 자동 갱신 토글
- [ ] S-YIELD: 일별 내역 + 클레임 이력 탭 + PS-C 분해

### 상태 규칙
- [ ] 수령 슬롯: UNAVAILABLE/DISABLED/ENABLED 3상태 + 스타일 차이 명확
- [ ] 밴드폭 0: 비밴드와 동일 렌더, 밴드 미터/옵션 없음
- [ ] 게임 숨김: B2/B3/시트는 완전 동일, B4 미렌더

### i18n
- [ ] 모든 UI 문구: `useTranslations('staking')` 또는 `staking.game` 키
- [ ] 카피 키: `staking-page-v2-screen-flow-frd.md` §8 매핑 참조
- [ ] 밴드 미터 케이스: 3개 분기 (프로그램 OFF/보유 0/보유 ≥1)

---

## 부록: 기존 Staking.tsx 삭제 항목

FRD §2.4 인계용:

| 삭제 대상 | 현재 위치 | 이관 처리 |
|----------|---------|---------|
| "Rewards Earned" 섹션 | `:385-402` | 제거 (i18n 미지원 + 허위 표시) |
| Earn 상품 목록 | `:405-497` | S-STAKE STEP 1로 이관 |
| 인라인 예치 폼 | `:443-485` | S-STAKE로 이관 |
| My Stakes 목록 | `:500-591` | S-POS로 이관 |
| `accruedInterest` 실시간 계산 | `:14`, `:546`, `:574-575` | 제거 (R-U7 위반) |
| 클라이언트 `lockedByCoin` 재계산 | `:139-145` | 제거, 서버에서만 받음 |
| `#staking-earn-section` 타깃 | `:405` | 제거, S-STAKE 시트로 변경 |

**유지**:
- DeepCoreEmbed 렌더 (B1로)
- 자동 갱신 토글/테이블/확인 시트 (S-POS로)
- 갱신 결과 통지 (B5로)

---

## 참고문서

- `staking-page-v2-screen-flow-frd.md` — 화면 구조 & 상태 모델
- `deep-core-07-art-style-guide.md` — 게임 비주얼 토큰
- `web/src/app/globals.css` — Tailwind v4 기본 설정
- `web/src/components/staking/deep-core/*` — 게임 컴포넌트 구현
