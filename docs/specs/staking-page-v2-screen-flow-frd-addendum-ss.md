# 부칙 SS — 스테이킹 금액을 표시하는 **모든** 표면 (Addendum SS)

> 작성: `product-planner` · 2026-08-11
> 상위: `docs/specs/staking-page-v2-screen-flow-frd.md` (이하 **기본 FRD**) — 이 문서는 기본 FRD의
> **§2.5**로 삽입될 부칙이며, 기본 FRD의 L-4 / §2.4 / §10을 **확장**한다. 새 원칙을 만들지 않는다.
> 판정: `pm` (2026-08-11) — 판정 기록 `temp/20260811-staked-summary-card-ruling/changes.md`·`status.md`
> 관련: `docs/specs/staking-yield-system-v2-design-t8-stake-flow-frd.md` DC-8 (§0-D 교차참조)
>
> **대상 컴포넌트:** `web/src/components/staking/StakedSummaryCard.tsx`
> **렌더 위치:** `web/src/components/Wallet.tsx:257`, `web/src/components/Dashboard.tsx:654`
> — 제품 최다 트래픽 2개 화면.
>
> 코드는 이 문서가 작성하지 않는다. 구현은 `web-wallet-expert`, 검증은 `qa-lead`.
> **착수에는 사용자의 별도 go-ahead가 필요하다(SS-6).**

---

## 0. 기본 FRD·T-8 FRD에 삽입할 포인터 (doc-keeper 인계)

> 이 부칙의 본문은 §1 이하다. 아래 4건은 **기존 문서에 삽입되어야 하는 한 줄짜리 포인터**이며,
> 본 문서를 쓴 시점의 도구 제약(전체 파일 재작성 없이 부분 삽입 불가) 때문에 여기에 분리해
> 적어 둔다. 삽입 위치는 앵커 문장으로 지정했으므로 기계적으로 적용 가능하다.

### 0-A. 기본 FRD `§1 L-4` — 앵커: `그 사이 값을 보간해 하나의 숫자로 제시하는 순간 예측이 된다.` **바로 아래**

```markdown
> **L-4의 적용 범위는 `/staking` 페이지가 아니다(부칙 SS-1, 2026-08-11).** L-4는 **스테이킹
> 금액을 표시하는 모든 표면**(지갑 홈·대시보드·요약 카드·위젯·게임 HUD)을 구속한다. 서버가
> 응답에서 제거한 필드를 **서버가 여전히 내려주는 다른 필드로 클라이언트에서 재구성**하는 것도
> 동일한 위반이다(DC-8 우회 금지). 상세·인벤토리·AC는 §2.5(부칙 SS).
```

### 0-B. 기본 FRD `§2.4` 말미 — 앵커: `| \`staking.autoRenew.*\` 카피 전체 | 변경 없음 |` 표 **바로 아래**

```markdown
> **이 인벤토리는 `Staking.tsx` 한 파일만 열거했고, 그것이 누락의 원인이었다(부칙 SS-1).**
> 같은 원칙(L-4/R-U7)의 구속을 받는 `StakedSummaryCard.tsx`가 이 표에 없었기 때문에 지갑
> 홈·대시보드에는 초당 증가 카운터가 그대로 남았다. §2.5(부칙 SS)를 함께 읽는다.
```

### 0-C. 기본 FRD `§10` AC 표 — `AC-V24` 행 **바로 아래**

```markdown
| **AC-V5′ / AC-SS-1 ~ AC-SS-4** | 요약 카드·위젯 등 `/staking` 밖의 금액 표시 표면에 대한 수용 기준. 전문은 §2.5(부칙 SS-3) |
```

### 0-D. `staking-yield-system-v2-design-t8-stake-flow-frd.md` §8 `DC-8` 셀 말미에 추가

```markdown
**DC-8은 표시 결과가 아니라 수치의 출처를 구속한다** — 제거한 필드를 **서버가 여전히 내려주는 다른 필드로 클라이언트가 재구성하는 것**(`principal`+`baseDailyRatePct`+`startAt`+`termDays` → `accruedInterest`)도 DC-8 위반이다(PS-A FRD §2.5 부칙 SS-1b).
```

---

## 1. 왜 이 컴포넌트가 §2.4에서 누락됐는가 (근본 원인 — SS-1이 존재하는 이유)

기본 FRD §2.4의 삭제 인벤토리는 **`web/src/components/Staking.tsx`의 라인 번호만 열거**했다.
즉 인벤토리의 단위가 **원칙**("L-4를 위반하는 표시")이 아니라 **파일**("=`/staking` 페이지")
이었다. rev05 §5.2 표도 이 컴포넌트에 대해서는 "타입·필드 추종"만 지시했을 뿐 **산술 감사
지시가 없었다**(`staking-yield-system-v2-prd-rev05-creation-path-cutover.md:730`).

