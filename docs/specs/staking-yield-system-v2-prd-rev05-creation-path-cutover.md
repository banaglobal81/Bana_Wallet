# 개정 05 — 스테이킹 생성 경로의 V2 컷오버 (상품 구성 · 컷오버 순서 · 연동 영향)

> 작성: `pm` · 2026-08-10
> **지위: 개정 01~04를 구속하는 최신 개정 문서.** 충돌 시 **이 문서가 이긴다.**
>
> **대체하는 절:**
> - 개정 03: **§5.2 CS-1/CS-2**(상품 동결의 범위 — 그랜트 경로가 빠져 있었다 → §2.2 CS-1′)
> - 개정 04: **§6.2 순서 2~8**(컷오버 실행 순서 → §5 CUT-0~CUT-6)
>
> **변경 없이 유효:** 개정 01 §3·§6·§7·§8·§10·§11, 개정 02 §2, 개정 03 §2·§4·§6,
> 개정 04 §1(PoR-1″)·§2·§3, A-2~A-8 설계 본문 전부.
>
> **이 문서는 상품 개설 승인이 아니다. 첫 포지션 체결 승인도 아니다.**
> 코드 경로를 올바른 스키마에 연결하는 것과, 그 경로로 실제 자금이 들어오는 것을 §5에서 분리한다.

---

## 0. 요약 — 세 문장

1. **"V2 스키마에 연결되지 않았다"는 진단은 정확하지만 절반이다.** 실제 상태는
   **읽기는 이미 V2, 쓰기만 v1인 분열**이며, 그래서 지금 v1 경로로 포지션이 하나라도 생기면
   그 부채는 **PoR-1″ 좌변에도 게임에도 잡히지 않는다.** 이것은 기능 공백이 아니라 **봉쇄 대상**이다.
2. **기존 5개 상품을 다시 여는 것만으로는 단 한 건도 체결되지 않는다.** 체결을 막고 있는 것은
   상품의 `CLOSED` 상태가 아니라 **잔고 출처의 불일치**이며(서버·클라이언트 양쪽이 허브 잔고를 본다),
   그것을 고쳐도 **아무도 로컬 BANA 잔고를 갖고 있지 않다** — 로컬 원장에 잔고를 넣는 코드 경로가
   이 저장소에 **단 하나도 없다.**
3. **마스터의 확인 요청("클레임과 달리 게이트가 없다")은 코드로 확인됐다**(§3). 그리고 그 확인이
   드러낸 것은 안심이 아니라 **한 가지 사실**이다 — 생성 시점에 게이트가 없으므로,
   **상품 카탈로그(기간·이율·정원·1건 상한)가 유일한 부채 상한 장치다.** 그래서 §4는 이율·정원을
   "승계할 값"이 아니라 **결정해야 할 값**으로 취급한다.

| # | 판정 | 요지 |
|---|------|------|
| **P-21** | **지금의 상태는 "미연결"이 아니라 "읽기/쓰기 분열"이다** | 게임 어댑터와 PoR 좌변은 이미 V2만 읽는다. v1 쓰기 경로는 살아 있다. 그 둘의 교집합이 **불가시 부채**다 → §1.2 |
| **P-22** | **CS-1(상품 5건 CLOSED)은 v1 생성 경로를 닫지 못했다. 관리자 그랜트 라우트가 열려 있다** | `api/admin/staking/positions` POST는 **의도적으로 `product.status`를 검사하지 않는다**(코드 주석 명시). rev04 G-E는 V2 경로에만 적용됐고, **실제로 살아 있는 v1 라우트에는 적용되지 않았다** → §2.2 |
| **P-23** | **상품을 다시 열어도 체결은 0건이다. 원인은 두 층에 있다** | 서버는 허브 `/api/v1/wallets`로 가용액을 계산하고(BANA는 허브에 없다), 클라이언트도 허브 잔고에서 뺀다. **두 곳 다 LOCAL 권위와 무관한 숫자를 본다** → §1.3 |
| **P-24** | **(신규 발견 · HIGH) 컷오버를 끝내도 체결은 여전히 0건이다 — 로컬 BANA를 만들 수 있는 경로가 없다** | `creditLocalLedger`를 호출하는 라우트가 **0개**다. 입금 레일 `UNSUPPORTED`, 클레임 라우트 미존재, 레퍼럴 OFF, 관리자 조정 라우트 미존재. `placeHold`는 전원에게 `insufficient available balance`를 던진다 → §1.4 · Q-M7 |
| **P-25** | **PoR 게이트 비적용은 확인됐다. 그러나 "생성에는 게이트가 없다"의 정확한 결론은 "카탈로그가 게이트다"이다** | `placeHold`·정산 트랜잭션 어느 것도 `assertReserveHealthyOrThrow`를 부르지 않는다(코드 확인). 대신 **`assertExecutionAllowed(coin,'NEW_POSITION')`이 구현돼 있으면서 아무도 호출하지 않는다** — 이것이 실재하는 통제 공백이다 → §3 |
| **P-26** | **기존 5개 상품을 그대로 재개설하지 않는다. 기간 사다리만 승계하고 이율·정원·상한은 다시 결정한다** | 360일 1.3%/일 = **원금의 468%**, `capacity`는 5건 모두 `null`(무제한). 시드 파일 자신이 *"360 rate = placeholder (TBD)"* 라고 적고 있다 → §4 |
| **P-27** | **정산 엔진은 "정산할 것이 아무것도 없을 때" 교체한다** | 포지션이 생긴 뒤에 워커를 바꾸면, 그 사이 만기 포지션의 **홀드가 해제되지 않는다.** 소프트 락에서 사용자가 실제로 지는 위험은 손실이 아니라 **동결**이며, 그 위험의 유일한 원인이 이 순서다 → §5.1 |
| **P-28** | **레퍼럴은 조용히 0이 된다. 이것은 컷오버가 만드는 회귀이지 기존 결함이 아니다** | `referralTree.getDownline`의 원시 SQL이 `"StakePosition"`을 직접 읽는다. V2로 옮기면 전 사용자의 `activeStake`/`dailyInterest`가 0이 되고, **에러 없이** 커미션이 0이 된다 → §6 |

---

## 1. 실측 — 오늘의 정확한 상태

개정 03 N-23~N-31, 개정 04의 실측은 전부 유효하다. 아래는 이번 패스에서 새로 확인된 것이며,
**전부 코드 실측**이다(프로덕션 행 수 재검증은 §5.0 CS-2′로 별도 요구한다).

### 1.1 스키마와 코드의 어긋남

| ID | 사실 | 근거 |
|----|------|------|
| **N-32** | V2 테이블 4종이 **존재하고 마이그레이션이 적용됐다** — `StakingProductV2`·`StakePositionV2`·`StakeYieldLedgerEntry`·`UserCoinYieldSummary` | `web/prisma/schema.prisma:500-668`, `migrations/20260810075816_v2_core_authority_local_ledger_staking_withdrawal_onchain/` |
| **N-33** | **A-4 §9의 인터페이스 계약 4건이 전부 미구현이다.** `createStakePositionV2` / `maturePositionV2` / `runStakingSettlementV2` / `claimYield` 어느 것도 존재하지 않는다. `web/src/lib/` 전수 확인 결과 `stakingV2.ts`류 파일 **0개** | `web/src/lib/*.ts` 전수 |
| **N-34** | 따라서 `StakingProductV2`/`StakePositionV2`에 **행을 쓰는 코드가 0개**다. 두 테이블을 **읽는** 코드는 이미 존재한다 → N-35 |

### 1.2 (P-21) 읽기/쓰기 분열 — 이것이 이번 문서의 핵심 사실

