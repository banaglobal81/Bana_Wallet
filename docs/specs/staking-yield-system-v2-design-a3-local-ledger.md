# 설계 문서 A-3 — 로컬 잔고 원장(Local Balance Ledger) Prisma 스키마 설계

> 작성: `prisma-db-expert` · 2026-08-10 · **개정: 2026-08-10 (wallet-security-expert 조건부 승인
> 후속 보완 · rev04 PoR-1″ 좌변 재정의 애드덤 반영)**

> **rev04 애드덤 (`staking-yield-system-v2-prd-rev04-core-design-synthesis.md`, pm 작성).**
> rev04는 이 문서의 **§2.6 `ReserveVerificationRun` 좌변 컬럼 구성**을 §1.6 애드덤으로
> 명시 대체한다(rev04 도입부). 아래는 그 대체가 실제로 반영된 지점의 목록이다 — 각 절 본문에
> 인라인으로 표시된 "**(rev04)**" 표기를 따라가면 된다.
> - **PoR-1″ (rev04 §1.3)** — `activeUserFundedPrincipalTotal`을 좌변 합계(`leftTotal`)에서
>   제외하고 표시·교차검증 전용으로 강등(P-15). 대신 **INV-P5**(홀드-원금 부분집합 관계)·
>   **INV-P6**(홀드 총액이 잔고를 넘지 않음)로 그 관계를 불변식으로 검증한다 → §2.6, §4.4bis.
> - **`referralPayableTotal` 신설(rev04 §2.2, Q8-a)** — 레퍼럴 보너스를 좌변 정식 항으로 편입 →
>   §2.6.
> - **`compensationPlanCommitmentTotal` 신설(rev04 §2.2, Q8-b)** — 보상 플랜은 좌변 산술에서
>   제외하되 `PROGRAM_COMMITMENT` 역할로 상시 표시 → §2.6.
> - **`stakePrincipalHoldTotal`/`withdrawalPendingHoldTotal`/`inFlightOnchainWithdrawalTotal`
>   신설(rev04 §1.5)** — INV-P5의 좌항, `SUBSET_OF_LOCAL_BALANCE`, `TIMING_ADJUSTMENT` 각 역할의
>   증거 컬럼 → §2.6.
> - **`ReserveVerificationResult`에 `NO_RESERVE_BASIS` 추가(rev04 §1.7, PoR-G1)** — 통제 주소
>   0건일 때 `PASS`를 절대 내지 않는다 → §2.6, §4.5.
> - **`assertReserveHealthyOrThrow(coin, amount)` 시그니처 변경(rev04 §1.7, PoR-G2)** — 이번
>   발행 금액을 인자로 받아 마진 초과 발행을 신선도 창 안에서도 차단 → §4.6.
> - **H-2′(rev04 §1.8)** — `grantPrincipalPayableTotal`의 `null` 조건을 좁힌다: `PLATFORM_GRANT`
>   포지션이 1건이라도 존재하고 H-2가 미결정일 때만 `null`, 0건이면 `"0"`(정직한 기지값) →
>   §2.6. 이 판정을 정직하게 유지하는 요구 G-E(그랜트 생성 경로 fail-closed)는 A-4(v2 포지션
>   생성 코드) 소관이며 이 문서의 스키마 자체는 바꾸지 않는다.
> - **PoR-S1 부채 스트림 등록부(rev04 §2.4)** — 이 문서는 **물리 테이블을 새로 만들지 않는다.**
>   등록 대상 스트림(`STAKING_YIELD`/`GRANT_PRINCIPAL`/`REFERRAL_BONUS`/`COMPENSATION_PLAN`/
>   `DEPOSIT`)이 이번 마이그레이션 시점에 최대 5개로 고정되어 있고 배포마다 바뀌는 값이 아니므로,
>   `prisma-db-expert` 결정(rev04 §8 질문 20이 위임한 판단)으로 **코드 상수 + `qa-lead`
>   단위 테스트**로 표현한다 — 위 목록에 없는 `role='ADDITIVE'`/`status='LIVE'` 스트림이 코드에
>   나타나면 그 테스트가 실패해야 한다(INV-P7). 관리자 화면 상시 노출(rev04 요구)은 `product-planner`
>   (A-8/A-11) 소관이며 이 결정이 그 노출 요구를 대체하지 않는다. 향후 스트림이 늘어나 코드
>   상수의 감사 가능성이 부족해지면 물리 테이블로 승격을 재검토한다.
>
> 이 애드덤은 §7의 3조건(및 rev04 §5.3이 추가한 조건 ④ — Q-M5 회신이 (나)일 것) 중 어느 것도
> 완화하지 않는다.
>
> **개정 이력.** `wallet-security-expert`가 A-2/A-3/A-5 설계를 검토해 **조건부 승인**했다.
> 두 건의 HIGH 심각도 필수 보완을 이 문서에 반영한다:
> 1. **PoR-1′ 동기 게이팅 미설계** — 이 문서 §4.6(신설)에서 `assertReserveHealthyOrThrow()`를
>    정의하고, §4.2의 `creditLocalLedger` 계약에 발행성 사유 코드에 대한 하드 게이트로 배선한다.
> 2. **홀드-잔고확인의 트랜잭션 합류 미확정** — §4.1/§4.3을 개정해 `getUserCoinBalance`/
>    `placeHold`가 호출자의 트랜잭션에 합류하고, `UserCoinBalance` 행을 `SELECT ... FOR UPDATE`로
>    잠근 뒤 요청 생성·잔고확인·홀드삽입을 하나의 직렬화 트랜잭션으로 묶도록 확정한다.
>
> 이 보완들이 §7의 3조건 중 어느 것도 완화하지 않는다 — **오히려 조건 ③("로컬 원장에 0이
> 아닌 값을 쓰는 코드 경로 미병합")이 실제로 풀릴 때 이 문서가 요구하는 안전장치가 코드에
> 그대로 존재해야 한다는 조건이 추가된 것**이다. 마스터 승인 전까지 클레임/정산/그랜트/홀드에
> 대한 실제 코드 착수는 여전히 금지다.
> **근거 문서(읽은 순서):** `staking-yield-system-v2-INDEX.md` →
> `staking-yield-system-v2-prd.md`(개정 01, §8 데이터 모델 요구) →
> `staking-yield-system-v2-prd-rev02-balance-authority.md`(개정 02 §4 PoR-1, §10 미해결 질문
> 11~13) → `staking-yield-system-v2-prd-rev03-rebuild-and-exclusivity.md`(개정 03 §3.4 PoR-1′,
> §4.2 W-1/W-2, §4.4, §7.2 A-3 작업 정의, §11 미해결 질문 14~15 — **이 문서가 답하는 항목**) →
> `staking-yield-system-v2-design-a2-balance-authority.md`(A-2 산출물 — `balanceAuthority`,
> `getCoinAuthority()`, `CoinAuthorityProbe`/`CoinAuthorityTransition`. 이 문서는 A-2와 정합해야
> 한다는 전제로 작성했다)
>
> **지위: 설계 문서다. 구현 지시서가 아니다.** rev03 §7.2의 3조건(① 이 문서의 마스터 승인
> ② 모든 신규 필드 기본값 "꺼짐"/0 ③ 로컬 원장에 0이 아닌 값을 쓰는 코드 경로 미병합)
> **전부가 충족되기 전까지 어떤 마이그레이션도 실행하지 않는다.** `prisma migrate dev`/`deploy`
> 이번 세션 미실행(§7). `prisma db push`는 절대 금지(CLAUDE.md 규칙 7, 항상). 아래 스키마
> 조각은 **개념 초안**이며 `web/prisma/schema.prisma`에 아직 반영되지 않았다.

---

## 0. 이 문서가 다루는 범위 (rev03 §7.2 A-3)

> *"로컬 잔고 원장 스키마 설계 — 잔고·홀드·원장행·감사. PoR-1′ 검사 지점 포함"*
> 담당: `prisma-db-expert` · 선행: A-2

**이 문서가 만드는 것:**
- 사용자×코인 잔고 캐시 테이블 + append-only 원장 행 테이블 (은행식 이중 기록)
- 홀드(hold) 메커니즘 — 출금 요청 홀드(W-2)와 스테이킹 원금 소프트 락을 **하나의 개념**으로 통일
- PoR-1′(개정 03 §3.4) 검사 실행 로그 + 그 우변(통제 주소)을 위한 명시적 레지스트리
- 권위 전환 절차(A-2의 `CoinAuthorityTransition.snapshotRef`)가 참조할 전 사용자 잔고 스냅샷 모델
- `web-shared-expert`(A-5)·향후 A-4 담당자를 위한 크레딧/차감/홀드 함수 인터페이스 계약

**이 문서가 만들지 않는 것 (명시적으로 다음 작업으로 미룸):**
- **A-4 (v2 스테이킹 스키마)** — 상품·포지션·미청구 이자 원장. 이 문서는 A-4가 걸릴 지점만
  인터페이스로 남겨둔다(§3의 nullable 컬럼들이 그 자리 표시자다).
- **A-5 (출금 큐 확장)** — `WithdrawalRequest`에 `AWAITING_ONCHAIN` 상태·txHash 필드를 추가하는
  작업. 이 문서의 `LocalBalanceHold`는 `WithdrawalRequest`를 느슨한 참조(`relatedType`/`relatedId`)로만
  가리키며, 하드 FK를 걸지 않는다 — A-5가 아직 그 테이블을 확장하지 않았기 때문이다.
- **입금 레일(BSC 감지·스윕·해시 제출)** — Q-M5 미회신(허브 입금 vs 자체 레일). `DEPOSIT_CONFIRMED`
  사유 코드와 멱등키 자리는 만들어 두되, 감지 로직·주소 발급은 다루지 않는다.
- 온체인 서명/전송. B-7은 수동 실행으로 결정됐다(Q-M2) — 이 문서는 개인키를 다루지 않는다.
- 코인 정밀도(decimals) 표준화 컬럼(`ManagedCoin.onchainDecimals` 등) — A-2가 소유한 테이블이므로
  이 문서는 필요성만 §6에 남긴다.

---

## 1. 설계 원칙

1. **잔고 행 + 이동 원장 병행 (rev03 §11 Q14 응답).** 캐시(빠른 읽기)와 증거(append-only 이력)를
   분리한다 — A-2가 `authorityAlertStage`(캐시)와 `CoinAuthorityProbe`(증거)에 적용한 것과
   동일한 원리(A-2 §1 원칙 5)를 잔고에 적용한다. `UserCoinBalance.balance`는 캐시이고,
   `LocalLedgerEntry`가 유일한 진실이다. 정합은 재계산으로 상시 검증 가능해야 한다(§4 대사 계약).
2. **락은 홀드의 특수 사례다 (rev03 §11 Q15 응답).** 출금 대기 홀드와 스테이킹 원금 소프트 락을
   별도 개념으로 만들지 않는다. `LocalBalanceHold` 하나가 둘 다를 표현하며, 차이는
   `reasonCode`와 허용된 상태 전이뿐이다. `available = balance − Σ(ACTIVE holds)`는 사유와 무관하게
   항상 같은 식이다.
3. **홀드는 잔고를 바꾸지 않는다. 원장 행만 잔고를 바꾼다.** 요청 생성(홀드)과 자금 이동(원장)을
   같은 트랜잭션 단계로 뭉개면, "요청이 있었다"와 "돈이 실제로 움직였다"가 같은 사건이 되어
   개정 03 W-3가 경고한 대사 불가능 상태가 재발한다.
4. **사유 코드는 감사 원시 자료다. 재사용 금지, 추가만 허용.** 새 원인이 생기면 새 코드를 더한다
   — 기존 코드의 의미를 바꾸지 않는다(A-2 X-1′ "유도 금지"와 같은 결의 원칙을 사유 코드 축에
   적용한 것).
5. **불가지(unknown)와 영(0)을 구분한다.** PoR-1′의 좌변 구성요소 중 A-4가 아직 존재하지 않아
   계산 불가능한 항목은 `null`이며, 절대 `"0"`으로 암묵 대체하지 않는다. `"0"`으로 대체하면
   실재하는 부채가 검사를 조용히 통과한다 — 이것이 PoR-1′를 무력화하는 가장 조용한 경로다.
6. **통제 주소는 코드 상수가 아니라 관리되는 데이터다 (rev03 §3.4 DP-6/PoR-1′).** 준비금의
   우변을 하드코딩하면 어떤 자금이 우변에 포함됐는지를 코드 리뷰로만 알 수 있게 된다 — 감사자가
   테이블 하나를 조회하는 것과 diff를 읽는 것은 다른 신뢰 수준이다.
7. **신규 필드는 전부 안전한 기본값을 가진다.** `balance`/`held` 관련 모든 컬럼 기본값은
   `"0"`/`0`/`false`다. 이 스키마가 적용되는 순간 어떤 사용자도 잔고를 갖지 않는다 — 잔고가
   생기려면 여전히 A-4/A-5의 코드가 존재하고 병합되어야 한다(A-2 §1 원칙 6과 동일 결).

---

## 2. 스키마 설계 (개념 초안)

### 2.1 잔고 캐시 — `UserCoinBalance`

```prisma
// (userId, coin) 하나당 한 행. LOCAL 권위 코인 전용이다 — HUB 권위 코인에 대해 이 테이블에
// 행이 있는 것은 버그다(앱 계층에서 getCoinAuthority()로 강제, DB 제약이 아니다 — A-2 §4.1과
// 같은 이유: "코인이 ManagedCoin에 없으면 허브겠지"류 추론이 여러 곳에 흩어지는 것을 막기 위해
// 진입점을 하나로 강제한다).
//
// `balance`는 파생 캐시다 — 이 (userId, coin)의 LocalLedgerEntry 부호합과 항상 같아야 한다.
// 읽기(잔고 화면, 출금 검증)가 매번 이력을 재합산하지 않도록 존재할 뿐이다. 캐시와 증거를
// 정직하게 유지하는 것은 대사 작업(§4)의 몫이다 — 이 필드 자체가 진실이라고 가정하지 않는다.
model UserCoinBalance {
  id        String   @id @default(cuid())
  userId    String
  coin      String   // ManagedCoin.symbol (denormalized — 기존 코드베이스 관례. StakePosition.coin /
                      // WithdrawalRequest.currency 등 전부 평문 문자열이며 FK가 없다. 이 테이블도 같은
                      // 관례를 따른다 — 권위 강제는 DB 관계가 아니라 §4의 단일 진입 함수가 한다)
  balance   String   @default("0") // canonical decimal string

  // 매 잔고 변경(크레딧/차감)마다 +1. LocalLedgerEntry 삽입과 **같은 트랜잭션**에서만 증가해야
  // 한다. 이 값이 이 (userId, coin)의 LocalLedgerEntry 행 수와 어긋나면, 어떤 코드 경로가
  // §4의 공유 함수를 우회해 UserCoinBalance를 직접 수정했다는 신호다 — 값싼 회귀 감지기다.
  version   Int      @default(0)

  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())

  @@unique([userId, coin])
  @@index([coin])
}
```

### 2.2 원장 행 — `LocalLedgerEntry` (append-only)

```prisma
enum LocalLedgerEntryType {
  CREDIT
  DEBIT
}

// 사용자의 LOCAL 코인 "잔고 총액"이 변할 수 있는 모든 원인. 홀드 생성/해제는 여기 포함되지
// 않는다(원칙 3) — 오직 실제로 balance가 움직이는 사건만 원장 행이 된다.
enum LocalLedgerReasonCode {
  // ── 크레딧 ──────────────────────────────────────────────────────────
  // 사용자가 미청구 이자를 로컬 잔고로 옮기는 동작(개정 03 §4.4 — 모델 C에서 클레임은 외부
  // 호출이 아니라 이 원장 증가 자체다). A-4(미청구 이자 원장)가 존재해야 실제로 쓰인다.
  // 주의: "스테이킹 정산"(일별 이자 발생) 자체는 이 원장에 반영되지 않는다 — A-4가 설계할
  // 별도의 미청구 이자 원장에만 쌓이고, 사용자가 클레임할 때 비로소 STAKING_CLAIM으로
  // 여기 반영된다. 정산이 로컬 잔고를 직접 건드리는 경로는 이 스키마에 없다.
  STAKING_CLAIM
  // 그랜트 원금이 클레임 대상으로 결정된 경우(H-2-a)의 크레딧. H-2 미결정 — RESERVED.
  GRANT_PRINCIPAL_CREDIT
  // 외부 온체인 입금이 확정 깊이(DP-2)를 통과해 크레딧된 경우. 입금 레일 자체는 A-3 범위
  // 밖(Q-M5 의존) — RESERVED.
  DEPOSIT_CONFIRMED
  // ReferralBonusPayout이 로컬 잔고로 지급된 경우. REFERRAL_BONUS_ENABLED가 꺼져 있는 한
  // 미사용 — RESERVED.
  REFERRAL_BONUS_CREDIT
  // 권위 전환(HUB_TO_LOCAL, A-2 X-4′) 3단계에서 이관된 잔고의 크레딧.
  AUTHORITY_TRANSITION_CREDIT_IN
  // 수동 정정. adminId/adminEmail/adjustmentReason 필수 + 같은 트랜잭션에 AuditLog 필수(§4).
  ADMIN_ADJUSTMENT_CREDIT

  // ── 차감 ──────────────────────────────────────────────────────────
  // 홀드가 EXECUTED로 확정될 때(온체인 전송 검증 통과, W-4)의 실제 소각(burn) 차감.
  WITHDRAWAL_EXECUTED
  // 권위 전환(LOCAL_TO_HUB) 3단계에서 이관되어 나가는 잔고의 차감.
  AUTHORITY_TRANSITION_DEBIT_OUT
  // 수동 정정.
  ADMIN_ADJUSTMENT_DEBIT
}

model LocalLedgerEntry {
  id             String                @id @default(cuid())
  userId         String
  coin           String
  type           LocalLedgerEntryType
  reasonCode     LocalLedgerReasonCode
  amount         String                // canonical decimal string, 항상 양수 — 부호는 `type`이 정한다

  // 은행 명세서 방식의 스냅샷 — 이 행이 기록된 직후의 UserCoinBalance.balance를 같은
  // 트랜잭션에서 함께 적는다. "현재 잔고"의 출처가 아니다(UserCoinBalance.balance가 출처다) —
  // 이것은 이력을 처음부터 재합산하지 않고도 특정 시점의 잔고를 재구성/대조할 수 있게 하는
  // 중복이지만 위조 방지에 유용한 체크포인트다.
  balanceAfter   String

  // 멱등키. 형식은 사유별로 다르며 §3에 문서화한다(예: "CLAIM:<coin>:<userId>:<batchId>",
  // "DEPOSIT:<chainId>:<txHash>:<logIndex>", "WITHDRAWAL_EXECUTED:<withdrawalRequestId>",
  // "AUTH_TRANSITION:<transitionId>"). ADMIN_ADJUSTMENT_*는 자연스러운 멱등키가 없어 null 허용
  // — Postgres는 NULL을 서로 다른 값으로 취급하므로 정상 관리자 조정이 유니크 제약에 막히지 않는다.
  idempotencyKey String?

  // 원인이 된 레코드에 대한 느슨한 다형적 참조(StakingPayout류/A-4 미청구 이자 행,
  // WithdrawalRequest, CoinAuthorityTransition 등). 하드 FK를 걸지 않는 이유는 A-2의
  // CoinAuthorityProbe와 동일 — 참조 대상이 삭제/변경되어도 증거는 그대로 읽혀야 한다.
  relatedType    String?
  relatedId      String?

  // ADMIN_ADJUSTMENT_* 전용. 앱 계층에서 이 셋의 동시 존재를 강제한다(§4).
  createdByAdminId String?
  createdByEmail   String?
  adjustmentReason String?

  holds          LocalBalanceHold[]    // LocalBalanceHold.executedLedgerEntry의 역참조

  createdAt      DateTime              @default(now())

  @@unique([coin, idempotencyKey])
  @@index([userId, coin, createdAt])
  @@index([relatedType, relatedId])
}
```

### 2.3 홀드 — `LocalBalanceHold` (W-2 + 원금 소프트 락 통합)

```prisma
enum LocalHoldReasonCode {
  // W-2: 출금 요청 생성과 같은 트랜잭션에서 원자적으로 만들어진다. ACTIVE -> EXECUTED(W-4
  // 검증 통과, 실제 소각) 또는 ACTIVE -> RELEASED(거절/실패/환불) 둘 중 하나로만 종결된다.
  WITHDRAWAL_PENDING
  // v2(A-4) 포지션의 원금 소프트 락. LOCAL 권위 코인에 대해서도 원금은 스테이킹 자체로는
  // 잔고에서 빠져나가지 않는다(개정 02 §10-12의 PM 의견 "소프트 락 유지" 승계) — 이 홀드는
  // 절대 EXECUTED로 전이하지 않는다. ACTIVE -> RELEASED(만기/클레임 가능 시점)만 존재한다.
  STAKE_PRINCIPAL_LOCK
}

enum LocalHoldStatus {
  ACTIVE
  RELEASED  // available로 복귀. 잔고 불변
  EXECUTED  // LocalLedgerEntry DEBIT으로 전환됨(WITHDRAWAL_PENDING 전용)
}

// 사용자의 이용 가능 잔고에 대한 미결 청구 하나당 한 행.
// available = UserCoinBalance.balance − Σ(이 사용자+코인의 ACTIVE 홀드).
// 홀드 생성/해제는 UserCoinBalance.balance를 절대 건드리지 않는다 — 오직 LocalLedgerEntry만
// 건드린다(개정 03 W-2: "요청 생성 = available 감소(홀드 증가). 원장 총액은 불변").
model LocalBalanceHold {
  id             String              @id @default(cuid())
  userId         String
  coin           String
  amount         String              // canonical decimal string, 항상 양수
  reasonCode     LocalHoldReasonCode
  status         LocalHoldStatus     @default(ACTIVE)

  // 느슨한 다형적 참조 — WITHDRAWAL_PENDING -> WithdrawalRequest.id (A-5가 아직 그 테이블을
  // 확장하지 않았으므로 하드 FK를 걸지 않는다). STAKE_PRINCIPAL_LOCK -> v2 포지션 id
  // (A-4, 아직 존재하지 않음).
  relatedType    String              // "WITHDRAWAL_REQUEST" | "STAKE_POSITION" | "ADMIN_MANUAL"
  relatedId      String?

  createdAt      DateTime            @default(now())
  releasedAt     DateTime?
  releasedReason String?             // 자유 텍스트, 예: "withdrawal rejected", "position matured"

  // EXECUTED로 전이할 때 생성된 원장 행. LocalLedgerEntry는 이 문서가 소유하므로 하드 FK로
  // 안전하다(A-5의 WithdrawalRequest 확장과 달리 같은 설계 문서 안이다).
  executedLedgerEntryId String?            @unique
  executedLedgerEntry   LocalLedgerEntry?  @relation(fields: [executedLedgerEntryId], references: [id])

  @@index([userId, coin, status])
  @@index([relatedType, relatedId])
  // (relatedType, relatedId, reasonCode)당 최대 한 개의 홀드만 허용 — 같은 출금 요청/포지션에
  // 중복 홀드가 걸리는 것을 DB 제약으로 막는다. relatedId가 null인 ADMIN_MANUAL 행은
  // Postgres가 NULL을 서로 다른 값으로 취급하므로 이 제약에 걸리지 않는다.
  @@unique([relatedType, relatedId, reasonCode])
}
```

### 2.4 권위 전환용 전 사용자 잔고 스냅샷 — A-2 `snapshotRef` 계약 확정

A-2 §6-3이 남긴 질문에 대한 답이다: `CoinAuthorityTransition.snapshotRef`는 아래
`LocalBalanceSnapshotBatch.id`를 문자열로 저장한다. A-2와 A-3가 같은 마이그레이션으로 합쳐질 때
실제 관계(FK)로 승격할 것을 제안하되, 그 전까지는 A-2 자신의 관례(비정규화 문자열 참조)와 같은
형태로 둔다.

```prisma
enum BalanceSnapshotPurpose {
  AUTHORITY_TRANSITION // X-4′ 2단계 — CoinAuthorityTransition.snapshotRef가 이 배치를 가리킨다
  POR_VERIFICATION     // ReserveVerificationRun과 짝지어 전 사용자 상세를 남기고 싶을 때(선택)
  MANUAL_ADMIN
}

model LocalBalanceSnapshotBatch {
  id                 String                    @id @default(cuid())
  coin               String
  purpose            BalanceSnapshotPurpose
  takenAt            DateTime                  @default(now())
  totalBalance       String                    // decimal string — 아래 행들의 합. 스냅샷 시점에 고정
  rowCount           Int
  initiatedByAdminId String?
  initiatedByEmail   String?
  rows               LocalBalanceSnapshotRow[]

  @@index([coin, purpose, takenAt])
}

// 불변 상세 행. 애플리케이션은 이 행을 절대 UPDATE하지 않는다 — 정정이 필요하면 새 배치를
// 만든다(X-4′ 2단계: "기록 후 불변").
model LocalBalanceSnapshotRow {
  id        String                    @id @default(cuid())
  batchId   String
  batch     LocalBalanceSnapshotBatch @relation(fields: [batchId], references: [id])
  userId    String
  balance   String                    // decimal string — takenAt 시점의 UserCoinBalance.balance
  heldTotal String                    // decimal string — takenAt 시점 이 사용자의 Σ(ACTIVE 홀드).
                                       // 정보용(이관 대상 총액에는 포함되지 않는다 — 홀드는 이미
                                       // balance 안에 포함된 금액에 대한 청구일 뿐이다). 분쟁 대비 보존.

  @@unique([batchId, userId])
}
```

### 2.5 PoR-1′ 우변 — `PlatformControlledAddress`

```prisma
// PoR-1′(개정 03 §3.4)의 우변은 "명시적으로 관리되는 데이터여야 하며, 코드에 흩어진 상수여서는
// 안 된다"(원문). 이 테이블이 그 레지스트리다. 채우는 것(어떤 주소를 넣을지)은 Q-M3(회사 지갑
// 주소) 회신에 달린 운영 데이터 입력이며, 이 스키마는 빈 상태에서도 안전하다 — 행이 0개면
// ReserveVerificationRun의 우변 합계도 정직하게 0이고, 그 경우 좌변이 0보다 크면 즉시 FAIL로
// 잡힌다(원칙 5 — 0과 불가지를 구분하되, 우변의 "아직 안 채움"은 정직하게 0이어야 좌변 발생 시
// 즉시 걸린다).
model PlatformControlledAddress {
  id             String    @id @default(cuid())
  coin           String
  network        String    // 예: "BINANCE"(BSC) — ManagedCoin.networks[].code와 매칭
  address        String
  label          String    // 예: "COMPANY_TREASURY", "DEPOSIT_SWEEP" — 자유 텍스트, 관례상 UPPER_SNAKE
  addedByAdminId String
  addedByEmail   String
  active         Boolean   @default(true)
  addedAt        DateTime  @default(now())
  removedAt      DateTime?
  notes          String?   // 예: 블록 익스플로러 링크, 용도 설명

  @@unique([coin, network, address])
  @@index([coin, active])
}
```

### 2.6 PoR-1″ 검사 로그 — `ReserveVerificationRun` (rev04 §1.5 애드덤 반영)

> **(rev04)** 이 모델은 개정 03 §3.4 PoR-1′을 좌변으로 삼던 원래 초안을, rev04 §1.3이 판정한
> **PoR-1″**로 대체한다. 핵심 차이: `activeUserFundedPrincipalTotal`은 원금이 사용자 잔고에서
> 소프트 락(홀드)될 뿐 차감되지 않는다는 A-3 §1 원칙 2의 확정 이후 **`localLedgerBalanceTotal`의
> 부분집합**이 됐다(P-14) — 그래서 좌변 합계(`leftTotal`)에서는 빠지되, 그 부분집합 관계 자체를
> `INV-P5`(§4.4bis)로 검증해 항을 "삭제"가 아니라 "강등"한다(P-15). 레퍼럴 보너스(발생 원장이
> 실재)는 신규 항으로 편입하고, 보상 플랜(원장 자체가 존재하지 않음)은 별도 컬럼으로 상시
> 표시하되 좌변 산술에서 제외한다(Q8, §2 요약).

```prisma
enum ReserveVerificationTrigger {
  WORKER_PERIODIC
  MANUAL_ADMIN
  PRE_AUTHORITY_TRANSITION // CoinAuthorityTransition 1/4단계에서 실행되는 검사
  PRE_ISSUANCE_GATE        // 정산/그랜트/클레임 배치 직전 애드혹 검사(실제로 게이트로 쓸지는 A-5/A-10 결정)
}

enum ReserveVerificationResult {
  PASS
  FAIL
  // 좌변 구성요소 중 하나 이상이 아직 계산 불가(예: H-2 미결정으로 grantPrincipalPayableTotal이
  // null인 채 PLATFORM_GRANT 포지션이 1건 이상 존재). "0"으로 대체하지 않는다 — 원칙 5.
  INCOMPLETE
  // 온체인 또는 허브 조회 자체가 실패. 판정이 아니라 장애다.
  QUERY_FAILED
  // (rev04 신규, PoR-G1) controlledAddressCount == 0 — 우변(준비금)이 단 한 번도 등록되지
  // 않은 상태. "준비금이 0인 것"과 "준비금을 아직 등록하지 않은 것"을 구분한다(원칙 5를
  // 우변에도 적용). 이 값은 절대 PASS로 대체되지 않는다 — §4.5/§4.6.
  NO_RESERVE_BASIS
}

// PoR-1″(rev04 §1.3, 개정 02 §4.2·개정 03 §3.4 좌변을 대체) 한 시점의 스냅샷:
//
//   leftTotal = L1 localLedgerBalanceTotal + L2 unclaimedLedgeredInterestTotal
//             + L3 grantPrincipalPayableTotal + L4 referralPayableTotal
//   leftTotal  ≤  controlledOnchainBalanceTotal
//
// 좌변에 더하지 않지만 상시 저장·표시하는 항목(componentRole, A-8 §5 DC-6 5값 집합과 정합):
//   activeUserFundedPrincipalTotal / stakePrincipalHoldTotal / withdrawalPendingHoldTotal
//     → SUBSET_OF_LOCAL_BALANCE ("로컬 잔고에 이미 포함됨")
//   compensationPlanCommitmentTotal → PROGRAM_COMMITMENT ("아직 발생하지 않은 프로그램 약정")
//   inFlightOnchainWithdrawalTotal  → TIMING_ADJUSTMENT ("실행 중 — 좌변·우변 어느 쪽에도 반영 안 됨")
//
// 결과만이 아니라 각 구성요소를 전부 저장한다 — 위반이 발견됐을 때 이력을 재추적하지 않고도
// 어느 항이 문제인지 바로 진단 가능해야 한다.
model ReserveVerificationRun {
  id      String                     @id @default(cuid())
  coin    String
  trigger ReserveVerificationTrigger
  ranAt   DateTime                   @default(now())

  // ── 좌변(부채), leftTotal에 합산되는 4항(L1~L4) — decimal string. ─────────────────────
  // null = "아직 계산 불가"(원칙 5), "0"과 혼동 금지. 4항 중 하나라도 null이면 leftTotal도 null.
  localLedgerBalanceTotal        String   // L1, ADDITIVE. Σ UserCoinBalance.balance — 이 문서만으로 항상 계산 가능
  unclaimedLedgeredInterestTotal String?  // L2, ADDITIVE. A-4 의존 (v2 포지션/수익요약 모델 미존재)
  // L3, ADDITIVE. (rev04 H-2′) `PLATFORM_GRANT` 포지션이 0건이면 "0"(기지값, 이유는 §2.6 comment
  // 아래 rev04 블록 참조). 1건 이상 존재하고 H-2가 미결정이면 null. H-2가 a(지급 대상)로
  // 결정되면 A-4 §7 쿼리로 실값을 채운다.
  grantPrincipalPayableTotal     String?
  // L4, ADDITIVE. (rev04 신규, Q8-a) Σ ReferralBonusPayout.total − Σ LocalLedgerEntry.amount
  // WHERE reasonCode=REFERRAL_BONUS_CREDIT. REFERRAL_BONUS_ENABLED가 꺼져 있는 오늘은 0행이므로
  // 결과는 "0"(기지값) — null이 아니다. 원장이 실재하고 조회 가능하기 때문이다(원칙 5).
  referralPayableTotal           String?
  leftTotal                      String?  // L1+L2+L3+L4. 넷 중 하나라도 null이면 leftTotal도 null

  // ── 좌변 표시·교차검증 전용 (leftTotal 산술에서 제외, componentRole 주석 참조) ──────────
  // (rev04, P-14/P-15) 소프트 락 원금 — 이미 L1(localLedgerBalanceTotal) 안에 포함되어 있으므로
  // leftTotal에 다시 더하지 않는다. INV-P5(§4.4bis)가 이 값과 stakePrincipalHoldTotal의 일치를
  // 상시 검증한다 — 항을 지우면 그 검증 대상 자체가 없어지므로 지우지 않고 강등만 한다.
  activeUserFundedPrincipalTotal String?  // A-4 의존 (v2 포지션 모델 미존재)
  // (rev04 신규) INV-P5의 좌항 — Σ(coin=coin, reasonCode=STAKE_PRINCIPAL_LOCK, status=ACTIVE인
  // LocalBalanceHold.amount). A-3만으로 항상 계산 가능.
  stakePrincipalHoldTotal        String?
  // (rev04 신규) SUBSET_OF_LOCAL_BALANCE — Σ(coin=coin, reasonCode=WITHDRAWAL_PENDING,
  // status=ACTIVE인 LocalBalanceHold.amount). 홀드는 잔고를 바꾸지 않는다(원칙 3) — L1에 이미 포함.
  withdrawalPendingHoldTotal     String?
  // (rev04 신규, §3.1 Q2 판정) TIMING_ADJUSTMENT — 실행 중(AWAITING_ONCHAIN) 온체인 출금 총액.
  // 좌변·우변 어느 쪽에도 산입하지 않는다. A-5의 WithdrawalRequest.debitTotal 합산 쿼리로 채운다
  // (A-5 소관, 이 문서는 컬럼 자리만 연다). null = A-5 미병합으로 아직 계산 불가.
  inFlightOnchainWithdrawalTotal String?
  // (rev04 신규, Q8-b) PROGRAM_COMMITMENT — 보상 플랜(650,000,000 BANA류) 등 "아직 발생하지
  // 않은 프로그램 약정"의 **관리자 입력값**. 코드 상수(EMISSION_POOL 등)를 이 컬럼이 직접 읽지
  // 않는다 — 그러면 마케팅 자료의 숫자가 재무 대시보드의 숫자가 된다. 미입력 = null = "미산정"
  // (0으로 표시하지 않는다). 입력 UI는 A-8/A-11 소관, 이 문서는 저장 위치만 연다.
  compensationPlanCommitmentTotal String?

  // 우변(준비금)
  controlledAddressCount        Int
  controlledOnchainBalanceTotal String    // decimal string

  result       ReserveVerificationResult
  marginAmount String?  // rightTotal − leftTotal. 음수 = 위반. result가 INCOMPLETE/QUERY_FAILED/NO_RESERVE_BASIS면 null
  breachDetail String?

  // 이 실행 결과가 신규 발행(그랜트/정산/클레임)을 정지시켜야 하는지 여부. 실제 킬 스위치
  // 배선은 A-5/A-10 소관 — 이 필드는 ranAt 시점의 판정만 기록한다.
  // (rev04, PoR-G1) controlledAddressCount == 0이면 result는 반드시 NO_RESERVE_BASIS이고
  // blocksIssuance는 반드시 true — "0 ≤ 0이라 PASS"가 되는 경로를 이 필드 자체가 봉쇄한다.
  blocksIssuance Boolean @default(false)

  // 이 검사가 전체 사용자 스냅샷과 함께 실행됐다면(POR_VERIFICATION 배치) 그 배치를 가리킨다.
  snapshotBatchId String?

  createdAt DateTime @default(now())

  @@index([coin, ranAt])
  @@index([coin, result, ranAt])
}
```

### 2.7 `PlatformSetting` 확장 (주기 검사 워커)

```prisma
model PlatformSetting {
  // ...기존 필드 전부 유지...

  // ─── 신규 (A-3) ─────────────────────────────────────────────
  // 읽기 전용 워커: 원장 합계를 재계산하고 PlatformControlledAddress의 온체인 잔고를 조회해
  // ReserveVerificationRun을 기록한다. 자금을 이동시키지 않는다. 기본값 true인 이유는 A-2의
  // authorityProbeWorkerEnabled와 동일하다(§1 원칙 7 — 이 워커는 켜져 있는 것 자체가 안전장치다).
  porVerificationWorkerEnabled   Boolean @default(true)
  porVerificationIntervalMinutes Int     @default(15)

  // ─── 신규 (A-3 개정 — 필수 보완 1, PoR-1′ 동기 게이팅) ─────────────
  // §4.6 assertReserveHealthyOrThrow()의 온/오프. 기본값 true — 이 필드는 자금을 이동시키지
  // 않는 순수 차단 로직이므로, §1 원칙 7과 결이 다른 예외로 "켜져 있는 것 자체가 안전장치"다
  // (authorityProbeWorkerEnabled/porVerificationWorkerEnabled와 동일 근거).
  // 주의: 이 값을 false로 내리는 것은 PoR-1′ 예방 통제를 완전히 해제하는 행위이므로, 변경 시
  // 반드시 AuditLog(action: 'POR_GATE_DISABLED')를 남기도록 관리자 라우트에서 강제할 것을
  // §4.6에서 계약으로 못 박는다.
  porGateEnabled                 Boolean @default(true)
  // §4.6의 신선도 판정 기준(분). porVerificationIntervalMinutes(15)보다 커야 하며, 한 주기를
  // 놓쳐도(예: 워커 일시 장애) 즉시 전면 차단되지 않도록 여유를 둔다 — 그렇다고 무한정 늘리면
  // 예방 통제가 사실상 탐지 통제로 되돌아가므로, 기본값은 평시 주기의 1.5배 미만으로 둔다.
  porGateMaxStalenessMinutes     Int     @default(20)
}
```

---

## 3. 요구사항 ↔ 스키마 매핑표

| 요구 | 내용 요지 | 이 설계에서 |
|------|-----------|-------------|
| **요청 1 (잔고 원장)** | 사용자별 코인별 잔고 + 증감 이력, append-only 원장 + 스냅샷, 은행식 복식부기 | `UserCoinBalance`(캐시) + `LocalLedgerEntry`(append-only, 원칙 1) |
| **요청 2 (홀드)** | 출금 요청 생성 시점 홀드, 동시 다중 요청으로 초과 인출 방지 | `LocalBalanceHold` + `LocalHoldReasonCode.WITHDRAWAL_PENDING`(§2.3). `available = balance − Σ(ACTIVE holds)`. **동시 다중 요청 TOCTOU 방지는 §4.1/§4.3의 필수 `tx` 합류 + `SELECT ... FOR UPDATE`(필수 보완 2)로 구조적으로 성립** |
| **요청 3 (PoR-1′ 검사 지점)** | Σ로컬잔고+Σ원금+Σ미청구이자+Σ그랜트원금 ≤ 통제주소 온체인 잔고 검증 데이터 모델 | `PlatformControlledAddress`(우변 레지스트리, §2.5) + `ReserveVerificationRun`(스냅샷/로그, §2.6) |
| **필수 보완 1 (PoR-1′ 동기 게이팅)** | 탐지뿐 아니라 예방 통제 — 크레딧 직전 신선도 검증으로 발행 하드 차단 | `assertReserveHealthyOrThrow()`(§4.6) + `PlatformSetting.porGateEnabled`/`porGateMaxStalenessMinutes`(§2.7), `creditLocalLedger`의 발행성 사유 코드에 자동 배선(§4.2) |
| **필수 보완 2 (홀드-잔고확인 트랜잭션 합류)** | `placeHold`/`getUserCoinBalance`가 외부 tx에 합류, 행 잠금으로 동시 요청 직렬화 | `getUserCoinBalance(..., { tx, forUpdate })`(§4.1) + `placeHold(..., { tx })`(`tx` 필수)(§4.3) |
| **요청 4 (감사 추적)** | 모든 잔고 변동의 사유 코드 체계 | `LocalLedgerReasonCode`(잔고 총액 변동) + `LocalHoldReasonCode`(홀드) — 둘로 분리한 이유는 원칙 3 |
| **rev03 W-2** | LOCAL 코인 출금 요청 = 홀드 원자 생성, 실행=홀드해제+차감, 거절=홀드해제, 트랜잭션 동일 | `LocalBalanceHold` + `executeHold`/`releaseHold` 계약(§4) |
| **rev02 §10-12 / rev03 §11 Q15** | 스테이킹 원금 락이 실제 차감인가 소프트 락인가 — "락=특수한 홀드로 통일" | `LocalHoldReasonCode.STAKE_PRINCIPAL_LOCK`, 소프트 락(EXECUTED 전이 없음). §1 원칙 2 |
| **rev03 §11 Q14** | 로컬 원장의 물리 형태 — 잔고 행 + 이동 원장 병행, 상시 검증 가능한 불변식 | `UserCoinBalance` + `LocalLedgerEntry`, 대사 계약은 §4 |
| **rev03 §3.4 PoR-1′ 우변** | 통제 주소 목록은 명시 관리 데이터, 코드 상수 금지, 블록 익스플로러 검증 가능 | `PlatformControlledAddress`(§2.5) |
| **rev02 §4.2 / rev03 §3.4** | 불변식 위반 시 발행 거부(fail-closed) | `ReserveVerificationRun.result` + `assertReserveHealthyOrThrow()`(§4.6)가 `creditLocalLedger`에 하드 배선됨. 이 원장을 거치지 않는 발행성 이벤트(A-4 정산 등)에 대한 게이팅은 여전히 그 문서 소관 |
| **A-2 §6-3 (인계 질문)** | `CoinAuthorityTransition.snapshotRef`의 정확한 형태 | `LocalBalanceSnapshotBatch.id`(§2.4) |
| **개정 01 C-9 / rev03 §4.4** | `claimedYield ≤ ledgeredYield`, 클레임 총액 == 로컬 원장 증가 총액 | 스키마 신규 테이블 불필요 — `SUM(LocalLedgerEntry WHERE reasonCode=STAKING_CLAIM)`을 A-4의 `claimedYield` 누계와 대조하는 쿼리로 검증(§4). A-4 확정 후 쿼리 형태를 그쪽 문서에 명시할 것을 제안 |
| **rev03 §3.3 DP-1** | 크레딧 멱등키는 `(chainId, txHash, logIndex)` 등 신뢰 경로 공유 | `LocalLedgerEntry.idempotencyKey` + `@@unique([coin, idempotencyKey])`(§2.2) |
| **rev02 §10-11** | BANA 18 decimals — 정밀도 정합 | 스키마는 문자열 저장으로 정밀도 손실 없음. 정규화(고정 소수 자릿수) 정책은 §6에서 A-2/A-4로 인계 |
| **rev04 P-14/P-15 (PoR-1″)** | 원금 이중 계상 제거 — 항을 삭제가 아니라 강등 + 교차검증 | `ReserveVerificationRun.activeUserFundedPrincipalTotal`을 `leftTotal`에서 제외, INV-P5/P6(§4.4bis) |
| **rev04 Q8-a/b (레퍼럴·보상 플랜)** | 발생 원장이 실재하는 스트림은 좌변 편입, 원장이 없는 스트림은 표시만 | `referralPayableTotal`(좌변) / `compensationPlanCommitmentTotal`(표시 전용, §2.6) |
| **rev04 P-17 (PoR-G1/G2)** | 통제 주소 0건일 때 오탐 PASS 차단 + 마진 초과 발행 동기 차단 | `ReserveVerificationResult.NO_RESERVE_BASIS`, `assertReserveHealthyOrThrow(coin, amount)`(§4.5/§4.6) |
| **rev04 H-2′ (P-18)** | "영구 INCOMPLETE" 지뢰 제거 — 그랜트 0건이면 기지의 0 | `grantPrincipalPayableTotal`의 null 조건 축소(§2.6). 요구 G-E(생성 경로 차단)는 A-4 소관 |
| **rev04 §2.4 (PoR-S1/INV-P7)** | 부채 스트림 등록부 — "무엇이 좌변에 없는가"를 데이터로 드러냄 | 코드 상수 + 단위 테스트(§2.4 애드덤 블록, INV-P7 §4.4bis) — 물리 테이블 미생성 |

---

## 4. 인터페이스 계약 (다음 담당자를 위한 구속력 있는 제안)

아래는 A-4(v2 스테이킹)·A-5(출금 큐 확장)·A-9(입금 레일 조사) 담당자가 이 함수들의 존재를
전제로 설계하게 될 경계다. 이름은 바뀌어도 **책임의 경계**는 유지되어야 한다.

### 4.1 잔고 읽기

```
getUserCoinBalance(userId, coin, opts?: { tx?: PrismaTransactionClient, forUpdate?: boolean })
  : Promise<{ balance: string, held: string, available: string }>
```
- `held` = Σ 이 사용자+코인의 `ACTIVE` 홀드. `available` = `balance − held`(decimal.js).
- 캐시 여부는 구현자 재량이나, 캐시한다면 §4.4의 대사 규율과 같은 원칙(캐시-증거 분리)을 따를 것.
- **트랜잭션 합류 계약 (필수 보완 2, 심각도 HIGH — wallet-security-expert 지적).**
  `opts.tx`가 주어지면 **새 트랜잭션을 열지 않고** 그 클라이언트로 쿼리를 실행한다 — 호출자의
  트랜잭션에 합류한다. `opts.tx`가 없으면 자체 읽기 전용 쿼리를 연다(잠금 없음).
- `opts.forUpdate === true`이면 `UserCoinBalance` 행을 `SELECT ... FOR UPDATE`로 잠그고 읽는다
  (`opts.tx` 없이는 사용할 수 없다 — 잠금은 트랜잭션 밖에서 의미가 없으므로 `tx` 미제공 시
  `forUpdate: true`는 즉시 예외).
- **호출부 구분이 안전의 핵심이다.**
  - `forUpdate` 없이(또는 `opts` 없이) 호출 = "정보 조회"용. 잔고 화면, 참고성 표시 등 — 이
    결과를 근거로 같은 트랜잭션에서 잔고를 변경하는 결정을 내려서는 안 된다.
  - **어떤 쓰기 결정(홀드 생성·크레딧·차감 가능 여부 판단)의 근거로 잔고를 읽을 때는 반드시
    `{ tx, forUpdate: true }`로 호출한다.** 이 구분을 어기는 것이 바로 아래 §4.3이 막으려는
    TOCTOU 레이스(잔고 100에 100짜리 요청 3건 동시 제출)의 원인이다.

### 4.2 원장 크레딧/차감 — 공유 함수 강제

```
creditLocalLedger({ userId, coin, amount, reasonCode, idempotencyKey?, relatedType?, relatedId?,
                     createdByAdminId?, createdByEmail?, adjustmentReason?, tx? })
  : Promise<LocalLedgerEntry>

debitLocalLedger(같은 시그니처): Promise<LocalLedgerEntry>
```
- `opts.tx`가 주어지면 호출자의 트랜잭션에 합류한다(§4.1과 동일 계약). 주어지지 않으면 자체
  트랜잭션을 연다 — 어느 쪽이든 아래 절차는 **하나의 DB 트랜잭션** 안에서 원자적으로 수행된다.
- **하나의 DB 트랜잭션** 안에서:
  0. **(발행성 사유 코드만 — 아래 목록) `ManagedCoin` 행을 `SELECT ... FOR UPDATE`로 잠근다.**
     이 잠금이 코인 단위의 직렬화 지점이다 — A-2 §4.6의 `changeAuthorityDirectly()`도 같은
     행을 같은 방식으로 잠그므로, 둘 중 먼저 잠금을 획득한 트랜잭션이 커밋될 때까지 다른 쪽은
     대기한다(필수 보완 3의 핵심 메커니즘 — TOCTOU 자체가 Postgres 행 잠금으로 구조적으로
     성립하지 않게 된다).
  1. 잠금 획득 **후** `assertIssuanceAllowed(coin)`(A-2 §4.3, 이번 개정으로 `directAuthorityChangeInProgress`
     및 진행 중인 `CoinAuthorityTransition`(status ∈ {FROZEN, SNAPSHOTTED, FUNDS_MOVED,
     RECONCILED})도 함께 검사하도록 확장됨 — A-2 문서 참조)를 **재검증**한다. 호출자가 이미
     사전 체크했더라도 이 함수 안에서 다시 확인한다 — 잠금 획득 전의 어떤 판단도 신뢰하지
     않는다(lock-then-check).
  2. **(발행성 사유 코드만) `assertReserveHealthyOrThrow(coin, amount)`(§4.6, rev04 PoR-G2로
     `amount` 인자 추가)를 호출한다.** 이 단계에서 던져진 예외는 잠금을 롤백하고 그대로 전파한다
     — `LocalLedgerEntry`는 삽입되지 않는다.
  3. `UserCoinBalance` 행을 `{ tx, forUpdate: true }`로 잠근다(없으면 `balance="0"`으로 생성
     후 잠금) → `newBalance = balance ± amount`(decimal.js, `debitLocalLedger`는
     `newBalance < 0`이면 예외 — 부분 차감 없음, fail-closed) → `LocalLedgerEntry` 삽입
     (`balanceAfter = newBalance`) → `UserCoinBalance.balance = newBalance`,
     `version += 1`을 함께 갱신.
- **발행성 사유 코드 목록(0~2단계 적용 대상)**: `STAKING_CLAIM`, `GRANT_PRINCIPAL_CREDIT`,
  `DEPOSIT_CONFIRMED`, `REFERRAL_BONUS_CREDIT`. 이 넷은 로컬 원장 총액을 늘려 PoR-1′ 좌변(부채)을
  증가시키는 유일한 경로들이다. **`AUTHORITY_TRANSITION_CREDIT_IN`은 제외** — 5단계 전환 절차
  자체가 이미 `FROZEN` 상태로 발행을 정지시킨 채 진행되므로 이중 게이트가 불필요하다(A-2 §4.6).
  **`ADMIN_ADJUSTMENT_CREDIT`도 제외** — 수동 정정은 정의상 자동 게이트를 우회할 수 있어야 하는
  경우가 있다(예: 대사 불일치를 바로잡는 조정 자체가 게이트를 통과 못 할 수 있다). 대신 이미
  요구되는 `createdByAdminId`/`adjustmentReason` + `AuditLog`가 그 책임 소재를 대신한다. 순수
  차감 사유 코드(`WITHDRAWAL_EXECUTED`, `AUTHORITY_TRANSITION_DEBIT_OUT`,
  `ADMIN_ADJUSTMENT_DEBIT`)는 부채를 줄이므로 0~2단계 전부 스킵 — `ManagedCoin` 잠금 없이
  바로 3단계로 진행한다(불필요한 직렬화 병목 방지).
- **A-4로 상속되는 요구사항.** `claimYield`(A-4 §6.2)는 `creditLocalLedger(STAKING_CLAIM)`을
  통해 이 게이트를 자동으로 물려받는다 — A-4가 별도로 게이트를 호출할 필요 없다. **그러나
  A-4의 "정산"(일별 이자 발생, `UserCoinYieldSummary.ledgeredYieldTotal` 증가)은 이 원장을
  거치지 않는다**(§0 명시) — 그럼에도 `unclaimedLedgeredInterestTotal`을 늘려 PoR-1′ 좌변을
  증가시키므로, **정산 함수도 독립적으로 `assertReserveHealthyOrThrow(coin)`을 호출해야 한다.**
  이 문서는 그 호출 지점을 A-4 애드덤으로 명시할 것을 제안한다 — A-4 담당자(같은 에이전트라도
  별도 세션)가 착수 전에 A-4 문서에 이 요구사항을 추가로 반영해야 한다.
- `idempotencyKey`가 주어지고 `(coin, idempotencyKey)`가 이미 존재하면 **새로 쓰지 않고 기존
  행을 반환**한다(멱등 no-op). 이중 크레딧의 유일한 방어선이다.
- `reasonCode`가 `ADMIN_ADJUSTMENT_*`이면 `createdByAdminId`/`createdByEmail`/`adjustmentReason`
  **셋 다 필수**(앱 계층 검증)이며, 같은 트랜잭션 안에서 기존 `recordAudit()` 헬퍼로
  `AuditLog` 행도 함께 남긴다(신규 스키마 불필요 — A-2가 `CoinAuthorityTransition`에 적용한
  것과 같은 재사용 원칙).
- **UserCoinBalance를 이 함수 밖에서 직접 UPDATE하는 코드는 존재해서는 안 된다.** 우회 경로가
  하나라도 생기면 `version` 대사(§4.4)가 그것을 잡아낸다.

### 4.3 홀드 — 생성 / 해제 / 실행

```
placeHold({ userId, coin, amount, reasonCode, relatedType, relatedId?, tx }): Promise<LocalBalanceHold>
releaseHold(holdId, releasedReason, opts?: { tx? }): Promise<LocalBalanceHold>
executeHold(holdId, { reasonCode: 'WITHDRAWAL_EXECUTED', idempotencyKey, relatedType?, relatedId?, tx? })
  : Promise<{ hold, ledgerEntry }>
```
- **트랜잭션 합류 계약 (필수 보완 2, 심각도 HIGH — wallet-security-expert 지적).**
  `placeHold`의 `tx`는 **선택이 아니라 필수**다 — 시그니처에 옵셔널 마크(`?`)가 없다. 호출자는
  반드시 자신의 트랜잭션 클라이언트를 넘겨야 한다. 이렇게 강제하는 이유: `placeHold`는 거의
  항상 "요청 레코드 생성"(예: `WithdrawalRequest` insert, v2 포지션 insert)과 짝을 이루는데,
  둘을 별도 트랜잭션으로 나누면 그 사이 구간에서 같은 잔고를 노리는 다른 요청이 끼어들 수 있다.
  **요청 생성 → 잔고확인 → 홀드삽입이 반드시 하나의 트랜잭션이어야 한다** — 호출부는 대략:
  ```
  await prisma.$transaction(async (tx) => {
    // 1) 요청 레코드를 먼저(또는 나중에, 순서는 호출자 재량이나 같은 tx여야 함) 만든다
    const withdrawalRequest = await tx.withdrawalRequest.create({ ... })
    // 2) 같은 tx로 홀드를 건다 — 여기서 UserCoinBalance 잠금 + available 검증이 일어난다
    const hold = await placeHold({
      userId, coin, amount, reasonCode: 'WITHDRAWAL_PENDING',
      relatedType: 'WITHDRAWAL_REQUEST', relatedId: withdrawalRequest.id, tx,
    })
  })
  ```
- `placeHold` 내부 절차(전부 호출자가 넘긴 `tx` 안에서 수행, 새 트랜잭션을 열지 않음):
  1. `UserCoinBalance` 행을 `{ tx, forUpdate: true }`로 잠근다(없으면 `balance="0"`으로 생성
     한 뒤 같은 트랜잭션 안에서 다시 잠근 상태를 유지 — insert 직후의 행은 그 트랜잭션의
     쓰기이므로 자동으로 잠겨 있다).
  2. 이 잠금이 유지되는 동안, 같은 사용자+코인에 대한 **모든** `placeHold`/`creditLocalLedger`/
     `debitLocalLedger` 호출이 같은 `UserCoinBalance` 행을 잠그려 시도하므로 대기열에 선다 —
     **이것이 "잔고 100에 100짜리 요청 3건 동시 제출" 레이스를 닫는 메커니즘이다.** 두 번째,
     세 번째 트랜잭션은 첫 번째가 커밋(그리고 그 커밋에 포함된 새 홀드)할 때까지 대기했다가,
     갱신된 `held` 합계를 읽고 `available < amount`로 정확히 거부된다.
  3. `held := SUM(이 사용자+코인의 ACTIVE 홀드)`, `available := balance − held`(decimal.js) 계산.
  4. `available < amount`면 예외(호출자에게 그대로 전파, 잔고 부족 에러).
  5. `ACTIVE` 홀드 삽입. `(relatedType, relatedId, reasonCode)` 유니크 제약 위반(예: 같은 출금
     요청에 중복 홀드 시도)은 호출자 오류로 표면화한다 — 조용히 무시하지 않는다.
  6. **`UserCoinBalance.balance`는 건드리지 않는다**(원칙 3).
- `releaseHold`: `ACTIVE → RELEASED`. 원장 행 없음, 잔고 불변. `tx`는 선택 — 단독 트랜잭션으로
  호출해도 안전하다(잠금 없이도 `ACTIVE`인 홀드를 원자적 클레임 패턴으로 전이하면 되므로 §4.1의
  잠금 요구가 적용되지 않는다 — 홀드 해제는 `UserCoinBalance`를 건드리지 않기 때문).
- `executeHold`: **`WITHDRAWAL_PENDING` 홀드에만 유효**(`STAKE_PRINCIPAL_LOCK`은 절대 실행되지
  않는다 — 호출 시 예외). N-30과 동일한 원자적 클레임 패턴
  (`updateMany({ where: { id, status: 'ACTIVE' }, data: { status: 'EXECUTED' } })`,
  `count === 1`일 때만 진행) + 같은 트랜잭션에서 `debitLocalLedger(WITHDRAWAL_EXECUTED, { tx })`
  호출 + `hold.executedLedgerEntryId` 기록. `executeHold`가 자체 트랜잭션을 열면 `tx`는 그
  트랜잭션 클라이언트를 그대로 `debitLocalLedger`에 전달한다(§4.2의 `tx` 합류 계약과 동일).

### 4.4 대사(reconciliation) — 캐시와 증거의 정합

```
reconcileUserCoinBalances(coin): Promise<{ checked: number, mismatches: Array<{userId, cached, derived}> }>
```
- `UserCoinBalance.balance`를 그 사용자+코인의 `SUM(LocalLedgerEntry CREDIT) − SUM(DEBIT)`과
  대조한다. 불일치는 **자동 정정하지 않는다** — `AuditLog`(`action:
  'LOCAL_LEDGER_RECONCILIATION_MISMATCH'`)로 남기고 사람이 본다(§2.6 `ReserveVerificationRun`과
  같은 결의 fail-loud 원칙 — 자동 자가 치유는 잔고 문제에서 위험하다).
- `UserCoinBalance.version`이 해당 사용자+코인의 `LocalLedgerEntry` 행 수와 다르면 별도로 경보한다
  — §4.2의 "공유 함수 우회" 감지기.
- 실행 주체(§2.7 워커와 합칠지 별도로 둘지)는 A-5가 결정한다. 이 문서는 계약만 못 박는다.

### 4.4bis (rev04 신규) INV-P5 / INV-P6 / INV-P7 — 강등된 항을 불변식으로 검증한다

> **배경 (P-15).** §2.6의 `activeUserFundedPrincipalTotal`은 `leftTotal` 산술에서 빠졌지만
> 컬럼 자체는 남는다 — "원금이 잔고 안에 있다"는 전제가 **검증되지 않는 가정**으로 남으면 안
> 되기 때문이다. 아래 두 불변식이 그 가정을 상시 검증한다.

> **요구 INV-P5 (신규, 필수).** LOCAL 권위 코인 C에 대해 상시 성립해야 한다:
> ```
> Σ(coin=C, reasonCode='STAKE_PRINCIPAL_LOCK', status='ACTIVE'인 LocalBalanceHold.amount)
>   ==  activeUserFundedPrincipalTotal(C)
> ```
> (좌항은 §2.6의 `stakePrincipalHoldTotal` 컬럼이 저장하는 값과 동일한 쿼리다.) 불일치는
> **자동 정정하지 않는다** — `AuditLog`(`action: 'STAKE_PRINCIPAL_HOLD_MISMATCH'`, `detail`에
> 두 값과 차이를 기록)로 남기고 인시던트로 승격한다. **불일치 상태에서는 해당 코인의 발행을
> 차단한다** — `runReserveVerification`이 이 대사를 `unclaimedLedgeredInterestTotal`과 같은
> 방식으로 함께 계산해 불일치 시 `result = FAIL`(사유 `STAKE_PRINCIPAL_HOLD_MISMATCH`)로
> 기록하는 것을 §4.5 구현 시 반영한다 — 이 불일치는 곧 "좌변(정확히는 그 부분집합 관계)을
> 신뢰할 수 없다"는 뜻이기 때문이다.
>
> 검증 쿼리(§4.4의 `reconcileUserCoinBalances`와 나란히 두거나 통합):
> ```
> reconcileStakePrincipalHolds(coin): Promise<{ holdTotal: string, principalTotal: string, matches: boolean }>
> ```

> **요구 INV-P6 (신규, 필수).** `Σ(coin=C, status='ACTIVE'인 모든 LocalBalanceHold.amount)
> ≤ localLedgerBalanceTotal(C)`. 위반은 홀드가 잔고를 초과했다는 뜻이며, `available`이 음수인
> 사용자가 존재한다는 신호다 — §4.3의 `placeHold`가 매 호출마다 `available < amount`를 이미
> 검사하므로 정상 경로에서는 위반이 발생할 수 없지만, 공유 함수를 우회한 직접 쓰기(§4.2 마지막
> 문단이 경계하는 바로 그 경로)가 있었다면 이 불변식이 그것을 잡아낸다.

> **요구 INV-P7 (신규, 필수 — rev04 §2.4 PoR-S1과 짝).** `role='ADDITIVE'`이고 `status='LIVE'`인
> 모든 부채 스트림(위 상단 rev04 애드덤 블록의 PoR-S1 목록)은 `ReserveVerificationRun`에 대응하는
> 컬럼(`porComponent`)이 **반드시 실재**해야 한다. 이 문서의 스키마 범위에서는 코드 상수 목록 +
> `qa-lead` 단위 테스트로 강제한다(물리 테이블을 두지 않기로 한 §2.4 결정과 동일 근거) — 하나라도
> 매핑이 비면 그 테스트가 실패해야 하고, 런타임에서는 `runReserveVerification`이
> `result = INCOMPLETE`(사유 `UNMAPPED_LIABILITY_STREAM`)로 기록해야 한다.

### 4.5 PoR-1″ 검사

```
runReserveVerification(coin, trigger): Promise<ReserveVerificationRun>
```
- 읽기 전용. `localLedgerBalanceTotal = SUM(UserCoinBalance.balance WHERE coin=coin)` — 이 값은
  A-3만으로 항상 계산 가능하다. **(rev04) `referralPayableTotal`도 A-3만으로 항상 계산
  가능하다**(`Σ ReferralBonusPayout.total − Σ LocalLedgerEntry.amount WHERE
  reasonCode=REFERRAL_BONUS_CREDIT`, 오늘은 0행이므로 결과 `"0"`). `unclaimedLedgeredInterestTotal`/
  `grantPrincipalPayableTotal`은 A-4/H-2가 갖춰지기 전까지 `null`로 두고 `result = INCOMPLETE`를
  반환한다(단 `grantPrincipalPayableTotal`은 rev04 H-2′에 따라 `PLATFORM_GRANT` 포지션이 0건이면
  `null`이 아니라 `"0"`이다 — §2.6) — **`FAIL`도 `PASS`도 거짓 신호이므로 쓰지 않는다.**
  좌변 4항(L1~L4) 전부가 채워지고 `leftTotal <= rightTotal`이면 `PASS`, 아니면 `FAIL`.
- **(rev04) `activeUserFundedPrincipalTotal`/`stakePrincipalHoldTotal`/`withdrawalPendingHoldTotal`/
  `inFlightOnchainWithdrawalTotal`/`compensationPlanCommitmentTotal`은 leftTotal 산술에 관여하지
  않는다** — 채워지든 `null`이든 `result`/`leftTotal` 판정에 영향을 주지 않는, 표시·교차검증
  전용 값이다(§2.6). `compensationPlanCommitmentTotal`은 이 함수가 계산하지 않는다(관리자 입력값,
  A-8/A-11 소관 — 이 함수는 마지막으로 저장된 값을 그대로 이번 실행 행에 복사할 뿐이다).
- 우변은 `SUM(PlatformControlledAddress.active=true 온체인 잔고 WHERE coin=coin)`.
  **(rev04, PoR-G1) `controlledAddressCount === 0`이면 그 값과 무관하게 `result = NO_RESERVE_BASIS`,
  `blocksIssuance = true`를 강제한다 — 이 판정은 좌변 계산보다 먼저 확인하고, 좌변이 얼마이든
  (`"0"`이든 `null`이든) 덮어쓴다.** `0 ≤ 0`이 참이라서 `PASS`가 나는 경로를 이 강제가 원천
  봉쇄한다(§2.6 enum comment). 온체인 읽기 자체가 실패하면(주소는 있으나 조회 실패)
  `QUERY_FAILED`(장애이지 판정이 아니다) — `controlledAddressCount === 0`과 `QUERY_FAILED`는
  다른 사유이므로 혼동하지 않는다.
- `blocksIssuance`는 이 실행이 기록될 당시의 판정 스냅샷이다. **이 필드 자체를 실시간으로
  폴링해 발행을 막는 것은 §4.6이 정의하는 예방 통제가 아니다** — §4.6은 크레딧 직전에
  `ReserveVerificationRun`을 다시 조회해 판정한다(아래). 그 외의 실행 경로(예: 대시보드 경보,
  출금 전체 정지 같은 더 넓은 킬 스위치)에 `blocksIssuance`를 추가로 배선할지는 여전히
  A-5/A-10 소관이다.

### 4.6 PoR-1″ 동기 게이팅 — `assertReserveHealthyOrThrow()` (필수 보완 1, 심각도 HIGH ·
    **rev04 PoR-G2로 시그니처 개정**)

