# FRD — 관리자 스테이킹 부채 가시화 (Admin Staking Debt Visibility)

> 작성: `product-planner` · 2026-08-10
> 근거: `docs/specs/staking-payout-rail-prd.md` §6 **Track 1 R-3 / R-4 / R-5**,
> `docs/specs/staking-yield-system-v2-prd.md` §10(고지 원칙) · §11.6 **R-U23 / R-U25 / R-U26**
> 구현: `web-admin-expert` (일부 P2 항목만 `web-shared-expert`). QA: `qa-lead`. 번역: `ui-ux-designer`.
>
> **범위: 관리자 화면 전용.** 사용자용 `/staking` 전면 재설계(`Staking.tsx`,
> `web/src/components/staking/deep-core/**`, `stakingRenew.ts`, `/api/staking/*`)는 다른
> 에이전트가 동시 작업 중이며 **이 문서는 그 파일들의 변경을 지시하지 않는다.**
>
> **비목표: 정산 로직·이자 계산·스키마 변경 없음.** Track 1은 표시와 가시성만 바꾼다
> (PRD §6 "Track 1 비목표"). 이 문서에는 마이그레이션이 하나도 없다.

---

## 1. Goal

관리자가 **"플랫폼이 사용자에게 실제로 얼마를 빚지고 있는가"** 를 한 화면에서 정확히 읽을 수
있게 한다.

현재 `GET /api/admin/staking/stats`는 코인별로 `activePrincipal`과 `totalPaid` 두 숫자만
반환하고, 두 관리자 화면이 이를 각각 "Interest paid" / "+{totalPaid} paid"로 렌더한다.
`totalPaid`의 실제 정의는 `SUM(StakePosition.paidInterest)`이며, 이 값은 **원장에만 존재하고
사용자 지갑에 단 1원도 이체된 적이 없는 금액**이다(PRD C1·C2·C4·C6). 즉 관리자 화면은
**부채를 지급 실적으로 표시**하고 있다.

이 FRD가 만드는 상태:

| | 지금 | 이후 |
|---|---|---|
| 활성 원금 | `activePrincipal` (라벨 "Active staked") | 유지 + **"사용자 자금이며 플랫폼 부채가 아니다"** 를 라벨이 말한다 |
| 미지급 이자 | `totalPaid` (라벨 "Interest paid", 초록색 `+`) | **`unpaidInterest`** — 부채 헤드라인. 초록색 금지 |
| 실지급액 | **표시 없음** | **`hubSettled` = 0**, "지급 레일 없음"을 함께 표기 |
| 그랜트 원금 | 활성 원금에 섞여 있음 | **분리 표기** (B-4 미확인 조건부 부채) |
| 증가 속도 | 알 수 없음 | **정산일당 증가액**을 상시 표시 |

---

## 2. 확인된 코드 사실 (2026-08-10, 직접 확인)

이 스펙의 모든 결정은 아래 사실 위에 서 있다. 구현 전 하나라도 달라졌다면 스펙을 먼저 고친다.

| ID | 사실 | 근거 |
|----|------|------|
| **A1** | `stats` 라우트의 `"totalPaid"`는 `SUM("paidInterest"::numeric)` — **상태 필터 없음** | `web/src/app/api/admin/staking/stats/route.ts:24` |
| **A2** | 같은 파일 주석이 이 값을 "interest actually paid to date (the real StakingPayout ledger)"라고 서술 — **사실과 다르다** | 동 파일 8–10행 |
| **A3** | `paidInterest`는 정산 시 `perDay × dueDays`로 **전량 덮어쓰기**된다. 증분이 아니다 | `web/src/lib/stakingSettle.ts:83,131` (PRD F-C) |
| **A4** | `StakePositionStatus.PAID`는 코드 어디에서도 할당되지 않는다 | `schema.prisma:36-40`, 전체 검색 결과 |
| **A5** | 실제 허브 이체 누계를 담는 컬럼은 **존재하지 않는다** | `schema.prisma:254-277` (`settledInterest` 없음) |
| **A6** | `grantedByAdminId`는 포지션에 존재하지만 `serializePosition`이 **의도적으로 직렬화하지 않는다** (사용자에게 관리자 신원 비공개) | `web/src/lib/staking.ts:110`, 주석 107-109행 |
| **A7** | 소비처는 **두 곳**: `admin/staking/page.tsx:246-266`, `admin/dashboard/page.tsx:89-108` |
| **A8** | 두 화면 모두 `getStakingStats().catch(() => [])` — **실패가 빈 배열이 되어 "부채 0"으로 렌더된다** | `admin/staking/page.tsx:69`, `admin/dashboard/page.tsx:32` |
| **A9** | 스테이킹 가능 자산은 BANA 하나뿐 | `admin/staking/products/route.ts:73` (PRD F-A / v2 N-6) |
| **A10** | 자동 갱신된 선행 포지션은 MATURED로 남고 `paidInterest`를 그대로 보유한다 | `schema.prisma:279-294`, `stakingRenew.ts` |
| **A11** | `worker/`는 `totalPaid` 필드를 읽지 않는다 (`grep totalPaid worker/` → 0건) | §9 P2 항목의 안전성 근거 |

> **A8이 이 작업에서 가장 위험한 기존 결함이다.** 부채 대시보드에서 "조회 실패"와 "부채 0"이
> 같은 화면으로 렌더되면, 대시보드가 없는 것보다 나쁘다. §5.4에서 별도 요구사항으로 다룬다.

---

## 3. 데이터 계약 — `GET /api/admin/staking/stats`

### 3.1 응답 스키마 (코인별 1행)

```ts
export interface AdminStakingStat {
  coin: string;

  // ① 사용자 자금. 플랫폼 부채가 아니다(그랜트분 제외).
  activePrincipal: string;          // SUM(principal) WHERE status='ACTIVE'
  grantedActivePrincipal: string;   // 위의 부분집합. WHERE grantedByAdminId IS NOT NULL

  // ② 부채. 원장에만 존재하는 이자.
  ledgeredInterest: string;         // SUM(paidInterest) — 전 상태
  hubSettled: string;               // 실제 허브 이체 완료 누계
  unpaidInterest: string;           // ledgeredInterest − hubSettled
  hubSettledStatus: 'NO_RAIL';      // 판별자. §3.3

  // ③ 증가 속도. 정산 1일당 계약상 발생액.
  dailyAccrualRate: string;         // SUM(principal × dailyRatePct / 100) WHERE status='ACTIVE'

  activeCount: number;
  maturedCount: number;
  totalCount: number;

  // 불변식 감시용. §3.4
  settledStatusCount: number;       // COUNT WHERE status='PAID' — 기대값 0
}
```

