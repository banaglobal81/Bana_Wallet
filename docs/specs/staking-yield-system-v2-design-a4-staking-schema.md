# 설계 문서 A-4 — v2 스테이킹 스키마(상품·포지션·정산 원장) Prisma 스키마 설계

> 작성: `prisma-db-expert` · 2026-08-10
> **근거 문서(읽은 순서):** `staking-yield-system-v2-INDEX.md` →
> `staking-yield-system-v2-prd.md`(개정 01, 특히 §3 밴드 모델·§6 그랜트·§8 데이터 모델 요구) →
> `staking-yield-system-v2-prd-rev02-balance-authority.md`(개정 02, 모델 C·PoR-1) →
> `staking-yield-system-v2-prd-rev03-rebuild-and-exclusivity.md`(개정 03 — **최신·최우선**.
> §3.4 PoR-1′, §4.4 클레임 축소, §5 전면 재구축 판정 + DC-1(§5.3), §7.2 A-4 작업 정의 —
> **이 문서가 답하는 항목**) →
> `staking-yield-system-v2-design-a2-balance-authority.md`(A-2 산출물 — `balanceAuthority`,
> `getCoinAuthority()`, `assertIssuanceAllowed()`) →
> `staking-yield-system-v2-design-a3-local-ledger.md`(A-3 산출물 — `UserCoinBalance`,
> `LocalLedgerEntry`, `LocalBalanceHold`, `PlatformControlledAddress`, `ReserveVerificationRun`,
> `creditLocalLedger`/`placeHold`/`executeHold`. **이 문서는 A-2·A-3와 정합해야 한다는 전제로
> 작성했다** — 특히 A-3의 `STAKING_CLAIM`/`GRANT_PRINCIPAL_CREDIT` 사유 코드와
> `STAKE_PRINCIPAL_LOCK` 홀드 사유는 A-3가 이미 이 문서를 위해 예약해 둔 자리다) →
> 코드 실측: `web/src/lib/deepCoreProgress.ts`(44-75행), `deepCoreProgressMath.ts`(전체),
> `web/prisma/schema.prisma`(234-368행 — 현행 `StakingProduct`/`StakePosition`/`StakingPayout`/
> `ReferralBonusPayout`), `web/src/lib/stakingSettle.ts`(F-C 결함 실측),
> `web/src/lib/stakingMath.ts`, `web/src/lib/stakingRenew.ts`(`'PAID'` 상태 미사용 확인)
>
> **지위: 설계 문서다. 구현 지시서가 아니다.** rev03 §7.2가 명시한 3조건
> (① 이 문서의 마스터 승인 ② 모든 신규 필드 기본값 "꺼짐"/0 ③ 로컬 원장에 0이 아닌 값을
> 쓰는 코드 경로 미병합) **전부가 충족되기 전까지 어떤 마이그레이션도 실행하지 않는다.**
> `prisma migrate dev`/`deploy` 이번 세션 미실행(§8). `prisma db push`는 절대 금지
> (CLAUDE.md 규칙 7, 항상). 아래 스키마 조각은 **개념 초안**이며 `web/prisma/schema.prisma`에
> 아직 반영되지 않았다. **기존 `StakingProduct`/`StakePosition`/`StakingPayout` 테이블은
> 이 문서에서 손대지 않는다 — DROP 포함, rev03 §5.4의 3단계 컷오버(추가→코드 전환→정리) 중
> 첫 단계조차 아직이다.**

---

## 0. 세션 시작 시 확인 (CLAUDE.md 규칙 7 — 신규 스키마 작업 전 상태 확인)

`migrate status`만 실행(`migrate deploy`/`db push` 없음):

- 로컬(`bana_wallet_dev`): 26개 마이그레이션, **up to date**.
- 프로덕션(Railway, `.env.production.local` 공개 프록시 URL): 26개 마이그레이션, **up to date**.
- **드리프트 없음.** A-2/A-3 세션 종료 시점과 동일 — 그 사이 아무 마이그레이션도 실행되지 않았다.

---

## 1. 이 문서가 다루는 범위 (rev03 §7.2 A-4)

> *"v2 스테이킹 스키마 설계(상품·포지션·정산원장) — DC-1 읽기 계약 보존 명시"*
> 담당: `prisma-db-expert` · 선행: A-3

**이 문서가 만드는 것:**
- `StakingProductV2` — 밴드폭 0(비밴드)과 밴드 상품이 **동일한 표현**을 쓰는 상품 모델
- `StakePositionV2` — 체결 시 밴드 스냅샷(Q-1/A1′) + 명시적 `fundingSource`(G-A) + A-3의
  `LocalBalanceHold`/`STAKE_PRINCIPAL_LOCK`으로의 연결점
- `StakeYieldLedgerEntry` — `StakingPayout`의 정산 원장 역할 승계, **증분 기록**으로 F-C(rev01
  §5.3/rev03 P-11 — `perDay × dueDays` 재계산 결함) 재발 방지
- `UserCoinYieldSummary` — 사용자×코인 단위 미청구/클레임 완료 누계 캐시(A-3의
  `UserCoinBalance`와 같은 캐시-증거 분리 원칙)
- 클레임 함수 계약 — **내부 DB 트랜잭션**(rev03 §4.4)이 A-3의 `creditLocalLedger`를
  `STAKING_CLAIM` 사유 코드로 호출하는 정확한 지점
- DC-1 읽기 계약 매핑표 — 게임이 오늘 읽는 13개 필드 하나하나가 새 스키마 어디서 오는지
- A-3의 `ReserveVerificationRun`에 남겨진 두 개의 `null` 필드
  (`activeUserFundedPrincipalTotal`/`unclaimedLedgeredInterestTotal`)를 채우는 쿼리

**이 문서가 만들지 않는 것 (명시적으로 다음 작업으로 미룸):**
- **예약 풀(L-4, rev01 §7.2/§8.5 S-1~S-4)** — rev03 §6.3이 이를 **V2-BAND 전용**으로 분류했다
  (H-1 미해소). `maxBonusPctOfBase`가 존재해도 0이 아닌 값을 체결하는 순간 예약 풀이
  필요해지지만, **그 상품 개설 자체가 아직 허용되지 않는다**(§13.1 P-4 승계·rev03 §8.3 명시
  금지 ④). 이 문서는 예약 풀이 얹힐 자리(`StakingProductV2`/`StakePositionV2`의 밴드 필드)만
  만든다.
- **밴드 정산 수식의 실제 MP 연동**(rev01 §3.1 `bonusPct(MP)` 계산) — V2-BAND 작업. 이 문서는
  정산 원장에 그 결과가 들어갈 열(`bonusAmount`/`mpSnapshot`/`bonusPctSnapshot`)만 예약한다.
- **출금 큐 확장(A-5)** — `WithdrawalRequest`에 `AWAITING_ONCHAIN`/`txHash` 등을 추가하는 작업.
  이 문서는 클레임이 끝나는 지점(로컬 잔고 크레딧)까지만 다루고, 그 잔고를 출금하는 경로는
  다루지 않는다.
- **화면·API 라우트 구현** — `product-planner`(A-7)·`web-shared-expert` 소관.
- **정산 워커의 실제 스케줄링 코드** — `worker/`(A-5/A-10 인접). 이 문서는 정산 트랜잭션의
  **계약**(무엇을 원자적으로 써야 하는가)만 규정한다.

---

## 2. 설계 원칙

1. **밴드폭 0은 밴드 모델의 특수 경우이지 별도 타입이 아니다 (rev01 D-1/A1′).** 비밴드 상품에
   별도 컬럼 집합을 두지 않는다. `maxBonusPctOfBase = "0"`가 "고정 이율"을 **표현**하며, 코드가
   "이 상품은 밴드가 아니다"라고 분기하지 않아도 정산식이 자동으로 `dayTotal == baseAmount`가
   되게 만든다(rev01 §3.1 수식 그대로).
2. **원장 누계는 재계산이 아니라 증분이다 (F-C의 구조적 해소, rev01 §5.3/rev03 P-11).**
   `StakeYieldLedgerEntry`를 삽입한 **바로 그 트랜잭션 안에서**, 방금 삽입한 행들의 금액 합만큼
   캐시(`StakePositionV2.ledgeredYield`, `UserCoinYieldSummary.ledgeredYieldTotal`)를 증가시킨다.
   `perDay × dueDays`류 재계산 코드가 존재할 자리를 스키마 차원에서 없앤다 — §5에서 이것이
   "재계산이 금지된다"가 아니라 "재계산할 필요가 애초에 없는 자료구조"임을 보인다.