> **문제.** 기존 설계는 `ReserveVerificationRun`을 `WORKER_PERIODIC`(15분 주기)로만 채웠다 —
> 이것은 **탐지(detective) 통제**다. 두 검사 사이 구간에서 부채가 온체인 준비금을 초과해도
> 다음 주기까지 아무것도 막지 못한다. 아래 함수가 **예방(preventive) 통제**로서 그 구간을 없앤다.

> **(rev04, PoR-G2) 왜 시그니처에 `amount`가 추가됐는가.** 신선도 창(`porGateMaxStalenessMinutes`,
> 기본 20분) 안에서는 마지막 실행의 `marginAmount`를 그대로 신뢰한다 — 그런데 그 마진을 넘는
> 단일 발행이 같은 창 안에서 들어오면, 옛 시그니처(코인만 검사)는 이를 통과시킨다. 이번에
> 발행하려는 금액을 인자로 받아 `marginAmount`와 직접 비교하면, **경고 밴드 임계값 정책
> 없이도**(Q3, rev04 §3.2가 이연한 그 정책) 이 구멍을 닫을 수 있다.

```
assertReserveHealthyOrThrow(coin: string, amount: string): Promise<void>
// throws ReserveGateBlockedError({ coin, amount,
//   reason: 'NO_RUN' | 'STALE' | 'INCOMPLETE' | 'FAIL' | 'QUERY_FAILED' | 'NO_RESERVE_BASIS' | 'INSUFFICIENT_MARGIN',
//   lastRun?: ReserveVerificationRun })
```