**`totalPaid` 필드는 응답에서 완전히 제거한다.** 하위호환 별칭으로 남기지 않는다 — 소비처가
정확히 두 곳(A7)이고 같은 변경에서 함께 고치므로 별칭을 남길 이유가 없으며, 남기면 다음
사람이 그것을 쓴다. `web/src/utils/adminApi.ts:234-240`의 인터페이스도 같이 교체한다.

### 3.2 각 값의 정의와 금지사항

| 필드 | 정의 | 금지 |
|------|------|------|
| `activePrincipal` | `status='ACTIVE'` 원금 합. **MATURED 원금은 포함하지 않는다**(만기 시 락이 풀리므로) | 그랜트분을 빼고 계산하지 말 것 — 별도 필드로 보여주고 총합은 유지 |
| `grantedActivePrincipal` | `activePrincipal`의 **부분집합** | 이것을 `activePrincipal`과 더하지 말 것(이중 계산) |
| `ledgeredInterest` | `SUM(paidInterest)` **전 상태**. MATURED·갱신된 선행 포지션 포함 | **A10 주의 — 갱신되어 MATURED가 된 선행 포지션을 제외하지 말 것.** 이자는 지급된 적이 없으므로 부채는 그대로 남아 있다. "정리"의 형태로 부채를 지우는 변경은 금지 |
| `hubSettled` | 실제 허브 이체 완료 누계 | §3.3 |
| `unpaidInterest` | `ledgeredInterest − hubSettled`. **SQL에서 계산한다** | 클라이언트에서 두 문자열을 빼지 말 것(CLAUDE.md 규칙 2 — 클라이언트 금액 연산 자체를 만들지 않는다) |
| `dailyAccrualRate` | `SUM(principal::numeric × "dailyRatePct"::numeric / 100)` WHERE `status='ACTIVE'` | §5.3 참조 — 실적 7일 평균으로 대체하지 말 것 |
| `settledStatusCount` | `COUNT(*) FILTER (WHERE status='PAID')` | §3.4 |

### 3.3 `hubSettled` — 0을 "검증 가능한 0"으로 만든다

실제 이체 누계를 담는 컬럼이 없다(A5). Track 1은 스키마를 바꾸지 않는다. 따라서 이 값은
**상수 `"0"`** 일 수밖에 없다. 그러나 상수 0을 컴포넌트에 하드코딩하는 것은 금지한다.

> **요구 DS-1.** `hubSettled`는 **라우트에서** 상수로 산출하고, 그 옆에 판별자
> `hubSettledStatus: 'NO_RAIL'`을 함께 반환한다. 상수 선언 지점에 다음 취지의 주석을 단다:
> *"실제 허브 이체 경로가 존재하지 않으므로 구조적으로 0이다. `StakePositionStatus.PAID`도
> 어디에서도 할당되지 않는다(schema.prisma:36-40). 지급 레일(staking-yield-system-v2-prd
> §4)이 가동되면 이 상수를 실제 컬럼 집계로 교체한다."*
>
> **요구 DS-2.** UI는 `hubSettled` 값이 아니라 `hubSettledStatus`로 문구를 고른다. 즉
> 화면은 "0"을 렌더하는 것이 아니라 **"지급 레일 없음 · 0"** 이라는 상태를 렌더한다.
> 맨숫자 0은 "아직 아무도 안 받아갔다"로도, "로딩 실패"로도 읽히므로 단독 렌더를 금지한다.

이렇게 두는 이유: 나중에 레일이 생겼을 때 **라우트 한 곳만** 고치면 되고, 판별자가
`'NO_RAIL'`로 남아 있는 한 UI가 자동으로 "레일 없음"을 계속 말한다. 컴포넌트에 0을 박으면
레일이 생겨도 화면은 계속 0을 말한다.

### 3.4 불변식과 그 위반 신호

| ID | 불변식 | 위반 시 |
|----|--------|---------|
| **INV-1** | `settledStatusCount == 0` (A4: `PAID`는 할당되지 않는다) | §5.5 인시던트 배너. `hubSettled = 0`이라는 주장의 근거가 무너졌다는 뜻이다 |
| **INV-2** | `unpaidInterest ≥ 0` | 음수는 데이터 손상. 인시던트 배너 |
| **INV-3** | `grantedActivePrincipal ≤ activePrincipal` | 위반 시 인시던트 배너 |

INV-1이 핵심이다. "실지급 0"은 지금은 참이지만 **코드가 보증하는 사실이 아니라 관찰된
사실**이다. 관찰이 깨지는 순간 화면이 조용히 거짓말하게 되므로, 관찰을 쿼리로 붙들어 둔다.

### 3.5 라우트 주석 정정 (Track 1 R-5)

`stats/route.ts:8-10`의 주석 "interest actually paid to date (the real StakingPayout ledger)"를
삭제하고 다음 취지로 교체한다:

```
// GET /api/admin/staking/stats — per-coin staking liability overview.
//
// `unpaidInterest` is the platform's REAL unfunded liability: interest that
// exists only in this Postgres ledger and has never been credited to any user's
// Nia-Hub balance. No payout rail exists (staking-payout-rail-prd.md §1);
// `hubSettled` is therefore a structural constant 0 — see DS-1.
// Do NOT reintroduce a field named "totalPaid": nothing here has been paid.
```

마지막 문장은 장식이 아니라 **재발 방지 장치**다. 같은 이름이 다시 생기는 것이 이 결함의
발생 경로였다.

---

## 4. Screen — 관리자 스테이킹 페이지 `/admin/staking`

### 4.1 배치

현재 `stats.length > 0` 조건으로 렌더되는 카드 그리드(`page.tsx:246-266`)를 **부채 섹션**으로
교체한다. 페이지 내 순서는 다음과 같이 바꾼다 — 부채가 상품·포지션보다 위다.