3. **지급을 함의하는 이름을 쓰지 않는다 (rev01 §5.4).** `paidInterest`→`ledgeredYield`,
   `paidAt`(정산행)→`settledAt`, `paidAt`(포지션)→`fullySettledAt`. `accruedInterest`(읽기 시
   재계산되는 "지금 벌고 있는" 값)는 **컬럼 자체를 만들지 않는다**(R-U7).
4. **자금 출처는 명시 필드이지 유도값이 아니다 (G-A, A-2 X-1′와 같은 결의 원칙).**
   `fundingSource`는 `grantedByAdminId != null`에서 유도하지 않는다. `grantedByAdminId`는
   **감사·표시 전용**이며 어떤 잠금/가용액 계산 코드도 이 필드를 읽지 않는다(§6).
5. **그랜트는 락을 만들지 않는다 — 조건문이 아니라 부재로 막는다 (G-B/G-C의 구조적 실현).**
   `fundingSource = PLATFORM_GRANT`인 포지션은 A-3의 `LocalBalanceHold`를 **애초에 생성하지
   않는다.** "가용액 계산에서 그랜트를 제외한다"는 런타임 필터가 아니라, "제외할 대상이 홀드
   테이블에 존재하지 않는다"는 구조다(§6).
6. **캐시와 증거를 분리한다 (A-2/A-3과 동일 원칙 3연속 적용).** `StakeYieldLedgerEntry`/
   `LocalLedgerEntry`가 증거이고, `StakePositionV2.ledgeredYield`/`UserCoinYieldSummary`가 그
   증거의 캐시다. 캐시는 항상 증거의 재합산과 대사 가능해야 한다.
7. **불가지와 0을 구분한다 (A-3 원칙 5 승계).** 밴드 상품이 아직 없으므로 `mpSnapshot`은
   `null`(계산에 쓰이지 않았다는 뜻)이고 `bonusPctSnapshot`은 `"0"`(계산에 쓰였고 결과가
   0이라는 뜻)이다 — 이 둘을 섞지 않는다(rev01 §5.2가 이미 이 구분을 요구했다).
8. **신규 필드는 전부 안전한 기본값을 가진다.** `maxBonusPctOfBase="0"`, `stakingClaimEnabled=false`,
   `stakingV2WorkerEnabled=false` 등 — 이 스키마가 적용되는 순간 어떤 부채도, 어떤 정산도
   시작되지 않는다(A-2/A-3 원칙 6/7과 동일).

---

## 3. 스키마 설계 (개념 초안)

### 3.1 이름 충돌 처리 — `V2` 접미사는 임시다, 영구 이름이 아니다

기존 `StakingProduct`/`StakePosition`은 rev03 CS-3에 따라 **아직 삭제하지 않는다.** Prisma는
같은 이름의 모델을 두 개 가질 수 없으므로, 추가(additive) 단계에서는 새 모델에 `V2` 접미사를
붙인다: `StakingProductV2`, `StakePositionV2`. **`StakeYieldLedgerEntry`/`UserCoinYieldSummary`는
기존 이름과 충돌하지 않으므로 접미사를 붙이지 않는다.**

> **제안: 3단계 정리(cleanup) 마이그레이션(CS-3 3단계)에서 DROP과 RENAME을 한 마이그레이션
> 파일 안에서 함께 수행한다** — `DROP TABLE "StakePosition"; ALTER TABLE "StakePositionV2"
> RENAME TO "StakePosition";` 순서. 이것이 안전한 이유는 그 시점에는 프로덕션 데이터가 전부
> `V2` 테이블에만 존재하고(코드 컷오버가 이미 끝났으므로), RENAME은 Postgres에서 메타데이터만
> 바꾸는 값싼 연산이기 때문이다. **이 결정은 지금 실행하는 것이 아니라 3단계에서 실행할
> 계획을 지금 문서화하는 것**이다 — rev01 §5.4가 "정확한 컬럼명·마이그레이션 방식은
> `prisma-db-expert`가 결정한다"고 위임한 항목에 대한 답이다.

### 3.2 상품 — `StakingProductV2`

```prisma
model StakingProductV2 {
  id                String               @id @default(cuid())
  coin              String               // 오늘은 "BANA"뿐(N-6) — 하드코딩하지 않는다
  name              String
  termDays          Int

  // P-1 — 기준 일이율. 이름 변경: dailyRatePct → baseDailyRatePct (밴드 모델에서 "이율"이
  // 복수이므로 "기준"임을 명시해야 한다).
  baseDailyRatePct  String

  // P-1/P-2/D-1 — 최대 가산율. 기본값 "0" = 밴드폭 0 = 사실상 고정 이율(비밴드 상품의 표현).
  // 이 필드가 "0"이 아닌 상품을 생성하는 코드 경로는 V2-BAND 게이트(H-1, rev03 §6.3)
  // 해제 전까지 존재해서는 안 된다 — 그러나 스키마 자체는 그 미래를 위해 지금 이 형태다.
  maxBonusPctOfBase String               @default("0")

  // P-3 — maxBonusPctOfBase > 0인 상품은 non-null 강제(L-5, 먼지 포지션 방지). DB 제약이 아니라
  // 상품 생성/수정 라우트의 검증이다(N-5의 원인 컬럼과 동일한 nullable 형태를 유지해야
  // 비밴드 상품까지 minAmount를 강제로 요구하게 되는 회귀를 막을 수 있다).
  minAmount         String?
  maxAmount         String?
  capacity          String?

  status            StakingProductStatus @default(OPEN) // 기존 enum 재사용 — 의미 불변(OPEN/CLOSED)
  createdAt         DateTime             @default(now())
  updatedAt         DateTime             @updatedAt
  positions         StakePositionV2[]

  @@index([status])
  @@index([coin, status])
}
```

> **P-4(`maxBonusPctOfBase ≤ GAME_BONUS_MAX_PCT`, 코드 상수 10.00)는 DB 제약이 아니라 상품
> 생성 라우트의 검증이다** — Prisma는 크로스컬럼/상수 CHECK 제약을 선언적으로 표현할 수 없다.
> `web-shared-expert`가 라우트 계층에서 강제한다(§9에 인터페이스 명시).

### 3.3 포지션 — `StakePositionV2`