**판정 절차 (읽기 전용, 호출자의 트랜잭션 안에서 §4.2의 0~2단계 순서로 호출됨):**
1. `PlatformSetting.porGateEnabled === false`면 즉시 통과(no-op) — 단, §2.7이 명시하듯 이
   토글을 끄는 관리자 액션은 그 자체로 `AuditLog('POR_GATE_DISABLED')`를 강제한다.
2. `ReserveVerificationRun WHERE coin=coin ORDER BY ranAt DESC LIMIT 1`을 조회한다.
   - 행이 없으면 → `NO_RUN`으로 차단(코인에 대해 PoR 검사가 단 한 번도 돌지 않았다는 뜻이며,
     이는 곧 우변(준비금)이 검증된 적이 없다는 뜻이다 — fail-closed).
3. `now() − run.ranAt > PlatformSetting.porGateMaxStalenessMinutes`(분)이면 → `STALE`로 차단
   (워커가 죽었거나 지연된 상태에서 "마지막으로 알려진 PASS"에 무기한 기대지 않는다).
4. **(rev04, PoR-G1) `run.result === 'NO_RESERVE_BASIS'`면 그 값 그대로 차단** — 통제 주소가
   0건인 채로 `PASS`가 나는 경로는 §2.6/§4.5가 스키마·쿼리 레벨에서 이미 봉쇄했으므로, 이
   함수는 그 판정을 그대로 전파하기만 한다.