```
헤더
[에러 배너]                       ← 기존
【0】 인시던트 배너 (조건부)        ← 신규. §5.5. INV 위반 시에만
【1】 부채 섹션                    ← 신규(기존 카드 그리드 교체). §4.2
【2】 일일 정산 스트립              ← 기존 위치에서 이동 + 카피 정정. §4.5
【3】 상품 생성 폼 / 상품 목록      ← 변경 없음
【4】 레퍼럴 커미션                 ← 변경 없음
【5】 그랜트 폼                     ← 변경 없음
【6】 전체 포지션 표                ← 컬럼 카피/색 정정. §4.4
```

정산 스트립(【2】)을 부채 섹션 바로 아래로 옮기는 이유: "지금 얼마를 빚졌는가"와 "그것이 방금
얼마나 늘었는가"는 같이 읽혀야 하는 한 쌍이다.

### 4.2 부채 섹션 — 코인별 카드

코인 1개당 카드 1개. **코인 간 합계 행을 만들지 않는다** — 서로 다른 자산의 수량을 더하는 것은
의미가 없다(A9로 실제로는 항상 BANA 1장이지만, 총합 행이 있으면 코인이 늘어나는 순간 틀린
숫자가 된다).

카드 내부 (세로 스택, 3개 블록 + 푸터):

```
┌─ BANA ──────────────────────────────── [배지: 지급 레일 없음] ─┐
│                                                                 │
│  미지급 이자 (장부에만 존재)                          ← 헤드라인 │
│  1,234.5678 BANA                                      (앰버/로즈)│
│  실제 사용자 지갑에 반영되지 않은 금액입니다.                    │
│  정산일 1일당 +12.3456 BANA 증가 중                              │
│  ────────────────────────────────────────────────────────────   │
│  실제 지갑 지급 완료          잠긴 원금 (활성)                   │
│  0 BANA                       50,000 BANA                        │
│  지급 레일 없음               사용자 자금 · 플랫폼 부채 아님      │
│  ────────────────────────────────────────────────────────────   │
│  그중 플랫폼 그랜트 원금: 3,000 BANA   ← B-4 미확인 조건부 부채   │
│  활성 12 · 만기 4 · 전체 16 포지션                               │
└─────────────────────────────────────────────────────────────────┘
```

시각 위계 요구:

| ID | 요구 |
|----|------|
| **S-1** | **미지급 이자가 카드의 헤드라인이다.** 세 숫자 중 가장 큰 타이포. 나머지 둘은 동일한 하위 크기 |
| **S-2** | **세 숫자를 어떤 조합으로도 합산 표시하지 않는다** (v2 R-U1의 관리자판) |
| **S-3** | **미지급 이자에 초록색(emerald)과 `+` 접두를 쓰지 않는다.** 현재 `text-emerald-400`과 `+{s.totalPaid}`가 "입금됨"의 시각 기호로 작동하고 있다. 색은 앰버 계열(경고이되 인시던트는 아님). 정확한 토큰은 `ui-ux-designer` |
| **S-4** | 잠긴 원금은 중립색(흰색/`#d8e2ff`). 부채와 같은 색을 쓰지 않는다 |
| **S-5** | 실지급 0은 **숨기지 않는다.** 0이라는 사실 자체가 이 화면의 핵심 정보다 |
| **S-6** | 그랜트 원금 줄은 `grantedActivePrincipal > 0`일 때만 렌더한다. 0이면 줄 자체를 숨긴다(빈 정보 억제) |
| **S-7** | 카드 우상단 배지는 `hubSettledStatus`로 결정한다. `'NO_RAIL'` → "지급 레일 없음" |

### 4.3 숫자 표기 규칙 (전 카드 공통)

| ID | 요구 |
|----|------|
| **N-1** | 서버가 준 decimal 문자열을 **`Number()`/`parseFloat()`/`+str`/`toLocaleString()`로 통과시키지 않는다** (CLAUDE.md 규칙 2). 정밀도 손실은 부채 수치에서 곧바로 오표시가 된다 |
| **N-2** | 표기는 **문자열 조작만으로** 한다: 소수점으로 split → 정수부에 3자리마다 `,` 삽입 → 소수부는 최대 8자리까지 **버림(truncate)** 후 재결합. 로케일별 구분자 전환 없음(운영자용 모노스페이스 표기, 전 로케일 `,`/`.` 고정) |
| **N-3** | 소수부가 8자리에서 잘렸으면 말줄임 표시 `…`를 붙이고, `title` 속성에 **원본 문자열 전체**를 넣는다 |
| **N-4** | 값이 정확히 `"0"`이면 `0`으로 표기한다. `0.00000000` 금지 |
| **N-5** | 코인 심볼은 숫자와 같은 줄에 항상 붙인다. 단위 없는 숫자를 렌더하지 않는다 |

N-2의 버림 방향에 대해: 버림은 부채를 최대 1e-8만큼 **과소** 표기하지만 `…`로 명시되고
`title`에 원본이 있으므로 오독 가능성이 없다. 반올림은 자릿수에 따라 과대/과소가 섞이므로
채택하지 않는다.

### 4.4 전체 포지션 표 (Track 1 R-4)

현재 헤더는 `{t('accrued')}`("Earned"/"획득")와 하드코딩된 `Paid`이고, `paidInterest` 셀은
`text-emerald-400 font-bold`로 `+{p.paidInterest}`를 렌더한다(`page.tsx:486-487`).

| ID | 요구 |
|----|------|
| **P-1** | `Paid` 컬럼 헤더 → **"미지급 이자(장부)"**. 하드코딩 제거, `t()` 키로 이동 |
| **P-2** | 해당 셀에서 emerald와 `+` 접두 제거(S-3과 동일 근거). 앰버 계열 |
| **P-3** | `accrued`("Earned") 컬럼 헤더 → **"발생 이자(실시간 계산)"**. 이 값은 `accruedInterest()`로 읽기 시점에 재계산되는 추정치이고 `paidInterest`와 다른 물건이라는 점이 헤더에서 구분되어야 한다 |
| **P-4** | 두 컬럼 위에 그룹 캡션 또는 헤더 툴팁으로 다음 취지 1문장: *"두 값 모두 BANA 원장 기록이며, 사용자 지갑 잔고가 아닙니다."* |
| **P-5** | **그랜트 포지션 표식.** `GET /api/admin/staking/positions`의 응답 매핑(`positions/route.ts:29-33`)에 `isGrant: p.grantedByAdminId != null`을 추가하고, 사용자 셀 옆에 작은 배지 "그랜트"를 렌더한다. **`serializePosition`은 건드리지 않는다**(A6 — 사용자 API 표면에 관리자 신원 관련 필드를 늘리지 않기 위한 의도적 설계). 관리자 라우트에서만 파생시킨다 |
| **P-6** | `PAID` 상태 배지 스타일(`POS_STYLE.PAID`)은 남겨두되, 그 상태의 행이 실제로 나타나면 §5.5 인시던트 배너가 함께 뜬다(INV-1) |