| ID | 사실 | 근거 |
|----|------|------|
| **N-35** | **게임 어댑터는 이미 V2만 읽는다.** A-6 컷오버가 완료돼 `deepCoreProgress.ts`는 `stakePositionV2`·`stakeYieldLedgerEntry`만 조회하며, 주석이 *"CO-R1 forbids reading both the legacy and v2 tables together"* 라고 못 박고 있다 | `web/src/lib/deepCoreProgress.ts:68, 94` |
| **N-36** | **PoR-1″ 좌변도 이미 V2만 읽는다.** `activeUserFundedPrincipalTotal`·`grantPrincipalPayableTotal`(H-2′ 판정)·INV-P5 대사 전부 `stakePositionV2`를 조회한다 | `web/src/lib/localLedger.ts:448-450, 550, 564-566` |
| **N-37** | **반면 사용자·관리자 생성/조회 경로는 전부 v1이다.** `/api/staking/{products,positions,stake,rewards,positions/[id]/auto-renew}`, `/api/admin/staking/{products,positions,stats,run}`, `lib/staking.ts`, `lib/stakingSettle.ts`, `lib/stakingRenew.ts`, `admin/staking/page.tsx` | 각 파일 |

> **이 분열의 의미를 정확히 적는다.** 오늘 v1 경로로 포지션이 1건 생기면:
> - PoR-1″ 좌변 `activeUserFundedPrincipalTotal` = **여전히 0**(V2를 읽으므로) → **원장에 없는 부채**
> - INV-P5(홀드 ↔ 원금 대사) = **위반조차 감지되지 않음**(양쪽 다 0이므로 일치)
> - 게임 = **그 포지션을 못 봄**(`S0_NOT_SHOWN` 유지)
> - 그러나 **레거시 정산 워커는 그 포지션에 이자를 계상하고**(`stakingWorkerEnabled` 기본 **true**),
>   `lockedPrincipalByCoin`은 그 원금만큼 **허브 코인 출금 가능액을 줄인다**
>
> 즉 **부채는 실재하는데 준비금 검증에는 존재하지 않는 상태**가 만들어진다.
> 이것이 개정 04 §2.4 PoR-S1(부채 스트림 등록부)이 막으려던 실패 양식의 **가장 노골적인 형태**다.

### 1.3 (P-23) 잔고 출처가 두 층 모두 틀렸다

| ID | 사실 | 근거 |
|----|------|------|
| **N-38** | **서버:** `/api/staking/stake`는 `niaWalletRequest('GET','/api/v1/wallets',{currency:'BANA'})`로 가용액을 구한다. BANA는 허브 markets 83종에 없고(N-23) `balanceAuthority=LOCAL`이므로 이 값은 **항상 0**이다 → 모든 요청이 `STAKE_INSUFFICIENT_AVAILABLE`로 실패한다 | `api/staking/stake/route.ts:100-101, 138-144` |
| **N-39** | **클라이언트:** `Staking.tsx`의 `availableFor(coin)` = `getNiaBalance()` − `lockedPrincipal` — 역시 허브 값이다. `StakeSheet`의 확인 버튼은 `amtDec.gt(avail)`이면 비활성이므로 **STEP 2에서 진행 자체가 불가능**하다 | `components/Staking.tsx:127-129`, `staking/sheets/StakeSheet.tsx:42, 159` |
| **N-40** | 반면 로컬 권위 잔고를 정직하게 노출하는 라우트는 **이미 존재한다** — `GET /api/wallet/local-balance`(A-7 R-A7-1~4, `balance`/`available`/홀드 3분류/`state:'ok'\|'error'`) | `api/wallet/local-balance/route.ts` |

> **그러므로 CS-1(상품 CLOSED)이 사용자를 막고 있는 것이 아니다.** 상품을 지금 다시 열어도
> 화면은 `available: 0`을 렌더하고 서버는 400을 던진다. **"상품만 다시 열면 된다"는 판단은
> 틀렸고, 그 판단으로 CS-1을 되돌리면 clean-slate 보호만 잃는다.**

### 1.4 (P-24 · HIGH) 로컬 BANA를 만드는 경로가 존재하지 않는다

| ID | 사실 | 근거 |
|----|------|------|
| **N-41** | `creditLocalLedger`를 호출하는 **라우트·워커가 0개**다. `web/src/` 전수 grep 결과 호출자는 `localLedger.ts` 내부(`mutateLocalLedger`)뿐이며, 실제로 배선된 원장 쓰기는 **출금 시 차감(`executeHold`→`debitLocalLedger`) 한 방향뿐**이다 | `web/src/**` 전수 |
| **N-42** | 네 개의 크레딧 사유 코드가 전부 닫혀 있다 — `DEPOSIT_CONFIRMED`(입금 레일 없음, `localDepositRail:'UNSUPPORTED'`), `STAKING_CLAIM`(클레임 라우트 미존재 + `stakingClaimEnabled=false`), `REFERRAL_BONUS_CREDIT`(`REFERRAL_BONUS_ENABLED` OFF, 크레딧 배선 없음), `ADMIN_ADJUSTMENT_CREDIT`(라우트·UI 없음) | `api/wallet/local-balance/route.ts:116`, `schema.prisma:136`, `lib/referralBonus.ts:14-16`, `lib/localLedger.ts:98-107` |
| **N-43** | 따라서 전 사용자의 `UserCoinBalance(BANA).balance`는 **구조적으로 `"0"`**이고, `placeHold`는 `available` 부족으로 **예외 없이 실패**한다 | `lib/localLedger.ts:305-312` |

> **이것이 이 문서에서 가장 중요한 발견이다.** 요청서는 *"실제 스테이킹 생성 흐름이 V2 스키마에
> 연결되지 않아서 지금 아무도 새 포지션을 만들 수 없다"* 고 진단했다. 연결하면 **에러 메시지가
> 바뀔 뿐 결과는 같다.** 진짜 차단은 **사용자가 BANA를 어떻게 손에 넣는가**이며, 그 답은
> Q-M5(입금 레일)에 묶여 있다 — 즉 **개정 03이 "로컬 원장 구현 착수 전에 필요하다"고 한 그 질문이,
> 구현이 끝난 지금도 여전히 마지막 차단**이다. → **Q-M7**(§8)

### 1.5 그 밖의 결합 실측

| ID | 사실 | 근거 |
|----|------|------|
| **N-44** | **레퍼럴 트리의 실적 계산이 v1 테이블을 원시 SQL로 직접 읽는다** — `SUM(p.principal)` / `SUM(p.principal × p."dailyRatePct"/100)` `FROM "StakePosition"` | `lib/referralTree.ts:33-41` |
| **N-45** | **레퍼럴 커미션 실행 지점이 레거시 정산 함수 꼬리에 있다** — `runStakingSettlement()` 마지막 줄에서 `payReferralBonuses(now)` 호출 | `lib/stakingSettle.ts:199` |
| **N-46** | **정산 엔진이 둘 배선돼 있고 살아 있는 쪽은 레거시다.** `stakingWorkerEnabled` 기본 `true`, `worker/`가 `/api/cron/staking`을 폴링 → `runStakingSettlement`(v1 테이블). `stakingV2WorkerEnabled` 기본 `false`이고 **대응 코드 자체가 없다** | `schema.prisma:101, 140`, `api/cron/staking/route.ts:22, 34` |
| **N-47** | `npm run db:seed:staking`(`seedStaking.ts`)은 **`status:'OPEN'`으로 v1 상품을 생성**하며 `(coin, termDays)` 기준 멱등이다. CS-1 이후 이 스크립트는 *"이미 존재"* 로 건너뛰지만, **행이 지워지면 다시 OPEN으로 만든다** | `web/prisma/seedStaking.ts:34-39` |

---

## 2. 즉시 봉쇄 (CUT-0) — 다른 어떤 결정보다 먼저

### 2.1 왜 먼저인가

§1.2가 보인 대로, **v1 경로로 생기는 포지션은 준비금 검증에 존재하지 않는 부채**다.
그 경로가 열려 있는 동안에는 CS-2(컷오버 당일 재검증)가 통과해도 아무 보장이 되지 않는다 —
검증 시점과 컷오버 시점 사이에 한 건이 생기면 그만이다. **관측을 영구 가정으로 승격시키지 않는다**
(개정 03 §5.2 원문)는 원칙은, 관측 사이의 창을 닫아야 비로소 성립한다.

