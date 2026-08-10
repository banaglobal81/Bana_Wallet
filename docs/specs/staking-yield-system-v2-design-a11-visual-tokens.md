# A-11 — V2-CORE 화면의 시각 설계 · 디자인 토큰

> 작성: `ui-ux-designer` · 2026-08-10
> 연계 문서: `staking-yield-system-v2-design-a7-screen-flow-frd.md` (A-7)
> 기초 토큰: `staking-v2-design-tokens.md`
>
> **이 문서는 A-7(FRD)의 설계 원칙과 화면 요구를 TailwindCSS v4 토큰과 타이포그래피로
> 운용화합니다. 구현 대상인 화면들(로컬 잔고, 클레임 상태칩, 관리자 큐, PoR-1' 상태)의
> 색상/spacing/타이포 규칙입니다.**
>
> **스코프 경계:**
> - 클레임 버튼·밴드 UI 기능 구현 아직 미착수 (이 문서는 향후 구현을 위한 토큰만 준비)
> - 코드·CSS 추가 없음 (문서만)

---

## 0. 기초 팔레트 (기존 유지)

### 기본 색상
| 용도 | 다크 모드 | 라이트 모드 | 토큰명 |
|------|---------|-----------|--------|
| 배경 | `#06132a` | `#eef2f8` | `bg-base` |
| 카드/패널 | `#112643` | `#ffffff` | `bg-card` |
| 보더 | `#1E3559` | `#d3ddec` | `border-default` |
| 액센트 (주로 버튼) | `#2E7DFF` | `#2E7DFF` | `bg-accent` / `text-accent` |
| 보조 텍스트 | `#8c90a0` | `#5b6576` | `text-secondary` |
| 성공 (신규 - A-11) | `#10b981` | `#059669` | `status-success` |
| 경고 (신규 - A-11) | `#f59e0b` | `#d97706` | `status-warning` |
| 실패 (신규 - A-11) | `#ef4444` | `#dc2626` | `status-error` |
| 중립/미확정 (신규 - A-11) | `#8c90a0` | `#5b6576` | `status-neutral` |

---

## 1. 로컬 잔고 블록 — 4수치 2그룹 레이아웃 (LB)

> A-7 §3 요구사항 (LA-1: 합계 없음, LB-1~LB-10)를 운용화합니다.

### 1.1 컨테이너 구조

```
┌─ 잔고 카드 (공통 스타일) ────────────────────────────┐
│                                                      │
│ 【그룹 1】 입출금 계정                                  │
│ (기존 HUB 자산 표시 그대로)                            │
│ USDT, BTC, ...                                      │
│                                                      │
│ ──────────────────── (시각적 분리선) ────────────────│
│                                                      │
│ 【그룹 2】 플랫폼 발행 자산                            │
│ BANA:  잔고 | 사용 가능 | 스테이킹 잠금 | 출금 신청 보류 │
│       (ⓐ)    (ⓑ)      (ⓒ)         (ⓓ)             │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 1.2 그룹 2 (BANA 로컬 잔고) 내부 구조

#### 1.2.1 컨테이너
```tailwind
div.
  w-full bg-[#112643]/70 border border-[#1E3559]
  rounded-lg p-4 sm:p-6
  space-y-4
```

**라이트 모드 오버라이드**: 배경/보더는 `globals.css` `.light` 클래스에서 자동

#### 1.2.2 그룹 헤더 (BANA · 그룹명)
```tailwind
div.flex items-center gap-2
  /* BANA 아이콘 */
  span.h-5 w-5 rounded-full bg-gradient-to-br from-[#fbbf24] to-[#f59e0b]
  
  /* "BANA" 텍스트 — 코인명 표시 */
  span.text-sm font-600 text-white
  
  /* 선택: "플랫폼 발행 자산" 같은 그룹명은 헤더 왼쪽에 아주 작게 */
  /* 또는 제목 수준에서 이미 나왔으면 생략 가능 */
```

#### 1.2.3 4수치 블록 — 모바일/SM/LG 반응형

**모바일 (기본, `base`):**
```tailwind
div.space-y-3  /* 수직 스택 */
  /* 각 수치 행이 순차 배치 */
```

**태블릿/데스크톱 (`sm` 이상):**
```tailwind
div.grid grid-cols-2 gap-4
  /* 2열 배치: (ⓐ,ⓒ) (ⓑ,ⓓ) */
  /* 또는 명시적으로 두 그룹으로 나누기 */
```

#### 1.2.4 각 수치 행 (ⓐ/ⓑ/ⓒ/ⓓ 동일 스타일)

```tailwind
div.space-y-1.5
  /* 라벨 */
  .label: text-xs font-600 text-[#8c90a0] uppercase tracking-wide
  
  /* 수치 — 서버 decimal 문자열, 로케일 포맷팅 금지 */
  .value: text-base sm:text-lg font-mono text-white
  
  /* 도움말 1줄 (선택사항, 특히 ⓓ에는 "신청 보기" 링크가 붙을 수 있음) */
  .help: text-xs text-[#8c90a0]/70 leading-tight
```

**i18n 라벨:**
| 수치 | 키 | 예시 (한국어) |
|------|-----|----------|
| ⓐ | `wallet.balance` | "잔고" |
| ⓑ | `wallet.available` | "사용 가능" |
| ⓒ | `wallet.lockedByStaking` | "스테이킹 잠금" |
| ⓓ | `wallet.lockedByPendingWithdrawal` | "출금 신청 보류" |

#### 1.2.5 ⓓ (출금 신청 보류) 특수 규칙

**ⓐ+ⓑ+ⓒ과 다른 점:**
- ⓓ > 0일 때는 도움말이 "관련 요청 보기" 링크가 됨
- 스타일:
```tailwind
.help a.
  text-xs font-600
  text-[#2E7DFF] hover:text-white underline
  transition-colors duration-200
```

- 라벨 옆에 작은 경고 아이콘 가능 (Info 또는 AlertCircle):
```tailwind
.label .icon-info.h-4 w-4 inline ml-1 text-[#2E7DFF]
```

#### 1.2.6 로딩/실패/영(0) 상태 표시 (LB-7)

**세 상태는 모두 다르게 렌더:**

1. **로딩 중**:
```tailwind
.value: text-[#8c90a0] italic  /* 예: "불러오는 중…" */
  또는 스피너
```

2. **실패 (조회 불가)**:
```tailwind
.value: text-[#ef4444]  /* 빨강 */
.help: text-[#ef4444]/80 text-xs  /* "잔고를 불러올 수 없습니다" */
```

3. **영(0)**:
```tailwind
.value: text-white
.help: text-[#8c90a0]/50 text-xs  /* "0" 그대로 표시, 필요시 "기록이 없습니다" */
```

#### 1.2.7 분리선 (그룹 1과 그룹 2 사이)

```tailwind
hr.
  border-0 border-t border-[#1E3559]/30
  my-4 sm:my-6
```

#### 1.2.8 그룹 2 설명 (1줄, 상시 노출, LA-2/LA-6)

```tailwind
div.text-xs text-[#8c90a0] leading-relaxed mt-3
  /* i18n 키: wallet.localBalanceHelp 또는 유사 */
  /* 예: "BANA는 플랫폼이 발행한 자산입니다. 출금은 신청 후 검토를 거쳐 온체인 전송으로 처리됩니다." */
```

이 설명은:
- 접기/툴팁 **금지** (LA-1 주석 참조, 접힘 시 정보가 사라짐)
- 권위, 원장, ledger 용어 금지 (LA-2)

---

## 2. 클레임 상태 칩 / 버튼 — 3가지 상태 (CLM)

> A-7 §4.2.3, PS-A CL-1 이어서 B2 YIELD PANEL 내 수령 슬롯입니다.
> CLM-1~CLM-10, LA-4, WD-3 요구사항을 운용화합니다.

### 2.1 상태 1: UNAVAILABLE (비버튼 상태칩)

**조건:** `yieldRail = LEDGER_ONLY` (현재 라이브 상태) 또는 점검 중

**시각:**
```tailwind
div.
  inline-flex items-center gap-2 px-3 py-2 rounded-lg
  bg-[#1E3559]/40 border border-[#1E3559]/60
  cursor-not-allowed pointer-events-none
  
  span.text-sm font-500 text-[#8c90a0]
    /* i18n: staking.claim.unavailable 또는 staking.yieldRail.unavailable */
    /* 예: "지원하지 않습니다" / "준비 중" 금지 (LA-5) */
```

**라이트 모드:**
```css
.light div.
  bg-[#f3f4f6]/50 border border-[#e5e7eb]
  span. text-[#6b7280]
```

**의미:** 사용자가 "조건을 충족하면 눌릴 수 있을" 가능성 제시 금지 — 시스템 상태임을 명확히 함

---

### 2.2 상태 2: DISABLED (비활성 버튼)

**조건:** `yieldRail = CLAIM_LIVE` + 클레임 가능액 = 0

**시각:**
```tailwind
button.
  px-3 py-2 rounded-lg
  bg-[#1E3559]/30 border border-[#1E3559]/50
  text-sm font-600 text-[#8c90a0]
  cursor-not-allowed disabled:opacity-50
  
  /* HTML 요소는 button이지만 disabled 상태 */
```

**라이트 모드:**
```css
.light button.
  bg-[#f9fafb]/40 border border-[#e5e7eb]
  text-[#6b7280]
```

**의미:** "조건만 충족되면 누를 수 있음" — 사용자 행동 대기

---

### 2.3 상태 3: ENABLED (활성 버튼)

**조건:** `yieldRail = CLAIM_LIVE` + 클레임 가능액 > 0

**시각:**
```tailwind
button.
  px-3 py-2 rounded-lg
  bg-[#2E7DFF]/90 hover:bg-[#2E7DFF]
  border border-[#2E7DFF]
  text-sm font-600 text-white
  cursor-pointer
  transition-colors duration-200
  
  /* 클릭 시 */
  &:active. bg-[#1a6aff]
```

**라이트 모드:**
```css
.light button.
  bg-[#2E7DFF] hover:bg-[#1a6aff]
  border border-[#2E7DFF]
  text-white
  /* 라이트 모드에서도 액센트 색 유지 */
```

**의미:** "지금 누를 수 있음"

---

### 2.4 상태 아이콘 (선택)

버튼 옆에 작은 아이콘 가능 (`lucide-react`):
- UNAVAILABLE: Info icon
- DISABLED: Clock icon (또는 없음)
- ENABLED: Check icon (또는 없음)

```tailwind
.icon.h-4 w-4 inline mr-1
```

---

### 2.5 in-flight 상태 (CLM-8)

클레임 요청 진행 중:
```tailwind
button.
  /* ENABLED 스타일 + 비활성화 */
  bg-[#2E7DFF]/60 cursor-not-allowed
  
  /* 스피너 추가 (선택) */
  span.spinner.animate-spin.h-4 w-4.inline mr-2
  span. "수령 중…"  /* i18n: staking.claim.inProgress 또는 유사 */
```

**금지:** "다시 시도" 버튼을 만들지 않음 (재탭도 불가)

---

### 2.6 모호한 결과 (CLM-9, CLM-7 분기)

**상황:** 요청 전송 후 응답 유실 / 네트워크 타임아웃

**표시:**
```tailwind
div.bg-[#1E3559]/40 border border-[#1E3559]/60 rounded-lg p-3 space-y-2
  .error-text.text-sm text-[#8c90a0]
    /* i18n: staking.claim.resultUnknownRefresh */
    /* "결과를 확인하지 못했습니다. 상태를 새로 불러오십시오." */
  
  button.text-[#2E7DFF] hover:text-white font-600 text-sm
    /* [상태 새로고침] 버튼 */
    /* i18n: staking.claim.refreshStatus 또는 유사 */
```

**라이트 모드:**
```css
.light div.
  bg-[#f3f4f6]/50 border border-[#e5e7eb]
  .error-text. text-[#6b7280]
```

**중요:** "실패했습니다"라고 쓰지 않음 — 실제로 실패했는지 모름

---

## 3. 클레임 결과 표시 (1줄, 정보 수준)

> LA-8: 게임화 금지, 성공 표시는 정보 수준 1줄

### 3.1 성공

```tailwind
div.text-sm text-white
  span.inline-flex items-center gap-1
    CheckCircle.icon.h-4 w-4.text-[#10b981]
    /* i18n: staking.claim.succeeded */
    /* 예: "{amount} BANA를 수령했습니다." */
```

---

### 3.2 실패 (명시적 오류)

```tailwind
div.text-sm text-[#ef4444]
  span.inline-flex items-center gap-1
    AlertCircle.icon.h-4 w-4
    /* i18n 키 기반 오류 문구 (§9 참조) */
```

---

## 4. `AWAITING_ONCHAIN` 상태 표시 (WD)

> A-7 §5.4, LA-5, WD-9 요구사항. 출금 이력 화면에서 보이는 상태입니다.

### 4.1 상태 칩 / 라벨

**조건:** 출금 요청 상태 = `AWAITING_ONCHAIN` (LOCAL 권위만)

**시각:**
```tailwind
div.inline-flex items-center gap-2 px-3 py-1 rounded-md
  bg-[#f59e0b]/20 border border-[#f59e0b]/50
  
  span.text-xs font-600 text-[#f59e0b]
    /* i18n: withdraw.status.awaitingOnchain */
    /* "승인됨 · 전송 대기" */
```

**라이트 모드:**
```css
.light div.
  bg-[#fef3c7]/60 border border-[#fcd34d]
  span. text-[#d97706]
```

### 4.2 상태 설명 (1줄)

```tailwind
p.text-xs text-[#8c90a0] mt-2
  /* i18n: withdraw.status.awaitingOnchainHelp */
  /* "관리자가 처리 중입니다. 온체인 전송 확인까지 시간이 걸릴 수 있습니다." */
  /* 금지: "보통 N시간", "24시간 이내" (LA-5) */
  /* 금지: "전송 중" (LA-5 — 아직 아무것도 전송되지 않았을 수 있음) */
```

### 4.3 txHash 미노출 (LA-7)

- `onchainVerifiedAt = null` 동안에는 txHash를 사용자에게 보이지 않음
- `onchainVerifiedAt != null`일 때만 아래 렌더:

```tailwind
div.mt-3 space-y-1
  .label. text-xs font-600 text-[#8c90a0] uppercase
    "온체인 해시"
  
  .hash. text-xs font-mono text-white break-all
    a. href="[블록 익스플로러 링크]" target="_blank"
      0x... (확인됨 해시)
      Icon.external-link.h-3 w-3.inline ml-1
  
  .verified-at. text-xs text-[#8c90a0]
    /* i18n: withdraw.status.verifiedAt */
    /* "확인 완료: 2026-08-10 14:30:22 UTC" */
```

---

## 5. 관리자 출금 큐 시각 계층 (ADM)

> A-7 §6 요구사항. 관리자 페이지 `app/[locale]/admin/withdrawals` 화면입니다.

### 5.1 목록 화면 (ADM-1~ADM-6)

#### 5.1.1 컨테이너

```tailwind
div.bg-[#112643]/70 border border-[#1E3559] rounded-lg p-4 sm:p-6
  space-y-4
```

#### 5.1.2 필터 / 정렬 (필수, ADM-1)

```tailwind
div.flex flex-wrap gap-2 items-center
  /* 레일 필터 */
  select. "모든 레일" / "허브 자동" / "수동 온체인"
    /* class: px-3 py-2 bg-[#1E3559]/40 border border-[#1E3559] text-white text-sm rounded */
  
  /* 상태 필터 */
  select. "모든 상태" / "검토 대기" / "승인됨·전송대기" / "완료" / "거절" / ...
  
  /* 기본 필터: 【내 조치가 필요한 것】 */
  button.
    bg-[#2E7DFF]/20 border border-[#2E7DFF]/50 text-[#2E7DFF]
    text-sm font-600 px-3 py-2 rounded
    /* "내 조치 필요" (PENDING + AWAITING_ONCHAIN) */
```

#### 5.1.3 목록 상태 (6개 상태, LB-7 원칙)

**1) 로딩:**
```tailwind
div.text-center py-8 text-[#8c90a0]
  "불러오는 중…" (스피너 포함)
```

**2) 실패 (조회 불가):**
```tailwind
div.bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-lg p-4
  .text-sm.text-[#ef4444]
    span.icon.AlertCircle.h-4 w-4.inline mr-2
    "목록을 불러올 수 없습니다. 잠시 후 다시 시도하세요."
```

**3) 빈 목록 (처리할 것 없음):**
```tailwind
div.text-center py-8 text-[#8c90a0]
  "처리 대기 중인 출금이 없습니다."
```

**4) 있음 (아래 표 구조)**

#### 5.1.4 목록 표 (각 행)

```tailwind
table.w-full text-sm
  thead.
    th. "요청 ID" / "사용자" / "코인" / "금액" / "수수료" / "차감" / "레일" / "상태" / "체류" / "홀드" / "최근 검증"
    /* 배경: #1E3559/40, 폰트: font-600 text-xs text-[#8c90a0] uppercase */
  
  tbody.
    tr.border-b border-[#1E3559]/30.
      hover:bg-[#1E3559]/20 transition-colors
      
      /* 컬럼별 */
      td. /* 요청 ID */ text-white font-mono text-xs
      td. /* 사용자 */ text-white
      td. /* 코인 */ text-white
      td. /* 보내는 금액 */ text-white font-mono
      td. /* 수수료 */ text-white font-mono text-xs
      td. /* 차감 총액 */ text-white font-mono font-bold
      td. /* 레일 */ text-[#2E7DFF] font-600 text-xs  /* 시각적 강조 (1급 필드) */
      td. /* 상태 */ [상태 칩 — 5.2 참조]
      td. /* 체류 시간 */ text-[#8c90a0] text-xs  /* 임계 초과 시 주황색 */
      td. /* 홀드 상태 */ text-xs  /* ACTIVE: 초록, RELEASED: 회색, 불변식 위반: 빨강 */
      td. /* 최근 검증 */ text-xs text-[#8c90a0]
```

**레일 칩 (ADM-1):**
```tailwind
span.inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-600
  /* HUB 자동: bg-blue-500/20 text-blue-400 border border-blue-500/30 */
  /* LOCAL 수동: bg-amber-500/20 text-amber-400 border border-amber-500/30 */
```

#### 5.1.5 체류 시간 표시 (ADM-4, 임계 초과 강조)

```tailwind
span.text-xs
  /* 정상 (< 임계값): */
  .text-[#8c90a0] "3시간 12분 경과"
  
  /* 임계값 초과: */
  .text-[#f59e0b] font-bold
    "6시간 30분 경과 ⚠️"
    /* 배경 또는 보더 미세 강조: bg-[#f59e0b]/10 */
```

#### 5.1.6 홀드 상태 / 불변식 위반 (ADM-5)

```tailwind
span.inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-600
  /* ACTIVE (정상): */
  .bg-[#10b981]/20.border border-[#10b981]/50.text-[#10b981]
    "ACTIVE"
  
  /* RELEASED (이미 해제): */
  .bg-[#8c90a0]/20.border border-[#8c90a0]/50.text-[#8c90a0]
    "RELEASED"
  
  /* EXECUTED (실행 완료): */
  .bg-[#8c90a0]/20.border border-[#8c90a0]/50.text-[#8c90a0]
    "EXECUTED"
  
  /* 불변식 위반 (AWAITING_ONCHAIN인데 홀드 != ACTIVE): */
  .bg-[#ef4444]/20.border border-[#ef4444]/50.text-[#ef4444].animate-pulse
    "⚠️ 불일치"
```

---

### 5.2 상태 칩 (목록 + 상세에 공통)

| 서버 상태 | 칩 색상/배경 | 텍스트 |
|---|---|---|
| `PENDING` | 회색 (`#8c90a0`) | "검토 대기" |
| `PROCESSING` | 회색 (동일) | "검토 대기" |
| `AWAITING_ONCHAIN` | 주황 (`#f59e0b`) | "승인됨·전송대기" |
| `APPROVED` | 초록 (`#10b981`) | "완료" |
| `REJECTED` | 회색 (`#8c90a0`) | "거절됨" |
| `FAILED` | 빨강 (`#ef4444`) | "처리되지 않음" |

**스타일 템플릿:**
```tailwind
span.inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-600
  bg-[색상]/20 border border-[색상]/50 text-[색상]
```

---

### 5.3 상세 화면

#### 5.3.1 요청 기본 정보

```tailwind
div.bg-[#1E3559]/40 border border-[#1E3559]/60 rounded-lg p-4 space-y-3
  .row.flex justify-between
    .label.text-xs font-600 text-[#8c90a0] uppercase
    .value.text-white font-mono
    /* 예: "상태 PENDING" / "레일 수동 온체인" / "사용자 user@example.com" */
```

#### 5.3.2 금액 세 줄 (WD-8과 동일)

```tailwind
div.bg-[#1E3559]/40 border border-[#1E3559]/60 rounded-lg p-4 space-y-2
  .row.flex justify-between
    .left.text-sm text-white
    .right.text-sm font-mono text-white
  
  /* 세 줄 */
  "보내는 금액" + "100.000000000000000000 BANA"
  "수수료" + "2.000000000000000000 BANA"
  "────────────────────"
  "잔고에서 차감" + "102.000000000000000000 BANA" (굵음)
```

#### 5.3.3 수신 주소

```tailwind
div.space-y-1
  .label.text-xs font-600 text-[#8c90a0] uppercase
  .address.text-sm font-mono text-white break-all
    "0xabc…def"
```

#### 5.3.4 승인/거절 버튼 + 경고 문구 (LA-6, ADM-7)

**경고 (필수):**
```tailwind
div.bg-[#f59e0b]/10 border border-[#f59e0b]/30 rounded-lg p-3 space-y-1
  .icon.AlertTriangle.h-4 w-4.inline.text-[#f59e0b].mr-2
  .text.text-sm.text-[#f59e0b]
    /* i18n: admin.withdraw.approvalWarning */
    /* "⚠️ 승인은 자금을 보내지 않습니다. 승인 후 전송은 관리자가 직접 실행합니다." */
```

**버튼 (ADM-8):**
```tailwind
div.flex gap-2
  button.bg-[#2E7DFF] hover:bg-[#1a6aff] text-white px-4 py-2 rounded font-600 text-sm
    /* HUB 레일: "승인 및 전송" */
    /* LOCAL 레일: "승인 (전송 대기로 이동)" */
  
  button.bg-[#ef4444]/20 border border-[#ef4444]/50 text-[#ef4444] px-4 py-2 rounded font-600 text-sm hover:bg-[#ef4444]/30
    "거절"
```

---

### 5.4 전송 정보 블록 (AWAITING_ONCHAIN 진입 후)

> 목적: 관리자가 `AMOUNT_MISMATCH` / `WRONG_CONTRACT` 오류를 만들지 않도록 함

#### 5.4.1 컨테이너

```tailwind
div.bg-[#1E3559]/40 border border-[#1E3559]/60 rounded-lg p-4 space-y-2
  .title.text-sm font-600 text-white
    "전송 정보 (이 값 그대로 전송)"
  
  .warning.text-xs text-[#f59e0b] bg-[#f59e0b]/10 p-2 rounded
    "금액은 정확히 일치해야 합니다. 반올림·부분 전송은 검증 실패입니다."
```

#### 5.4.2 각 정보 행 (복사 버튼 포함)

```tailwind
div.flex items-center justify-between gap-2
  .left
    .label.text-xs font-600 text-[#8c90a0] uppercase
    .value.text-sm font-mono text-white mt-1
      /* 예: "0x154a8Ca…" */
  
  .right
    button.p-2 text-[#2E7DFF] hover:text-white rounded
      ClipboardIcon.h-4 w-4
      /* 클릭 시: "복사됨!" 플래시 피드백 1초 */
```

**행들:**
- 체인 (BSC, chainId 56)
- 토큰 컨트랙트 (0x154a8Ca…)
- 수신 주소 (0xabc…def)
- 전송 금액 (100.000000000000000000, 서버가 준 정확한 값)

---

### 5.5 txHash 제출 / 검증 결과 패널

#### 5.5.1 제출 폼 (상태 = AWAITING_ONCHAIN)

```tailwind
div.space-y-3
  label.text-sm font-600 text-white
    "트랜잭션 해시 (txHash) 입력"
  
  input.w-full px-4 py-3 rounded-lg
    bg-[#020d24] border border-[#1E3559]
    text-white font-mono text-sm
    placeholder-[#8c90a0]/50
    focus:outline-none focus:border-[#2E7DFF]
    transition-colors
  
  button.bg-[#2E7DFF] hover:bg-[#1a6aff] text-white px-4 py-2 rounded font-600 text-sm
    "검증 및 확정"
```

#### 5.5.2 검증 결과 3분류 (W-4, W-5)

**1) 통과 (SETTLED로 확정):**
```tailwind
div.bg-[#10b981]/10 border border-[#10b981]/50 rounded-lg p-4 space-y-2
  .icon-check.h-5 w-5.text-[#10b981].inline.mr-2
  .text-sm.text-[#10b981]
    /* i18n: admin.withdraw.verificationPassed */
    /* "✓ 검증 완료. 자금이 사용자에게 도착했습니다." */
    
  .timestamp.text-xs.text-[#8c90a0].mt-2
    "확인됨: 2026-08-10 14:30:22 UTC"
```

**2) 실패 (여러 원인, W-5 불변식 위반 표시):**
```tailwind
div.bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-lg p-4 space-y-2
  .icon-alert.h-5 w-5.text-[#ef4444].inline.mr-2
  .text-sm.text-[#ef4444]
    /* i18n 키 기반, 구체적 원인 명시 */
    /* 예: "검증 실패: 금액 불일치. 요청 {100}, 트랜잭션 {99}" */
    /* 또는: "검증 실패: 토큰 주소 불일치" */
    /* 또는: "검증 실패: 아직 확정되지 않음 (확정 깊이 미달)" */
```

**3) 불확정 (오류 아님, 상태 유지, ADM-2):**
```tailwind
div.bg-[#1E3559]/40 border border-[#1E3559]/60 rounded-lg p-4 space-y-2
  .icon-help.h-5 w-5.text-[#8c90a0].inline.mr-2
  .text-sm.text-[#8c90a0]
    /* i18n: admin.withdraw.verificationIncomplete */
    /* "검증할 수 없습니다: 트랜잭션 해시가 블록체인에 없거나 해석 중입니다." */
  
  /* 버튼: 상태 유지, 나중에 다시 시도 가능 */
  button.mt-3.text-[#2E7DFF] font-600 text-sm
    "다시 검증"
```

---

## 6. PoR-1' 관련 상태 색상 매핑 (A-8 대시보드)

> A-7의 참조 사항 (A-8은 별도 문서). 8개 상태값의 시각적 표현.
> 특히 `UNCONFIGURED`는 PASS와 시각적으로 구분되어야 함.

### 6.1 상태 맵핑 테이블

| 상태 | 의미 | 색상 | 배경 | 아이콘 |
|------|------|------|------|--------|
| **PASS** | 검증 통과 | 초록 `#10b981` | `#10b981/20` | ✓ Check |
| **FAIL** | 검증 실패 | 빨강 `#ef4444` | `#ef4444/20` | ✗ X |
| **NEVER_RUN** | 한 번도 실행 안 됨 | 회색 `#8c90a0` | `#8c90a0/20` | — Minus |
| **QUERY_FAILED** | 쿼리 불가 (RPC 무응답 등) | 회색 `#8c90a0` | `#8c90a0/20` | ⚠️ AlertCircle |
| **STALE** | 오래됨 (최근 업데이트 미달) | 주황 `#f59e0b` | `#f59e0b/20` | 📅 Clock |
| **INCOMPLETE** | 불완전 (부분 검증) | 주황 `#f59e0b` | `#f59e0b/20` | 🔄 RefreshCw |
| **UNCONFIGURED** | 미설정 (설정 필요) | 보라 `#a78bfa` (신규) | `#a78bfa/20` | ⚙️ Settings |
| **UNAVAILABLE** | 사용 불가 (권한 부족 등) | 회색 `#8c90a0` | `#8c90a0/20` | 🔒 Lock |

### 6.2 중요: UNCONFIGURED ≠ PASS

**문제:** `UNCONFIGURED`를 초록으로 그리면 "설정됨"이라는 거짓 신호를 준다.

**해법:** 독립적인 색상 (보라 또는 노랑) + 명확한 아이콘 + 설명 문구

```tailwind
div.inline-flex items-center gap-2 px-2.5 py-1 rounded-md
  .icon. Settings.h-4 w-4.text-[#a78bfa]
  .text-xs.font-600.text-[#a78bfa]
    "UNCONFIGURED — 설정 필요"
  
  a. href="[설정 페이지]" class="text-[#2E7DFF] hover:underline ml-2"
    "[설정하기]"  /* i18n: common.configure 또는 유사 */
```

### 6.3 다크/라이트 모드 색상 조정

| 상태 | 다크 | 라이트 |
|------|------|--------|
| PASS | `#10b981` (그대로) | `#059669` |
| FAIL | `#ef4444` (그대로) | `#dc2626` |
| NEVER_RUN | `#8c90a0` | `#5b6576` |
| QUERY_FAILED | `#8c90a0` | `#5b6576` |
| STALE | `#f59e0b` | `#d97706` |
| INCOMPLETE | `#f59e0b` | `#d97706` |
| UNCONFIGURED | `#a78bfa` (신규) | `#7c3aed` |
| UNAVAILABLE | `#8c90a0` | `#5b6576` |

```css
/* globals.css에 추가 (필요시) */
.light .status-unconfigured {
  background-color: rgba(147, 51, 234, 0.2);
  border-color: rgba(147, 51, 234, 0.5);
  color: #7c3aed;
}
```

---

## 7. 타이포그래피 규칙 (A-7 승계)

| 용도 | 폰트 | 크기 | 굵기 | 라인높이 | 예시 |
|------|------|------|------|---------|------|
| **그룹 헤더** | IBM Plex Sans | 14px | 600 | normal | "【그룹 2】플랫폼 발행 자산" |
| **수치 라벨** | IBM Plex Sans | 12px | 600 | normal | "잔고", "사용 가능" |
| **수치 값** | IBM Plex Mono | 16px-18px | 400 | normal | "1,234.567890…" (로케일 포맷팅 금지) |
| **도움말 / 보조** | IBM Plex Sans | 11px-12px | 400 | 1.5 | "BANA는 플랫폼이 발행한 자산입니다." |
| **관리자 테이블 헤더** | IBM Plex Sans | 11px | 600 | normal | 위 "요청 ID" 등 |
| **관리자 테이블 셀** | IBM Plex Sans / Mono | 13px-14px | 400-500 | normal | 금액은 Mono, 텍스트는 Sans |
| **상태 칩** | IBM Plex Sans | 12px | 600 | normal | "검토 대기" |
| **버튼** | IBM Plex Sans | 13px-14px | 600 | normal | "[승인]", "[출금]" |

---

## 8. Spacing 규칙 (A-7 승계)

| 컨텍스트 | 간격 | 사용처 |
|----------|------|--------|
| 블록 간 (B1 ↔ B2) | `gap-4` (16px) | 페이지 주요 섹션 |
| 블록 간 (B2 ↔ B3) | `gap-3` (12px) | 섹션 연접 |
| 블록 간 (B3 ↔ B4) | `gap-2` (8px) | 같은 형태, 긴밀 |
| 로컬 잔고 그룹 내 | `space-y-3` (12px) / `space-y-4` (16px) | 모바일 / SM+ |
| 로컬 잔고 그룹 2 내부 | `gap-4` (16px, 수치 사이) | 2열 그리드 |
| 테이블 행 간 | `border-b border-[#1E3559]/30` + `py-3` (12px) | 행 구분 |
| 카드 내부 패딩 | `p-4` (16px) / `p-6` (24px) | 모바일 / SM+ |

---

## 9. i18n 키 매핑 (참고용)

> 이 문서의 모든 사용자 대면 문구는 i18n 키를 통해 `web/messages/*.json`에서 관리됩니다.

| 기능 | 권고 키 패턴 | 예시 (한국어) |
|------|------------|----------|
| 로컬 잔고 - 라벨 | `wallet.balance`, `wallet.available` 등 | "잔고", "사용 가능", "스테이킹 잠금", "출금 신청 보류" |
| 로컬 잔고 - 설명 | `wallet.localBalanceHelp` | "BANA는 플랫폼이 발행한 자산입니다. 출금은 신청 후 검토를 거쳐 온체인 전송으로 처리됩니다." |
| 클레임 - 상태 | `staking.claim.unavailable` 등 | "지원하지 않습니다", "준비 중"(금지) |
| 클레임 - 결과 불명 | `staking.claim.resultUnknownRefresh` | "결과를 확인하지 못했습니다. 상태를 새로 불러오십시오." |
| 클레임 - [버튼] | `staking.claim.refreshStatus` | "[상태 새로고침]" |
| 출금 - AWAITING_ONCHAIN | `withdraw.status.awaitingOnchain` | "승인됨 · 전송 대기" |
| 출금 - 설명 | `withdraw.status.awaitingOnchainHelp` | "관리자가 처리 중입니다." |
| 관리자 - 승인 경고 | `admin.withdraw.approvalWarning` | "⚠️ 승인은 자금을 보내지 않습니다." |
| 관리자 - 검증 통과 | `admin.withdraw.verificationPassed` | "✓ 검증 완료." |
| 관리자 - 검증 실패 | `admin.withdraw.verificationFailed` | "검증 실패: [구체적 원인]" |
| 관리자 - 검증 불명 | `admin.withdraw.verificationIncomplete` | "검증할 수 없습니다: [원인]" |

---

## 10. 라이트 모드 오버라이드 패턴

`globals.css` `.light` 클래스 내에서 다음 패턴을 따릅니다:

```css
/* 예: 로컬 잔고 그룹 2 */
.light .local-balance-group {
  @apply bg-white border-[#d3ddec];
}

.light .local-balance-group .label {
  @apply text-[#6b7280];
}

.light .local-balance-group .value {
  @apply text-gray-900;
}

/* 예: 상태 칩 */
.light .status-chip-unavailable {
  @apply bg-[#f3f4f6]/50 border-[#e5e7eb];
}

.light .status-chip-unavailable span {
  @apply text-[#6b7280];
}
```

---

## 11. 구현 체크리스트

> 문서 작성이므로 실제 구현 전 검토 사항입니다. `web-wallet-expert` / `web-admin-expert` 참조.

- [ ] **로컬 잔고 표시 (LB)**
  - [ ] 그룹 2 (BANA) 블록 생성
  - [ ] 4수치 반응형 레이아웃 (모바일: 세로, SM+: 2열)
  - [ ] 로딩/실패/영(0) 상태 구분 표시
  - [ ] ⓓ (출금 신청 보류) > 0일 때 링크 렌더

- [ ] **클레임 상태칩/버튼 (CLM)**
  - [ ] 3가지 상태 (UNAVAILABLE/DISABLED/ENABLED) 시각 차이 명확
  - [ ] in-flight 스피너 + 재탭 차단
  - [ ] 모호한 결과 시 [상태 새로고침] 버튼 (재시도 버튼 아님)

- [ ] **AWAITING_ONCHAIN 표시 (WD)**
  - [ ] 상태 칩 (주황색, "승인됨·전송대기")
  - [ ] 설명 1줄 (ETA 암시 금지)
  - [ ] txHash는 `onchainVerifiedAt != null`일 때만 노출

- [ ] **관리자 큐 (ADM)**
  - [ ] 목록 필터 (레일/상태)
  - [ ] 기본 필터: "내 조치 필요" (PENDING + AWAITING_ONCHAIN)
  - [ ] 각 행: 체류 시간, 홀드 상태, 불변식 위반 표시
  - [ ] 상세: 승인 경고 문구 (필수)
  - [ ] 전송 정보 블록 (복사 버튼)
  - [ ] txHash 검증 결과 3분류 (통과/실패/불명)

- [ ] **PoR-1' 상태 (A-8)**
  - [ ] 8개 상태 색상 매핑
  - [ ] UNCONFIGURED ≠ PASS 시각적 구분
  - [ ] 라이트 모드 색상 조정

---

## 12. 참고 자료

- `staking-yield-system-v2-design-a7-screen-flow-frd.md` — 화면 요구사항
- `staking-v2-design-tokens.md` — 기초 팔레트 및 기존 토큰
- `web/src/app/globals.css` — TailwindCSS v4 설정 + 다크/라이트 오버라이드
- `docs/patterns/ui-ux-designer.md` — 디자인 패턴 라이브러리