### 4.5 일일 정산 스트립 카피 정정

`page.tsx:199-219`의 하드코딩 영어 문자열 3개가 "paid"라고 말하고 있다. 같은 페이지에서
부채를 "미지급"이라 부르면서 그 아래에서 "Paid today"라고 쓰면 정정 자체가 무력화된다.

| 현재 | 이후 (EN 소스) | 비고 |
|------|----------------|------|
| `Last interest paid:` | `Last accrual:` | `t()` 키로 이동 |
| `Paid today:` | `Accrued today:` | `t()` 키로 이동 |
| `Run settlement now` (버튼) | `Run accrual now` | `t()` 키로 이동 |
| `title="Run the daily interest payout now (idempotent)"` | `title="Record today's interest on the ledger (idempotent). This does not send anything to user wallets."` | 오해 방지 문장이 요점 |
| `Paid ${r.totalPaid} across ${r.daysCredited} day(s); ${r.matured} matured.` | `Recorded {amount} {coin} across {days} day(s) on the ledger; {matured} matured. Nothing was sent to user wallets.` | `t()` + 토큰 |
| `Up to date — nothing new to pay (${r.processed} active).` | `Up to date — nothing new to record ({n} active).` | `t()` + 토큰 |
| `Paid today` 값의 `text-emerald-400` | 중립색 | S-3과 동일 근거 |

> `StakingRunResult.totalPaid` / `StakingRunStatus.totalPaidToday` **필드명 자체**는 이 작업에서
> 바꾸지 않는다 — §9 P2 참조.

---

## 5. 대시보드 요소 판정 (요청 2번에 대한 답)

"경고 배지·추이가 필요한가"에 대한 판정. **채택 4 / 기각 3.** 기각 항목도 근거를 남긴다.

### 5.1 채택 — 정산일당 증가 속도 (`dailyAccrualRate`) · **P1**

부채 총액만으로는 "지금 조치하지 않으면 어떻게 되는가"를 알 수 없다. PRD §2.1은 이 문제의
성질을 "방치할수록 커지는 종류"로 규정했고, 그 성질을 화면에 나타내는 최소 단위가 증가
속도다. 미지급 이자 카드 안에 한 줄로 붙인다: **"정산일 1일당 +X BANA 증가 중"**.

### 5.2 채택 — 상시 상태 배지 "지급 레일 없음" · **P1**

숫자 자체는 "왜 0인가"를 말하지 않는다. §3.3 DS-2의 판별자로 렌더한다. **경보(alarm)가 아니라
상태 표기**다 — 색은 앰버, 아이콘은 경고 삼각형이 아닌 중립 아이콘, **닫기 버튼 없음**.

### 5.3 채택 — 그랜트 원금 분리 표기 · **P1**

PRD B-5의 부채 산식은 두 갈래다: `SUM(paidInterest)` **+ (B-4가 "입금 안 됨"이면)**
`SUM(principal) WHERE grantedByAdminId IS NOT NULL`. 즉 **부채 총액은 오늘 하나의 숫자로
확정될 수 없다.** 화면은 이 불확정성을 숨기지 말고 그대로 보여야 한다:

- 확정 부채 = `unpaidInterest` (헤드라인)
- 조건부 부채 = `grantedActivePrincipal` (푸터, 캡션에 *"운영 확인(B-4) 전까지 부채 여부 미정"*)

**두 값을 더한 숫자를 만들지 않는다.** 더하는 순간 미확인 가정을 확정 사실로 표시하게 된다.

### 5.4 채택 — 조회 실패 상태의 명시 (A8 수정) · **P1, 이 문서에서 가장 중요한 안전 요구**

`getStakingStats().catch(() => [])`는 실패를 빈 배열로 바꾸고, 두 화면 모두 빈 배열에서 섹션
자체를 렌더하지 않는다. 결과: **허브/DB 장애 시 관리자는 "부채 섹션이 없는 화면"을 보고
"부채 없음"으로 읽는다.**

| ID | 요구 |
|----|------|
| **E-1** | 조회 실패 시 `catch(() => [])`를 쓰지 않는다. 실패 상태를 분리 보관한다(`stats: AdminStakingStat[] \| null` + `statsError: string \| null` 형태 등, 구조는 구현 재량) |
| **E-2** | 실패 시 부채 섹션 자리에 **에러 카드**를 렌더한다. 문구: *"부채 수치를 불러오지 못했습니다. 이 화면의 공백을 '부채 0'으로 해석하지 마십시오."* + 다시 시도 버튼 |
| **E-3** | 로딩 중에는 **0을 렌더하지 않는다.** 스켈레톤 또는 `—`. 잠깐이라도 0이 보이면 그 0이 스크린샷으로 남는다 |
| **E-4** | 성공했는데 행이 0개(포지션이 하나도 없음)인 경우: 섹션을 **숨기지 않고** 빈 상태를 렌더한다. *"스테이킹 포지션이 없습니다 — 현재 부채 0."* 이것이 E-2와 구분되어야 한다 |
| **E-5** | E-1~E-4는 `/admin/dashboard`에도 동일 적용(§6) |

E-4와 E-2의 구분이 요점이다. **"데이터가 없다"와 "데이터를 못 읽었다"는 정반대의 운영 판단을
낳는다.** 지금은 두 경우가 픽셀 단위로 동일하다.

### 5.5 채택 — 인시던트 배너 (불변식 위반 시에만) · **P1**

§3.4의 INV-1/2/3 중 하나라도 깨지면 페이지 최상단(에러 배너보다 위)에 **로즈 계열 배너**를
띄운다. 문구 취지:

> *"데이터 정합성 경고 — `PAID` 상태 포지션 {n}건이 감지되었습니다. 이 상태는 현재 코드에서
> 할당되지 않아야 하며(schema.prisma), 따라서 '실지급 0'이라는 표시를 더 이상 신뢰할 수
> 없습니다. 지급 레일 구축 전까지 원인을 규명하십시오."*

이 배너는 **닫을 수 없다.** 이것이 이 화면에서 유일한 진짜 경보다.