```prisma
// G-A — 명시 필드. grantedByAdminId에서 유도하지 않는다(원칙 4).
// A-3 §6-2가 제안한 명칭 변경(USER_HUB → USER_BALANCE)을 채택한다 — LOCAL 권위 코인에서는
// "허브"라는 이름이 더 이상 정확하지 않다.
enum PositionFundingSource {
  USER_BALANCE    // 원금이 사용자 자신의 잔고에서 왔다. HUB 권위 코인이면 니아 허브 잔고,
                  // LOCAL 권위 코인이면 A-3 LocalBalanceHold(STAKE_PRINCIPAL_LOCK)로 락.
  PLATFORM_GRANT  // 원금이 플랫폼이 부여한 명목 포지션이다. 어떤 권위의 코인이든, 사용자의
                  // 실제 잔고(허브든 로컬이든)에서 어떤 것도 락되지 않는다(§6).
}

// rev03 재구축 — 'PAID' 상태 없음. 실측(stakingRenew.ts 전수 grep) 결과 기존
// StakePositionStatus.PAID는 **한 번도 대입되지 않는 값**이었다(matureOrRenewPosition은
// 항상 'MATURED'로만 전이한다) — 죽은 상태값을 승계하지 않는다.
enum StakePositionV2Status {
  ACTIVE
  MATURED
}

model StakePositionV2 {
  id                String                 @id @default(cuid())
  userId            String                 // BANA DB user id (세션 도출)
  email             String                 // denormalized, 관리자 화면 관례 승계
  // HUB 권위 코인의 포지션이 미래에 생기면 hub payout에 필요. LOCAL 전용(BANA)인 오늘은 미사용.
  niaUserId         String?
  productId         String
  product           StakingProductV2       @relation(fields: [productId], references: [id])
  coin              String

  principal         String                 // canonical decimal string

  // --- 밴드 스냅샷 (Q-1, A1′) — 체결 시 1회 고정. 이후 상품이 바뀌어도 재조회하지 않는다 ---
  baseDailyRatePct  String
  maxBonusPctOfBase String                 @default("0")
  termDays          Int

  startAt           DateTime               @default(now())
  maturityAt        DateTime
  status            StakePositionV2Status  @default(ACTIVE)

  // --- 자금 출처 (G-A, 원칙 4/5) ---
  fundingSource     PositionFundingSource
  grantedByAdminId  String?                // 감사·표시 전용. 잠금/가용액 로직은 이 필드를 읽지 않는다(§6)

  // A-3 LocalBalanceHold(STAKE_PRINCIPAL_LOCK)로의 느슨한 참조. fundingSource=PLATFORM_GRANT면
  // 구조적으로 영구 null(§6) — "null이어야 한다"는 검증 로직이 아니라 "채울 코드가 아예
  // 호출되지 않는다"는 사실이다. HUB 권위 코인의 USER_BALANCE 포지션도 null(그 경우 락은
  // 오늘처럼 lockedPrincipalByCoin류 합산 쿼리로 표현되지, A-3 홀드로 표현되지 않는다 — A-3는
  // LOCAL 전용, §6).
  principalHoldId   String?                @unique

  // --- 정산 원장 캐시 (F-C 해소, 원칙 2/6) ---
  // Σ StakeYieldLedgerEntry.amount(이 포지션). 증분으로만 갱신 — 재계산 금지(§5).
  ledgeredYield     String                 @default("0")
  daysPaid          Int                    @default(0)
  lastSettledAt     DateTime?              // 구 lastAccrualAt 대체. "accrual"(실시간 계산) 개념 자체가 없다
  fullySettledAt    DateTime?              // 구 포지션-레벨 paidAt 대체 — 이 포지션의 전 기간이 정산 완료된 시각

  createdAt         DateTime               @default(now())

  // --- 그랜트 원금 지급 (H-2, 미결정 정책) ---
  // 예약 컬럼. H-2가 a(그랜트 원금도 클레임 대상)로 결정되기 전까지 이 컬럼에 값을 쓰는 코드는
  // 존재해서는 안 된다. 결정되면: 정확히 1회, LocalLedgerEntry를
  // reasonCode=GRANT_PRINCIPAL_CREDIT(A-3가 이미 예약해 둔 사유 코드)로 크레딧하고 이 타임스탬프를
  // 찍는다. idempotency는 이 필드의 null 여부 자체로 충분하다(원자적 업데이트로 이중 지급 방지).
  grantPrincipalCreditedAt DateTime?

  payouts           StakeYieldLedgerEntry[]

  // --- 자동 갱신 (구조 불변 승계, rev03이 건드리지 않음) ---
  autoRenew               Boolean              @default(false)
  renewalStatus            StakeRenewalStatus   @default(NONE) // 기존 enum 재사용 — 의미 불변
  renewedIntoPositionId     String?              @unique
  renewedFromPositionId     String?
  renewalProcessedAt        DateTime?
  renewalAttempts           Int                  @default(0)
  renewalNotifiedAt         DateTime?
  maturityReminderSentAt    DateTime?

  renewedTo   StakePositionV2? @relation("StakePositionV2Renewal", fields: [renewedIntoPositionId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  renewedFrom StakePositionV2? @relation("StakePositionV2Renewal")

  @@index([userId, status])
  @@index([status])
  @@index([renewedFromPositionId])
  @@index([status, autoRenew, maturityAt])
  // 신규 — UserCoinYieldSummary 대사(§5) 및 ReserveVerificationRun 좌변 쿼리(§7)가 쓴다.
  @@index([userId, coin, status])
  @@index([coin, fundingSource, status])
}
```

> **자동 갱신(auto-renew) 시 밴드 스냅샷 재확정.** 갱신 포지션은 새 `StakePositionV2` 행이므로
> `baseDailyRatePct`/`maxBonusPctOfBase`/`termDays`를 **갱신 시점 상품의 현재 값**에서 다시
> 스냅샷한다(rev01 §5.2 갱신 로직과 동일 원리 — 오늘도 `dailyRatePct`를 재스냅샷하지, 원
> 포지션 값을 승계하지 않는다). `fundingSource`는 원 포지션에서 **그대로 승계**한다(그랜트
> 포지션이 자동 갱신되는 경로는 오늘도 막혀 있다 — `FAILED_GRANTED_POSITION`, 승계 불변).

### 3.4 정산 원장 — `StakeYieldLedgerEntry` (`StakingPayout` 역할 승계)

```prisma
model StakeYieldLedgerEntry {
  id               String          @id @default(cuid())
  positionId       String
  position         StakePositionV2 @relation(fields: [positionId], references: [id], onDelete: Cascade)
  userId           String
  coin             String
  dayIndex         Int             // 1-based, 포지션 term 내 일차 — R-3/DC-1 멱등성의 전부

  // R-1 — amount == baseAmount + bonusAmount는 앱 계층(decimal.js) 불변식이다. Prisma는 크로스컬럼
  // CHECK를 선언할 수 없으므로, 이 불변식의 상시 검증은 §7의 감사 쿼리 + qa-lead 단위 테스트가 맡는다.
  baseAmount       String
  bonusAmount      String          @default("0") // V2-CORE 동안 항상 "0"(포지션의 maxBonusPctOfBase가 "0")
  amount           String

  // R-2 — 원칙 7: null(계산에 안 쓰임) ≠ "0"(계산에 쓰였고 결과가 0). V2-CORE 동안 mpSnapshot은
  // 항상 null(밴드가 없으므로 MP를 조회조차 하지 않는다), bonusPctSnapshot은 항상 "0"(실제
  // 적용된 가산율이 0이라는 사실 자체를 기록).
  mpSnapshot       String?
  bonusPctSnapshot String          @default("0")

  settledAt        DateTime        @default(now()) // 구 paidAt 대체(원칙 3)

  @@unique([positionId, dayIndex])
  @@index([userId, coin])
  @@index([userId, settledAt])
}
```

### 3.5 사용자×코인 수익 요약 — `UserCoinYieldSummary` (신규)

```prisma
// A-3의 UserCoinBalance와 동일한 캐시/증거 분리(원칙 6)를 수익 원장에 적용한 것. 증거는
// StakeYieldLedgerEntry(ledgeredYieldTotal 쪽)와 LocalLedgerEntry WHERE reasonCode=STAKING_CLAIM
// (claimedYieldTotal 쪽) 두 곳에 나뉘어 있으므로, 이 캐시가 없으면 수익 요약 화면(rev01 R-U1)이
// 매 읽기마다 두 테이블을 조인·집계해야 한다.
model UserCoinYieldSummary {
  id                 String   @id @default(cuid())
  userId             String
  coin               String

  // Σ StakeYieldLedgerEntry.amount(userId, coin). 정산 트랜잭션이 증분으로만 갱신(§5) — F-C가
  // 여기서도 재발하지 않는다.
  ledgeredYieldTotal String   @default("0")
  // Σ LocalLedgerEntry.amount WHERE reasonCode='STAKING_CLAIM' (userId, coin). claimYield()
  // 트랜잭션 안에서만 증가(§6).
  claimedYieldTotal  String   @default("0")

  version            Int      @default(0) // A-3 UserCoinBalance.version과 같은 "공유 함수 우회" 감지기
  updatedAt          DateTime @updatedAt

  @@unique([userId, coin])
  @@index([coin])
}
```

> **C-9 불변식이 이 테이블 하나로 항상 참이 되는 이유.** `claimedYieldTotal`은 오직
> `claimYield()`(§6) 안에서, 그 시점의 `ledgeredYieldTotal − claimedYieldTotal`(즉 claimable)
> 만큼만 증가한다 — 절대 그보다 큰 값을 쓰지 않는다. 따라서 `claimedYieldTotal ≤
> ledgeredYieldTotal`은 **매 트랜잭션이 유지하는 불변식**이지, 사후 검증으로 발견하는 사실이
> 아니다. 플랫폼 전체 `SUM(LocalLedgerEntry WHERE reasonCode='STAKING_CLAIM') ==
> SUM(claimedYieldTotal)`도 같은 이유로 정의상 참이다(같은 트랜잭션에서 같은 값을 쓴다) —
> 그럼에도 §7의 대사 쿼리에 넣어 **회귀 감지용**으로 상시 검증한다(우회 경로가 생기면 이
> 등식이 깨진다).