결과적으로 `/staking` 페이지에서 제거한 바로 그 초당 증가 카운터가, **같은 원칙의 구속을 받는**
지갑 홈·대시보드에는 그대로 남았다. 그리고 그것은 V2 컷오버 이후 제품에 남은 **마지막
클라이언트 측 `accruedInterest()` 재계산 표면**이다(클라이언트 import 1건, 나머지는 v1
`stakingSettle.ts`·테스트·문서).

> **교훈(SS-1c로 규범화):** 금액 표시의 인벤토리를 **파일 단위로 작성하면 같은 누락이
> 반복된다.** 인벤토리의 단위는 원칙이어야 한다.

시급성이 바뀐 사유: 2026-08-11 프로덕션에서 V2 정산 워커를 켰다. 그 전까지 "Earning now"와
"Credited"의 괴리는 이론적이었으나, 이제 실제 사용자 화면에서 발생 가능하다.

---

## 2. SS-1 — 적용 범위의 명문화

| # | 규칙 |
|---|------|
| **SS-1a** | **L-4 / v2 R-U7 / AC-V5는 `/staking` 페이지의 규칙이 아니다.** 스테이킹 금액(원금·수익)을 표시하는 **모든 표면**을 구속한다: `/staking` 페이지, 지갑 홈(`Wallet.tsx`), 대시보드(`Dashboard.tsx`), 요약 카드·위젯, 게임 HUD, **그리고 앞으로 신설되는 어떤 표면도**. 표면이 어디에 있든 §10 AC 전부가 그대로 적용된다 |
| **SS-1b** | **DC-8 우회 금지.** 서버가 응답에서 제거한 필드(`accruedInterest`)를, 서버가 **여전히 내려주는 다른 필드**(`principal` + `baseDailyRatePct` + `startAt` + `termDays`)로 클라이언트에서 재구성하는 것은 **그 필드를 그대로 내려주는 것과 동일한 위반**이다. T-8 FRD DC-8의 "응답에 존재하지 않아야 한다"는 문언은 **표시 결과가 아니라 수치의 출처**를 구속한다 |
| **SS-1c** | 금액 표시 인벤토리는 **파일 단위가 아니라 원칙 단위**로 작성한다. 신규·변경 컴포넌트가 스테이킹 금액을 렌더하면, 그 컴포넌트가 `/staking` 밖에 있어도 L-4·§10 AC의 대상이다 |

### 2.1 확인된 위반 (전부 소스 대조 완료 — `pm` 검증)

| # | 사실 | 근거 | 위반 조항 |
|---|------|------|-----------|
| 1 | 클라이언트에서 `accruedInterest`를 재계산한다 | `StakedSummaryCard.tsx:8`, `:57-65` | **AC-V5**("호출 0건")의 문언적 위반 |
| 2 | 1초 `setInterval`이 금액 state를 구동한다 | `:23-24`, `:52-55` | **L-4 / R-U7** "초 단위로 증가하는 카운터" 직격 |
| 3 | **워커 정지 시에도 수치가 계속 오른다** | 순수 클라이언트 타이머 연산이라 `PlatformSetting.stakingWorkerEnabled` 상태와 **무관하게** 상승한다 | **AC-V20** — 계산값이 실제 정산을 조용히 대체한다 |
| 4 | 서버가 삭제한 필드를 클라이언트가 재구성한다 | 응답에 `accruedInterest`는 없으나(`utils/stakingApi.ts:64`) 다른 필드로 되살린다 | **DC-8 우회**(SS-1b) |
| 5 | 밴드 모델에서 구조적으로 값이 틀리다 | `lib/stakingMath.ts:39-48`은 `baseDailyRatePct`만 사용 — 가산분을 알 수 없다 | R-U7 (라벨을 바꿔도 수치가 틀림) |
| 6 | 원금을 클라이언트에서 순회 합산한다 | `:39` `act.reduce(...)` | **AC-V6** — 서버가 이미 코인별 `lockedPrincipal`을 준다 |
| 7 | 다중 코인 합산 + 단일 심볼 라벨 | `:39-40` 원금 전 코인 합산 + `positions[0].coin` 라벨, **`:41-43` `totalByCoin`을 전 코인 합산** | **AC-V2** |
| 8 | "Live" 배지가 이중으로 오도한다 | `daysElapsed` 정수 절삭 → 실제로는 하루 단위 계단함수인데, 초당 리렌더로 같은 값을 86,400회 다시 그린다 | R-U7 / T-7 취지 |