### 5.6 기각 — 임계값 경고 배지 ("부채 > X면 빨강")

**v1 비채택.** X를 정할 수 있는 사람이 아직 없다. 의미 있는 임계값은 "미지급 부채 > 트레저리
충당 가능액"인데 그 우변은 PRD B-5/B-6이 미해결이다. 근거 없는 임계값은 (i) 항상 켜져 있어
벽지가 되거나 (ii) 절대 안 켜져서 없는 것과 같다.

> **향후 활성화 조건:** B-6(재무 충당 능력) 회신 후, `PlatformSetting`에 충당액을 넣고
> `unpaidInterest > 충당액`을 트리거로 삼는다. **그때 이 배지는 P0가 된다.** 지금 만들지 않는
> 이유는 필요 없어서가 아니라 **비교 대상이 없어서**다.

### 5.7 기각 — 추이 차트 / 스파크라인

**v1 비채택(P3).** §5.1의 증가 속도가 같은 판단 정보를 상수 시간에 제공한다. 추가로, 시계열을
`StakingPayout.paidAt`으로 그리면 **정산 "일"이 달력 일과 다를 수 있다는 함정**이 있다
(정산 주기는 설정 가능 — `docs/architecture/worker.md`). 달력 축에 정산일 데이터를 그리면
가속 모드/재실행 구간에서 그래프가 거짓말을 한다. 차트를 도입한다면 **정산일 인덱스 축**으로
설계해야 하며, 그것은 이 FRD의 범위를 넘는다.

### 5.8 기각 — "N일 후 예상 부채" 외삽

**v1 비채택.** `dailyAccrualRate × N`은 만기 도래와 신규 체결을 무시하므로 체계적으로
과대 추정된다. 오차 방향은 알지만 크기를 아무도 모르는 숫자는 재무 판단에 쓸 수 없다.
(v2 PRD R-U7의 "미확정 수익 추정 금지"는 사용자 화면 규칙이지만, 그 정신은 여기에도 적용된다.)
정말 필요해지면 **"30일 내 만기 도래 활성 원금"** 같은 확정 사실로 대체한다.

---

## 6. Screen — 관리자 대시보드 `/admin/dashboard`

`dashboard/page.tsx:89-108`의 "Staking liability" 스트립은 코인별로
`{activePrincipal}` + `+{totalPaid} paid · {activeCount} active`를 렌더한다. **"paid"라는 단어와
초록색이 여기에도 있다.** 스테이킹 페이지만 고치면 거짓 표시가 한 페이지 옆으로 이동할 뿐이다.

| ID | 요구 |
|----|------|
| **D-1** | 코인별 블록을 **2줄 구조**로 교체: (1행) **미지급 이자** — 앰버, 이 스트립의 주 숫자. (2행) 잠긴 원금 · 활성 n건 — 중립색 |
| **D-2** | "paid"라는 단어를 이 페이지에서 제거한다. 초록색 제거 |
| **D-3** | 섹션 제목 "Staking liability" → **"스테이킹 부채 (미지급)"**. 하드코딩 제거, `t()` 키로 이동 |
| **D-4** | 실지급 0과 그랜트 원금은 **여기 넣지 않는다.** 대시보드는 요약이며, 링크 클릭 한 번이면 전체가 보인다. 요약에서 세 숫자를 다 보여주려다 다시 뭉개지는 것이 원래 실패 경로였다 — 대신 **가장 중요한 하나(미지급 이자)만** 크게 보여주고 나머지는 `/admin/staking`으로 위임한다 |
| **D-5** | §5.4 E-1~E-4를 동일 적용. 특히 `getStakingStats().catch(() => [])`(`:32`) 제거 |
| **D-6** | §5.5 인시던트 조건(INV-1)이 참이면 대시보드에도 동일 배너를 띄운다. 대시보드가 관리자의 첫 화면이다 |

---

## 7. Copy — 정확한 문구 (EN 소스 / KO 정본)

전부 `adminStaking.liability.*` 네임스페이스로 신설한다. 대시보드 전용 키는
`adminDashboard.stakingLiability.*`.

### 7.1 부채 섹션 (`adminStaking.liability.*`)

| 키 | EN (source) | KO |
|----|-------------|-----|
| `sectionTitle` | Staking liability | 스테이킹 부채 |
| `sectionNote` | These are ledger figures. Interest recorded here has never been credited to a user's wallet. | 아래는 장부 수치입니다. 여기에 기록된 이자는 사용자 지갑에 반영된 적이 없습니다. |
| `unpaid.label` | Unpaid interest — ledger only | 미지급 이자 — 장부에만 존재 |
| `unpaid.note` | Not reflected in any user's wallet balance. | 사용자 지갑 잔고에 반영되지 않은 금액입니다. |
| `unpaid.rate` | +{amount} {coin} per settlement day | 정산일 1일당 +{amount} {coin} 증가 중 |
| `settled.label` | Actually sent to wallets | 실제 지갑 지급 완료 |
| `settled.noRail` | No payout rail exists yet | 지급 레일 없음 |
| `settled.noRailTooltip` | There is no code path that credits staking interest to a Nia-Hub balance. This figure is a structural zero, not a measurement. | 스테이킹 이자를 Nia-Hub 잔고로 입금하는 코드 경로가 존재하지 않습니다. 이 값은 측정치가 아니라 구조적으로 0입니다. |
| `principal.label` | Locked principal (active) | 잠긴 원금 (활성) |
| `principal.note` | User funds. Locked, not owed. | 사용자 자금입니다. 잠겨 있을 뿐 플랫폼 부채가 아닙니다. |
| `grant.label` | Of which platform grants | 그중 플랫폼 그랜트 원금 |
| `grant.note` | Whether this is a platform liability depends on an unanswered operational question (B-4): is granted principal actually deposited to the user's hub wallet? | 이 금액이 플랫폼 부채인지는 미확인 운영 질문(B-4)에 달려 있습니다: 그랜트 원금이 사용자 허브 지갑에 실제로 입금됩니까? |
| `counts` | {active} active · {matured} matured · {total} total | 활성 {active} · 만기 {matured} · 전체 {total} |
| `badge.noRail` | No payout rail | 지급 레일 없음 |

### 7.2 상태 (`adminStaking.liability.state.*`)