### 3.6 `PlatformSetting` 확장

```prisma
model PlatformSetting {
  // ...기존 필드 전부 유지...

  // ─── 신규 (A-4) ─────────────────────────────────────────────────────
  // C-6 — 클레임 킬 스위치. 기본 비활성. "발행 마찰이 사라진"(개정 02 §4) 이 모델에서
  // 남은 몇 안 되는 브레이크(rev03 §4.4).
  stakingClaimEnabled            Boolean @default(false)

  // v2 정산 워커 on/off. 기존 stakingWorkerEnabled(구 워커, 구 테이블 대상)와 **의도적으로
  // 분리**한다 — 코드 컷오버(CS-3 2단계) 전까지 구 워커는 구 테이블을 계속 정산해야 하고,
  // v2 워커가 실수로 같이 켜지면 이중 정산 표면이 생긴다. 기본값 false로 두 워커가 절대
  // 동시에 프로덕션에서 켜지지 않도록 한다(§7.2 조건 ②).
  stakingV2WorkerEnabled         Boolean @default(false)
  stakingV2WorkerMode            String  @default("INTERVAL")
  stakingV2WorkerIntervalMinutes Int     @default(5)
  stakingV2WorkerDailyTime       String  @default("00:00")
}
```

---

## 4. 요구사항 ↔ 스키마 매핑표

| 요구 | 내용 요지 | 이 설계에서 |
|------|-----------|-------------|
| **rev01 D-1/A1′/§3.1** | 밴드폭 0 = 비밴드의 동일 표현. 체결 시 기준율+최대가산율 스냅샷 | `StakingProductV2.baseDailyRatePct/maxBonusPctOfBase`, `StakePositionV2` 동일 필드 스냅샷(§3.2/§3.3) |
| **rev01 P-1~P-4** | 기준/최대 분리, 기본값 0, minAmount 강제(밴드일 때), 상수 상한 검증 | `StakingProductV2`(§3.2). P-3/P-4는 앱 계층 검증(DB 제약 아님, 명시) |
| **rev01 Q-1~Q-4** | 체결 스냅샷, fundingSource 명시, 원장 누계 지급-비함의 이름 + 증분 유지, 클레임 완료 누계 별도 | `StakePositionV2`(§3.3) — Q-4의 "클레임 완료 누계"는 포지션이 아니라 `UserCoinYieldSummary`(§3.5)에 둔다(C-5: 클레임은 포지션 단위가 아니라 사용자×코인 단위이므로) |
| **rev01 R-1~R-4** | amount=base+bonus, mp/bonusPct 스냅샷 행 단위 기록·재계산 금지, unique(positionId,dayIndex) | `StakeYieldLedgerEntry`(§3.4) |
| **rev01 §5.3 F-C 해소** | `perDay × dueDays` 재계산 금지 → 증분 기록 | §5 정산 트랜잭션 계약. 캐시 필드는 삽입된 행의 합만큼만 증가 |
| **rev01 §5.4** | 지급 함의 이름 금지 | `ledgeredYield`/`settledAt`/`fullySettledAt`(§3.3/§3.4, 원칙 3) |
| **rev01 §5.5 / R-U7** | 실시간 재계산 "지금 벌고 있는" 표시 제거 | `accruedInterest`류 컬럼을 아예 만들지 않음 |
| **rev01 G-A~G-D** | fundingSource 명시, 그랜트가 가용액 감소 안 시킴, 불변식 테스트, 그랜트=밴드폭 0 | `PositionFundingSource`(§3.3), 구조적 실현은 §6, G-D는 상품 밴드와 무관하게 그랜트 생성 라우트가 항상 `maxBonusPctOfBase="0"`으로 스냅샷(앱 계층 강제) |
| **rev01 C-1~C-11(rev03 §4.4 재범위)** | 클레임 = 내부 DB 트랜잭션, 세션 userId, 사용자×코인 일괄, 킬 스위치, decimal.js, `claimedYield ≤ ledgeredYield` | §6 `claimYield()` 계약. C-3/C-4/C-10/C-11은 rev03에 따라 클레임에서 소멸(외부 호출 없음) — 출금 레일(A-5)의 몫 |
| **rev03 §3.4 PoR-1′ 좌변** | `activeUserFundedPrincipalTotal`/`unclaimedLedgeredInterestTotal`(A-3에서 null로 남김) | §7 — 이 문서가 정확한 쿼리로 채운다 |
| **rev03 §5.3 DC-1** | 13개 필드 읽기 계약 보존 | §8 전체 |
| **rev03 §5.4 CS-3** | 추가→코드 전환→정리 3단계, 구 테이블 미삭제 | §3.1 — `V2` 접미사로 공존, DROP은 이 문서 범위 밖 |
| **A-2 X-2 (합산 금지)** | 두 권위 잔고를 어디서도 합산하지 않음 | 이 스키마는 잔고를 갖지 않는다(`ledgeredYield`/`claimedYieldTotal`은 잔고가 아니라 수익 원장) — 합산 위험 자체가 없음. 단 §9에서 화면 계층에 재확인 |
| **A-3 §6-2 (fundingSource 재검토)** | `USER_HUB`→`USER_BALANCE` | 채택(§3.3) |
| **A-3 §6-4 (STAKE_PRINCIPAL_LOCK relatedId 대상)** | v2 포지션 id 확정 대기 | `StakePositionV2.id`로 확정(§6) |

---

## 5. 정산 트랜잭션 계약 — F-C의 구조적 해소

### 5.1 옛 결함의 정확한 형태 (실측, `stakingSettle.ts:74,83`)

```ts
const paidToDate = perDay.times(dueDays);           // ← 매 실행마다 "처음부터" 재계산
await prisma.stakePosition.update({
  data: { paidInterest: paidToDate.toFixed(), ... }, // ← 덮어쓰기
});
```

이 산식은 **일별 금액이 상수(`perDay`)라는 가정** 위에 서 있다. 밴드 모델에서는 MP가 오르면
`bonusAmount`가 날마다 달라지므로 이 재계산이 애초에 틀린 값을 만든다(rev01 §5.3).

### 5.2 신규 계약 — 삽입한 만큼만 더한다

> **요구 SETTLE-1 (신규, 필수).** 한 포지션의 하루치(또는 밀린 여러 날치) 정산은
> **① `StakeYieldLedgerEntry` 신규 행 insert, ② `StakePositionV2.ledgeredYield`/`daysPaid`/
> `lastSettledAt` 갱신, ③ `UserCoinYieldSummary.ledgeredYieldTotal` 갱신을 단일 DB 트랜잭션
> 안에서 원자적으로 수행한다.** 트랜잭션 시작 시 `StakePositionV2` 행을 `SELECT ... FOR UPDATE`로
> 잠가 동시 실행(워커 중복 기동 등)을 직렬화한다(A-3가 `UserCoinBalance`에 적용한 것과 동일 패턴).

```
// 의사코드 — 실제 구현은 web-shared-expert/워커 소유자가 확정
tx:
  position := SELECT StakePositionV2 WHERE id=positionId FOR UPDATE
  dueDays := daysElapsed(position.startAt, now, position.termDays)  // stakingMath.ts 그대로 재사용
  newDays := dueDays - position.daysPaid
  if newDays <= 0: return  // 이 포지션은 오늘 할 일 없음

  rows := []
  for d in (position.daysPaid+1 .. dueDays):
    baseAmount := dailyInterest(position.principal, position.baseDailyRatePct)  // 포지션당 상수(스냅샷)
    bonusAmount := "0"       // V2-CORE: maxBonusPctOfBase가 항상 "0"이므로 항상 0.
                              // V2-BAND(미착수): bonusPct(MP at day d) × baseAmount, 그 날의 MP를
                              // mpSnapshot에 함께 기록 — 이 문서는 그 계산을 구현하지 않는다.
    amount := baseAmount + bonusAmount  // decimal.js
    rows.push({ positionId, userId: position.userId, coin: position.coin, dayIndex: d,
                baseAmount, bonusAmount, amount, mpSnapshot: null, bonusPctSnapshot: "0", settledAt: now })

  insertMany(StakeYieldLedgerEntry, rows)  // FOR UPDATE로 이미 직렬화됐으므로 skipDuplicates 불필요
                                            // — @@unique([positionId,dayIndex])는 방어선으로 유지
  newRowsSum := Σ(row.amount for row in rows)   // ← 방금 실제로 쓴 값의 합. perDay × newDays가 아니다
                                                  //   (오늘은 우연히 같은 값이지만, 코드가 그 사실에
                                                  //   기대지 않는다 — V2-BAND에서 날마다 달라져도
                                                  //   이 로직은 고쳐 쓸 필요가 없다)

  update StakePositionV2 SET daysPaid=dueDays, ledgeredYield = position.ledgeredYield + newRowsSum,
         lastSettledAt = now, fullySettledAt = (dueDays >= termDays ? now : null)
  upsert UserCoinYieldSummary(userId, coin): ledgeredYieldTotal += newRowsSum
commit
```