5. `run.result !== 'PASS'`면 그 값 그대로(`INCOMPLETE`/`FAIL`/`QUERY_FAILED`)를 사유로 차단.
6. **(rev04, PoR-G2) `amount`가 `run.marginAmount`보다 크면 → `INSUFFICIENT_MARGIN`으로 차단.**
   `marginAmount`가 이번 발행 후에도 여전히 비음수로 유지될 것인지를 신선도 창 안에서 확인하는
   마지막 단계다 — 배치 발행(정산 워커의 일괄 크레딧)에서 `amount`는 **배치 총액 기준**으로
   해석한다(rev04 §8 질문 22, PM 의견 채택 — 건별보다 보수적). 정확한 배치 경계는 A-4 정산
   함수 구현 시 그 문서가 확정한다.
7. 위 전부를 통과하면 반환(통과) — 크레딧이 §4.2의 3단계로 진행된다.

**이것은 "가벼운 버전"이다 — 매 클레임/그랜트마다 온체인 RPC를 다시 호출하지 않는다.** 대신
15분 주기 워커가 채운 `ReserveVerificationRun`의 신선도(freshness)를 게이트 조건으로 삼는다.
온체인 조회 자체를 크레딧 경로에 동기 삽입하는 "무거운 버전"은 지연시간·RPC 부하 트레이드오프
때문에 이 문서가 기본값으로 채택하지 않는다 — 신선도 창(`porGateMaxStalenessMinutes`, 기본
20분)이 그 대신 예방 통제의 강도를 결정한다. 더 촘촘한 창(예: 5분)이 필요하다고 판단되면
`porVerificationIntervalMinutes`를 함께 낮추는 것을 §2.7에서 이미 요구하고 있다(신선도 창이
평시 주기의 1.5배 미만).