| 키 | EN | KO |
|----|----|----|
| `loading` | Loading liability figures… | 부채 수치를 불러오는 중… |
| `error.title` | Could not load liability figures | 부채 수치를 불러오지 못했습니다 |
| `error.body` | Do not read this blank as "zero liability". Retry, and if it keeps failing, treat the figures as unknown. | 이 공백을 "부채 0"으로 해석하지 마십시오. 다시 시도하고, 계속 실패하면 수치를 미상으로 취급하십시오. |
| `error.retry` | Retry | 다시 시도 |
| `empty` | No staking positions — liability is 0. | 스테이킹 포지션이 없습니다 — 현재 부채 0. |

### 7.3 인시던트 배너 (`adminStaking.liability.incident.*`)

| 키 | EN | KO |
|----|----|----|
| `paidStatus` | Data integrity warning — {n} position(s) are in PAID status. Nothing in this codebase assigns that status, so "Actually sent to wallets = 0" can no longer be trusted. Investigate before any payout work. | 데이터 정합성 경고 — `PAID` 상태 포지션 {n}건이 감지되었습니다. 현재 코드는 이 상태를 할당하지 않으므로 "실제 지갑 지급 완료 = 0" 표시를 더 이상 신뢰할 수 없습니다. 지급 관련 작업 전에 원인을 규명하십시오. |
| `negative` | Data integrity warning — unpaid interest computed as a negative value. The ledger is inconsistent. | 데이터 정합성 경고 — 미지급 이자가 음수로 계산되었습니다. 원장이 정합하지 않습니다. |
| `grantExceeds` | Data integrity warning — granted principal exceeds total active principal. | 데이터 정합성 경고 — 그랜트 원금이 전체 활성 원금을 초과합니다. |

### 7.4 포지션 표 (`adminStaking.*`, 기존 네임스페이스에 추가)

| 키 | EN | KO |
|----|----|----|
| `unpaidCol` | Unpaid (ledger) | 미지급 이자(장부) |
| `accrued`(기존 값 교체) | Accruing (live) | 발생 이자(실시간 계산) |
| `ledgerColsNote` | Both columns are ledger records, not wallet balances. | 두 컬럼 모두 원장 기록이며 지갑 잔고가 아닙니다. |
| `grantBadge` | Grant | 그랜트 |

### 7.5 정산 스트립 (`adminStaking.settlement.*`)

| 키 | EN | KO |
|----|----|----|
| `title` | Daily accrual | 일일 이자 적립 |
| `lastAccrual` | Last accrual: {when} | 마지막 적립: {when} |
| `never` | never | 없음 |
| `accruedToday` | Accrued today: {amount} ({count}) | 오늘 적립: {amount} ({count}) |
| `activeN` | {n} active | 활성 {n} |
| `runNow` | Run accrual now | 지금 적립 실행 |
| `runNowTitle` | Record today's interest on the ledger (idempotent). This does not send anything to user wallets. | 오늘 이자를 장부에 기록합니다(멱등). 사용자 지갑으로는 아무것도 전송되지 않습니다. |
| `runResult` | Recorded {amount} {coin} across {days} day(s) on the ledger; {matured} matured. Nothing was sent to user wallets. | 장부에 {days}일치 {amount} {coin}을(를) 기록했습니다. {matured}건 만기. 사용자 지갑으로는 아무것도 전송되지 않았습니다. |
| `runResultNoop` | Up to date — nothing new to record ({n} active). | 최신 상태입니다 — 새로 기록할 항목 없음 (활성 {n}). |

### 7.6 대시보드 (`adminDashboard.stakingLiability.*`)

| 키 | EN | KO |
|----|----|----|
| `title` | Staking liability (unpaid) | 스테이킹 부채 (미지급) |
| `unpaid` | {coin} unpaid interest | {coin} 미지급 이자 |
| `principalSub` | {amount} locked · {n} active | 잠긴 원금 {amount} · 활성 {n} |
| `error` | Liability figures unavailable — do not read as zero. | 부채 수치를 불러오지 못했습니다 — 0으로 해석하지 마십시오. |

### 7.7 금지어 목록 (전 로케일 구속)

아래 의미의 표현을 **미지급 이자·발생 이자·적립 실행 어디에도** 쓰지 않는다.

`paid` / `payout` / `sent` / `credited` / `received` / `earned (완료형)` /
`지급됨` / `지급 완료` / `받음` / `수령` / `입금` / `정산 완료`

예외는 단 하나: `settled.label`("실제 지갑 지급 완료" / "Actually sent to wallets") — **실제로
이체된 금액을 가리키는 유일한 자리**이며, 그래서 그 값이 0이라는 사실이 의미를 갖는다.
이 예외를 다른 필드로 복사하는 순간 정정 전체가 무효가 된다.

---

## 8. 번역 브리프 (`ui-ux-designer` · 6개 로케일)

로케일: en / ko / ja / zh / vi / th. **§7의 EN이 소스, KO가 정본**(운영자 다수가 한국어).
ja / zh / vi / th는 `ui-ux-designer`가 작성한다.

### 8.1 구속 규칙

1. **§7.7 금지어 목록은 단어가 아니라 *개념* 단위로 구속된다.** 영어 금지어가 없어도 그 로케일에서
   "이미 받았다"로 읽히면 위반이다. 예: ja「お支払い済み」, zh「已发放」, vi「đã trả」,
   th「จ่ายแล้ว」를 `unpaid.*` 계열에 쓰면 위반.
2. **부정 표현을 완곡화하지 않는다.** ja/ko의 경어 레지스터가 "지급되지 않았습니다"를
   "아직 반영이 어렵습니다"류로 부드럽게 만드는 것을 금지한다. 이것은 사실 진술이지 사과가 아니다.
3. **`settled.label`은 "실제로 사용자 지갑에 도착한 금액"이라는 뜻이 정확히 살아야 한다.**
   이 문자열만이 §7.7의 예외이며, 여기서 의미가 흐려지면 0의 의미도 사라진다.
   각 로케일에서 "장부상"이 아니라 "실물 이체"임이 드러나는 어휘를 고를 것.
4. **`principal.note`("사용자 자금입니다. 잠겨 있을 뿐 플랫폼 부채가 아닙니다")의 두 절을
   합치지 않는다.** "사용자 자금"과 "부채 아님"은 별개의 주장이고 둘 다 필요하다.
5. **금융 어휘는 기존 `adminStaking.*` / `staking.*` 문자열과 동일한 단어를 쓴다.**
   원금·이자·기간·만기에 두 번째 단어를 도입하지 않는다.