> **왜 트랜잭션을 강제하는가 — 옛 코드에 없던 요구다.** 옛 코드는 `createMany` → `update`를
> 별도 문장으로 실행했다(같은 함수 안이지만 트랜잭션으로 묶이지 않았다). 재계산 방식은 이 틈에서
> 부분 실패가 나도 다음 실행이 처음부터 다시 계산해 **저절로 자가치유**됐다 — 그것이 F-C의
> 유일한 장점이었다. 증분 방식은 그 장점이 없다: `createMany`는 성공하고 `update`가 실패하면
> `ledgeredYield`가 실제보다 작게 멈춘다. **SETTLE-1의 단일 트랜잭션 요구가 이 장점의 상실을
> 메운다** — 부분 실패 자체가 발생하지 않으므로 자가치유가 필요 없어진다. 이 트레이드오프를
> 명시하지 않고 넘어가면 구현자가 "옛날처럼 나눠 써도 되겠지"라고 판단할 위험이 있다.

### 5.3 발행 게이트와의 연동 (A-2 `assertIssuanceAllowed`)

> **요구 SETTLE-2 (신규).** SETTLE-1의 트랜잭션 시작 전, 해당 코인에 대해 A-2의
> `assertIssuanceAllowed(coin)`를 호출한다. `T2_HALTED`면 이 포지션의 정산을 건너뛴다(에러가
> 아니라 스킵 — 다음 사이클에 재시도, 밀린 날짜는 해소 후 한꺼번에 따라잡는다).

이유: `ledgeredYield`의 증가는 rev02 PoR-1(§3.4 PoR-1′)의 **좌변을 늘리는 행위**이며, PoR-1′
정의 원문이 "이자 정산·그랜트 생성·레퍼럴 지급이 전부 이 검사를 통과해야 한다"고 명시했다.
**클레임(§6)은 이 목록에 없다** — 클레임은 좌변의 구성을 바꿀 뿐(미청구 이자 감소, 로컬 잔고
증가) 좌변 합계를 바꾸지 않는 **재분류**이기 때문이다(§6에서 다시 설명).

### 5.4 그랜트 생성도 발행이다

> **요구 SETTLE-3 (신규).** `fundingSource=PLATFORM_GRANT` 포지션 생성 트랜잭션도
> `assertIssuanceAllowed(coin)`를 호출한다 — 그랜트 원금은 (H-2-a가 채택되면) PoR-1′ 좌변의
> `grantPrincipalPayableTotal`에 직접 들어가는 신규 부채이기 때문이다(rev02 §4.4).

---

## 6. 클레임 — 내부 DB 트랜잭션 계약 (rev03 §4.4)

### 6.1 무엇이 사라지고 무엇이 남는가

rev03 §4.4 표를 이 스키마 기준으로 다시 쓴다.

| rev01 항목 | 이 설계에서 |
|---|---|
| C-1 (세션 userId) | 유효 — `claimYield()`는 이미 검증된 `userId`를 인자로 받는다(호출자 책임, CLAUDE.md 규칙 8) |
| C-2 (원자적 상태 전이) | **형태 변경.** `updateMany(...).count===1` 패턴이 아니라, **단일 DB 트랜잭션 + 행 잠금**이 원자성을 담당(§6.3) |
| C-3/C-4/C-10 (멱등키·모호 실패·대사 런북) | **소멸.** 외부 호출이 없다. §6.4가 이유를 설명 |
| C-5 (사용자×코인 일괄) | 유효 — `claimYield({userId, coin})`는 포지션이 아니라 사용자×코인 단위로만 존재한다(`UserCoinYieldSummary`가 그 단위의 유일한 테이블) |
| C-6 (킬 스위치, 기본 비활성) | 유효 — `PlatformSetting.stakingClaimEnabled`(§3.6) |
| C-7 (게임화 금지) | 유효 — DEEP CORE는 이 함수를 호출도, 이 함수가 만드는 어떤 행도 읽지 않는다(DC-1이 클레임과 무관함을 §8에서 확인) |
| C-8 (decimal.js) | 유효 |
| C-9 (불변식) | 유효 — §3.5에서 구조적으로 항상 참(트랜잭션이 만드는 성질이지 사후 검증 대상이 아니다) |
| C-11 (`PARTIAL` 금지, 1회 상한) | **소멸.** 부분 성공 개념이 없다(DB 트랜잭션은 전부 아니면 전무). 1회 상한(T-7)도 무의미 — 그 상한의 원 목적(허브 호출의 수동 대사 규모 제한)이 애초에 사라졌다 |

### 6.2 함수 계약

```
claimYield({ userId, coin }): Promise<{ claimedAmount: string }>
```

전제 조건(함수 진입 전 검증, 실패 시 즉시 거부):
1. `PlatformSetting.stakingClaimEnabled === true` (C-6)
2. `!PlatformSetting.maintenanceMode`
3. `getCoinAuthority(coin) === 'LOCAL'` — HUB 권위 코인에 이 함수를 호출하는 코드 경로는 없어야
   한다(오늘은 BANA만 LOCAL이므로 사실상 자동 충족되지만, 명시 검증을 코드에 남긴다 — A-2
   원칙 1과 같은 결).

단일 DB 트랜잭션(원자성의 전부, C-2 대체):

```
tx:
  summary := SELECT UserCoinYieldSummary WHERE (userId, coin) FOR UPDATE
             (없으면 { ledgeredYieldTotal: "0", claimedYieldTotal: "0" }로 취급 — insert는 아래서)
  claimable := Decimal(summary.ledgeredYieldTotal).minus(summary.claimedYieldTotal)  // C-9

  if claimable.lte(0):
    return { claimedAmount: "0" }   // no-op. 에러 아님 — 아래 §6.4의 재시도 안전성 근거

  // A-3 §4.2 계약 그대로 호출 — 같은 트랜잭션 컨텍스트 안에서
  entry := creditLocalLedger({
    userId, coin, amount: claimable.toFixed(),
    reasonCode: 'STAKING_CLAIM',
    idempotencyKey: null,   // §6.4에서 null인 이유 설명 — A-3 스키마가 이미 null을 허용
    relatedType: 'USER_COIN_YIELD_SUMMARY', relatedId: summary.id,
  })

  upsert summary: claimedYieldTotal += claimable.toFixed(), version += 1

commit
return { claimedAmount: claimable.toFixed() }
```

### 6.3 "포지션별 클레임을 만들지 않는다"(C-5)가 스키마에서 의미하는 것

`claimYield`는 **`StakePositionV2`나 `StakeYieldLedgerEntry`를 전혀 건드리지 않는다.** 오직
`UserCoinYieldSummary` + `LocalLedgerEntry`(A-3)만 갱신한다. 이것이 옛 결함(N-2, `paidInterest`를
포지션마다 따로 관리)과 클레임을 구조적으로 분리한다 — "이 포지션의 이자가 얼마나 클레임됐는가"라는
질문 자체가 이 스키마에 존재하지 않는다. 존재하는 것은 "이 사용자의 이 코인 전체 미청구 이자가
얼마인가"뿐이다(C-5 원문 그대로).

### 6.4 멱등키가 필요 없는 이유 — "고정 금액 이체"가 아니라 "현재 잔여분 수거"이기 때문이다

전형적인 결제 시스템의 멱등키는 "클라이언트가 X를 보냈는데 응답을 못 받아 다시 보낸다"를
방어한다. `claimYield`는 **금액을 클라이언트가 지정하지 않는다** — 항상 "지금 시점의 미청구
전액"을 계산해서 크레딧한다. 그래서:

- 사용자가 클레임 버튼을 두 번 눌러 두 요청이 도착하면: 첫 트랜잭션이 `summary` 행을 잠그고
  커밋한다. 두 번째 트랜잭션은 잠금 해제를 기다렸다가, 커밋된 새 `claimedYieldTotal`을 읽고
  `claimable = 0`을 계산해 **자연스럽게 no-op**한다.
- 네트워크 재시도도 동일하게 안전하다.

**따라서 `LocalLedgerEntry.idempotencyKey`를 `STAKING_CLAIM`에 대해 항상 `null`로 둔다** — A-3
스키마가 이미 이 경우를 예상해 설계했다(A-3 §2.2: "`ADMIN_ADJUSTMENT_*`는 자연스러운 멱등키가
없어 null 허용… Postgres는 NULL을 서로 다른 값으로 취급하므로 유니크 제약에 막히지 않는다" —
같은 이유가 `STAKING_CLAIM`에도 적용된다).

---

## 7. A-3 `ReserveVerificationRun`의 `null` 필드 해소

A-3 §2.6은 좌변 두 항목을 "A-4 의존"으로 `null` 남겨 뒀다. 이 문서가 정확한 쿼리를 제공한다.

```sql
-- activeUserFundedPrincipalTotal (coin 단위)
SELECT COALESCE(SUM(principal::numeric), 0)
FROM "StakePositionV2"
WHERE coin = $1 AND status = 'ACTIVE' AND "fundingSource" = 'USER_BALANCE';

-- unclaimedLedgeredInterestTotal (coin 단위)
SELECT COALESCE(SUM(("ledgeredYieldTotal"::numeric - "claimedYieldTotal"::numeric)), 0)
FROM "UserCoinYieldSummary"
WHERE coin = $1;
```

> **정밀도 주의.** 위는 개념 예시다. 실제 구현은 Postgres `numeric` 캐스팅이 아니라 애플리케이션
> 레이어에서 행을 읽어 `decimal.js`로 합산할 것을 권고한다(CLAUDE.md 규칙 2 — SQL 내 산술도
> "숫자 연산"의 일종으로 취급해 애플리케이션 계층에서 canonical string 처리를 하는 것이 이
> 코드베이스의 일관된 관례다).

`grantPrincipalPayableTotal`은 **여전히 `null`이다.** H-2가 미결정이기 때문이다(rev03 §7.3 B-c).
H-2-a가 채택되면 쿼리는:

```sql
SELECT COALESCE(SUM(principal::numeric), 0)
FROM "StakePositionV2"
WHERE coin = $1 AND "fundingSource" = 'PLATFORM_GRANT'
  AND status IN ('ACTIVE', 'MATURED') AND "grantPrincipalCreditedAt" IS NULL;
```

(이미 크레딧된 그랜트 원금은 좌변에서 빠진다 — 그 순간부터는 `UserCoinYieldSummary`가 아니라
`UserCoinBalance`/`LocalLedgerEntry`의 `GRANT_PRINCIPAL_CREDIT` 크레딧이 좌변의
"로컬 원장 잔고" 항으로 이미 반영되기 때문에, 여기서 다시 세면 이중 계상이다.)

---

## 8. DC-1 읽기 계약 보존 (rev03 §5.3, N-28 실측 기반)

### 8.1 정확한 의존 필드 — 매핑표

`deepCoreProgress.ts:44-75`가 읽는 것은 정확히 이 13개다. 하나하나 새 스키마의 출처를 명시한다.

| # | 게임이 오늘 읽는 것 | 출처 | 새 스키마에서 |
|---|---|---|---|
| 1 | `StakePosition.id` | 포지션 | `StakePositionV2.id` — 무변경 |
| 2 | `StakePosition.status` | 포지션 | `StakePositionV2.status` — **값 집합 축소**(`ACTIVE`\|`MATURED`\|`PAID` → `ACTIVE`\|`MATURED`). §8.2에서 안전함을 증명 |
| 3 | `StakePosition.startAt` | 포지션 | `StakePositionV2.startAt` — 무변경 |
| 4 | `StakePosition.maturityAt` | 포지션 | `StakePositionV2.maturityAt` — 무변경 |
| 5 | `StakePosition.termDays` | 포지션 | `StakePositionV2.termDays` — 무변경(스냅샷 의미도 동일) |
| 6 | `StakePosition.daysPaid` | 포지션 | `StakePositionV2.daysPaid` — 무변경. SETTLE-1이 여전히 이 필드를 정산 완료 일수로 유지 |
| 7 | `StakePosition.coin` | 포지션 | `StakePositionV2.coin` — 무변경 |
| 8 | `StakePosition.principal` | 포지션 | `StakePositionV2.principal` — 무변경 |
| 9 | `StakePosition.renewedFromPositionId` | 포지션 | `StakePositionV2.renewedFromPositionId` — 무변경 |
| 10 | `StakePosition.product.minAmount`(조인) | 포지션→상품 | `StakePositionV2.product.minAmount`(→`StakingProductV2`) — 무변경, 여전히 nullable |
| 11 | `StakingPayout.userId` | 정산행 | `StakeYieldLedgerEntry.userId` — 무변경 |
| 12 | `StakingPayout.positionId` | 정산행 | `StakeYieldLedgerEntry.positionId` — 무변경 |
| 13 | `StakingPayout.paidAt` | 정산행 | `StakeYieldLedgerEntry.settledAt` — **이름 변경**(원칙 3). 값의 의미(그 날 정산이 기록된 시각)는 동일 |
| — | `@@unique([positionId, dayIndex])`(암묵 의존 — DC-1이 명시하진 않지만 정산 자체의 멱등성이 이 계약 위에 있다) | 정산행 | `StakeYieldLedgerEntry`의 `@@unique([positionId, dayIndex])` — 무변경 |

### 8.2 상태값 집합 축소가 안전한 이유 (실측)

`deepCoreProgressMath.ts`가 `status`를 읽는 두 지점을 전수 확인했다:

```ts
if (p.status !== 'ACTIVE' && p.daysPaid >= p.termDays) { charterCompleteXpTotal += ...; }  // "ACTIVE가 아니다"만 검사
...
.filter((p) => p.status === 'ACTIVE' || p.maturityAt.getTime() > now.getTime() - TWENTY_FOUR_HOURS_MS)
...
recentlyMatured: p.status !== 'ACTIVE',
```

**세 지점 전부 `=== 'ACTIVE'` 또는 `!== 'ACTIVE'`만 검사하고, `'MATURED'`나 `'PAID'`라는 구체
문자열을 단 한 번도 비교하지 않는다.** 그리고 `stakingRenew.ts` 전수 grep 결과 `status: 'PAID'`를
대입하는 코드가 **0건**이다(§3.3 주석에 실측 근거 기재) — 즉 오늘도 `PAID`는 도달 불가능한
상태였다. **`StakePositionV2Status`에서 `PAID`를 제거해도 DC-1의 세 검사 지점 중 어느 것도
값이 달라지지 않는다.** 이것이 "값 집합 축소"가 계약 위반이 아니라 안전한 정리임을 보이는
실측 증거다.

### 8.3 DC-2 — 어댑터만 갱신, 순수 함수는 무변경

> `deepCoreProgressMath.ts`(`deriveDeepCoreState` + `deepCoreProgressMath.test.ts`)는 이 스키마
> 변경으로 **한 줄도 바뀌지 않는다.** 바뀌는 것은 `deepCoreProgress.ts`(I/O 래퍼) 하나뿐이며,
> 바뀌는 내용은:
> - `prisma.stakePosition.findMany` → `prisma.stakePositionV2.findMany`(select 절의 필드명은
>   §8.1 매핑표 그대로 — 열 이름은 동일하므로 select 절 자체는 무변경, 단 `paidAt` 조인 없음)
> - `prisma.stakingPayout.findMany` → `prisma.stakeYieldLedgerEntry.findMany`, select에서
>   `paidAt` → `settledAt`으로, 반환 객체 조립 시 `{ positionId, paidAt: row.settledAt }`처럼
>   **어댑터 레이어에서 옛 필드명으로 재포장**하거나, 혹은 `DeepCorePayoutRow` 타입 자체를
>   `{ positionId, settledAt }`로 바꾸고 `deriveDeepCoreState` 내부의 `p.paidAt` 참조 두 곳을
>   `p.settledAt`으로 바꾼다 — **어느 쪽을 택할지는 이 문서가 정하지 않는다**(A-6, `game-planner`
>   → `game-developer` 소관, rev03 §7.2 A-6). 이 문서는 새 스키마가 그 선택을 막지 않는다는
>   것만 보장한다.
> - **`deepCoreProgressMath.test.ts`의 기존 단위 테스트는 스키마 교체와 무관하게 전부 그대로
>   통과해야 한다** — DC-2가 요구하는 인수 기준이며, 어댑터 갱신자가 이 테스트를 건드리지
>   않고 통과시키지 못하면 그것은 계약 위반이다.