**호출 지점 (모두 `assertReserveHealthyOrThrow(coin, amount)` — rev04 이후 `amount` 필수 인자):**
- `creditLocalLedger`의 발행성 사유 코드(§4.2 목록)에 대해 자동 적용 — `amount`는 그 크레딧
  호출의 `amount` 그대로. 별도 배선 불필요.
- **A-4의 정산 함수는 이 원장을 거치지 않으므로 별도로 호출해야 한다**(§4.2 마지막 항목에
  이미 명시). `amount`는 그 정산 배치가 늘리는 `ledgeredYieldTotal` 증분(배치 총액, rev04 §8
  질문 22)이다.
- `changeAuthorityDirectly()`(A-2 §4.6)도 잔고 재개(권위 전환 완료 시) 전 이 게이트를 호출할
  것을 권고한다 — 필수는 아니다(전환 완료 시점엔 통상 부채가 이미 0이거나 스냅샷으로 고정돼
  있어 위험이 낮지만, 방어적으로 호출해도 비용이 낮다). `amount`는 이 경로에서 `"0"`으로
  호출한다(신규 발행이 아니라 재개 판단이므로 마진 초과 검사는 무의미 — `NO_RUN`/`STALE`/
  `NO_RESERVE_BASIS`/`INCOMPLETE`/`FAIL` 판정만 의미가 있다).