6. **토큰(`{amount}` `{coin}` `{n}` `{active}` `{matured}` `{total}` `{when}` `{days}`)은
   리터럴로 치환하지 않는다.** 특히 `{coin}`에 "BANA"를 박지 않는다.
7. **인시던트 문구(§7.3)의 `PAID`와 `schema.prisma` 같은 식별자는 번역하지 않는다.**
   운영자가 코드에서 찾아야 하는 문자열이다.
8. **숫자 표기는 번역 대상이 아니다.** §4.3 N-2에 따라 전 로케일 `,`/`.` 고정. 로케일 파일에
   구분자 관련 문자열을 만들지 않는다.
9. **관리자용 문자열도 톤 규칙의 예외가 아니다.** 대상이 운영자라는 이유로 축약형·은어
   ("미수금", "떼인 돈" 등)를 쓰지 않는다.

### 8.2 로케일별 용어 앵커 (초안 — `ui-ux-designer` 확정 필요)

각 로케일에서 반드시 구분되어야 하는 **세 쌍**의 어휘. 아래는 검토 출발점이며 그대로 채택할
의무는 없다. 세 항목이 서로 다른 단어로 구분되기만 하면 된다.

| 개념 | ja | zh | vi | th |
|------|----|----|----|-----|
| 미지급 이자(장부) | 未払い利息（帳簿上のみ） | 未支付利息（仅账面） | Lãi chưa chi trả (chỉ trên sổ sách) | ดอกเบี้ยค้างจ่าย (บันทึกบัญชีเท่านั้น) |
| 실제 지갑 지급 완료 | ウォレットへの実送金額 | 实际发放至钱包 | Đã chuyển vào ví thực tế | โอนเข้ากระเป๋าจริงแล้ว |
| 잠긴 원금(사용자 자금) | ロック中の元本（利用者資金） | 锁定本金（用户资金） | Vốn gốc đang khóa (tiền của người dùng) | เงินต้นที่ถูกล็อก (เงินของผู้ใช้) |

> 세 열이 한 로케일 안에서 **서로 혼동되지 않는 별개 표현**인지가 유일한 합격 기준이다.
> 특히 1열과 2열이 같은 동사에서 파생되면(예: "지급"의 부정형 vs 긍정형만 다른 경우) 스캔하듯
> 읽는 운영자에게 구분되지 않는다 — 어간을 달리할 것.

### 8.3 검수 방법

`qa-lead`가 6개 파일 전부에 대해 §7.7 금지어를 스캔한다(AC-11). 번역자가 아니라 **테스트가**
이 규칙을 지킨다.

---

## 9. 구현 범위와 담당

| # | 항목 | 파일 | 담당 | 우선도 |
|---|------|------|------|--------|
| 1 | 응답 스키마 교체 + SQL + 주석 정정 (§3) | `web/src/app/api/admin/staking/stats/route.ts` | `web-admin-expert` | **P1** |
| 2 | `AdminStakingStat` 타입 교체 (§3.1) | `web/src/utils/adminApi.ts:234-240` | `web-admin-expert` | **P1** |
| 3 | 부채 섹션 UI (§4.1–4.3, §5.1–5.3, §5.5) | `web/src/app/[locale]/admin/staking/page.tsx` | `web-admin-expert` | **P1** |
| 4 | 실패/로딩/빈 상태 (§5.4) | 위 + `admin/dashboard/page.tsx` | `web-admin-expert` | **P1** |
| 5 | 포지션 표 카피·색·`isGrant` (§4.4) | 위 + `api/admin/staking/positions/route.ts` | `web-admin-expert` | **P1** |
| 6 | 정산 스트립 카피 (§4.5) | `admin/staking/page.tsx` | `web-admin-expert` | **P1** |
| 7 | 대시보드 스트립 (§6) | `admin/dashboard/page.tsx` | `web-admin-expert` | **P1** |
| 8 | 6개 로케일 문자열 (§7, §8) | `web/messages/{en,ko,ja,zh,vi,th}.json` | `ui-ux-designer` (ja/zh/vi/th), `web-admin-expert` (en/ko 배선) | **P1** |
| 9 | 색·타이포 토큰 확정 (S-1~S-4) | 동 컴포넌트 | `ui-ux-designer` | **P1** |
| 10 | `SettleResult.totalPaid` / `StakingRunStatus.totalPaidToday` **필드명** 정정 | `web/src/lib/stakingSettle.ts`, `api/admin/staking/run/route.ts`, `adminApi.ts` | `web-shared-expert` | **P2** |
| 11 | 임계값 경고 배지 (§5.6) | — | 미착수 | **B-6 회신 후 P0** |
| 12 | 추이 차트 (§5.7) | — | 미착수 | **P3** |

> **10번을 P2로 두는 이유:** `stakingSettle.ts`는 공유 레이어이고 `worker/`도 이 함수를
> 호출한다. `grep totalPaid worker/`는 0건이므로(A11) 리네임 자체는 안전하지만, 이 FRD의
> 관리자 화면 변경과 **같은 커밋에 묶을 이유가 없다.** 표시 카피(§4.5)는 P1으로 이미
> 정정되므로 운영자가 보는 거짓말은 P1에서 전부 사라진다. 남는 것은 내부 필드명이며,
> 그것은 `web-shared-expert`의 별건이다.

---

## 10. Acceptance Criteria (`qa-lead`)