### 8.4 DC-3/DC-4 — 재확인

- **DC-3(원금 비례 성장 금지).** `relativeSize`는 `termDays / maxTermDays`로만 계산되고
  `principal`을 읽지 않는다(§8.1 #8 — `principal`은 `wells` 표시용으로만 전달된다). 이 스키마도
  `principal`을 그대로 문자열로 보존할 뿐, 어떤 파생값도 만들지 않는다 — DC-3를 느슨하게 할
  여지가 없다.
- **DC-4(빈 상태 렌더).** `positions.length === 0`이면 `S0_NOT_SHOWN`. 컷오버 시점에
  `StakePositionV2`가 비어 있어도(코드 컷오버 직후 아직 아무도 새로 스테이킹하지 않은 상태)
  이 분기가 그대로 작동한다 — 오늘 프로덕션 전원이 이미 이 상태이므로(N-27: `StakePosition`
  0건) **깨질 라이브 경험이 없다**(rev03 원문 그대로, 재확인 완료).

### 8.5 컷오버 시점의 명확화 — "지금 두 스키마를 동시에 안 읽는다"

이 매핑표는 **CS-3 2단계(코드 컷오버)** 시점에 어댑터가 만족해야 할 계약이다. **1단계(추가
마이그레이션)만 실행된 상태에서는 `deepCoreProgress.ts`는 여전히 구 `StakePosition`/
`StakingPayout`을 읽는다** — 새 테이블이 생겼다는 사실 자체는 게임에 아무 영향도 주지 않는다
(§7.2 조건 ③ "로컬 원장에 0이 아닌 값을 쓰는 코드 경로 미병합"과 같은 이유로, 이 문서가 만드는
테이블에 값을 쓰는 코드도, 그것을 읽는 어댑터도 이 시점에는 병합되지 않는다).

---

## 9. `web-shared-expert`를 위한 인터페이스 계약 (rev03 A-4 후속 작업의 기반)

A-2/A-3와 같은 방식으로 제안한다 — 이름은 바뀌어도 책임 경계는 유지되어야 한다.

1. **`createStakePositionV2({ userId, coin, productId, principal, fundingSource, grantedByAdminId? })`**
   — `fundingSource='USER_BALANCE'`일 때만 A-3의 `placeHold({ reasonCode: 'STAKE_PRINCIPAL_LOCK',
   relatedType: 'STAKE_POSITION', relatedId: position.id })`를 **같은 트랜잭션 안에서** 호출하고
   `principalHoldId`를 채운다. `PLATFORM_GRANT`면 이 호출 자체를 건너뛴다(§6 원칙 5 — 조건문이
   아니라 호출 부재). HUB 권위 코인의 `USER_BALANCE` 포지션은 오늘처럼 허브 잔고 조회로
   검증하되(A-3는 LOCAL 전용이므로 관여하지 않는다), `assertIssuanceAllowed`는 호출하지 않는다
   (원금 체결은 발행이 아니라 사용자 자산의 이동/락이다 — 발행은 이자 정산과 그랜트 생성뿐, §5).
   `PLATFORM_GRANT`면 `assertIssuanceAllowed(coin)`를 호출한다(SETTLE-3).
2. **`maturePositionV2(positionId, now)`** — `daysPaid >= termDays`일 때만 `status='MATURED'`로
   전이. `fundingSource='USER_BALANCE'`면 같은 트랜잭션에서 `releaseHold(principalHoldId, 'position
   matured')`(A-3 §4.3) 호출 — **`executeHold`가 아니라 `releaseHold`다**(소프트 락, 원금이
   차감되지 않고 그대로 `available`로 복귀. rev02 §10-12/A-3 원칙 2 승계). `PLATFORM_GRANT`면
   홀드가 없으므로 아무것도 해제하지 않는다.
3. **`runStakingSettlementV2(now)`** — §5의 SETTLE-1/2 계약을 구현하는 배치 진입점. 기존
   `runStakingSettlement`과 동일하게 크론/관리자 "지금 실행"이 공유한다.
4. **`claimYield({ userId, coin })`** — §6 계약 그대로.
5. **두 권위 합산 금지(A-2 X-2)를 이 문서에도 재확인한다.** 수익 요약 화면이
   `UserCoinYieldSummary`(미청구/클레임 완료)와 `UserCoinBalance`(A-3, 실제 잔고)를 같은 화면에
   보여줄 것이다(rev01 R-U1의 "세 숫자"). **이 셋을 하나로 합산 표시하지 않는다** — R-U1이 이미
   요구했지만, 스키마가 세 값을 물리적으로 다른 테이블에 둠으로써 "합치기 쉬우니 합쳐 버리는"
   유혹을 구조적으로 줄인다.

---

## 10. 그랜트 정합성 총정리 (요청 3에 대한 명시적 답)

세 계층이 각자 다른 질문에 답하고, 합쳐서 G-B/G-C를 만족한다:

| 계층 | 소유 문서 | 질문 | BANA(오늘)의 답 |
|---|---|---|---|
| **코인 권위** | A-2 `ManagedCoin.balanceAuthority` | 이 코인의 잔고 진실은 어디에 있는가? | `LOCAL` |
| **락 메커니즘** | A-3 `LocalBalanceHold` | (LOCAL 권위일 때) 원금을 어떻게 잠그는가? | `STAKE_PRINCIPAL_LOCK` 홀드 — 실제 차감 아님, 소프트 락 |
| **자금 출처** | **A-4 (이 문서) `StakePositionV2.fundingSource`** | 이 포지션의 원금은 누구 돈인가? | `USER_BALANCE`(홀드 생성됨) 또는 `PLATFORM_GRANT`(홀드 **없음**) |

**B-4(그랜트 락 의심)가 구조적으로 재발하지 않는 이유:**

1. 옛 결함(N-3)의 원인은 `lockedPrincipalByCoin`이 `grantedByAdminId`를 **한 번도 확인하지
   않고** ACTIVE 포지션 원금을 전부 합산한 것이었다 — **런타임 필터 누락**이 원인이었다.
2. 이 설계에서 "가용액"이라는 개념은 LOCAL 권위 코인에 대해 **A-3의 `LocalBalanceHold` 합**으로
   **재정의**된다(`available = balance − Σ(ACTIVE holds)`, A-3 §2.3 canonical formula). 이
   Σ는 `LocalBalanceHold` **테이블의 실제 행**을 합산하는 것이지, `StakePositionV2` 테이블을
   순회하며 "그랜트가 아닌 것만 골라서" 합산하는 것이 아니다.
3. `PLATFORM_GRANT` 포지션은 **애초에 그 테이블에 행을 만들지 않는다**(§9 항목 1). 따라서
   "필터를 깜빡했다"가 원리적으로 발생할 수 없다 — **거를 필터가 없고, 거를 대상 자체가
   존재하지 않는다.**
4. 이것을 코드 리팩터가 조용히 깨뜨릴 수 있는 유일한 경로는 "그랜트 생성 라우트가 실수로
   `placeHold`를 호출하는 것"이다. 이 경로는 (a) 코드 리뷰로 잡히기 쉽고(그랜트 라우트에
   holds 관련 호출이 있다는 것 자체가 눈에 띈다), (b) `wallet-security-expert`의 필수 리뷰
   대상이다(G-B는 "락을 완화하는 변경"이므로 rev01이 이미 리뷰를 요구했다 — 이 설계는 그
   반대 방향, 즉 "그랜트가 락을 만들지 않는 것"을 지키는 쪽이므로 완화가 아니라 **강화**이지만,
   그래도 §12에 회귀 테스트를 명시해 둔다).