> **가장 결정적인 것은 #3(AC-V20)이다.** 원래 발의는 #2(초당 증가 카운터)와 "언젠가 원장과
> 어긋난다"는 **확률적** 논거에 기대고 있었다 — 그 괴리는 워커가 돌기 시작하고 정산 결과가
> 클라이언트 추정과 어긋나는 순간에만 드러난다. 반면 #3은 **결정론적**이다. 워커를 끄면
> **매번, 예외 없이** 화면의 수치가 계속 오른다. AC-V20이 요구하는 것은 "워커를 멈췄을 때
> 계산값이 실제 정산을 조용히 대체하지 않는 것"인데, 이 카드는 워커 상태를 **읽지조차 않는다**.
> EG-6("계산값으로 대체 금지")·`notice.workerPaused`가 `/staking`에서 하는 일을, 이 카드는
> 정면으로 무효화한다.

---

## 3. SS-2 — `StakedSummaryCard` 재설계 (M-1·M-2 반영)

**이 카드가 표시하는 수치는 두 종류뿐이며, 둘 다 서버가 코인별로 내려준 값을 그대로 쓴다.**

| 슬롯 | 값 | 출처(그대로 표시, 유도 금지) | 라벨 키 |
|------|----|------------------------------|---------|
| **A** 잠긴 원금 | 코인별 소프트 락 원금 | `getStakePositionsAndGame().lockedPrincipal[coin]` (기본 FRD §4.2.2 ③ / R-D2) | `stakedSummary.staked` (변경 없음) |
| **B** 기록된 수익 | 코인별 원장 기록 누계 | `getStakingRewards().totalByCoin[coin]` | `stakedSummary.recordedLabel` (신규 — SS-5) |

### 3.1 제거 대상