**알려진 결과(rev04 H-2′로 범위가 좁혀짐, §6 항목 5 참조).** V2-CORE는 그랜트 기능을 제공하지
않으므로(요구 G-E, A-4 소관 — 그랜트 포지션 생성 경로 자체가 fail-closed) `grantPrincipalPayableTotal`은
`"0"`(기지값)으로 유지된다. 다만 `unclaimedLedgeredInterestTotal`은 여전히 A-4(v2 정산/수익요약
모델)가 병합되기 전까지 `null`이므로, **A-4 병합 전까지는 `STAKING_CLAIM`이 `INCOMPLETE`로 차단된
채로 남는다** — 이것은 버그가 아니라 이 보완이 요구하는 fail-closed의 직접적 귀결이며, A-4가
병합되고 `unclaimedLedgeredInterestTotal` 쿼리(A-4 §7)가 연결되어야 비로소 좌변 4항 전부가
채워져 `PASS`/`FAIL` 판정이 가능해진다.

---

## 5. Prisma 관례 준수 확인

- 모든 금액 컬럼은 `String`(canonical decimal string). `Int`/`Float` 없음(CLAUDE.md 규칙 2).
- 신규 필드 전부 안전 기본값: `balance="0"`, `version=0`, 홀드/원장 `status`/`result` 계열은
  변동 유발 값이 아닌 상태(예: 워커 `enabled=true`는 §1 원칙 7이 명시한 유일한 예외이며, 자금
  이동이 없는 읽기 전용 워커라는 근거를 A-2와 동일하게 반복한다).