**HUB 권위 코인으로 일반화하면** (오늘은 미해당 — BANA만 스테이킹 가능, N-6): `fundingSource`가
여전히 명시 필드로 존재하고, "가용액" 계산(오늘의 `available = niaBal − locked`, N-4)이
`lockedPrincipalByCoin`류 집계를 `WHERE fundingSource = 'USER_BALANCE'`로 **명시 필터링**해야
한다(rev01 G-B 원문 그대로 — 이 경우는 A-3의 도움 없이 여전히 런타임 필터에 의존하므로, LOCAL
권위만큼 구조적으로 안전하지는 않다). **이것이 이 설계가 정직하게 인정하는 비대칭이다**: 구조적
방지(홀드 부재)는 LOCAL 권위 코인에서만 성립하고, HUB 권위 코인의 그랜트는 여전히 필터 누락에
취약하다 — 단 오늘 스테이킹 가능 코인이 BANA(LOCAL) 하나뿐이므로 이 비대칭은 **잠재적**이며,
향후 HUB 권위 코인에 그랜트 가능한 이자 상품을 추가하는 순간 §12의 회귀 테스트 대상에 그 경로도
포함해야 한다.

---

## 11. Prisma 관례 준수 확인

- 모든 금액 컬럼 `String`(canonical decimal string). `Int`/`Float` 없음(CLAUDE.md 규칙 2).
- 신규 필드 전부 안전 기본값: `maxBonusPctOfBase="0"`, `ledgeredYield="0"`, `daysPaid=0`,
  `claimedYieldTotal="0"`, `stakingClaimEnabled=false`, `stakingV2WorkerEnabled=false`.
- `cuid()` id, `createdAt`/`updatedAt` 관례, 관리자 발생 필드의 `adminId` 단독 보존
  (`grantedByAdminId` — 기존 관례상 email 비정규화 컬럼이 없었으므로 승계, 필요 시 향후 추가).
- 기존 테이블(`StakingProduct`, `StakePosition`, `StakingPayout`, `ManagedCoin`,
  `PlatformSetting`, `WithdrawalRequest`)에 대한 **파괴적 변경 없음** — `PlatformSetting`은
  컬럼 추가뿐, 나머지 넷은 **전혀 건드리지 않는다**.
- `StakeRenewalStatus`/`StakingProductStatus` 기존 enum **재사용**(의미 불변이므로 중복 정의
  않음) — `StakePositionV2Status`/`PositionFundingSource`는 의미가 달라 신규 정의(§3.3 도입부에
  근거 기재).

---

## 12. 남는 설계 질문 (다음 단계로 명시적으로 넘김)

1. **`amount == baseAmount + bonusAmount` 불변식의 DB 레벨 강제 여부.** Prisma는 선언적 CHECK
   제약을 지원하지 않는다. Raw SQL 마이그레이션으로 `CHECK` 제약을 추가하는 옵션이 있으나,
   기존 코드베이스에 전례가 없다(전수 조사 결과 CHECK 제약 사용 0건) — **이 문서는 앱 계층
   불변식(§4 표)으로 충분하다고 제안**하되, 최종 판단은 마이그레이션 실행 시점에
   `prisma-db-expert`가 재확인한다.
2. **G-B/G-C 회귀 테스트의 정확한 형태.** §10.4가 언급한 테스트("그랜트 포지션 생성 전후
   `available` 불변")를 `qa-lead`가 어느 계층(단위/통합)에 둘지 미정 — A-10(설계 단계 보안
   리뷰)과 함께 확정할 것을 제안.
3. **`niaUserId`를 `StakePositionV2`에 남겨 둘 것인가.** 오늘은 BANA(LOCAL) 전용이라 미사용
   컬럼이 된다. HUB 권위 코인의 이자 상품이 실제로 계획되기 전까지는 죽은 컬럼일 수 있다 —
   **작게 남겨 두는 것과, 그 상품이 실제로 설계될 때 추가하는 것 사이의 트레이드오프**는
   마이그레이션 실행 시점에 재검토 제안(현재 초안은 "남겨 둠" 쪽).
4. **`StakeYieldLedgerEntry`에 `@@unique([positionId, dayIndex])` 외에 `idempotencyKey` 컬럼이
   필요한가.** A-3의 `LocalLedgerEntry`와 달리, 이 원장은 정산 트랜잭션(SETTLE-1)이 유일한
   쓰기 경로이고 그 트랜잭션이 이미 `FOR UPDATE` + `@@unique(positionId,dayIndex)`로 이중 방어된다
   — **현재 초안은 불필요하다고 판단**했으나, V2-BAND에서 정산 트리거 경로가 늘어나면
   (예: 수동 재정산 관리자 액션) 재검토가 필요할 수 있다.
5. **밴드 정산(V2-BAND)이 실제로 설계될 때 SETTLE-1의 `bonusAmount`/`mpSnapshot`/
   `bonusPctSnapshot` 계산 로직이 어디에 위치할 것인가** — 이 파일(정산 트랜잭션 계약)인지,
   별도 `deepCoreYieldBonus.ts`류 순수 함수 모듈인지는 그 시점의 `game-planner`/
   `web-shared-expert` 설계 대상이다.

---

## 13. 마이그레이션 상태 — 실행하지 않음

이번 세션에서 실행한 것은 §0의 `migrate status` 조회 둘(로컬/프로덕션)뿐이다(`migrate deploy`/
`db push` 전혀 실행하지 않음). **rev03 §7.2의 3조건은 여전히 미충족이며, 그대로 유지된다:**

① 이 문서(A-4)와 A-2·A-3의 마스터 승인, ② 모든 신규 필드 기본값 "꺼짐"/0(위 설계는 이를
만족하도록 작성됐다 — §11에서 확인), ③ 로컬 원장 및 이 스키마의 어떤 테이블에도 0이 아닌 값을
쓰는 코드 경로 미병합(A-4 대상 코드 자체가 미착수 상태이므로 현재 자동 충족). **셋 다 확인되기
전까지 `prisma migrate dev`를 실행하지 않는다.**

추가로 재확인: **CS-1(프로덕션 `StakingProduct` 5건 → `CLOSED`)은 이 문서의 범위가 아니다** —
rev03 §7.1 "0b"는 "사람 승인 → `deploy-manager`"로 명시된 별도 데이터 조치이며, 이 설계 문서의
승인과 독립적으로 처리된다.

---

## 14. 이 문서가 승인하지 않는 것 (명시)

- **마이그레이션 실행 승인이 아니다.** `prisma migrate dev`/`deploy` 어느 것도 이 세션에서
  실행하지 않았고, §13의 3조건이 전부 충족되기 전까지 실행하지 않는다.
- **`web-shared-expert`의 정산/클레임/포지션 생성 로직 구현 착수 승인이 아니다.** §9의
  인터페이스는 제안이며, 실제 코드 작성은 담당자 자신의 스코프 판단과 필요 시 추가 확인을
  거친다.
- **V2-BAND(밴드폭 > 0 상품, 예약 풀, MP 연동 정산)의 설계가 아니다.** H-1(밴드 모델 채택)이
  미해소(rev03 §6.3/§8.1) — 이 문서는 그 미래가 이 스키마에 자연스럽게 얹힐 수 있음만 보인다.
  (법무 게이트와 재무 준비금 게이트는 2026-08-11 마스터 결정으로 해제됐다. V2-BAND 착수를
  막는 조건은 H-1 하나만 남는다.)
- **기존 `StakingProduct`/`StakePosition`/`StakingPayout` 테이블의 DROP 승인이 아니다.**
  CS-3의 3단계(정리 마이그레이션)는 코드 컷오버 이후이며, 이 문서는 그 계획(§3.1)만 문서화한다.
- **DEEP CORE 어댑터(A-6) 구현 착수 승인이 아니다.** §8은 어댑터가 만족해야 할 계약을 명시할
  뿐, 어댑터 코드 자체는 `game-planner`(계약 확정) → `game-developer`(구현) 소관이다.
- **A-3 `ReserveVerificationRun` 게이트를 실제 발행 코드에 배선하는 것의 승인이 아니다.** §7의
  쿼리는 그 필드를 채우는 방법만 제공하며, 그 판정을 코드가 강제하도록 연결하는 작업은 여전히
  A-5/A-10 소관이고 별도 착수 승인을 거친다.