### 2.2 (P-22) CS-1은 문을 다 닫지 못했다 — CS-1′

개정 03 CS-1은 *"프로덕션 `StakingProduct` 5건을 `CLOSED`로 전환한다"* 였고 실행됐다.
그런데 관리자 그랜트 라우트는 **상품 상태를 의도적으로 검사하지 않는다:**

> *"Product status and capacity are intentionally NOT enforced: a grant is a deliberate admin
> override, e.g. issuing a bonus into a closed or full pool."* — `api/admin/staking/positions/route.ts:95-97`

그리고 개정 04 §1.8의 요구 **G-E**(그랜트 생성 경로 fail-closed)는 **V2 경로를 향해 쓰였고,
실제로 살아 있는 v1 라우트에는 적용되지 않았다.** 그 결과:

- 관리자가 오늘 그랜트를 1건 만들면 → v1 `StakePosition` 행 생성
- PoR의 `grantPrincipalPayableTotal`은 `stakePositionV2.count(PLATFORM_GRANT)`를 보므로 **여전히 `"0"`**
  (`localLedger.ts:550`) → 개정 04 P-18이 *"기지의 0"* 이라고 부른 그 값이 **정직하지 않게 된다**
- 레거시 워커가 그 포지션에 이자를 계상하고, 허브 출금 가능액이 줄어든다

> **요구 CS-1′ (필수, 즉시).** 아래 두 라우트를 **fail-closed로 봉쇄**한다. 코드 삭제가 아니라
> **진입점에서 거부**이며, CUT-3/CUT-4에서 V2 구현으로 대체될 때까지 유지한다.
>
> | 라우트 | 조치 | 사유 코드 |
> |---|---|---|
> | `POST /api/admin/staking/positions` (그랜트) | **항상 409 거부.** rev04 §1.8 G-E("V2-CORE에서 그랜트 기능은 제공하지 않는다")를 v1 라우트에 소급 적용 | `GRANT_DISABLED_V2_CORE` |
> | `POST /api/staking/stake` (v1 체결) | **항상 503 거부**(사용자 화면은 "일시 중단" 표기 — §7 `product-planner` 카피) | `STAKE_PATH_MIGRATING` |
>
> **관리자 화면의 그랜트 폼도 같은 배포에서 제거한다** — 눌러도 실패하는 버튼을 남기면
> 관리자가 "시스템 오류"로 보고한다.
>
> **요구 CS-1″ (필수).** `web/prisma/seedStaking.ts` 및 `package.json`의 `db:seed:staking`
> 스크립트를 **제거하거나 즉시 종료(no-op)로 바꾼다.** v1 상품을 `status:'OPEN'`으로 만드는
> 스크립트가 저장소에 남아 있는 것 자체가, CS-1을 한 명령으로 되돌릴 수 있게 만든다.

**되돌릴 수 있는가:** 그렇다. 세 변경 모두 조건문 한 줄 수준이고 데이터를 건드리지 않는다.
**사용자 영향:** 0(오늘 이 경로로 성공하는 요청이 없다 — §1.3).

---

## 3. 마스터 확인 요청 — "클레임과 달리 생성·정산에는 게이트가 없다"

### 3.1 확인 결과: 맞다. 코드로 확인했다

개정 04는 문서상의 판정이었다. **구현이 그 판정대로 됐는지를 이번에 코드로 확인했다.**

| 동작 | PoR 게이트 통과? | 근거 |
|---|---|---|
| **포지션 생성**(`placeHold`) | **아니오** | `placeHold`(`localLedger.ts:278-330`)는 `assertReserveHealthyOrThrow`도 `assertIssuanceAllowed`도 호출하지 않는다. 잔고 행을 잠그고 `available`을 검사한 뒤 `LocalBalanceHold` 행만 만든다 |
| **이자 정산**(`StakeYieldLedgerEntry` 삽입) | **아니오** | 정산은 `LocalLedgerEntry`를 만들지 않는다 → `mutateLocalLedger`를 거치지 않는다 → 게이트 경로에 들어가지 않는다 |
| **클레임**(`STAKING_CLAIM` 크레딧) | **예** | `mutateLocalLedger`가 `ISSUANCE_CREDIT_REASON_CODES`에 해당할 때만 ① `ManagedCoin` 행 잠금 ② `assertIssuanceAllowed` ③ `assertReserveHealthyOrThrow(coin, amount)`를 수행한다 (`localLedger.ts:163-183`) |

> **결론: 지금 사용자가 스테이킹을 하고 이자가 원장에 쌓이기 시작하는 것 자체는 PoR 게이트에
> 걸리지 않는다.** 개정 04 §1.7 PoR-G1(통제 주소 0건 → `NO_RESERVE_BASIS` → 발행 차단)은
> **클레임만** 막는다.

### 3.2 그러나 "게이트가 없다"에서 "그러므로 안전하다"로 넘어가지 않는다

세 가지를 정직하게 덧붙인다.

**ⓐ 게이트가 없다는 것은 부채가 없다는 뜻이 아니다.**
정산은 `UserCoinYieldSummary.ledgeredYieldTotal`을 늘리고, 그 값은 PoR-1″ 좌변의 **L2**
(`unclaimedLedgeredInterestTotal`)다. 통제 주소가 0건인 지금 PoR 결과는 `NO_RESERVE_BASIS`이므로,
**우리는 한 번도 검증된 적 없는 준비금에 대해 청구권을 쌓기 시작하는 것**이다.
그것이 rev04가 의도적으로 택한 설계다(상시 FAIL이 게이트를 죽이는 것보다 낫다, §1.2). 옳다.
**다만 그 선택의 대가는 고지 의무가 "첫 클레임"이 아니라 "첫 체결" 시점에 발생한다는 것이다.**

> **요구 CP-1 (필수).** 체결 확인 화면(S-STAKE STEP 3)과 수익 표시(B2 YIELD PANEL)의 문구는
> **"지급"을 함의하지 않는다.** 개정 01 §10과 A-7 §4.1·rev04 N-9의 카피 정정을 **체결 화면까지
> 확장**한다. 담당: `product-planner` → `web-wallet-expert` → 6로케일.

**ⓑ 생성 시점에 존재해야 할 게이트가 하나 있는데, 구현돼 있고 아무도 호출하지 않는다.**
개정 03 X-3′ T2는 *"해당 코인의 ① 로컬 원장 발행 ② **신규 체결** ③ 출금 실행을 전부 정지"* 라고
요구했고, 그 훅은 `assertExecutionAllowed(symbol, 'NEW_POSITION')`으로 **이미 구현돼 있다**
(`coinAuthority.ts:158-200`, T1_WARNING일 때 관리자 오버라이드 요구까지 포함). 그런데
**호출자는 출금 경로 3곳뿐이고 스테이킹 경로는 0곳**이다.

> **요구 CP-2 (필수).** V2 체결 진입점은 트랜잭션 시작 전에
> `assertExecutionAllowed(coin, 'NEW_POSITION')`을 호출한다. `CoinAuthorityBlockedError`는
> 403 + 사유 코드로 매핑한다(출금 라우트 `api/nia/withdrawals/route.ts:246-254`가 이미 쓰는 패턴 그대로).
> **A-4 §9-1의 "`assertIssuanceAllowed`는 호출하지 않는다"는 그대로 유효하다** — 원금 체결은 발행이
> 아니다. 여기서 요구하는 것은 **다른 함수**이며, 둘을 혼동하면 T2 정지가 체결을 막지 못한다.

**ⓒ 생성에 게이트가 없으므로, 상품 카탈로그가 유일한 부채 상한 장치다.**
클레임 게이트는 "이미 발생한 부채를 지금 지급해도 되는가"를 묻는다. **"얼마까지 부채를 만들
것인가"를 묻는 장치는 이 시스템에 `StakingProductV2`의 `termDays × baseDailyRatePct × capacity`
밖에 없다.** 이것이 §4의 전제다.