- `cuid()` id, `createdAt`/`updatedAt` 관례, 관리자 발생 행의 `adminId` + 비정규화된
  `adminEmail` 병행 저장(`WithdrawalRequest.reviewedById`, `AuditLog.adminEmail`,
  A-2의 `CoinAuthorityTransition.initiatedByEmail`과 동일한 코드베이스 관례) 전부 유지.
- 기존 테이블(`WithdrawalRequest`, `StakePosition`, `StakingPayout`, `ManagedCoin`,
  `PlatformSetting`)에 대한 **파괴적 변경 없음** — `PlatformSetting`에 대한 변경은 컬럼 추가뿐.

---

## 6. 남는 설계 질문 (다음 단계로 명시적으로 넘김)

1. **정밀도 정규화 정책.** BANA는 18 decimals(rev02 N-14)다. `LocalLedgerEntry.amount` 등
   decimal 문자열의 정규화 자릿수를 온체인 정밀도와 맞추는 규칙이 필요하다. 자연스러운 자리는
   `ManagedCoin`(A-2 소유)에 `onchainDecimals` 같은 필드를 추가하는 것이지만, 이 문서가 A-2의
   테이블을 재정의하지는 않는다 — **A-2 애드덤 또는 A-4 설계 시 결정**을 제안한다.