| AC | 내용 |
|----|------|
| **AC-1** | `GET /api/admin/staking/stats` 응답의 **어떤 키도 `totalPaid`가 아니다.** 응답 JSON 전체에 `totalPaid` 문자열이 존재하지 않는다 |
| **AC-2** | 응답에 `activePrincipal` / `grantedActivePrincipal` / `ledgeredInterest` / `hubSettled` / `unpaidInterest` / `hubSettledStatus` / `dailyAccrualRate` / `activeCount` / `maturedCount` / `totalCount` / `settledStatusCount`가 모두 존재한다 |
| **AC-3** | 픽스처: ACTIVE 2건(원금 100·200, 각 `paidInterest` 5·7) + MATURED 1건(원금 50, `paidInterest` 3) → `activePrincipal="300"`, `ledgeredInterest="15"`, `unpaidInterest="15"`, `hubSettled="0"`, `activeCount=2`, `maturedCount=1`, `totalCount=3` |
| **AC-4** | **갱신되어 MATURED가 된 선행 포지션의 `paidInterest`가 `ledgeredInterest`에 포함된다.** 갱신 시나리오 픽스처로 검증(§3.2 A10) |
| **AC-5** | 그랜트 픽스처: `grantedByAdminId != null`인 ACTIVE 포지션의 원금이 `grantedActivePrincipal`에 포함되고 **동시에** `activePrincipal`에도 포함된다(부분집합) |
| **AC-6** | `dailyAccrualRate` = `SUM(principal × dailyRatePct/100)` over ACTIVE. 픽스처 원금 1000·일이율 0.05 단건 → `"0.5"` |
| **AC-7** | 포지션 0건일 때 라우트가 200 + 빈 배열을 반환하고, **UI는 §7.2 `empty` 문구를 렌더한다**(섹션 미렌더 아님) |
| **AC-8** | 라우트가 실패(500/네트워크)하면 UI가 §7.2 `error.*` 카드를 렌더하고 **숫자를 하나도 렌더하지 않는다.** 특히 "0"이 화면에 나타나지 않는다 |
| **AC-9** | 로딩 중 화면에 `0`이 렌더되지 않는다(스켈레톤 또는 `—`) |
| **AC-10** | AC-7 / AC-8 / AC-9가 `/admin/dashboard`에서도 동일하게 성립한다 |
| **AC-11** | `web/messages/*.json` **6개 파일 전부**에 대해 §7.7 금지어 스캔이 통과한다. 스캔 범위: `adminStaking.liability.*`, `adminStaking.settlement.*`, `adminStaking.unpaidCol`, `adminStaking.accrued`, `adminDashboard.stakingLiability.*`. `settled.label` / `settled.*`는 명시적 예외 |
| **AC-12** | 6개 로케일 파일에 §7의 모든 키가 존재한다(누락 키 0). 어떤 로케일도 영어 폴백으로 렌더되지 않는다 |
| **AC-13** | `/admin/staking`과 `/admin/dashboard` 렌더 DOM에 "paid"(대소문자 무관) 문자열이 **부채·이자 문맥에서** 존재하지 않는다 |
| **AC-14** | 미지급 이자 값에 `text-emerald-*` 클래스와 `+` 접두가 붙지 않는다(§4.3 S-3, P-2). 카드·표·정산 스트립 3곳 전부 |
| **AC-15** | `settledStatusCount > 0`인 픽스처에서 §7.3 `paidStatus` 배너가 렌더되고, **닫기 버튼이 없다** |
| **AC-16** | `settledStatusCount == 0`인 정상 픽스처에서 인시던트 배너가 렌더되지 않는다 |
| **AC-17** | `grantedActivePrincipal == "0"`이면 그랜트 줄이 렌더되지 않는다(S-6) |
| **AC-18** | 컴포넌트 코드에 `Number(`/`parseFloat(`/`toLocaleString(`가 금액 문자열에 적용된 곳이 없다(§4.3 N-1). `code-compliance-checker`와 중복되지만 이 화면에서는 직접 확인한다 |
| **AC-19** | 소수 9자리 이상인 값이 8자리 + `…`로 표기되고 `title` 속성에 원본 문자열 전체가 들어 있다(N-3) |
| **AC-20** | 값이 `"0"`이면 `0`으로 렌더된다(`0.00000000` 아님, N-4) |
| **AC-21** | 관리자 포지션 목록 응답에 `isGrant`가 존재하고, **사용자용 `/api/staking/positions` 응답에는 존재하지 않는다**(A6 경계 유지) |
| **AC-22** | 코인이 2개 이상인 픽스처에서 **코인 간 합계 행/카드가 렌더되지 않는다**(§4.2) |
| **AC-23** | 이 변경 전후로 `StakePosition` / `StakingPayout` 레코드가 하나도 변경되지 않는다. 마이그레이션 파일이 추가되지 않는다(Track 1 비목표) |

`data-testid` 제안(구현자 재량이나 QA가 의존): `liability-section`, `liability-card-{coin}`,
`liability-unpaid`, `liability-settled`, `liability-principal`, `liability-grant`,
`liability-rate`, `liability-error`, `liability-empty`, `liability-incident`.

---

## 11. 이 문서가 결정하지 않는 것

- **부채를 어떻게 갚을 것인가.** 지급 레일은 `staking-yield-system-v2-prd.md` §4이며
  B-1/B-2(파트너사 회신) 없이는 설계가 확정되지 않는다. 이 화면은 **금액을 보이게 할 뿐**이다.
- **그랜트 원금이 부채인가.** B-4(운영 확인) 소관. 화면은 미확정 상태를 미확정으로 표시한다(§5.3).
- **임계값.** B-6(재무) 회신 후 §5.6이 활성화된다.
- **사용자 화면 문구(Track 1 R-1/R-2).** 사용자용 `/staking` 재설계를 담당하는 에이전트의
  스코프다. 다만 §7.7의 금지어 원칙은 그쪽에도 동일하게 적용되어야 하며, 두 화면이 서로 다른
  단어로 같은 사실을 말하지 않도록 **어휘 정렬은 `pm`이 최종 확인**할 것을 권고한다.

## 12. 이 문서에서 발견했으나 여기서 고치지 않는 것

- **F-1. `getStakingStats().catch(() => [])` 패턴이 다른 관리자 조회에도 있는지 미확인.**
  이 FRD는 스테이킹 통계 2개 호출만 고친다. 같은 패턴이 다른 부채/자금 수치에 쓰이고 있다면
  같은 종류의 오독을 낳는다 — `code-compliance-checker`에 전수 조사를 요청할 것을 권고한다.
- **F-2. `/api/staking/rewards`(사용자용)가 `paidInterest`를 코인별로 합산해 반환한다**
  (`rewards/route.ts:78-82`). 사용자 화면 스코프이므로 건드리지 않았으나, **관리자 화면이
  "미지급"이라 부르는 그 값을 사용자 API가 "rewards"라는 이름으로 내보내고 있다.** Track 1
  R-1 담당자에게 전달 필요.
- **F-3. `POS_STYLE.PAID`가 UI에 존재한다**(`page.tsx:179`). 도달 불가능한 상태의 스타일이
  준비되어 있다는 사실 자체가 "언젠가 지급된다"는 인상을 코드에 남긴다. INV-1 배너와 함께
  두면 무해하므로 제거하지 않았으나, 지급 레일이 끝내 다른 형태가 되면 정리 대상이다.