> `docs/patterns/pm.md` — *"계약된 지급은 자를 수 없다. 자를 수 있는 것은 얼마나 계약할지뿐이다.
> 그래서 모든 절삭 통제는 체결 시점(admission point)으로 옮겨져야 한다."*
> 밴드가 없어도 이 원리는 동일하게 적용된다. 소프트 락 원금은 우리 부채가 아니지만, **이자는 부채다.**

**ⓓ 소프트 락에서 사용자가 실제로 지는 위험은 손실이 아니라 동결이다.**
원금은 차감되지 않고 `available`만 줄며, 만기에 `releaseHold`로 복귀한다(A-4 §9-2 — `executeHold`가
아니다). 따라서 **이 컷오버에서 가장 위험한 결함 유형은 "홀드가 영원히 해제되지 않는 포지션"**이다.

> **요구 CP-3 (필수 · 인수 기준).** **만기·해제 경로가 라이브가 되기 전에는 어떤 포지션도 생성
> 가능해서는 안 된다.** `maturePositionV2`(+ 자동 갱신 분기)와 그것을 구동하는 V2 정산 워커가
> 프로덕션에서 동작하는 것을 확인한 **뒤에** 체결 라우트를 연다(§5의 순서가 이 요구의 구현이다).
> QA 인수 기준: *"체결 → 만기 → `available`이 체결 직전 값으로 정확히 복귀"* 가 통합 테스트로 증명될 것.
>
> **요구 CP-4 (필수).** `reconcileStakePrincipalHolds()`(INV-P5, 이미 구현됨)를 **주기 실행 + 경보**로
> 배선한다. 불일치는 자동 정정하지 않고 인시던트로 올린다(rev04 §1.4 원문). **이 대사가 깨지면
> BANA 전체의 클레임이 차단된다** — 즉 이것은 진단 도구가 아니라 가용성에 직결된 통제다.

---

## 4. 요청 1 — 초기 V2 상품 구성

### 4.1 (P-26) 기존 5건의 조건을 승계하지 않는 이유

시드 파일(`web/prisma/seedStaking.ts:19-25`)의 실제 값과 그 함의:

| 기간 | 일이율 | 연환산 | 1건 최대 원금 | **1건 최대 이자(만기)** | 원금 대비 | `capacity` |
|---|---|---|---|---|---|---|
| 10일 | 0.2% | 73% | 3,000 | 60 | 2% | **null(무제한)** |
| 30일 | 0.5% | 182.5% | 29,999 | 4,499.85 | 15% | **null** |
| 90일 | 0.7% | 255.5% | 99,999 | 62,999.4 | 63% | **null** |
| 180일 | 1.0% | 365% | 500,000 | 900,000 | **180%** | **null** |
| 360일 | 1.3% | 474.5% | 1,000,000 | 4,680,000 | **468%** | **null** |

세 가지가 동시에 참이다:

1. **정원이 없다.** 다섯 상품 모두 `capacity = null` → **총 부채에 상한이 없다.**
   §3.2 ⓒ에 따라 이 시스템에는 다른 상한 장치가 없으므로, `null` 정원은 곧 **무제한 발행 허가**다.
2. **이율이 확정된 값이 아니다.** 시드 파일 자신이 *"BANA amounts + the 360-day rate are
   placeholders pending the senior's policy"*, *"360 rate = placeholder (TBD)"* 라고 적고 있다.
   **확정된 적 없는 값을 재개설로 확정시키지 않는다.**
3. **rev04 §5.2 P-3가 이 5건을 얼어붙인 이유가 아직 살아 있다.** 그때의 목적은 clean-slate 보호였고,
   지금 그 조건을 그대로 새 스키마에 복사하면 **아무도 결정하지 않은 채 결정이 이뤄진다.**

> **판정 P-26. 기존 5건의 조건을 그대로 V2로 재개설하지 않는다. 기간 사다리만 승계하고,
> 이율·정원·1건 상한·최소액은 재결정 대상으로 둔다.**

### 4.2 기간 사다리(10/30/90/180/360)는 승계한다

이것만은 바꾸지 않는다. 이유가 재무가 아니라 **구조**에 있기 때문이다:

- `AUTO_RENEW_MAX_TERM_DAYS = 90`이 기간 값에 직접 걸려 있다(90 이하만 자동 갱신 대상).
- DEEP CORE의 `relativeSize`는 **`termDays / maxTermDays`** 로만 계산된다(DC-3 — 원금 비례 금지).
  기간 사다리를 바꾸면 **게임의 크기 스케일이 조용히 바뀐다.** 그것은 게임 기획 결정이지
  스테이킹 컷오버의 부수 효과여서는 안 된다.