2. **`fundingSource` 명명 재검토.** 개정 01 G-A의 `USER_HUB | PLATFORM_GRANT`는 LOCAL 권위
   코인에는 "허브"라는 이름이 더 이상 정확하지 않다(원금이 로컬 잔고에서 소프트 락되지, 허브
   잔고에서 락되지 않는다). A-4가 이 enum을 재정의할 때 `USER_HUB` → `USER_BALANCE`류 명칭
   변경을 검토할 것을 제안한다 — 유도가 아니라 명시 필드라는 X-1′/G-A의 원칙 자체는 그대로
   승계된다.
3. **대사(§4.4)·PoR 검사(§2.7) 워커를 하나로 합칠지 분리할지.** 둘 다 읽기 전용이고 같은
   `UserCoinBalance` 테이블을 스캔한다는 점에서 합치는 것이 효율적이나, 실행 주체·주기·실패
   시 알림 대상이 다를 수 있다 — **A-5 구현 시 결정**.
4. **`STAKE_PRINCIPAL_LOCK` 홀드의 `relatedId`가 가리킬 대상.** A-4가 v2 포지션 모델을
   확정하기 전까지는 자리 표시자다. 개정 03 CS-3(구 `StakePosition` 삭제)에 따라 레거시 id를
   가리킬 일은 없다 — **A-4 설계 시 이 필드의 실제 참조 대상을 확정**.
5. **(rev04 H-2′로 해소됨 — P-18)** 원래 우려: 그랜트 원금 처리(H-2)가 결정되지 않으면
   `grantPrincipalPayableTotal`은 영구히 `null`이고 PoR-1″는 영구히 `INCOMPLETE`가 되어
   `STAKING_CLAIM`이 영구 차단된다는 "지뢰"였다. **rev04 H-2′가 이를 좁혔다**: `PLATFORM_GRANT`
   포지션이 **0건**이면(V2-CORE는 재구축이므로 신규 테이블도 0건에서 시작) `grantPrincipalPayableTotal`은
   `null`이 아니라 `"0"`(기지의 0)이다 — H-2가 결정되기 전까지 그랜트 포지션 생성 자체를
   fail-closed로 차단하는 요구 G-E(A-4 소관)가 이 `"0"`을 항상 정직하게 유지한다. **따라서
   V2-CORE 범위(그랜트 기능 미제공)에서는 이 항목이 더 이상 영구 INCOMPLETE를 만들지 않는다** —
   그랜트 포지션이 실제로 하나라도 생기는 시점(H-2 결정 이후)부터만 이 우려가 다시 유효해진다.
6. **`ReserveVerificationRun`의 결과를 발행을 막는 코드에 연결하는 시점 — 부분 해소됨.** 이
   개정으로 `creditLocalLedger`의 발행성 사유 코드 경로는 **연결이 완료됐다**(§4.6). 다만
   Q-M3(회사 지갑 주소) 회신 전에는 `PlatformControlledAddress`가 비어 있어 우변이 항상
   0이므로, 좌변이 조금이라도 발생하는 순간(현재는 `INCOMPLETE`라 그 이전 단계) 즉시 걸린다
   — 이 게이트가 "무의미"한 것이 아니라 "항상 차단"으로 작동한다는 뜻이다. `porGateEnabled`를
   끄지 않는 한 Q-M3 회신 전까지 어떤 발행성 크레딧도 통과하지 못한다(원칙 5의 직접 귀결).
   이 원장을 거치지 않는 발행성 이벤트(A-4 정산 함수)에 대한 배선은 여전히 A-4 애드덤 소관.

---

## 7. 마이그레이션 상태 — 실행하지 않음

이번 세션에서 실행한 것은 로컬 `migrate status` 조회 하나뿐이다(`prisma migrate deploy`/
`db push` 미실행):

- 로컬(`bana_wallet_dev`): 26개 마이그레이션, **up to date**(A-2 세션 이후 변경 없음).
- 프로덕션은 A-2 설계 시점(같은 세션)에 이미 확인됨 — 26개 마이그레이션, up to date, 드리프트
  없음. 이번 A-3 작업은 스키마 파일에 아무것도 반영하지 않았으므로 재확인은 생략했다(읽기 전용
  조회조차 이 설계 문서 산출에 필요하지 않았다).

**rev03 §7.2의 3조건은 여전히 미충족이며, 그대로 유지된다:**
① 이 문서(A-3)와 A-2의 마스터 승인, ② 모든 신규 필드 기본값 "꺼짐"/0(위 설계는 이를 만족하도록
작성됐다), ③ 로컬 원장에 0이 아닌 값을 쓰는 코드 경로 미병합(A-4/A-5 미착수 상태이므로 현재
자동 충족). **셋 다 확인되기 전까지 `prisma migrate dev`를 실행하지 않는다.**

**(rev04 §5.3 추가) 조건 ④.** A-3(이 문서)/A-4/A-5의 마이그레이션 실행은 **Q-M5 회신이
"(나) 로컬 원장 유지"일 때만 허용한다.** rev04 §6.3 기준 Q-M5는 여전히 "사람만 답할 수 있음"
목록에 남아 있다 — 이 문서의 애드덤 반영이 조건 ④를 충족시키지 않는다.

---

## 8. 이 문서가 승인하지 않는 것 (명시)

- **마이그레이션 실행 승인이 아니다.** `prisma migrate dev`/`deploy` 어느 것도 실행하지 않았고,
  §7의 3조건이 전부 충족되기 전까지 실행하지 않는다.
- **`web-shared-expert`/A-4 담당자의 크레딧·홀드 로직 구현 착수 승인이 아니다.** §4의 인터페이스는
  제안이며, 실제 코드 작성은 각 담당자 자신의 스코프 판단과 필요 시 추가 확인을 거친다.
- **A-4(v2 스테이킹 스키마)·A-5(출금 큐 확장)·입금 레일의 설계가 아니다.** 이 문서가 남긴
  인터페이스 지점(§6 등)을 전제로 별도 설계한다.
- **PoR-1′ 게이트의 `creditLocalLedger` 배선(§4.6)은 설계·계약이지 구현 착수 승인이 아니다.**
  `assertReserveHealthyOrThrow()`의 실제 코드 작성도 §7의 3조건이 전부 충족되기 전까지는
  이루어지지 않는다 — 이 문서가 "무엇을 어떻게 연결할지"를 확정했을 뿐, "지금 그 코드를
  써도 된다"는 뜻이 아니다. 이 원장을 거치지 않는 발행성 이벤트(A-4 정산 등)에 대한 게이팅
  배선은 여전히 A-4/A-5/A-10 소관이고 별도 착수 승인을 거친다.