| 대상 | 현재 위치 | 사유 |
|------|-----------|------|
| `accruedInterest` import + 재계산 effect | `:8`, `:57-65` | AC-V5(호출 0건) |
| 1초 `setInterval` + `now` / `live` state | `:23-24`, `:52-55` | L-4 / R-U7 / **AC-V20** |
| `active` state(원 포지션 보관) | `:27-30`, `:38` | 재계산 입력이 사라지면 보관 이유도 사라진다 |
| 클라이언트 원금 합산 `act.reduce(...)` | `:39` | **AC-V6** — 서버 `lockedPrincipal` 사용 |
| 단일 심볼 라벨 `positions[0].coin` | `:40` | **AC-V2** — 코인 맵 순회로 대체 |
| **전 코인 `totalByCoin` 합산** | `:41-43` | **AC-V2 (M-2)** — 원금 쪽에서 지적한 것과 **동일한 버그가 수익 쪽에도 있다** |
| "Live" 배지(`animate-ping` 포함) | `:81-83` | 초당 갱신되는 수치가 사라지면 이 배지는 거짓이 된다 |
| `TrendingUp` 아이콘 + `+` 접두 | `:96-98` | 증가를 함의한다(#8 / T-7 취지) |

### 3.2 범위 밖·금지

| # | 규칙 |
|---|------|
| **SS-2a** | **만기 카운트다운 시계를 넣지 않는다(M-1).** L-4 표가 "만기까지 남은 시간(시계)"을 허용하는 것은 맞으나, (a) 방금 제거한 `setInterval`을 즉시 되살리게 되고, (b) 포지션이 N개일 때 **"어느 포지션의 만기인가"가 정의돼 있지 않다**. 이 티켓은 **금액 수치 1개(기록된 수익) + 서버 원금**으로 끝난다. 비는 시각 슬롯은 **그대로 비워 둔다** — 대체물을 채우지 않는다. 카운트다운 시계는 **별도 설계 항목**이며 이 부칙의 범위가 아니다(담당 미지정) |
| **SS-2b** | **"estimated"·"예상" 재라벨이나 면책 문구 추가로 수치를 존치하는 안은 기각(M-3).** R-U7이 금지하는 것은 **라벨이 아니라 수치 자체**다. 더구나 `stakingMath.ts:39-48`은 `baseDailyRatePct`만 사용하므로 밴드 포지션에서는 라벨을 어떻게 붙이든 **수치가 틀린다** |
| **SS-2c** | 오늘 스테이킹 가능 코인이 BANA 하나여도(v2 N-6) **코인 맵(`Record<coin, amount>`)을 순회하는 구조로 구현**한다. 단일 코인 심볼이 라벨로 붙은 합산 수치는 **어떤 경우에도 금지**(기본 FRD §4.2.1과 같은 규칙) |
| **SS-2d** | 렌더 억제 조건(원금 0 **and** 기록 수익 0이면 아무것도 렌더하지 않음, `:68-69`)은 **유지**한다. 다만 판정 입력이 서버 값으로 바뀐다 |
| **SS-2e** | 카드 탭 → `/staking` 이동(`onOpen`)은 변경 없음 |
| **SS-2f** | 이 카드에 클레임 진입점·수령 슬롯을 만들지 않는다. 클레임은 `/staking` B2의 단일 진입점이다(기본 FRD §4.2.3) |

### 3.3 SS-2′ — 서버 작업 의존이 **없다** (M-4)

**이 티켓은 100% 클라이언트 작업이다.** API·DB·워커 변경이 필요 없으며, `web-shared-expert`나
`prisma-db-expert`를 끌어들일 필요가 없다. 소스 대조로 확인된 사실:

- `GET /api/staking/positions`는 **이미 코인별 `lockedPrincipal`을 응답에 포함**한다
  (`web/src/app/api/staking/positions/route.ts:72-76`). 이 값은 **출금 라우트가 쓰는 것과 같은
  함수**(`lockedPrincipalByCoin`)에서 나오므로, 화면의 "잠긴 원금"이 출금 화면의 실제 락과
  어긋날 수 없다(R-D2가 요구한 그대로다).
- 클라이언트 헬퍼도 이미 그 필드를 노출한다 —
  `getStakePositionsAndGame()`(`web/src/utils/stakingApi.ts:222-231`).
  현재 카드가 쓰는 `getStakePositions()`를 **이 함수로 바꾸기만 하면 된다.**
- `getStakingRewards().totalByCoin`은 이미 `Record<string, string>`이다
  (`web/src/utils/stakingApi.ts:104`). **데이터가 부족한 것이 아니라, 그것을 합산해 스칼라로
  뭉개는 클라이언트 코드가 문제다.**

---

## 4. SS-3 — 수용 기준 (기본 FRD §10에 편입)

| ID | 기준 |
|----|------|
| **AC-V5′** | AC-V5의 "페이지 어디에도"는 **제품 전체**로 읽는다. `lib/stakingMath.ts`의 `accruedInterest`를 import하는 **클라이언트 컴포넌트가 0개**다(v1 `stakingSettle.ts` 경로·테스트 제외) |
| **AC-SS-1** | 스테이킹 금액을 표시하는 어떤 컴포넌트에도 **금액 state를 구동하는 타이머**(`setInterval` / `setTimeout` 루프 / `requestAnimationFrame`)가 없다 |
| **AC-SS-2** | `StakedSummaryCard`가 표시하는 원금·수익이 **서버 응답 필드 그대로**이며, 클라이언트가 포지션을 순회해 만든 값이 아니다 |
| **AC-SS-3** | 두 수치 모두 **코인별로 렌더**된다. 서로 다른 코인의 금액이 하나의 수치로 합산되거나, 합산 수치에 단일 코인 심볼이 라벨로 붙는 경로가 존재하지 않는다 |
| **AC-SS-4** | **`stakingWorkerEnabled=false`에서 카드의 금액 수치가 시간이 지나도 변하지 않는다.** 클라이언트 측 적립 계산이 실제 정산을 대체하지 않는다(AC-V20의 요약 카드 적용형) |

> AC-SS-4의 검증 형태(권고, 확정은 `qa-lead`): 워커 비활성 상태에서 카드를 마운트하고
> 가상 타이머로 충분한 시간을 진행시킨 뒤, 렌더된 금액 문자열이 **최초 렌더와 동일**한지 본다.
> 타이머가 존재하지 않는다는 것(AC-SS-1)과 값이 변하지 않는다는 것(AC-SS-4)은 **서로 다른
> 검사**다 — 전자는 구현 형태를, 후자는 사용자가 보는 결과를 잠근다.

---

## 5. SS-4 — `accruedInterest` 함수 자체의 폐기 (비차단 · 귀속 명시)

`web/src/lib/stakingMath.ts`의 `accruedInterest`는 SS-2 적용 이후 **v1 정산 경로
(`web/src/lib/stakingSettle.ts`)와 그 테스트에서만** 참조된다. 함수 삭제는 **이 티켓의 범위가
아니다.**

> **귀속:** 이 삭제 항목은 **v1 `stakingSettle.ts` 폐기 티켓**에 귀속시킨다. 그 티켓의
> 체크리스트에 "`lib/stakingMath.ts`의 `accruedInterest` 삭제"를 **한 줄 항목으로 포함**한다.
> 부유하는 TODO로 남기지 않는다.

**범위 밖(명시):** `web/prisma/schema.prisma:446`의 v1 `StakePosition.accruedInterest` **컬럼**.
v1 테이블 폐기 시점에 `prisma-db-expert`가 판단한다 — v2 PRD §5.5가 이미 그렇게 위임했다.

---

## 6. SS-5 — 카피 키 (M-5 · 6개 로케일 전부, AC-V24)

| 키 | 처리 | 사유 |
|----|------|------|
| `stakedSummary.live` | **삭제** | 표시 대상("Live" 배지)이 사라진다. 남겨두면 다음 사람이 되살린다 |
| `stakedSummary.earning` | **삭제** | R-U7이 금지하는 바로 그 수치의 라벨이다 |
| `stakedSummary.credited` | **`stakedSummary.recordedLabel`로 교체** | 기본 FRD §8.4 `staking.position.recordedLabel`(`PositionsSheet.tsx:145`)의 관용을 따른다 |
| `stakedSummary.title` / `stakedSummary.staked` | 변경 없음 | |

### 6.1 `credited`는 이름만의 문제가 아니었다

기존 값은 **T-7 / 기본 FRD §9.2 금지어 그 자체**였다 — 원장에 기록만 된 금액에 "지급 완료"를
붙였다:

| 로케일 | 기존 `stakedSummary.credited` | §9.2 판정 |
|--------|-------------------------------|-----------|
| en | Credited | 경계선(금지어 목록에는 없으나 완료를 함의) |
| ko | 지급됨 | **금지어** |
| ja | 支払済み | **금지어** |
| zh | 已发放 | **금지어** |
| vi | Đã ghi có | 완료 함의(→ `đã ghi nhận`) |
| th | จ่ายแล้ว | **금지어** |

즉 **AC-V1 위반이 5개 로케일에 이미 존재**했다. `/staking` 페이지의 "Paid to date"를 정정할 때
(Track 1 R-1/R-2) 이 카드가 인벤토리에 없었기 때문에 그대로 남은 것이며, §1의 근본 원인이
카피 층에서도 똑같이 나타난 사례다.

### 6.2 교체값 — §8.4 `staking.position.recordedLabel`과 **동일 문자열**

| 로케일 | `stakedSummary.recordedLabel` |
|--------|-------------------------------|
| en | Recorded |
| ko | 기록됨 |
| ja | 記録済み |
| zh | 已记录 |
| vi | Đã ghi nhận |
| th | บันทึกแล้ว |

두 곳에서 같은 개념에 다른 단어를 쓰지 않기 위해 **번역을 새로 만들지 않고 기존 값을 그대로
복사**한다(§9.1 용어 잠금표). 6개 로케일 전부에 존재해야 하며 en 폴백은 실패다(AC-V24).

---

## 7. SS-6 — 착수 조건 · 담당

| 항목 | 판정 |
|------|------|
| 담당 | `web-wallet-expert`(컴포넌트 + 6로케일 카피) → `qa-lead`(AC-V5′ / AC-SS-1~4) |
| 우선순위 | `web-wallet-expert`의 **다음 UI 티켓**(일반 큐 삽입이 아니다). 근거: (a) 프로덕션 워커 가동으로 실사용자 노출 가능, (b) 최다 트래픽 2개 화면, (c) 서버 의존 0, (d) 남은 AC-V5 위반 최후 1건 |
| **핫픽스 아님** | **통상 QA 게이트를 그대로 거친다.** 우선순위가 높은 것과 게이트를 건너뛰는 것은 다르다 |
| **착수 조건** | **사용자의 별도 go-ahead 필요.** 라이브 프로덕션 UI이며 최다 트래픽 2개 화면이다. `pm` 판정 시점에 이 항목은 **차단** 상태다(`temp/20260811-staked-summary-card-ruling/status.md`) |
| 조정 비용 | 없음(SS-2′) — API/DB/워커 변경 의존이 0이다 |

### 7.1 미해결(이 부칙 밖)

| # | 항목 | 담당 |
|---|------|------|
| 1 | 만기 카운트다운 시계 설계(SS-2a로 분리) | 미지정 |
| 2 | v1 `StakePosition.accruedInterest` **컬럼** 정리 | `prisma-db-expert`(v1 테이블 폐기 시) |
| 3 | `lib/stakingMath.ts`의 `accruedInterest` **함수** 삭제 | v1 `stakingSettle.ts` 폐기 티켓에 귀속(SS-4) |

---

*상위: `docs/specs/staking-page-v2-screen-flow-frd.md` · 교차: `docs/specs/staking-yield-system-v2-design-t8-stake-flow-frd.md` §8 DC-8*