- 기간은 규제상 새 상품 유형을 만들지 않는다(rev03 §6.3 — V2-CORE는 "오늘 이미 제공 중인 것과
  동일한 조건의 정기 이자 상품").

### 4.3 요구 — 초기 V2 상품 집합

> **요구 CP-5 (필수).** 초기 `StakingProductV2` 5건은 **기간만 승계**하고 아래 제약을 전부 만족한다.
>
> | 필드 | 요구 | 근거 |
> |---|---|---|
> | `coin` | `"BANA"` | N-6. 라우트가 다른 코인을 거부한다(기존 검증 승계) |
> | `termDays` | 10 / 30 / 90 / 180 / 360 | §4.2 |
> | `maxBonusPctOfBase` | **`"0"` 고정.** 라우트는 0이 아닌 값을 **거부**한다 | V2-BAND 게이트(H-1/H-3/H-4) 미해소. rev03 §8.3 금지 ④ |
> | `baseDailyRatePct` | **재결정 대상** → Q-M8 | §4.1-2 |
> | `capacity` | **non-null 필수.** `null` 생성을 라우트가 **거부**한다 | §4.1-1. 이 시스템의 유일한 총량 상한 |
> | `maxAmount` | **non-null 필수** | 1건당 최대 부채를 계산 가능하게 만든다 |
> | `minAmount` | **non-null 필수** | 먼지 포지션 방지(L-5) + **DEEP CORE 파밍 가드**(`minAmount`가 nullable인 것이 개정 01 시점의 파밍 취약점이었다 — `docs/patterns/pm.md`) |
> | `status` | **생성 시 `CLOSED` 강제.** 스키마 기본값이 `OPEN`이므로 **라우트가 명시적으로 `CLOSED`를 써야 한다** | §4.4 |
>
> **요구 CP-6 (필수).** 상품 개설(`CLOSED → OPEN`)은 **별도 액션**이며, 아래를 모두 만족할 때만 허용한다.
> ① `capacity`·`minAmount`·`maxAmount`가 전부 non-null, ② `maxBonusPctOfBase == "0"`,
> ③ **Q-M8(이율·정원 사이징) 회신 완료**, ④ `AuditLog` 기록(`STAKING_PRODUCT_V2_OPEN`, 관리자 신원 포함).
> 상품 개설은 **부채 한도를 여는 행위**이므로, 그 순간이 감사 가능해야 한다.

### 4.4 왜 초기 상품을 `CLOSED`로 만드는가 — 이것이 이 문서의 핵심 설계 선택

`StakingProductV2`가 0건인 지금의 상태는 **사고가 아니라 우연**이다. 그것을 **의도된 상태로 바꾼다.**

- 컷오버(§5)는 상품 개설 없이 **끝까지 진행할 수 있다.** 코드 경로·워커·화면·대사가 전부 붙고,
  내부 검증용 상품 1건으로 E2E를 증명한 뒤에도 **공개 오퍼는 여전히 0건**이다.
- 그러면 **"엔지니어링 완료"와 "상품 출시"가 분리된다.** 지금은 이 둘이 묶여 있어서,
  코드를 붙이는 결정이 곧 부채 한도를 여는 결정처럼 보인다. 그것이 이 안건이 무거워 보이는 진짜 이유다.
- 그리고 Q-M3(준비금)·Q-M8(사이징)의 회신은 **`status` 필드 하나를 바꾸는 작업**이 된다 —
  코드 배포도, 마이그레이션도, 재검토도 필요 없다.

### 4.5 출시 기간의 상한 — 권고

> **권고 CP-7 (PM 권고, 마스터 확정 대상 · Q-M9).** **1차 개설은 10 / 30 / 90일 3종으로 한정하고,
> 180 / 360일은 생성하되 `CLOSED`로 유지**한다. 해제 조건: **G-1‴**(정산→클레임→출금→온체인→검증
> 전 구간 프로덕션 성공, 개정 03 §6.2).
>
> 근거는 **되돌리기 지평(unwind horizon)** 이다. 정기 이자는 계약이므로 중도 해지가 없다 —
> 한 번 체결되면 만기까지 간다. 클레임 레일이 **아직 한 번도 자금을 실어 나른 적이 없는** 상태에서
> 360일 계약을 받는다는 것은, 문제가 발견돼도 **1년치를 되돌릴 수 없다**는 뜻이다.
> 90일 상한은 `AUTO_RENEW_MAX_TERM_DAYS`와도 일치해 자동 갱신 정책과 어긋나지 않는다.

---

## 5. 요청 2 — 컷오버 방식과 영향 범위

### 5.0 사전 조건

> **요구 CS-2′ (필수, CUT-1 착수 전).** 프로덕션에서 아래를 재조회하고 결과를 기록한다.
> `StakePosition` / `StakingPayout` / `ReferralBonusPayout` / `WithdrawalRequest` /
> `StakePositionV2` / `StakeYieldLedgerEntry` / `UserCoinBalance`(balance ≠ '0' 행 수) /
> `LocalBalanceHold`(ACTIVE) / `PlatformControlledAddress`(active) / `StakingProduct`(status별).
> **v1 포지션이 1건이라도 있으면 이 문서의 컷오버는 무효**가 되고 개정 01 §5(승계 전략)로 돌아간다
> (CS-2 원문 승계). 담당: `prisma-db-expert`.

### 5.1 (P-27) 순서 — 정산 엔진을 "정산할 것이 없을 때" 바꾼다

가장 흔한 오류 순서는 "체결부터 열고 워커는 나중에"다. 그러면 **만기가 도래한 포지션의 홀드가
해제되지 않고**, 사용자는 원금이 동결된 채 아무 안내도 받지 못한다(§3.2 ⓓ). 반대로 지금은
**정산 대상이 0건**이므로 워커 교체가 **무해한 배포**다. 이 여유를 쓴다.

| 단계 | 내용 | 배포 | 이 단계에서 체결 가능? |
|---|---|---|---|
| **CUT-0** | **봉쇄** — CS-1′(그랜트·v1 체결 라우트 fail-closed) + CS-1″(시드 스크립트 제거) | 독립 · 즉시 | 아니오 |
| **CUT-1** | **공유 레이어** — `lib/stakingV2.ts`: `createStakePositionV2` / `maturePositionV2` / `settleMaturedPositionsV2` / `runStakingSettlementV2` / `lockedPrincipalForLocal`. 라우트 미변경(다크 병합) + 단위·통합 테스트 | 무해(호출자 없음) | 아니오 |
| **CUT-2** | **관리자** — 상품 CRUD를 V2로(생성 시 `CLOSED` 강제, `capacity` 필수), 포지션 조회·통계 V2, 그랜트 폼 제거 확정 | 관리자 전용 | 아니오(상품 CLOSED) |
| **CUT-3** | **정산 엔진 교체** — `/api/cron/staking`·`/api/admin/staking/run`을 V2로, `stakingWorkerEnabled=false` + `stakingV2WorkerEnabled=true` **동일 배포에서**, `payReferralBonuses` 호출 지점 이설 | **정산 대상 0건 상태에서 실행** | 아니오 |
| **CUT-4** | **사용자 API + 화면** — `/api/staking/*` V2, `Staking.tsx` 가용액 출처를 `/api/wallet/local-balance`로, 타입·시트 갱신. **읽기와 쓰기를 같은 배포에서 뒤집는다**(A-6 CO-R1과 동일 원리 — 두 스키마를 동시에 읽는 창을 만들지 않는다) | 단일 배포 | **경로는 열림. 실제로는 잔고 0이라 0건**(Q-M7) |
| **CUT-5** | **레퍼럴 SQL** — `referralTree.getDownline`을 V2로(§6) | 독립 | — |
| **CUT-6** | **정리** — 구 테이블 DROP(CS-3 3단계) + `RENAME V2 → 원래 이름` | **별도 커밋·별도 배포·소킹 이후.** 이 문서의 범위 밖 | — |

> **CUT-3와 CUT-4를 합치지 않는다.** 합치면 롤백 단위가 "정산 엔진 + 사용자 화면"이 되고,
> 화면 결함 하나 때문에 정산 엔진을 되돌리게 된다.
> **CUT-4 내부는 반대로 쪼개지 않는다.** 쓰기만 V2로 가고 읽기가 v1에 남으면 사용자가 자기
> 포지션을 볼 수 없다.

### 5.2 영향 범위 전수 — 파일 단위

**① 사용자 API (`web-shared-expert`)**

| 파일 | 바꿔야 할 것 |
|---|---|
| `api/staking/products/route.ts` | `stakingProduct` → `stakingProductV2`. 응답 필드 `dailyRatePct` → **`baseDailyRatePct`**(A-4 원칙 3 — 이름이 의미를 정한다). 정원 사용량 집계도 V2 포지션 기준 |
| `api/staking/stake/route.ts` | **전면 재작성.** ⓐ `assertExecutionAllowed(coin,'NEW_POSITION')`(CP-2) ⓑ 권위 분기 — `getCoinAuthority(coin)`이 `LOCAL`이면 **허브 호출 제거**하고 `placeHold`로 검증·락 ⓒ `createStakePositionV2`(`fundingSource:'USER_BALANCE'`, 밴드 스냅샷, `principalHoldId`)를 **`placeHold`와 같은 트랜잭션에서** ⓓ 정원 재검사를 `StakePositionV2` 기준으로 ⓔ 기존 advisory lock 패턴 유지 |
| `api/staking/positions/route.ts` | V2 조회. `serializePosition` 재작성 → **`accruedInterest` 필드 삭제**(개정 01 §5.5 / R-U7 — V2에는 컬럼 자체가 없고 개념이 금지됨), `paidInterest` → `ledgeredYield`, `dailyRatePct` → `baseDailyRatePct`, 상태값 집합에서 `'PAID'` 제거. **`lockedPrincipal`은 LOCAL 코인에 대해 포지션 합산이 아니라 `LocalBalanceHold(STAKE_PRINCIPAL_LOCK)` 합산으로 계산**(A-7 LB-C1 — 그러지 않으면 이중 계상) |
| `api/staking/rewards/route.ts` | `stakingPayout` → `stakeYieldLedgerEntry`(`paidAt` → `settledAt`). **`since`/`positionId`/`cursor`/`limit` 4개 모드의 페이지네이션 의미를 그대로 보존**(Field Log·Shift Report가 의존) |
| `api/staking/positions/[id]/auto-renew/route.ts` | V2 포지션 소유권 검증 + `AUTO_RENEW_MAX_TERM_DAYS` 규칙 유지 |
| `api/cron/staking/route.ts` | `runStakingSettlement` → `runStakingSettlementV2`, `stakePosition.count` → V2, 스케줄 설정을 `stakingV2Worker*`에서 읽기 |

**② 공유 라이브러리 (`web-shared-expert`)**

| 파일 | 바꿔야 할 것 |
|---|---|
| **신규** `lib/stakingV2.ts` | A-4 §9 계약 4종. `maturePositionV2`는 **`releaseHold`**(`executeHold` 아님). `runStakingSettlementV2`는 SETTLE-1(단일 트랜잭션 + `FOR UPDATE` + **삽입한 행의 합만큼만 증분**) / SETTLE-2(`assertIssuanceAllowed` 실패 시 **스킵**, 에러 아님) |
| `lib/staking.ts` | `settleMaturedPositions`·`lockedPrincipalByCoin`을 V2로. LOCAL 코인은 홀드 기반 |
| `lib/stakingSettle.ts` · `stakingRenew.ts` · `stakingRenewMath.ts` | V2 대응으로 이설. **자동 갱신은 새 포지션 생성 = 새 홀드 생성 + 구 홀드 해제가 한 트랜잭션**이어야 한다. `FAILED_GRANTED_POSITION` 등 실패 사유 집합은 의미 불변 승계 |
| `lib/stakingMath.ts` | **손대지 않는다.** `stakingDayMs()`가 rev04 N-7의 dayMs 단일 출처이며 게임이 import한다 — 이 접근자가 깨지면 파밍 가드가 조용히 무력화된다 |
| `lib/referralTree.ts` | §6 |

**③ 관리자 (`web-admin-expert`)**

`api/admin/staking/products/route.ts` · `products/[id]/route.ts`(V2 + CP-5/CP-6 검증) ·
`positions/route.ts`(GET만 V2, **POST는 영구 제거**) · `stats/route.ts`(V2) · `run/route.ts`(V2) ·
`app/[locale]/admin/staking/page.tsx` · `utils/adminApi.ts`.

**④ 사용자 화면 (`web-wallet-expert`)**

| 파일 | 바꿔야 할 것 |
|---|---|
| `components/Staking.tsx` | **`availableFor(coin)`의 출처 교체.** LOCAL 권위 코인은 `GET /api/wallet/local-balance`의 `available`을 **그대로 사용**한다(홀드가 이미 반영돼 있으므로 `lockedPrincipal`을 다시 빼지 않는다 — 빼면 이중 차감). HUB 코인은 현행 유지. **두 값을 절대 합산하지 않는다**(X-2 / A-7 LA-1) |
| `utils/stakingApi.ts` | 타입 갱신 — `dailyRatePct`→`baseDailyRatePct`, `accruedInterest` 제거, `paidInterest`→`ledgeredYield`, `StakeStatus`에서 `'PAID'` 제거 |
| `staking/sheets/StakeSheet.tsx` · `PositionsSheet.tsx` · `YieldSheet.tsx` · `StakedSummaryCard.tsx` · `InlineNotices.tsx` · `renewalCopy.ts` | 타입·필드 추종. StakeSheet의 `fullInterest(...)` 계약 표기는 `baseDailyRatePct` 기준으로 |
| `components/Wallet.tsx` | **검증 항목** — LOCAL 권위 코인에 대해 `stakedRows()` 합성 행이 생성되지 않는지 확인(A-7 LB-C1 / AC-A7-06). 원금은 그룹 2의 홀드로 이미 표시된다 |

**⑤ 건드리지 않는 것 (명시)**

- `lib/deepCoreProgress.ts` — **이미 V2다.** 이번 컷오버에서 **한 줄도 바꾸지 않는다.**
- `lib/deepCoreProgressMath.ts` + `deepCoreProgressMath.test.ts` — DC-2/AC-A6-1. **테스트가 인수 기준이며
  이 컷오버로 단 하나도 실패해서는 안 된다.**
- `lib/localLedger.ts` · `coinAuthority.ts` · `withdrawalOnchain.ts` · `onchain/*` — V2-CORE 완료분. 호출만 한다.
- `lib/compensation/*` — 별개 시스템. 스테이킹 테이블 의존 0건(rev04 §2.1 확인 승계).

---

## 6. 요청 3 — 레퍼럴 등 연동 기능의 영향

### 6.1 (P-28) 레퍼럴 — 조용한 0 회귀

`referralTree.getDownline`은 재귀 CTE 안에서 **원시 SQL로 v1 테이블을 직접 읽는다**
(`referralTree.ts:33-41`):

```
SUM(p.principal)                              FROM "StakePosition" WHERE status='ACTIVE'  → activeStake
SUM(p.principal * p."dailyRatePct" / 100)     FROM "StakePosition" WHERE status='ACTIVE'  → dailyInterest
```

이 두 값이 `referralBonusMath.computeBonus()`의 **전 입력**이다(대·소실적, 유니레벨 부스트, 자격 판정
`MIN_QUALIFY`). 컷오버 후 V2로 포지션이 쌓이면 이 쿼리는 **에러 없이 0을 반환**하고, 그 결과:

- `ReferralBonusPayout` 행이 생성되지 않는다(`total > 0` 조건에서 걸러짐) → 커미션 **전액 미지급**
- `/api/referral` · `/api/referral/earnings` · `/api/admin/referral` 화면의 라인 볼륨이 **전부 0**
- **아무 예외도 발생하지 않으므로 QA가 "정상"으로 판정할 수 있다**

> **요구 CP-8 (필수).** `getDownline`의 두 서브쿼리를 `"StakePositionV2"` + `"baseDailyRatePct"`로
> 이설한다. 담당 `web-shared-expert`, 단계 **CUT-5**.
> **인수 기준:** 픽스처로 V2 포지션 N건을 만든 뒤 `activeStake`/`dailyInterest`가 기대값과 일치할 것.
> **0을 반환하는 것이 정상 결과인 상태(포지션 0건)와 회귀(쿼리가 틀린 테이블을 봄)를 구분하는
> 테스트여야 한다** — 이 둘을 구분하지 못하는 테스트는 이 결함을 못 잡는다.
>
> **연기 항목(V2-BAND).** 밴드 보너스(`bonusAmount`)가 레퍼럴 실적에 산입되는가는 **미결정**이며
> V2-CORE에서는 항상 `"0"`이라 문제가 되지 않는다. `dailyInterest`가 `baseDailyRatePct`만 쓴다는
> 사실을 코드 주석에 남겨 둔다.

### 6.2 레퍼럴 커미션 실행 지점의 이설

`payReferralBonuses(now)`는 레거시 `runStakingSettlement()`의 **마지막 줄**에서 호출된다
(`stakingSettle.ts:199`). CUT-3에서 레거시 엔진을 끄면 **커미션 실행 자체가 사라진다.**

> **요구 CP-9 (필수).** `runStakingSettlementV2()`의 동일 위치(기초 이자 계상 **후**)로 호출을 이설한다.
> 멱등성은 `@@unique([userId, dayKey])` + `skipDuplicates`로 이미 보장되므로 두 엔진이 겹쳐 돌아도
> 이중 지급은 없다 — **그러나 겹쳐 돌리지 않는다**(CUT-3에서 두 플래그를 한 배포에서 뒤집는다,
> A-4 §3.6이 두 플래그를 분리한 이유).

### 6.3 레퍼럴을 켜는 것은 별개의 결정이다

rev04 R-1: `REFERRAL_BONUS_ENABLED`는 **PoR-1″ 좌변(L4 `referralPayableTotal`)을 늘리는 발행 스위치**이며
클레임 킬 스위치와 동급으로 취급한다. 지금 OFF이고, **이 컷오버는 그것을 켜지 않는다.**
개정 04 §8-21(환경변수 → `PlatformSetting` + `AuditLog` 이설)은 **여전히 미결**이며 이 문서도 정하지 않는다.

### 6.4 그 밖의 결합 — 전수

| 대상 | 영향 | 조치 |
|---|---|---|
| **DEEP CORE**(게임) | **이미 V2.** 컷오버로 오히려 **정상화**된다 — 지금은 게임이 읽는 테이블에 아무도 쓰지 않는 상태다 | 변경 없음. `game-planner`가 `renewedFromPositionId` 챕터 연속성이 V2 갱신 경로에서 보존되는지만 확인 |
| **출금(HUB 레일)** | `lockedPrincipalByCoin`이 허브 가용액을 줄인다. V2 이설 시 **LOCAL 코인은 이 함수를 쓰지 않아야** 한다(홀드가 이미 `available`에 반영) | `web-shared-expert`, CUT-1 |
| **출금(LOCAL 레일)** | 영향 없음 — `placeHold(WITHDRAWAL_PENDING)`과 `STAKE_PRINCIPAL_LOCK`은 같은 `available` 계산을 공유한다. **다만 두 홀드가 같은 잔고를 두고 경합**하므로, 스테이킹 후 출금 시도는 정상적으로 거부된다(의도된 동작) | 변경 없음. QA 시나리오에 포함 |
| **PoR-1″ / 준비금 대시보드** | 컷오버로 좌변 L1·L2·`activeUserFundedPrincipalTotal`·`stakePrincipalHoldTotal`이 **비로소 실제 값을 갖는다.** 첫 포지션 직후 INV-P5가 성립하는지가 최초의 진짜 검증 | `qa-lead` 인수 기준 |
| **보상 플랜(compensation)** | 결합 없음(rev04 §2.1 — Prisma 모델 0건) | 변경 없음 |
| **이메일**(만기 리마인더·갱신 결과) | 레거시 정산의 Pass 2/3에 있다. V2 정산으로 이설 필요 | `web-shared-expert`, CUT-3 |
| **관리자 부채/준비금 화면(A-8)** | 데이터 계약 변화 없음(이미 V2 기준) | 변경 없음 |

---

## 7. 요청 4 — 담당자 배정

| # | 작업 | 담당 | 단계 | 선행 |
|---|------|------|------|------|
| **T-1** | **CS-1′/CS-1″ 봉쇄** — 그랜트·v1 체결 라우트 fail-closed, 시드 스크립트 제거 | `web-shared-expert`(라우트) + `web-admin-expert`(그랜트 폼 제거) | CUT-0 | — |
| **T-2** | **CS-2′ 프로덕션 재조회** | `prisma-db-expert` | CUT-0 | — |
| **T-3** | **`lib/stakingV2.ts` 신설** — A-4 §9 계약 4종 + SETTLE-1/2 + CP-2/CP-3 | `web-shared-expert` | CUT-1 | T-2 |
| **T-4** | **CUT-1 보안 리뷰** — 홀드/트랜잭션 경계, 만기 해제 누락 경로, 정원 경합 | `wallet-security-expert` | CUT-1 | T-3 |
| **T-5** | **관리자 상품 CRUD V2 + CP-5/CP-6 검증 + 그랜트 제거 확정** | `web-admin-expert` | CUT-2 | T-3 |
| **T-6** | **정산 엔진 교체 + 워커 플래그 + 레퍼럴 호출 이설 + 이메일 이설** | `web-shared-expert` | CUT-3 | T-3, T-5 |
| **T-7** | **사용자 API V2 이설** | `web-shared-expert` | CUT-4 | T-6 |
| **T-8** | **S-STAKE v2 화면·카피 FRD** — §7.1 참조 | `product-planner` | CUT-4 선행 | T-3 |
| **T-9** | **화면 이설** — `Staking.tsx` 가용액 출처, 시트·타입, `Wallet.tsx` LB-C1 검증 | `web-wallet-expert` | CUT-4 | T-7, T-8 |
| **T-10** | **레퍼럴 SQL 이설** | `web-shared-expert` | CUT-5 | T-7 |
| **T-11** | **컷오버 QA 계획·인수** — §7.2 | `qa-lead` | 전 단계 | — |
| **T-12** | **DEEP CORE 무영향 확인** — `renewedFromPositionId` 연속성, `deepCoreProgressMath.test.ts` 전량 통과 | `game-planner` | CUT-4 | T-7 |
| **T-13** | **단계별 배포·플래그 전환·CS-2′ 쿼리 실행** | `deploy-manager` | 전 단계 | 각 단계 QA 통과 |
| **T-14** | **디자인 토큰**(A-11, 미착수) | `ui-ux-designer` | 병렬 | — |

> **상품 생성은 시드 스크립트가 아니라 관리자 라우트로 한다(T-5).** 이유 셋:
> ① 시드에는 `AuditLog`도 관리자 신원도 없는데, **상품 파라미터는 이제 부채 사이징 결정**이므로
> 귀속 가능해야 한다. ② `seedStaking.ts`는 `status:'OPEN'` 기본에 `(coin,termDays)` 멱등이라
> **동결된 오퍼를 한 명령으로 되살릴 수 있는 모양**이다(N-47). ③ 관리자 라우트는 이미
> `STAKING_PRODUCT_CREATE` 감사 기록을 남긴다.

### 7.1 `product-planner`에게 넘기는 것 (T-8)

**A-7은 체결 흐름(S-STAKE)을 다루지 않는다** — A-7 §0의 범위표가 로컬 잔고 표시·클레임·출금·관리자
큐·입금 레일만 열거한다. 즉 **이번 컷오버가 만드는 화면 변화의 FRD가 아직 없다.** 필요한 것:

1. **가용 잔고의 출처가 바뀐 것에 대한 사용자 표현.** "허브 잔고"가 아니라 "BANA 잔고"이며,
   **두 숫자를 한 화면에서 합산하지 않는다**(LA-1).
2. **세 가지 빈 상태를 구분하는 카피**(A-7 LA-4 — *"없음"과 "멈춤"과 "당신이 채울 조건"은
   세 개의 다른 화면이다*):
   - ⓐ **개설된 상품이 0건**(초기 상태 — CP-5에 의해 의도된 상태)
   - ⓑ **상품은 있으나 BANA 잔고가 0**
   - ⓒ **T2_HALTED로 체결이 정지됨**(CP-2)
   > **ⓑ가 가장 어렵고 가장 중요하다.** 입금 레일이 `UNSUPPORTED`이므로 **"입금하세요"라고 쓸 수 없다.**
   > A-7 §7.2가 이미 판정한 원리를 그대로 적용한다 — *"조용히 사라지는 것이 사용자를 다른 경로로
   > 보내고, 그것이 실제 자금 사고를 만든다."* 정직한 사실 진술을 하되 **주소·QR·네트워크 선택기를
   > 어떤 조건에서도 렌더하지 않는다**(rev04 N-6 제약 ⓐⓑ 승계).
3. **CP-1 — 체결 확인 화면의 지급 비함의 문구**(6로케일).
4. **신규 에러 코드 → 표시 문구 매핑**: `STAKE_PATH_MIGRATING` / `STAKE_COIN_HALTED` /
   `STAKE_INSUFFICIENT_LOCAL_BALANCE` / `STAKE_PRODUCT_CLOSED` / `STAKE_PRODUCT_FULL`.

### 7.2 `qa-lead`에게 넘기는 것 (T-11) — 인수 기준

| ID | 인수 기준 |
|----|-----------|
| **AC-C1** | **체결 → 만기 → `available`이 체결 직전 값으로 정확히 복귀**(CP-3). 소수점 손실 0 |
| **AC-C2** | 체결 직후 `reconcileStakePrincipalHolds()`(INV-P5)가 **일치**를 반환. 홀드 없이 생성된 포지션이 있으면 **불일치로 검출**되는지도 함께 |
| **AC-C3** | `Σ(모든 ACTIVE 홀드) ≤ localLedgerBalanceTotal`(INV-P6) 유지 |
| **AC-C4** | 동일 사용자의 동시 체결 2건이 **가용액을 초과해 둘 다 성공하지 않는다**(advisory lock + `placeHold`의 행 잠금) |
| **AC-C5** | 정원 초과 동시 체결이 `STAKE_PRODUCT_FULL`로 직렬화된다 |
| **AC-C6** | `authorityAlertStage = T2_HALTED`에서 **체결이 403으로 거부**된다(CP-2). T1_WARNING에서는 관리자 오버라이드 없이 거부 |
| **AC-C7** | 정산 2회 연속 실행이 **이자를 이중 계상하지 않는다**(`@@unique([positionId,dayIndex])` + 증분) |
| **AC-C8** | `ledgeredYield` == `Σ StakeYieldLedgerEntry.amount`, `UserCoinYieldSummary.ledgeredYieldTotal` == 사용자×코인 합 (재합산 대사) |
| **AC-C9** | `deepCoreProgressMath.test.ts` **전량 통과, 파일 무수정**(DC-2 / AC-A6-1) |
| **AC-C10** | 레퍼럴 `activeStake`/`dailyInterest`가 V2 포지션을 반영(CP-8). **포지션 0건일 때의 0과 회귀로 인한 0이 구분됨** |
| **AC-C11** | 클레임 경로는 **여전히 차단**된다 — `stakingClaimEnabled=false` 및 PoR `NO_RESERVE_BASIS`. 이 컷오버가 클레임을 열지 않았음을 테스트로 고정 |
| **AC-C12** | `maxBonusPctOfBase != "0"` 상품 생성이 **거부**된다(V2-BAND 게이트) |
| **AC-C13** | 그랜트 라우트가 **어떤 입력으로도 포지션을 만들지 않는다**(CS-1′ / G-E) |

---

## 8. 마스터에게 남기는 확인 질문

기존 **Q-M3 · Q-M5 · Q-M6은 그대로 미회신**이며 유효하다. 아래 셋을 추가한다.

**Q-M7 (신설 · 최상위 — 이것이 없으면 컷오버를 끝내도 체결은 0건입니다)**
**사용자는 BANA를 어떻게 손에 넣습니까?**
*로컬 원장에 잔고를 넣는 코드 경로가 지금 이 저장소에 **하나도 없습니다**(N-41/N-42). 입금 레일은
`UNSUPPORTED`, 클레임 라우트는 미존재, 레퍼럴은 OFF, 관리자 조정 라우트는 없습니다. 따라서
`placeHold`가 전원에게 실패하며, **스테이킹 경로를 V2에 연결해도 에러 메시지만 바뀝니다.**
셋 중 하나를 정해 주십시오.*

- **(가) 입금 레일을 먼저 만든다** → **Q-M5 회신이 선행**입니다(D-C 수동 해시 / D-B2 입금 컨트랙트).
  가장 정공법이지만 가장 오래 걸립니다.
- **(나) 관리자 크레딧 표면을 만든다**(`ADMIN_ADJUSTMENT_CREDIT`) → 라이브러리 층은 이미 존재하고
  감사 기록도 강제됩니다. **다만 이 사유 코드는 설계상 PoR 게이트를 우회합니다**
  (`ISSUANCE_CREDIT_REASON_CODES`에서 의도적으로 제외 — 수동 정정이 자동 게이트에 막히면 안 되므로).
  즉 **"준비금 검사를 받지 않는 잔고 생성 버튼"** 입니다. 만든다면 **4-eyes 승인 + 1회/일일 한도 +
  `wallet-security-expert` 필수 리뷰**를 전제 조건으로 붙일 것을 권고합니다.
- **(다) 지금은 아무도 스테이킹하지 않아도 된다** → 컷오버는 **경로를 올바른 스키마에 연결하는 것**으로
  완료하고, 실제 오퍼 개시는 (가) 완료 시점으로 미룹니다. **PM 권고는 (다) + (가)입니다** —
  §4.4의 "상품은 만들되 `CLOSED`" 설계가 정확히 이 답을 위한 것입니다.
  (내부 E2E 검증용으로 소액 1건이 필요하면 (나)를 **한도·감사 조건 하에 검증 목적으로만** 씁니다.)

**Q-M8 (신설) — 초기 상품의 이율과 정원**
**5개 상품의 `baseDailyRatePct`와 `capacity`를 확정해 주십시오.**
*기존 값을 승계하지 않는 이유는 §4.1입니다 — 360일 1.3%/일은 **원금의 468%**이고, 5건 모두
`capacity`가 `null`(무제한)이며, 시드 파일 자신이 360일 이율을 "placeholder (TBD)"라고 적고 있습니다.
**생성 시점에 준비금 게이트가 없으므로, 이 두 값이 이 시스템의 유일한 부채 상한입니다.**
사이징 식은 단순합니다:*

```
상품별 최대 이자 부채 = capacity × (baseDailyRatePct / 100) × termDays
Σ(전 상품) ≤ 온체인 BANA 보유량 × 안전계수      ← 우변이 Q-M3의 답입니다
```

*따라서 **Q-M3 회신이 Q-M8의 선행**입니다. Q-M3 없이 정원을 정하면 그것은 숫자를 고른 것이지
사이징이 아닙니다.*

**Q-M9 (신설 · 경량) — 1차 개설 기간 범위**
**1차 개설을 10 / 30 / 90일 3종으로 한정하고 180 / 360일은 G-1‴ 이후로 미뤄도 되겠습니까?**
*정기 이자에는 중도 해지가 없으므로 계약 기간이 곧 **되돌리기 지평**입니다. 클레임 레일이 아직
한 번도 자금을 실어 나른 적이 없는 상태에서 360일 계약을 받으면, 문제가 발견돼도 1년치를 되돌릴 수
없습니다. 90일 상한은 `AUTO_RENEW_MAX_TERM_DAYS`와도 일치합니다. **PM 권고: 3종 한정.***

---

## 9. 이 문서가 승인하지 않는 것 (명시)

- **상품 개설 승인이 아니다.** CP-5는 전부 `CLOSED` 생성이고, 개설은 CP-6 + Q-M8 회신 후의 별도 액션이다.
- **첫 포지션 체결 승인이 아니다.** Q-M7 미회신 — 잔고를 만드는 경로 자체가 없다.
- **클레임 활성화 승인이 아니다.** `stakingClaimEnabled=false` 유지, Q-M3 미회신, PoR-G1이
  통제 주소 0건 상태를 계속 차단한다. **AC-C11이 이것을 테스트로 고정한다.**
- **관리자 크레딧 표면 구축 승인이 아니다.** Q-M7 (나)는 **선택지 제시이지 착수 승인이 아니다.**
- **V2-BAND 승인이 아니다.** `maxBonusPctOfBase`는 전 상품 `"0"`이고 라우트가 강제한다.
- **구 테이블 DROP 승인이 아니다.** CUT-6은 이 문서의 범위 밖이며 소킹 이후 별도 결정이다.
- **그랜트 기능의 부활이 아니다.** CS-1′는 rev04 G-E를 v1 라우트에 소급 적용하는 것이며,
  개정 01 §6의 그랜트 설계는 V2-BAND/후속 트랙으로 이연된 상태 그대로다.

## 10. 남은 미해결 질문 (개정 05 신규)

개정 01 §16, 개정 02 §10, 개정 03 §11, 개정 04 §8은 그대로 유효하다. 아래를 추가한다.

23. **사용자당 총 노출 상한을 둘 것인가.** 상품별 `capacity`는 총량을 막지만 **한 사용자가 정원을
    독식하는 것**은 막지 않는다. 개정 01 L-3(노출 상한)은 V2-BAND로 분류됐으나, 그 근거는 밴드
    보너스였다. 비밴드에서도 같은 질문이 성립한다 — **미결. 첫 개설 전에 `pm` 재검토.**
24. **`StakingProductV2.status`의 스키마 기본값이 `OPEN`이다.** CP-5는 라우트 층에서 `CLOSED`를
    강제하지만, 개정 01 §8.6("마이그레이션 적용만으로 어떤 부채도 발생하지 않는다")의 정신에 비추면
    기본값 자체가 `CLOSED`인 편이 옳다. 행이 0건이므로 값싸다 — `prisma-db-expert`가 다음 마이그레이션
    창에서 처리할지 결정한다. **라우트 강제만으로도 요구는 충족된다.**
25. **V2 정산 워커의 배치 발행에 PoR-G2의 `amount` 인자를 어떻게 넘길 것인가**(개정 04 §8-22 승계).
    정산은 게이트를 타지 않으므로 V2-CORE에서는 무해하나, **클레임을 켜는 시점에 이 질문이 되살아난다.**
    PM 의견 유지: **배치 총액 기준.**
26. **CUT-4 이후 v1 `StakePosition`/`StakingPayout`을 읽는 코드가 0개임을 어떻게 상시 보장하는가.**
    `code-compliance-checker`의 탐지 규칙으로 등재하는 것이 CUT-6(DROP)까지의 안전장치가 된다.

---

*선행: `staking-yield-system-v2-INDEX.md` → 개정 01 → 02 → 03 → 04 → A-2~A-8 ·
후속: `product-planner` S-STAKE v2 FRD(T-8) · `qa-lead` 컷오버 QA 계획(T-11) · A-11 시각 설계*
