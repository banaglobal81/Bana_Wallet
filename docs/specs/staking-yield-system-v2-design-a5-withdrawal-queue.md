# 설계 문서 A-5 — 출금 큐 확장(W-3~W-9) + 온체인 읽기 전용 검증 헬퍼

> 작성: `web-shared-expert` · 2026-08-10
> **근거 문서(읽은 순서):** `staking-yield-system-v2-INDEX.md` →
> `staking-yield-system-v2-prd.md`(개정 01) → `...-prd-rev02-balance-authority.md`(개정 02) →
> `...-prd-rev03-rebuild-and-exclusivity.md`(개정 03, 특히 §4 Q-M2 판정 — 이 문서가 답하는 항목) →
> `staking-yield-system-v2-design-a2-balance-authority.md`(A-2, `CoinBalanceAuthority` /
> `assertExecutionAllowed()` 등 인터페이스 — 이 문서가 그 위에 얹힌다) →
> `docs/research/2026-08-10-bsc-deposit-detection-and-band-legal-issues.md`(BSC 확정 컨펌·reorg
> 예비 조사 — **수치 미확정임을 명시하고 있으므로 이 문서도 확정 수치를 만들지 않는다**)
>
> **지위: 설계 문서다. 구현 지시서가 아니다.** 아래 스키마·인터페이스 조각은 **개념 초안**이며
> `web/prisma/schema.prisma` · `web/src/app/api/**` · `web/src/lib/**` 어디에도 아직 반영되지
> 않았다. **이번 세션에서 실행/병합한 코드 변경은 없다.** `prisma migrate dev`/`deploy`,
> `db push` 전부 미실행(그리고 `db push`는 CLAUDE.md 규칙 7에 의해 항상 절대 금지).
> 최종 Prisma 문법·필드명은 `prisma-db-expert`의 검토·확정을 거쳐야 한다(A-2 문서와 동일한
> 경계 — 이 문서는 요구사항과 개념 스키마까지만 책임진다).
>
> **W-1(잔고 검증 무조건화)은 이미 별도로 수정·병합되어 프로덕션에 반영되어 있다**
> (`web/src/app/api/nia/withdrawals/route.ts` §3c — 락 유무와 무관하게 허브 잔고를 항상 조회하고,
> 조회 실패는 fail-closed). 이 문서는 그 위에 **W-2~W-9**를 얹는다.
>
> **A-3(로컬 잔고 원장) 설계가 이 세션 중 `prisma-db-expert`에 의해 이미 작성 완료됐다**
> (`staking-yield-system-v2-design-a3-local-ledger.md` — 발견 후 확인함). 따라서 §3은 "A-3가
> 제공해야 할 것"을 가상으로 정의하지 않고, **A-3 §4가 실제로 제안한 `LocalBalanceHold` /
> `placeHold` / `releaseHold` / `executeHold` / `getUserCoinBalance` 인터페이스에 직접 정합화**한다.
> 두 문서는 상호 참조 관계다 — A-3 §0은 "A-5가 아직 `WithdrawalRequest`를 확장하지 않았으므로
> `LocalBalanceHold`가 그것을 느슨한 참조(`relatedType`/`relatedId`)로만 가리킨다"고 이미
> 명시해 두었고, 이 문서의 §1.4 `localHoldId`가 정확히 그 반대쪽 참조다.

> **개정 — `wallet-security-expert` A-10 조건부 승인 반영 (2026-08-10).** A-10 리뷰가 이
> 문서를 조건부 승인하며 필수 보완 2건을 지정했다: (1) `withdrawalOnchainMinConfirmations`
> 하한(floor) 강제 미비(MEDIUM) → §2.6에 강제 로직 추가로 해소. (2) `GET /api/nia/withdrawals`
> 병합 조건 수정과 `submit-tx` 신설의 동시 배포 미확정(MEDIUM, "신뢰 손상" 위험) → §1.8에
> "릴리스 순서 요구"로 명문화. 아울러 §3.2/§1.5의 홀드-트랜잭션 합류 지점에서 A-5 의사코드가
> `tx`를 실제로 전달하지 않던 불일치(배열 형태 `$transaction`이 커스텀 함수와 원자적으로
> 결합될 수 없는 문제 포함)를 함께 발견해 수정했다. 세부 내용은 각 절 본문 참조.

---

## 0. 이 문서가 다루는 범위 (rev03 §7.2 A-5)

> *"출금 큐 확장 설계(W-3~W-9) + 온체인 읽기 전용 검증 헬퍼"* — 담당: `web-shared-expert`. 선행: A-2.

**이 문서가 만드는 것:**
- `WithdrawalRequest` 상태 기계에 `AWAITING_ONCHAIN`을 추가하는 설계 — 기존 상태·기존 코드 경로
  (`forwardWithdrawalToHub`, 관리자 승인 큐, N-30 원자적 클레임 패턴)와의 통합 방식
- **읽기 전용** 온체인 검증 헬퍼의 인터페이스와 검증 로직 설계 (구현 아님)
- W-2(요청 시점 홀드)가 A-3(로컬 원장, 아직 미작성)의 홀드 메커니즘과 맞물리는 지점 —
  A-3가 제공해야 할 계약(interface contract)으로 명시
- non-custodial 실행이라는 제약이 이 설계의 모든 지점에서 실제로 지켜지는지에 대한 재확인

**이 문서가 만들지 않는 것 (명시적으로 다음 작업/타 에이전트로 미룸):**
- **A-3(로컬 잔고 원장) 자체의 상세 스키마.** `prisma-db-expert`가 이미 별도 문서로 작성했다
  (`staking-yield-system-v2-design-a3-local-ledger.md`). 이 문서는 그 인터페이스를 **소비**할
  뿐, 재정의하지 않는다(§3).
- **실제 코드 작성·병합.** 마스터 지시("아직 실제 코드를 작성/병합하지 마세요")에 따라 아래는
  전부 설계 조각이다.
- **W-7(가스비 부담·관리자 수수료 설정)의 관리자 화면 및 `ManagedCoin.networks[]` 수수료 필드
  설계.** W-7 자체는 인정하고 데이터 홈을 지정하지만(§1.6/§5), 상세 설계는 코인 관리 화면
  작업(A-2 인접, `product-planner`/`prisma-db-expert`)으로 넘긴다.
- **온체인 검증 헬퍼가 쓸 구체적 라이브러리 선택**(raw JSON-RPC fetch vs `viem`/`ethers` 등
  읽기 전용 클라이언트). 인터페이스는 라이브러리 독립적으로 설계했고, 선택은 구현 착수 시점에
  `wallet-security-expert` 리뷰와 함께 결정한다(§2.8).
- **확정 컨펌 수의 최종 숫자.** 조사 문서 자체가 "확정하지 말 것"이라고 명시했다(§2.6).

---

## 1. `WithdrawalRequest` 상태 기계 — `AWAITING_ONCHAIN` 통합 설계

### 1.1 기존 상태와의 관계

현행 `WithdrawalStatus`: `PENDING → PROCESSING → {APPROVED | FAILED}`, 별도로 `PENDING → REJECTED`.
`PROCESSING`은 N-30의 원자적 클레임(`updateMany(where: status=PENDING, data: status=PROCESSING)`,
`count===1`)을 위한 찰나의 중간 상태다. 이 골격은 **HUB 권위 코인에 대해 그대로 유지**한다 —
rev03 §4.1이 명시한 대로 "바뀌는 것은 승인 이후의 실행 단계 하나"뿐이다.

`AWAITING_ONCHAIN`은 **LOCAL 권위 코인 전용**으로 `PROCESSING` 다음에 삽입되는 신규 상태다.
`PROCESSING`을 대체하지 않는다 — 두 레일이 **같은 클레임 코드를 공유**하고, 클레임 직후에만
갈라지도록 설계한다(재발명 금지, N-30 재사용 원칙).

### 1.2 전체 다이어그램 (rev03 §4.3 원안 그대로, 필드 수준으로 구체화)

```
PENDING
  │  (관리자 승인 클릭 — 원자적 클레임: updateMany(status:PENDING → PROCESSING), count===1만 진행)
  │  (또는 HUB 레일 한정 자동승인 — W-8에 의해 LOCAL은 이 경로에 절대 들어오지 않는다)
  ▼
PROCESSING ── assertExecutionAllowed(coin, 'WITHDRAWAL') 통과 필요(A-2 §4.3) ──┐
  │                                                                            │
  ├─ balanceAuthorityAtRequest = HUB ──▶ forwardWithdrawalToHub()  ──▶ APPROVED / FAILED
  │                                          (현행 그대로, 변경 없음)
  │
  └─ balanceAuthorityAtRequest = LOCAL ──▶ updateMany(PROCESSING → AWAITING_ONCHAIN)
                                              (이 전이는 항상 성공한다 — 호출자가 이미 PROCESSING을
                                               단독 소유하고 있으므로 경쟁이 없다. 자금은 아직
                                               움직이지 않았다 — "승인"은 "실행 의사 확정"이지
                                               "실행 완료"가 아니다)
                                              │
                                              │  관리자가 이 시점 이후 **이 애플리케이션 밖에서**
                                              │  자신의 지갑/도구로 회사 지갑 → toAddress 전송을
                                              │  사람 손으로 실행한다. 그 다음 txHash를 제출한다.
                                              ▼
                                    POST /api/admin/withdrawals/[id]/submit-tx { txHash }
                                              │
                                    verifyOnchainWithdrawal() — 읽기 전용 (§2)
                                              │
                                    ┌─────────┴─────────┐
                                 통과                  실패/미확정
                                    ▼                    ▼
                    같은 트랜잭션 안에서:          상태 유지 = AWAITING_ONCHAIN
                    1. WithdrawalOnchainSettlement       (자동 FAILED 전환 금지 — W-5)
                       insert (chainId,txHash unique)     실패 사유를 WithdrawalOnchainVerification-
                       — 실패하면 TX_ALREADY_CONSUMED     Attempt에 기록하고 관리자 화면에 그대로
                       로 처리(W-6)                       노출한다. 관리자는 txHash를 정정해
                    2. A-3.settleHold(holdId)              재제출하거나(오타 등), 확인 중 다시
                       (홀드 해제 + 로컬 원장 확정 차감)     시도하거나(컨펌 대기 등), 조사한다.
                    3. status: AWAITING_ONCHAIN → APPROVED
                    → APPROVED (="정산 완료". rev03 원문
                      "SETTLED(=APPROVED)"을 따라 기존
                      APPROVED enum 값을 재사용 — §1.3)

PENDING ──(관리자 거절)──▶ REJECTED   (변경 없음, 두 레일 공통)
```

### 1.3 신규 terminal 상태를 따로 만들지 않는 이유 — `APPROVED` 재사용

rev03 §4.3 다이어그램은 스스로 `SETTLED(=APPROVED)`라고 표기했다. 이 문서는 그 표기를 그대로
따라 **별도의 `SETTLED` enum 값을 만들지 않고 기존 `APPROVED`를 재사용**하기로 설계한다.

- **근거 1.** "출금이 완료되어 자금이 사용자에게 도달했다"는 의미는 두 레일에서 동일하다.
  `APPROVED`를 "레일과 무관하게 자금이 나갔다"로 해석하면, 관리자 큐의 상태 필터·`already
  ${status}` 메시지·향후 대사 쿼리가 레일별로 갈라지지 않는다.
- **근거 2.** 레일 구분이 필요한 곳(§1.7 W-9)은 `status`가 아니라 `balanceAuthorityAtRequest`
  필드로 답한다. 상태값에 레일 정보를 욱여넣지 않는 것이 X-1′의 "명시 필드, 유도 금지" 원칙과
  같은 결이다 — 레일도 명시 필드로 묻는다.
- **단, 이 재사용에는 하나의 회귀가 딸려 있다.** §1.8에서 명시한다.

### 1.4 `WithdrawalRequest` 확장 — 개념 초안

```prisma
enum WithdrawalStatus {
  PENDING
  PROCESSING
  AWAITING_ONCHAIN   // 신규 (A-5, rev03 W-3) — LOCAL 레일 승인 완료, 온체인 전송 대기/검증 중
  APPROVED
  REJECTED
  FAILED
}

model WithdrawalRequest {
  // ...기존 필드 전부 유지, 변경 없음...

  // ─── 신규 (A-5) ─────────────────────────────────────────────────────
  // 요청 "생성 시점"에 스냅샷된 권위(A-2의 CoinBalanceAuthority 재사용). 승인/실행 시점에
  // getCoinAuthority()를 다시 조회해서 분기하지 않는다 — 요청 생성 이후 권위가 전환되더라도
  // (X-4′ 전환 절차는 어차피 그 코인의 발행·체결·출금을 먼저 정지시키므로 이 필드가 생성 이후
  // 바뀔 일은 정상 경로에서 없어야 한다) 이미 만들어진 요청의 실행 레일이 조회 타이밍에 따라
  // 흔들리지 않도록 하는 방어적 스냅샷이다. 기본값 HUB — 오늘까지의 전 요청(전량 HUB 레일)과
  // 동일한 동작을 backfill 없이 보존한다(프로덕션 WithdrawalRequest 0건이므로 사실상 무해하다).
  balanceAuthorityAtRequest CoinBalanceAuthority @default(HUB)

  // LOCAL 레일 전용. A-3의 `LocalBalanceHold.id`(placeHold()가 반환한 값)에 대한 느슨한 참조 —
  // 하드 FK 없음(A-3 §0이 이미 이렇게 설계했다 — "A-5가 아직 그 테이블을 확장하지 않았으므로").
  // §3.
  localHoldId                String?

  // LOCAL 레일 전용. 관리자가 제출·검증에 통과한 온체인 정보. 허브 참조인 hubTxId와 의도적으로
  // 분리한다 — 개정 02 N-19/N-20이 지적한 "허브 경로와 로컬 경로를 뒤섞지 않는다"는 원칙을
  // 필드 수준에서도 지킨다.
  onchainChainId              Int?
  onchainTxHash                 String?
  onchainVerifiedAt              DateTime?

  onchainVerificationAttempts  WithdrawalOnchainVerificationAttempt[]
  onchainSettlement             WithdrawalOnchainSettlement?

  @@index([balanceAuthorityAtRequest, status])
}

// W-5 — 검증 시도의 원시 증거. 판정을 상태 컬럼에 덮어쓰지 않고 시도마다 별도 행으로 남긴다.
// A-2의 CoinAuthorityProbe와 동일한 원리(증거와 현재 판정을 분리 보존 — 하나가 다른 하나의
// 계산 근거를 가리면 안 된다).
model WithdrawalOnchainVerificationAttempt {
  id                   String            @id @default(cuid())
  withdrawalRequestId  String
  withdrawalRequest    WithdrawalRequest @relation(fields: [withdrawalRequestId], references: [id])
  submittedTxHash      String
  result               String            // "PASS" | OnchainVerifyFailureReason 중 하나(§2.5) — 문자열로 저장, 관리자 화면에 그대로 노출
  detail               String?           // 사람이 읽을 수 있는 불일치 설명(예: "amount 100.000000000000000000 expected, 99.5 observed")
  confirmationsAtCheck Int?
  checkedByAdminId     String
  checkedAt            DateTime          @default(now())

  @@index([withdrawalRequestId, checkedAt])
}

// W-6 — 재사용 차단. "검증을 통과한" (chainId, txHash)만 정확히 한 번, 이 테이블에 기록된다.
// unique 제약이 "같은 전송으로 두 개의 출금 요청을 정산"하는 것을 DB 레벨에서 막는 최종 방어선이다.
model WithdrawalOnchainSettlement {
  id                  String            @id @default(cuid())
  withdrawalRequestId String            @unique
  withdrawalRequest   WithdrawalRequest @relation(fields: [withdrawalRequestId], references: [id])
  chainId             Int
  txHash              String
  observedAmount      String            // decimal string 그대로 저장. 실제 관측된 온체인 전송량(요청 금액과 일치가 확인된 값)
  confirmedAt         DateTime          @default(now())

  @@unique([chainId, txHash])
}
```

> **gate 조건과의 정합.** rev03 §7.2 ②("모든 신규 필드 기본값 꺼짐/0")를 만족한다 —
> `balanceAuthorityAtRequest` 기본값 `HUB`(신규 동작을 켜지 않는 값), 나머지는 전부 nullable/빈
> 관계다. ③("로컬 원장에 0이 아닌 값을 쓰는 코드 경로 미병합")도 이 설계 단계에서는 자동
> 충족된다 — A-3가 없으므로 `settleHold()` 호출부 자체가 아직 존재할 수 없다.

### 1.5 엔드포인트 변경/신설

**변경: `POST /api/admin/withdrawals/[id]/approve`**
현행 로직(원자적 클레임 → `forwardWithdrawalToHub`)의 **클레임 단계는 그대로 재사용**하고,
클레임 직후에 `wr.balanceAuthorityAtRequest`로 분기한다.

```
claim = updateMany(where: {id, status:'PENDING'}, data: {status:'PROCESSING', reviewedById, reviewedAt})
if claim.count === 0 → 기존 그대로 (404 / "already X")

assertExecutionAllowed(wr.currency, 'WITHDRAWAL')  // A-2 §4.3 — T2_HALTED면 여기서 즉시 중단
                                                     // (상태는 PROCESSING에 멈춘 채로 두지 않고
                                                     //  PENDING으로 되돌리는 보정 updateMany 필요 —
                                                     //  §6 열린 질문 1)

if balanceAuthorityAtRequest === 'HUB':
    result = forwardWithdrawalToHub(wr, {adminId})   // 현행 그대로, 변경 없음
    ... (기존 로직)

if balanceAuthorityAtRequest === 'LOCAL':
    updateMany(where: {id, status:'PROCESSING'}, data: {status:'AWAITING_ONCHAIN'})
    // 경쟁 없음 — 호출자가 이미 PROCESSING을 단독 소유
    recordAudit({ action: 'WITHDRAWAL_APPROVE_QUEUED_ONCHAIN', ... })
    return { ok: true, data: { status: 'AWAITING_ONCHAIN' } }
    // 이 시점까지 자금은 이동하지 않았다. 관리자는 이제 앱 밖에서 실제 전송을 실행해야 한다.
```

**신규: `POST /api/admin/withdrawals/[id]/submit-tx`**

```
body: { txHash: string }

1. requireAdmin()
2. wr = findUnique(id); wr.status must be 'AWAITING_ONCHAIN', balanceAuthorityAtRequest 'LOCAL'
   아니면 400 (상태 불일치)
3. 동시 제출 가드 — niaState류 in-memory Set (§1.6에서 소유권 명시)로 `submit-tx:${id}` 락.
   (실제 유일성 보장은 4번의 WithdrawalOnchainSettlement unique 제약이 최종 방어선 — 이 가드는
   N-30 approve 라우트의 in-memory 가드와 동일하게 "빠른 경로"일 뿐이다)
4. assertExecutionAllowed(wr.currency, 'WITHDRAWAL')  // 재확인 — 승인 이후 시간이 지났으므로
5. coin config 조회 → { chainId, contractAddress, tokenDecimals } (ManagedCoin.networks[] 에서
   wr.currency + wr.network으로 매칭)
6. rawMinConfirmations = PlatformSetting.withdrawalOnchainMinConfirmations
   minConfirmations = Math.max(rawMinConfirmations, MIN_WITHDRAWAL_ONCHAIN_CONFIRMATIONS_FLOOR)
   // FLOOR=3 하한 강제, fail-closed 클램프 — §2.6 신규 요구. 클램프가 실제로 발동하면
   // (rawMinConfirmations < FLOOR) recordAudit('WITHDRAWAL_ONCHAIN_MIN_CONFIRMATIONS_FLOOR_APPLIED')
7. outcome = verifyOnchainWithdrawal({
     chainId, contractAddress,
     expectedToAddress: wr.toAddress, expectedAmount: wr.amount, tokenDecimals,
     txHash, minConfirmations,
   })
8. WithdrawalOnchainVerificationAttempt.create({ ..., result: outcome.ok ? 'PASS' : outcome.reason, checkedByAdminId })
9. if !outcome.ok:
     recordAudit({ action: 'WITHDRAWAL_ONCHAIN_VERIFY_FAILED', detail: outcome.reason })
     return { ok: false, error: outcome.detail, reason: outcome.reason }   // 상태는 AWAITING_ONCHAIN 그대로

10. if outcome.ok:
     await prisma.$transaction(async (tx) => {              // 콜백 형태(개정) — 배열 형태였던 이전
                                                               // 초안은 커스텀 함수(executeHold)를
                                                               // 진짜로 같은 트랜잭션에 합류시킬 수
                                                               // 없어 폐기했다(아래 각주)
       await tx.withdrawalOnchainSettlement.create({ data: { withdrawalRequestId, chainId, txHash, observedAmount } })
         // unique(chainId, txHash) 위반 시 트랜잭션 전체 롤백 → catch해서 TX_ALREADY_CONSUMED로 재응답 (W-6)
       await executeHold(wr.localHoldId, {                   // A-3 §4.3 — 반드시 이 tx로 합류(§3.2와 동일 원칙)
         tx,
         reasonCode: 'WITHDRAWAL_EXECUTED',                  // debitLocalLedger(WITHDRAWAL_EXECUTED)를
         idempotencyKey: `WITHDRAWAL_EXECUTED:${wr.id}`,      // 원자적으로 함께 수행 (A-3 §4.3 원문의
         relatedType: 'WITHDRAWAL_REQUEST', relatedId: wr.id, // 2차 방어선 — DB unique(coin, idempotencyKey)가
       })                                                     // W-6을 원장 레벨에서도 한 번 더 막는다)
       await tx.withdrawalRequest.updateMany({
         where: { id, status: 'AWAITING_ONCHAIN' },      // 재확인 클레임 — 동시 제출 최종 방어
         data: { status: 'APPROVED', onchainTxHash: txHash, onchainChainId: chainId, onchainVerifiedAt: now },
       })
     })
     recordAudit({ action: 'WITHDRAWAL_ONCHAIN_VERIFIED', detail: `${wr.amount} ${wr.currency} · tx ${txHash}` })
     return { ok: true }
```

> **왜 배열 형태를 버리고 콜백 형태로 바꿨는가(개정 반영).** Prisma의 배열 형태
> `$transaction([...])`는 인자로 **이미 만들어진(아직 실행 전) Prisma 쿼리 객체**만 받는다 —
> `executeHold(...)`처럼 내부에서 여러 단계의 로직/여러 prisma 호출을 수행하는 커스텀 async
> 함수의 반환값을 그 배열에 넣어도, 그 함수가 자신만의 트랜잭션/클라이언트로 실행되는 것을
> 막지 못한다(즉 "같은 배열 안에 있다"는 것이 "같은 트랜잭션"을 보장하지 않는다). 콜백 형태
> `$transaction(async (tx) => {...})`만이 `tx`를 함수 인자로 넘겨 실제로 합류시킬 수 있는
> 방식이다 — §3.2와 동일한 이유, 동일한 수정.

`niaState`(`web/src/lib/nia/state.ts`, 내 소유)에 새 필드 추가를 제안한다 — 기존
`inFlightWithdrawals`/`inFlightAddresses`와 동일한 패턴:

```ts
interface NiaState {
  // ...기존 필드...
  inFlightOnchainVerifications: Set<string>;  // 신규 (A-5) — `submit-tx:${withdrawalRequestId}`
}
```

### 1.6 "AWAITING_ONCHAIN에서 되돌리기" — 설계하되 미승인으로 명시 (신규 제안)

rev03 W-3~W-9는 이 경로를 명시하지 않는다. 그러나 실무상 "관리자가 승인 버튼을 눌렀지만 아직
실제 전송 전에 요청이 잘못됐다는 걸 깨달았다"는 상황이 반드시 생긴다. 이 문서는 **가능한 설계를
제시하되, 승인하지 않는다** — 이유는 아래에 명시한 실질적 위험 때문이다.

- 후보 설계: `POST /api/admin/withdrawals/[id]/abandon-onchain` — `AWAITING_ONCHAIN → REJECTED`,
  홀드 해제(`A-3.releaseHold`, 차감 없음).
- **왜 이것이 순수한 편의 기능이 아니라 위험 지점인가.** 시스템은 관리자가 **실제로 온체인 전송을
  실행했는지 여부를 알 방법이 없다** — 서명이 이 시스템 밖에서 일어나기 때문이다(그것이 이
  설계의 핵심 이점이자 동시에 이 지점의 맹점이다). 관리자가 이미 자금을 보낸 뒤 실수로(또는
  악의로) "abandon"을 눌러 홀드를 해제하면, 로컬 원장은 그 자금이 여전히 있다고 믿지만 실제로는
  회사 지갑에서 이미 나간 상태가 된다 — **탐지되지 않는 실손실**이다.
- **이 문서의 입장: 이 엔드포인트를 만들려면 최소한 아래가 함께 있어야 하고, 그 결정은 이
  문서 혼자 내리지 않는다 — `wallet-security-expert` 리뷰(A-10)에서 확정한다.**
  1. "온체인 전송을 실행하지 않았음을 확인합니다"라는 명시적 확인 문구(체크박스가 아니라 타이핑
     확인 등 마찰이 있는 확인)
  2. 4-eyes(2인 승인) 또는 최소한 별도 상급 권한 요구
  3. `AuditLog`에 통상 액션보다 눈에 띄는 심각도로 기록
  4. 남용 시나리오(잦은 abandon 패턴)에 대한 관리자 대시보드 경보(A-8과 연동 여지)

---

### 1.7 관리자 큐 화면 노출 요구 (W-9) — 데이터 계약만, 화면은 A-7 소관

W-9: *"관리자 큐 화면은 요청의 권위·실행 레일·홀드 상태·txHash·검증 결과를 표시한다."*
이 문서는 화면을 설계하지 않지만, `GET /api/admin/withdrawals`가 반환해야 할 **데이터 계약**을
명시해 `product-planner`(A-7)/`web-admin-expert`가 바로 쓸 수 있게 한다.

| 표시 항목 | 데이터 출처 |
|---|---|
| 권위 | `balanceAuthorityAtRequest` |
| 실행 레일 | `balanceAuthorityAtRequest`에서 유도 (`HUB` → "허브 자동/차변", `LOCAL` → "관리자 수동 온체인") — **저장하지 않고 화면에서 유도**해도 안전하다. X-2("두 권위 합산 금지")가 금지하는 것은 **잔고의 합산**이지, 이미 저장된 단일 필드에서 라벨을 유도하는 것이 아니다 |
| 홀드 상태 | `localHoldId` 존재 여부 + A-3 `LocalBalanceHold`(§3.3) 직접 조회의 `status`(`ACTIVE`/`RELEASED`/`EXECUTED`) — A-3 §4는 이를 위한 별도 조회 함수를 정의하지 않았으므로, 관리자 큐가 `LocalBalanceHold.id = localHoldId`로 직접 SELECT하는 것을 전제로 한다(A-3가 이 모델을 소유하지만 읽기 전용 조회까지 함수로 감싸도록 강제하지는 않았다) |
| txHash | `onchainTxHash` (확정) 또는 최신 `onchainVerificationAttempts[0].submittedTxHash`(시도 중) |
| 검증 결과 | `onchainVerificationAttempts`를 최신순 정렬해 그대로 노출(성공/실패 사유 원문, §2.5) |

> **두 레일의 요청이 같은 목록에서 구분 없이 보이면 관리자가 잘못된 조치를 한다**(rev03 W-9
> 원문). 이 계약은 최소한 "권위" 컬럼이 목록 화면의 1급 필드여야 한다는 요구까지는 못 박는다 —
> 정렬/필터 UX는 A-7이 정한다.

### 1.8 회귀 영향 — 기존 사용자 이력 병합 로직을 함께 고쳐야 한다 (신규 발견, 명시)

`GET /api/nia/withdrawals`(`web/src/app/api/nia/withdrawals/route.ts`, 내 소유)의 현행 로직은
로컬 `WithdrawalRequest`를 **`status ∈ {PENDING, PROCESSING, REJECTED, FAILED}`일 때만** 사용자
이력에 병합한다. 주석 원문: *"APPROVED ones already show up from the hub"* — 이 가정은 **HUB
레일에서만 참**이다.

`AWAITING_ONCHAIN`/LOCAL 레일 `APPROVED`를 그대로 두면 두 가지 회귀가 생긴다:

1. **`AWAITING_ONCHAIN`이 병합 대상 status 목록에 없다** — 관리자가 승인한 순간부터 검증
   완료까지, 사용자에게는 자신의 출금 요청이 **화면에서 사라진 것처럼** 보인다.
2. **LOCAL 레일 `APPROVED`는 허브 이력에 영원히 나타나지 않는다**(허브 호출 자체가 없었으므로).
   현행 병합 조건(`APPROVED` 제외)을 그대로 두면 LOCAL 레일 출금은 **완료된 뒤에도 사용자
   이력에서 통째로 사라진다.**

> **요구 (이 문서의 필수 산출물).** 병합 조건을 권위 인식형으로 바꾼다:
> - `balanceAuthorityAtRequest === 'HUB'` → 현행 그대로(`APPROVED` 제외, 허브 이력이 진실)
> - `balanceAuthorityAtRequest === 'LOCAL'` → **모든 status를 병합**(`APPROVED` 포함) — 로컬
>   레코드가 유일한 진실이므로
>
> 이것은 A-5 구현 시 **`submit-tx` 신설과 반드시 함께** 고쳐야 하는 항목이다. 별도 티켓으로
> 미루면 "관리자는 승인했는데 사용자 화면엔 안 보인다"는 실사용자 문의가 곧바로 발생한다.

> **릴리스 순서 요구 (필수, `wallet-security-expert` A-10 조건부 승인 필수 보완 2로 재확인) —
> `GET /api/nia/withdrawals` 병합 조건 수정과 `submit-tx` 엔드포인트 신설은 반드시 같은
> 배포(같은 PR/같은 릴리스)에 묶여야 하며, 어느 쪽도 단독으로 먼저 배포되어서는 안 된다.**
> - `wallet-security-expert`의 평가: 이 회귀는 홀드 메커니즘 자체가 정상 동작하는 한 **자금
>   손실로 직결되지는 않는다** — `LocalBalanceHold`/`executeHold`가 실제 차감을 정확히 수행하면
>   사용자 잔고는 맞다. 그러나 **신뢰 손상은 실재한다**: 관리자가 승인했고 자금도 정확히
>   처리됐는데, 사용자 화면에서는 해당 출금 요청이 `AWAITING_ONCHAIN` 구간 동안 통째로
>   사라지고(위 회귀 1) LOCAL 레일이면 `APPROVED` 이후에도 영원히 다시 나타나지 않는다(회귀 2)
>   — 사용자 입장에서는 "돈이 없어졌다"로 체감되고, 이는 실제 자금 사고와 구분되지 않는
>   문의·불신을 유발한다.
> - **왜 "같은 배포"여야 하는가.** `submit-tx`만 먼저 배포하고 병합 조건 수정을 나중으로
>   미루면, `AWAITING_ONCHAIN`으로 전이되는 실제 요청이 그 즉시 발생하기 시작하는데 병합
>   로직은 여전히 그 상태를 숨긴다 — 회귀가 "이론상 위험"에서 "매 건 실사용자 영향"으로
>   즉시 전환된다. 반대로 병합 조건 수정만 먼저 배포하는 것은 무해하지만(아직 LOCAL
>   `AWAITING_ONCHAIN`/`APPROVED` 레코드 자체가 존재하지 않으므로) `submit-tx` 없이는 W-2~W-9
>   전체가 반쪽짜리 기능이라 실질적 이득이 없다 — 따라서 순서상 이득이 없는 분리 배포를 굳이
>   허용할 이유가 없다.
> - **구현 착수 시 체크리스트에 반영할 것 (`prisma-db-expert`/구현 담당 에이전트 공지).** 이
>   문서가 설계하는 PR/배포 단위는 최소한 다음을 한 세트로 포함해야 한다: (a) §1.4 스키마
>   전체, (b) §1.5 `approve` 라우트 변경 + `submit-tx` 신설, (c) 이 §1.8이 요구하는
>   `GET /api/nia/withdrawals` 병합 조건 수정. `deploy-manager`가 배포 단위를 쪼개려는
>   요청을 받으면 이 절을 근거로 거부/에스컬레이션할 것.

---

## 2. 온체인 읽기 전용 검증 헬퍼 — 인터페이스 설계

### 2.1 설계 원칙

1. **읽기만 한다.** 이 헬퍼가 호출하는 모든 하위 API는 부작용이 없는 조회다
   (`eth_getTransactionReceipt` / `eth_getTransactionByHash` / `eth_blockNumber` / 필요시
   `eth_call`류 view 함수). **서명·전송·니모닉·프라이빗키를 다루는 어떤 함수도 이 파일 트리에
   존재해서는 안 된다.**
2. **관리자의 주장을 신뢰하지 않는다(W-4).** 제출된 txHash는 검증 전까지 **미인증 주장**으로
   취급한다. 컨트랙트·수신자·금액·확정깊이 **넷 다** 독립적으로 재확인한다.
3. **"모른다"와 "위반이다"를 구분한다.** RPC 무응답/타임아웃은 검증 실패가 아니라 **판정 불가**다
   (A-2의 `UNKNOWN` vs `T2_VIOLATION` 구분과 동일 원리). 판정 불가를 실패로 기록하면 관리자가
   엉뚱한 재작업(예: 실제로는 맞는 해시를 "틀렸다"고 오인해 재전송)을 하게 만들 수 있다.
4. **정밀도는 `decimal.js`/정수 비교로, 근사치 허용 없음(CLAUDE.md 규칙 2).** 금액 비교는 토큰
   `decimals` 기준 정수 단위(raw uint256)로 환산해 정확히 일치해야 통과한다. "거의 맞다"를
   통과시키지 않는다 — 관리자가 실수로 다른 금액을 보냈다면 그것은 **사람이 해결할 운영
   문제**이지 시스템이 조용히 승인할 문제가 아니다.
5. **컨트랙트 주소로 판정한다, 심볼로 판정하지 않는다(DP-3).** 같은 심볼의 가짜 토큰이 전송되어도
   컨트랙트 주소가 다르면 실패해야 한다.

### 2.2 파일 위치 제안 — harness 패턴 적용

내 소유 영역인 `docs/architecture/harness.md`의 원칙(순수 로직은 `server/core/*`에 두고 실제
의존성(fetch)은 `src/lib/**`에 둔다 — `nia-signing.js` / `client.ts`의 관계와 동일)을 그대로
따른다.

```
web/server/core/onchain-verify.js     — 순수 함수: receipt 파싱, Transfer 로그 디코딩,
                                          금액/주소 비교, 확정깊이 계산. fetch 없음 → 하네스로
                                          단위 테스트 가능 (web/tests/harness/onchain-verify/)
web/src/lib/onchain/config.ts         — 서버 전용. RPC/익스플로러 엔드포인트, 체인 설정
                                          (web/src/lib/nia/config.ts와 동일 패턴)
web/src/lib/onchain/verifyWithdrawal.ts — 서버 전용. 실제 fetch 호출 + onchain-verify.js의
                                          순수 함수 조합 (web/src/lib/nia/client.ts와 동일 패턴)
```

> **경계 표기.** 이 경로(`web/src/lib/onchain/*`)는 Nia-Hub HMAC 클라이언트가 **아니다** — 별도
> 외부 시스템(BSC 공개 RPC/익스플로러)과의 연동이다. 현재 내 에이전트 정의 파일의 owned scope는
> `web/src/lib/nia/*`로 명시되어 있고 이 신규 경로는 아직 어떤 CLAUDE.md 표에도 등재돼 있지
> 않다 — "공유 인프라"라는 성격은 같으므로 이 문서가 설계는 담당하되, **scope 표 갱신 자체는
> `doc-keeper`가 구조적 변경으로 처리해야 할 항목**으로 남겨 둔다(§7).
>
> **소유·리뷰 요구(설계 문서 내 명시, 권고사항 반영).** `web/src/lib/onchain/*`와
> `web/server/core/onchain-verify.js`는 `web/src/lib/nia/*`와 동일한 성격의 서버 전용 공유
> 인프라이므로, 이 문서는 그 실제 코드 소유권이 `web-shared-expert`에 있어야 한다고 제안한다.
> 또한 W-4(관리자 주장 미신뢰)·자금 정산 확정 트리거라는 민감도를 감안해, **이 경로에 대한
> 모든 변경(신규 작성 포함)은 예외 없이 `wallet-security-expert` 리뷰를 거쳐야 한다**고 이
> 설계 문서 안에서 명시한다 — `withdrawals/route.ts` 등 기존 출금 관련 경로에 이미 적용되는
> "diff를 `wallet-security-expert`에 제출" 요구와 동일한 수준으로 취급한다. 공식 scope 표
> 등재(에이전트 정의 파일 갱신)는 여전히 `doc-keeper`의 구조적 변경 처리 대상으로 남겨 둔다
> (이 문단은 그 등재를 대체하지 않는다).

### 2.3 인터페이스 시그니처

```ts
// web/src/lib/onchain/verifyWithdrawal.ts (설계 초안 — 미구현)
import 'server-only';

export interface OnchainVerifyInput {
  chainId: number;             // 예: 56 = BSC mainnet. ManagedCoin.networks[]에서 코드로 매핑
  contractAddress: string;     // 기대하는 BEP-20 컨트랙트 (DP-3). ManagedCoin 설정에서 조회 —
                                // 코드에 하드코딩하지 않는다
  expectedToAddress: string;   // WithdrawalRequest.toAddress
  expectedAmount: string;      // decimal 문자열. WithdrawalRequest.amount
  tokenDecimals: number;       // 컨트랙트 decimals (설정에서 조회 — BANA는 18, N-14)
  txHash: string;              // 관리자 제출값
  minConfirmations: number;    // PlatformSetting에서 조회 (§2.6 — 확정 수치 아님)
}

export type OnchainVerifyFailureReason =
  | 'TX_NOT_FOUND'                 // 어느 상태에서도 해시를 찾을 수 없음(멤풀에도 없음)
  | 'TX_PENDING'                   // 멤풀에는 있으나 아직 영수증 없음 — 일시적, 재시도로 해소될 수 있음
  | 'TX_REVERTED'                  // 영수증 status !== success
  | 'NO_TRANSFER_EVENT'            // 영수증에 ERC20 Transfer 로그 자체가 없음(예: 네이티브 BNB 전송을
                                    // BEP-20 출금으로 착각해 제출한 경우)
  | 'WRONG_CONTRACT'                // Transfer 로그는 있으나 컨트랙트 주소 불일치 (DP-3)
  | 'WRONG_RECIPIENT'               // to 불일치
  | 'AMOUNT_MISMATCH'               // 정확히 일치하지 않음(근사 허용 없음)
  | 'INSUFFICIENT_CONFIRMATIONS'    // 전부 일치하나 확정 깊이 미달 — 일시적, 나중에 재확인하면 통과할 수 있음
  | 'TX_ALREADY_CONSUMED'           // WithdrawalOnchainSettlement unique 위반 — 이미 다른 요청을 정산한 해시(W-6)
  | 'RPC_UNAVAILABLE';              // 조회 자체 실패 — 위반이 아니라 판정 불가

export type OnchainVerifyOutcome =
  | { ok: true; confirmations: number; blockNumber: number; observedAmount: string }
  | { ok: false; reason: OnchainVerifyFailureReason; detail: string; confirmations?: number };

export async function verifyOnchainWithdrawal(input: OnchainVerifyInput): Promise<OnchainVerifyOutcome>;
```

`TX_ALREADY_CONSUMED`는 §1.5 절차상 `verifyOnchainWithdrawal()` 자신이 아니라 그 **호출자**(DB
unique 위반을 잡는 쪽)가 채워 넣는 결과 코드다 — 헬퍼 자체는 DB를 모른다(순수하게 체인만 본다).
이 구분을 인터페이스 문서에 명시해 두는 이유는, 헬퍼에 DB 접근을 슬쩍 끼워 넣고 싶은 유혹을
미리 차단하기 위함이다 — **헬퍼는 상태가 없다.**

### 2.4 검증 로직 — 단계별 설계

1. `eth_getTransactionReceipt(txHash)` 조회.
   - `null`이면 `eth_getTransactionByHash(txHash)`로 재확인 → 멤풀에 존재 → `TX_PENDING`,
     존재하지 않음 → `TX_NOT_FOUND`. (둘 다 관리자에게는 "재시도 대상"으로 보여야지 "실패"로
     보이면 안 된다 — UI 문구는 A-7 소관이나, 이 구분값 자체는 여기서 나온다)
2. `receipt.status !== '0x1'` → `TX_REVERTED`.
3. `receipt.logs`에서 `log.address.toLowerCase() === contractAddress.toLowerCase()` **그리고**
   `log.topics[0] === TRANSFER_EVENT_TOPIC`(`keccak256("Transfer(address,address,uint256)")`,
   잘 알려진 상수 — 코드 상수로 고정, 계산하지 않음)인 로그만 후보로 남긴다. 후보가 0건이면
   `NO_TRANSFER_EVENT`.
4. 후보가 있으나 컨트랙트가 일치하는 로그가 없으면(다른 컨트랙트에서만 Transfer가 발생한
   경우) `WRONG_CONTRACT`.
5. 후보 로그 중 `to`(= `topics[2]`의 하위 20바이트, 체크섬 무시 소문자 비교)가
   `expectedToAddress`와 일치하는 것을 찾는다. 없으면 `WRONG_RECIPIENT`.
6. 일치하는 로그의 `value`(`data` 필드 디코딩, uint256)를 `expectedAmount`와 비교한다.
   `expectedAmount`를 `new Decimal(expectedAmount).times(new Decimal(10).pow(tokenDecimals))`로
   정수 raw 단위로 환산해 **문자열/BigInt 정확 일치**로 비교(부동소수점 비교 금지, CLAUDE.md
   규칙 2). 불일치 시 `AMOUNT_MISMATCH` — `detail`에 기대값/관측값을 둘 다 남긴다(관리자가
   스스로 오타를 판단할 수 있도록).
   - **동일 tx에 후보 로그가 둘 이상**(배치 전송 등) 있을 수 있다. 이 경우 "합산해서 맞으면
     통과"가 아니라 **단일 로그 하나가 정확히 일치해야 통과**하는 것으로 설계한다 — 합산 매칭은
     서로 무관한 두 전송을 하나의 요청으로 우연히/의도적으로 짜맞추는 경로를 열어 준다.
7. `eth_blockNumber` 조회 → `confirmations = currentBlock - receipt.blockNumber + 1`.
   `confirmations < minConfirmations` → `INSUFFICIENT_CONFIRMATIONS`(단, 위 4~6단계는 이미
   통과했다는 뜻이므로 `detail`에 "일치함, 컨펌 대기 중"임을 명시 — §2.5에서 이 구분이 왜
   중요한지 설명).
8. 전부 통과 → `{ ok: true, confirmations, blockNumber, observedAmount }`.

어느 단계에서든 네트워크 오류/타임아웃이 나면 그 단계의 실패 사유가 아니라 **무조건
`RPC_UNAVAILABLE`**로 귀결시킨다 — 3~6단계 도중 실패했다고 `WRONG_CONTRACT` 등으로 잘못 보고하면
"검증했더니 틀렸다"와 "검증 자체를 못 했다"가 섞여 사고 기록이 오염된다.

### 2.5 실패 사유별 처리 방침

| 사유 | 영구적/일시적 | 관리자에게 보여줄 태도 |
|---|---|---|
| `TX_NOT_FOUND` | 일시적(전파 지연) 또는 오타 | "잠시 후 재시도, 계속되면 해시를 확인하세요" |
| `TX_PENDING` | 일시적 | "블록에 포함될 때까지 대기" |
| `TX_REVERTED` | 영구적 | 이 전송은 실패했다 — **자금이 실제로 나가지 않았을 가능성이 높다**. 관리자에게 재전송을 안내 |
| `NO_TRANSFER_EVENT` / `WRONG_CONTRACT` / `WRONG_RECIPIENT` / `AMOUNT_MISMATCH` | 영구적(같은 해시로는 절대 통과 못 함) | "이 해시는 이 요청과 맞지 않습니다" — 관리자가 해시를 잘못 붙여넣었을 가능성부터 확인하도록 유도 |
| `INSUFFICIENT_CONFIRMATIONS` | 일시적 | "내용은 일치, 확정 대기 중 — 잠시 후 재확인" |
| `TX_ALREADY_CONSUMED` | 영구적, **경보 대상** | 이미 다른 요청 정산에 쓰인 해시 — 관리자 실수 또는 **의도적 재사용 시도**일 수 있다. `AuditLog` 표준 심각도보다 높게 표시 권고(§7 열린 질문) |
| `RPC_UNAVAILABLE` | 판정 불가 | "확인할 수 없습니다, 다시 시도하세요" — **위반으로 취급하지 않는다** |

**공통 규칙(W-5 원문 재확인): 어떤 실패 사유도 `WithdrawalRequest.status`를 자동으로
바꾸지 않는다.** 상태는 오직 `verifyOnchainWithdrawal`이 `ok:true`를 반환했을 때만 전이한다.

### 2.6 확정 깊이(confirmation depth) — 확정 수치를 만들지 않는다

`docs/research/2026-08-10-bsc-deposit-detection-and-band-legal-issues.md`가 명시적으로 경고한다:
프로토콜 이론치(Fast Finality 이후 2블록 내외)와 거래소 실무치(Binance류 15 컨펌 관행)
사이에 상당한 간극이 있고, **그 간극이 최신 블록타임 축소를 반영해 재조정된 것인지 확인되지
않았다.** 이 문서는 그 위에 확정 숫자를 얹지 않는다.

> **설계 요구: `minConfirmations`는 코드 상수가 아니라 `PlatformSetting`의 값이어야 한다.**
> ```prisma
> model PlatformSetting {
>   // ...기존 필드...
>   withdrawalOnchainMinConfirmations Int @default(15)  // 보수적 기본값 — 조사 결과가 나오기 전까지
>                                                          // 거래소 실무 관행치를 따른다. 운영자가
>                                                          // 재조정 가능
> }
> ```
> 기본값 `15`는 **연구 결과가 나오기 전의 보수적 임시값**이며, 이 문서가 그 수치를 최종 확정하는
> 것이 아니다. `researcher`의 후속 조사(Open Question 1 — 거래소들이 실제로 컨펌 수를 낮췄는지)
> 또는 자체 블록/가스 실측 이후 재조정을 전제로 한다.

> **설계 요구(신규, `wallet-security-expert` A-10 조건부 승인 필수 보완 1 반영) — 하한(floor)
> 강제, 자유 설정 금지.** 관리자가 이 값을 "자유롭게" 설정 가능한 것으로 두면, 관리자 계정
> 실수 또는 탈취로 `0`(또는 `1`)이 설정될 경우 reorg 보호가 통째로 사라진다 — 온체인 검증
> 헬퍼는 `PlatformSetting`이 지시하는 값을 그대로 신뢰하고 확정 깊이를 판정하기 때문이다.
> 이것은 애플리케이션 레벨 상수로 강제해야 하며, `PlatformSetting`의 컬럼 제약(Prisma에는
> DB 레벨 `CHECK` 제약이 기본으로 없다)만으로는 방어되지 않는다.
>
> - **하한 상수.** `MIN_WITHDRAWAL_ONCHAIN_CONFIRMATIONS_FLOOR = 3`(3 미만 거부). 순수 상수이므로
>   `web/server/core/onchain-verify.js`에 둔다(harness로 단위 테스트 가능 — `web/tests/harness/onchain-verify/`).
>   숫자 `3`은 최종 확정 수치(§2.6 원칙과 동일하게 §2.6이 다루는 "권장 운영값"과는 별개)가
>   아니라, **"이 아래로는 reorg 방어가 사실상 없다"고 볼 수 있는 절대 최저선**이다 — 확정
>   운영값(현재 기본 `15`)을 대체하는 게 아니라 그 값이 실수로 훼손됐을 때의 마지노선이다.
> - **강제 지점 1 — 쓰기 시점(설정 변경 API).** `PlatformSetting.withdrawalOnchainMinConfirmations`를
>   갱신하는 관리자 엔드포인트(이 문서 범위 밖, A-2/코인 관리 화면과 동일한 위치에 있을 것으로
>   예상)는 `value < FLOOR`면 **400으로 거부**해야 한다. 이 요구를 여기 명시해 두는 이유는, 그
>   엔드포인트를 설계·구현할 에이전트가 이 A-5 문서를 근거 문서로 참조하게 하기 위함이다.
> - **강제 지점 2 — 읽기 시점(`submit-tx`, §1.5 6단계), fail-closed 이중 방어.** 쓰기 시점
>   검증이 어떤 이유로든(마이그레이션 시드값 오류, DB 직접 조작, 검증 로직 배포 이전 레코드 등)
>   우회됐을 가능성을 항상 전제한다 — §1.5 6단계를 다음으로 갱신한다:
>   ```
>   6. rawMinConfirmations = PlatformSetting.withdrawalOnchainMinConfirmations
>      minConfirmations = Math.max(rawMinConfirmations, MIN_WITHDRAWAL_ONCHAIN_CONFIRMATIONS_FLOOR)
>      // rawMinConfirmations < FLOOR면 이 시점에 즉시 FLOOR로 클램프한다 — PlatformSetting
>      // 값이 무엇이든 절대 FLOOR 아래로 내려가지 않는다. 클램프가 실제로 발동한 경우
>      // (rawMinConfirmations !== minConfirmations) recordAudit({ action:
>      // 'WITHDRAWAL_ONCHAIN_MIN_CONFIRMATIONS_FLOOR_APPLIED', detail: `configured=${rawMinConfirmations}` })
>      // 로 반드시 감사 로그를 남긴다 — 이 자체가 "누군가 하한을 깨려 했다"는 신호이기 때문이다.
>   ```
>   이 클램프 로직(순수 함수, `Math.max` 비교)도 `onchain-verify.js`에 두고 하네스 테스트로
>   `rawValue < FLOOR`, `rawValue === FLOOR`, `rawValue > FLOOR` 세 경계를 검증한다.
> - **이중 방어의 이유.** 강제 지점 1만으로는 "그 API를 거치지 않은 값 변경"(운영 DB 직접 수정,
>   시드 스크립트, 향후 추가되는 다른 쓰기 경로)을 막지 못한다. 자금이 실제로 나가는 마지막
>   문턱(`submit-tx`)에서 다시 한 번 클램프하는 것은 W-4("관리자의 주장을 신뢰하지 않는다")와
>   동일한 원칙을 설정값에도 적용하는 것 — **설정값도 "신뢰"가 아니라 매번 재확인**한다.

### 2.7 이중 소스 교차검증 — 권장, 미확정

RPC 단일 소스 장애·데이터 불일치 위험을 줄이기 위해, **1차(공개/유료 BSC JSON-RPC)와 2차
(블록 익스플로러 API, 예: BscScan류)를 모두 조회해 일치할 때만 `ok:true`를 반환하는 안**을
권고한다. 단 이것은 **이 문서의 확정 사항이 아니다** — 호출 비용·지연이 2배가 되고, 구현
복잡도가 늘어난다. 최소 요구는 "1차 실패 시 2차로 폴백"이고, "두 소스가 사실관계에서 불일치하면
`RPC_UNAVAILABLE`로 처리한다(둘 중 하나를 임의로 신뢰하지 않는다)"는 원칙만 이 문서에서 못
박는다. 구체적 채택 여부는 구현 착수 시점, `wallet-security-expert`와 함께 정한다.

### 2.8 환경변수/설정 — 서명 관련 항목 0개임을 확인

이 헬퍼가 필요로 하는 설정은 전부 **읽기 전용 엔드포인트**뿐이다:

```
BSC_RPC_URL              — 1차 읽기 전용 JSON-RPC 엔드포인트
BSC_RPC_URL_FALLBACK     — (선택) 2차 읽기 전용 RPC
BSCSCAN_API_BASE_URL     — (선택) 익스플로러 API 베이스
BSCSCAN_API_KEY          — (선택) 익스플로러 API 키 — 이 키는 "쓰기" 권한이 없는 조회 전용 API 키다
```

> **이 목록에 시드/니모닉/프라이빗키/서명 관련 항목은 존재하지 않는다.** `wallet-security-expert`
> 리뷰 시 이 파일 트리(`web/src/lib/onchain/*`, `web/server/core/onchain-verify.js`)에
> `Wallet(`/`signTransaction`/`privateKey`/`mnemonic`류 패턴이 등장하면 그 자체로 설계 위반으로
> 처리할 것을 제안한다(§7 — `code-compliance-checker` 체크리스트 후보).

라이브러리 선택은 미정이다. 후보:
- **raw `fetch` + 수동 JSON-RPC 페이로드** — 신규 의존성 0개. `niaKlinesFetch`(내가 이미 소유한
  `web/src/lib/nia/client.ts`)와 동일한 패턴. N-13("이 리포지토리에 web3 라이브러리 의존성이
  0건")을 유지한다는 장점.
- **`viem`의 `createPublicClient`(읽기 전용 클라이언트만)** — 로그 디코딩 등을 라이브러리가
  대신 해 줘서 직접 파싱 코드를 줄일 수 있으나, `viem` 자체에는 서명 기능도 포함돼 있으므로
  "이 코드베이스에 서명 가능한 라이브러리가 import된다"는 사실 자체가 보안 리뷰에서 추가
  질문거리가 될 수 있다(실제로 서명 클래스를 쓰지 않아도).

**이 문서는 선택하지 않는다.** 구현 착수 시 `wallet-security-expert`가 A-10 리뷰에서 결정에
참여해야 한다.

### 2.9 W-6 재사용 차단 — 설계 요약

§1.4의 `WithdrawalOnchainSettlement.@@unique([chainId, txHash])`가 최종 방어선이다. 검증 헬퍼
자체는 상태가 없으므로(§2.3) 같은 해시를 두 번 다른 요청에 제출하면 **둘 다 `verifyOnchainWithdrawal`
단계에서는 `ok:true`를 반환할 수 있다**(체인 관점에서는 유효한 전송이니까) — 재사용 차단은
**반드시 DB의 unique 제약**에서 걸려야 하고, §1.5의 절차가 그 삽입을 성공 경로의 필수
1단계로 두는 이유가 여기 있다.

### 2.10 재시도/쿨다운

과도한 재시도로 RPC 요청이 남발되는 것을 막기 위해 `PlatformSetting`에 최소 쿨다운을 두는
것을 제안한다(가벼운 항목, 확정 아님):

```prisma
withdrawalOnchainVerifyCooldownSeconds Int @default(10)
```

`submit-tx`가 직전 시도로부터 이 시간 이내에 다시 호출되면 429로 거절 — 실패 원인이 아니라
단순 rate limit이므로 `WithdrawalOnchainVerificationAttempt`에 기록하지 않는다.

---

## 3. W-2(요청 시점 홀드) ↔ A-3 연동 개요

### 3.1 W-2 요구사항 재확인 (rev03 원문)

> - 요청 생성 = `available` 감소(홀드 증가). 원장 총액은 불변
> - 실행 확정 = 홀드 해제 + 실제 차감(burn)
> - 거절·실패 = 홀드 해제, 차감 없음
> - 홀드 생성·해제는 **요청 행 생성과 같은 트랜잭션 안**에서 원자적으로 수행
> - 불변식: `Σ(사용자 홀드) == Σ(PENDING/PROCESSING/AWAITING_ONCHAIN 상태 요청 금액)`

**A-3(`staking-yield-system-v2-design-a3-local-ledger.md`)가 이 세션에서 이미 작성되어 있음을
확인했다.** 따라서 이 절은 가상의 계약을 정의하지 않고, **A-3 §2.3(`LocalBalanceHold`) +
§4.1/§4.3(`getUserCoinBalance` / `placeHold` / `releaseHold` / `executeHold`)에 A-5를 직접
정합화**한다.

### 3.2 트랜잭션 경계 요구 — LOCAL 코인은 잔고검증·홀드·요청생성이 한 DB 트랜잭션이어야 한다

오늘의 HUB 레일 잔고 검증(`POST /api/nia/withdrawals` §3c)은 **허브에 대한 HTTP 호출**이라서
DB 트랜잭션 안에 넣을 수 없다 — 이것이 HUB 레일이 구조적으로 "최선 노력(best-effort)" 검증일
수밖에 없는 이유다(레이스 컨디션이 원리적으로 남는다. 다만 §4의 `inFlightWithdrawals` dedup
가드로 완화한다).

**LOCAL 레일은 다르다.** 잔고의 원본이 로컬 DB 자신이므로, **잔고 조회 + 홀드 생성 +
`WithdrawalRequest.create`를 하나의 Prisma `$transaction`으로 묶을 수 있고, 묶어야 한다.**
이것이 rev02 §2.2가 지적한 "(C)에서 이 검증이 오히려 더 정확해질 수 있다"는 잠재적 이점을
실제로 살리는 지점이다 — HUB 레일보다 **더 강한** 원자성 보장이 LOCAL 레일에서는 공짜로
따라온다.

```
prisma.$transaction(async (tx) => {
  const { available } = await getUserCoinBalance(userId, coinSymbol, { tx });  // A-3 §4.1 — 반드시
                                                                                 // 이 tx로 합류(아래 참조)
  if (decAmount.gt(available)) throw INSUFFICIENT_BALANCE;

  const wr = await tx.withdrawalRequest.create({ data: { ..., balanceAuthorityAtRequest: 'LOCAL' } });
  const hold = await placeHold({                                       // A-3 §4.3 — 반드시 이 tx로 합류
    tx, userId, coin: coinSymbol, amount: decAmount.toFixed(),
    reasonCode: 'WITHDRAWAL_PENDING',
    relatedType: 'WITHDRAWAL_REQUEST', relatedId: wr.id,
  });
  await tx.withdrawalRequest.update({ where: { id: wr.id }, data: { localHoldId: hold.id } });
});
```

> **`tx` 인자를 명시적으로 전달하는 이유(개정 반영).** 이전 초안은 `prisma.$transaction(async
> (tx) => {...})`로 콜백 형태를 열어 놓고도 `getUserCoinBalance`/`placeHold` 호출에 그 `tx`를
> 실제로 넘기지 않았다 — 콜백 블록 안에서 호출됐다는 사실만으로 같은 트랜잭션에 합류하는 것이
> 아니다(각 함수가 내부적으로 자신만의 `prisma` 클라이언트를 새로 열면, 콜백 밖에서 호출한
> 것과 원자성 관점에서 동일하다). **A-3의 함수가 외부 `tx`를 받는 시그니처로 확정되는 것을
> 전제로**, 이 문서의 모든 호출부(§3.2, §1.5 10단계)는 예외 없이 `tx`를 전달하는 형태로
> 통일했다 — §6 열린 질문 1이 아직 미확정임을 유지하되, 확정될 경우 이 문서가 실제로 취할
> 형태를 명확히 해 둔다.

> **정합성 확인 — 잘 맞물린다.** A-3 §2.3의 `LocalBalanceHold.@@unique([relatedType, relatedId,
> reasonCode])` 제약이 정확히 이 지점에서 "같은 출금 요청에 중복 홀드가 걸리는 것"을 DB
> 레벨에서 한 번 더 막아 준다 — W-2가 우려하는 "잔고 100인 사용자가 100짜리 요청을 3건 만든다"
> 시나리오는, 3건이 각자 **다른** `relatedId`(각기 다른 `WithdrawalRequest.id`)를 갖게 되므로
> 이 제약으로는 막히지 않는다(정상 동작 — 셋 다 별개의 정당한 요청이다). 실제 방어는
> `getUserCoinBalance().available`이 매 요청마다 이전 홀드들을 반영해 감소한 상태로 조회되는
> 것에서 나온다 — **세 번째 요청 시점에는 이미 두 번의 홀드가 걸려 있어 `available`이 0에
> 가까워지고, 세 번째 요청이 트랜잭션 안에서 잔고 부족으로 거부된다.** 이것이 성립하려면
> `getUserCoinBalance`의 읽기와 `placeHold`의 쓰기가 **동일 트랜잭션 안에서 순서대로**
> 일어나야 한다 — 그렇지 않으면(각자 별도 트랜잭션이면) 세 요청이 동시에 도착했을 때 셋
> 다 "아직 홀드가 안 걸린 잔고 100"을 읽고 통과해 버리는 TOCTOU 레이스가 성립한다.
>
> **A-3 §4.1/§4.3의 의사코드는 "하나의 트랜잭션 안에서"라고 서술하지만, 그 함수들이 외부에서
> 전달된 Prisma `tx` 클라이언트를 받아 그 트랜잭션에 합류하는지, 아니면 자신만의 트랜잭션을
> 여는지를 명시하지 않았다.** 후자라면 위 코드 예시 전체가 성립하지 않는다(홀드 생성과 요청
> 생성이 서로 다른 트랜잭션이 되어 §3.2의 원자성 요구가 깨진다). **이것이 §6의 열린 질문
> 1번이다 — A-3/A-5 구현 착수 전에 `prisma-db-expert`와 반드시 맞춰야 하는 시그니처 세부사항.**

### 3.3 A-3 인터페이스 소비 — 그대로 재사용, 확장하지 않는다

A-3 §4가 이미 제안한 함수를 그대로 쓴다(재정의하지 않음):

| A-5가 호출하는 지점 | A-3 함수 | 인자 매핑 |
|---|---|---|
| §3.2 요청 생성 시 잔고 확인 | `getUserCoinBalance(userId, coin, { tx })` | `available`을 `decAmount`와 비교. `tx`는 §3.2를 감싸는 외부 트랜잭션 클라이언트 — 반드시 전달(개정, §3.2 각주) |
| §3.2 요청 생성 시 홀드 | `placeHold({ tx, ... })` | `reasonCode: 'WITHDRAWAL_PENDING'`, `relatedType: 'WITHDRAWAL_REQUEST'`, `relatedId: wr.id` — 반환된 `hold.id`를 `WithdrawalRequest.localHoldId`에 저장. `tx` 반드시 전달(위와 동일) |
| §1.5 거절(`REJECTED`) 경로 | `releaseHold(holdId, releasedReason)` | 차감 없음. `releasedReason`은 예: `"withdrawal rejected by admin"`. 이 경로는 §1.5 승인 라우트의 클레임 업데이트와 별도 트랜잭션이어도 안전하다 — 실행(차감)이 아니라 단순 해제이므로 §3.2/§1.5 10단계만큼의 원자성 요구가 없다(자금 이동이 없는 경로) |
| §1.5 검증 통과 시 정산 | `executeHold(wr.localHoldId, { tx, reasonCode: 'WITHDRAWAL_EXECUTED', idempotencyKey: \`WITHDRAWAL_EXECUTED:${wr.id}\`, relatedType: 'WITHDRAWAL_REQUEST', relatedId: wr.id })` | A-3 §2.2 `LocalLedgerReasonCode.WITHDRAWAL_EXECUTED`를 그대로 사용 — A-3가 이미 이 사유 코드를 "홀드가 EXECUTED로 확정될 때(온체인 전송 검증 통과, W-4)의 실제 소각(burn) 차감"이라고 정확히 이 용도로 문서화해 두었다. `tx`는 §1.5 10단계의 콜백 트랜잭션 — 반드시 전달(개정, §1.5 10단계 각주) |
| §1.6 abandon(미승인 경로, 만약 채택된다면) | `releaseHold(holdId, releasedReason)` | §1.6이 요구하는 "명시적 확인" 이후에만 호출 — A-3 자체는 그 확인을 강제하지 않는다(A-5/UI 책임). 자금 이동 없는 해제이므로 `tx` 합류 요구 없음(위 `REJECTED` 행과 동일 근거) |

**A-3의 `executeHold`가 N-30과 동일한 원자적 클레임 패턴**(`ACTIVE → EXECUTED`,
`count===1`)을 이미 내장하고 있다고 명시했으므로(A-3 §4.3), §1.5의 `submit-tx` 절차가 별도로
동시성 가드를 만들 필요가 없다 — **§1.5의 in-memory `inFlightOnchainVerifications` 가드는
어디까지나 빠른 경로일 뿐이고, 실제 유일성은 `executeHold` 내부의 원자적 상태 전이 +
`WithdrawalOnchainSettlement`의 unique 제약(§1.4/§2.9), 이렇게 이중으로 걸린다.**

### 3.4 불변식과 검증 가능성

W-2가 요구하는 불변식 `Σ(사용자 홀드) == Σ(PENDING/PROCESSING/AWAITING_ONCHAIN 상태 요청 금액)`은
A-3 §4.1(`getUserCoinBalance`의 `held` — 또는 A-3 §4.4 `reconcileUserCoinBalances`가 이미
캐시-증거 대사를 제공) 대 `WithdrawalRequest`에 대한 group-by 합계(A-5, 이 스키마에서 바로
계산 가능)를 대조하는 것으로 상시 검증 가능하다. A-3 §4.4가 이미 "캐시와 증거의 정합"을 위한
`reconcileUserCoinBalances(coin)`를 제안했으므로, **A-5가 별도 대사 함수를 새로 만들 필요는
없다** — W-2의 불변식은 이 함수가 반환하는 `held`(홀드 합계, `LocalHoldReasonCode.WITHDRAWAL_PENDING`
사유로 필터)와 `WithdrawalRequest`의 group-by 합계를 QA 단계에서 대조하는 쿼리 하나로 검증
가능하다. `qa-lead`가 이 대조를 자동 테스트로 잠그는 것을 제안한다(구현 이후 — 이 문서가
테스트를 작성하지는 않는다).

---

## 4. Non-custodial 실행 재확인 (요청 4)

이 설계 전체에 걸쳐 **개인키·서명 코드는 단 한 줄도 존재하지 않는다.** 명시적으로 확인한다:

- **자금을 실제로 옮기는 유일한 행위자는 사람(관리자)이다.** 그 사람은 이 애플리케이션이 아닌
  **자신의 지갑 소프트웨어/하드웨어 지갑**으로 회사 지갑 → `toAddress` 전송을 실행한다
  (§1.2 "관리자가 이 시점 이후 **이 애플리케이션 밖에서**..."). 이 시스템은 그 실행을 **트리거하지
  않는다.**
- **이 시스템이 체인에 쓰는 것은 0건이다.** `verifyOnchainWithdrawal()`(§2)이 호출하는 모든
  메서드는 조회(`eth_getTransactionReceipt`, `eth_getTransactionByHash`, `eth_blockNumber`,
  필요시 `eth_call` view 함수)뿐이며, `eth_sendRawTransaction`/`personal_sign`/이에 준하는
  어떤 쓰기·서명 RPC도 설계에 등장하지 않는다.
- **관리자가 제출한 txHash는 "명령"이 아니라 "주장"으로 취급된다.** 시스템은 그 주장을 그대로
  믿고 정산을 확정하지 않는다 — 반드시 §2의 읽기 전용 절차로 독립 재확인한 뒤에만 홀드를
  해제·차감한다(W-4). 이것이 "관리자를 신뢰하는 시스템"과 "관리자의 주장을 검증하는 시스템"의
  차이이며, 이 설계는 후자다.
- **rev03 P-9/§4.1의 결론과 정확히 일치한다.** *"핫월렛 PRD 선행 요구(개정 02 §3.2 ③)는
  발동하지 않는다"* — 개인키가 시스템에 들어오는 시나리오(B-1″-b, 자동 서명)를 이 설계는
  전혀 구현하지 않는다. Q-M2(마스터 답변: 수동)를 그대로 따른다.
- **§1.6에서 제안만 하고 미승인으로 남긴 "abandon-onchain" 경로도 서명과 무관하다** — 홀드
  해제라는 순수 DB 동작이며, 이 경로의 위험은 "개인키 유출"이 아니라 "사람의 사후보고 누락"이라는
  전혀 다른 종류의 리스크임을 다시 한 번 명확히 한다.

---

## 5. 요구사항 ↔ 설계 매핑표 (rev03 §4 전항목 추적)

| 요구 | 내용 요지 | 이 설계에서 |
|---|---|---|
| **W-1** | 잔고 검증 무조건화 | **이미 별도로 완료·병합됨**(프로덕션 반영 확인). 이 문서 범위 밖 |
| **W-2** | LOCAL 코인 요청 시점 홀드 | §3 전체. A-3의 `LocalBalanceHold`/`placeHold`/`executeHold`를 직접 소비(§3.3), §3.2에서 트랜잭션 경계 명시 |
| **W-3** | `AWAITING_ONCHAIN` 신설 | §1.2/§1.4 — enum 값 추가, `PROCESSING` 다음에 LOCAL 레일 전용으로 삽입 |
| **W-4** | 관리자 주장이 아닌 온체인 검증으로 정산 | §2 전체(`verifyOnchainWithdrawal`) + §1.5 `submit-tx` 절차가 검증 통과 시에만 확정 |
| **W-5** | 검증 실패는 자동 FAILED 금지, 상태 유지 + 불일치 명시 | §1.4 `WithdrawalOnchainVerificationAttempt`(상태 컬럼을 덮어쓰지 않고 시도별 기록), §2.5 실패 사유 표 |
| **W-6** | 동일 txHash 재사용 차단, `(chainId, txHash)` unique | §1.4 `WithdrawalOnchainSettlement.@@unique([chainId, txHash])`, §2.9 |
| **W-7** | 가스비 부담 주체 결정·고지, LOCAL은 관리자 설정값이 유일 값 + 가스 실비 하한 | **데이터 홈만 지정**: `ManagedCoin.networks[].fee`류 관리자 설정 필드(코인 관리 화면 작업 — A-2 인접, 상세 설계는 이 문서 범위 밖으로 명시 이관) |
| **W-8** | 자동 승인은 LOCAL에 절대 미적용 | §1.5 승인 라우트 설계에서 LOCAL 분기는 애초에 auto-approve 경로(`POST /api/nia/withdrawals`의 자동승인 블록)에 들어오지 않음. **추가 권고**: auto-approve 게이트를 `STABLECOINS` 휴리스틱뿐 아니라 `assertExecutionAllowed`/권위 필드로도 이중 확인할 것(§1.5 5단계) — 테스트로 잠그는 것은 `qa-lead` 소관 |
| **W-9** | 관리자 큐가 권위·레일·홀드·txHash·검증결과를 구분 표시 | §1.7 데이터 계약표. 화면 자체는 A-7 |

**클레임 축소(개정 01 §4 C-계열, rev03 §4.4) 재확인 — 이 문서 범위 밖이지만 경계만 명시:**
이자 클레임(로컬 원장 증가)은 이 문서가 다루는 **출금 큐**와 별개다. C-3/C-4/C-10/C-11이
"출금 레일에서 부활한다"고 한 rev03의 판단은 **바로 이 문서가 설계한 `AWAITING_ONCHAIN` +
검증 헬퍼**를 가리킨 것이며, 이 문서가 그 부활의 실체다.

---

## 6. 확정되지 않은 것 / 열린 질문 (명시)

실사용자 자금과 직결되므로, 이 설계가 "정한 것"과 "아직 안 정한 것"을 섞지 않는다.

1. **(신규, §3.2) A-3의 `getUserCoinBalance`/`placeHold`/`releaseHold`/`executeHold`가 외부
   Prisma `tx` 클라이언트를 받아 호출자의 트랜잭션에 합류할 수 있는지가 A-3 문서 자체에
   명시돼 있지 않다.** 이것이 §3.2의 원자성 요구(잔고확인+홀드+요청생성 단일 트랜잭션) 전체가
   실제로 성립하는지를 가른다. **A-3/A-5 구현 착수 전 `prisma-db-expert`와의 시그니처 조율이
   최우선 선행 작업**이다 — 이 문서와 A-3 어느 쪽도 아직 이 세부사항을 확정하지 않았다.
   **(개정) 이 문서 자체의 모든 의사코드(§3.2, §1.5 10단계, §3.3 표)는 이제 "A-3가 `tx`를
   받는 시그니처로 확정된다"는 가정 아래 `tx`를 명시적으로 전달하는 형태로 통일해 두었다 —
   즉 이 열린 질문이 "받는다"로 답해지면 A-5는 추가 수정 없이 그대로 구현 가능하다. 만약
   `prisma-db-expert`가 반대로("A-3 함수는 자체 트랜잭션을 연다") 확정한다면, §3.2/§1.5
   10단계의 원자성 설계 전체를 다시 짜야 한다 — 그 경우는 이 문서의 재개정이 필요한 시나리오로
   남겨 둔다.
2. **§1.5 4단계 — `assertExecutionAllowed`가 승인 시점에 실패하면 `PROCESSING`을 어떻게
   되돌리는가.** 현재 초안은 "보정 updateMany 필요"라고만 적었다 — `PROCESSING → PENDING`으로
   되돌리는 것이 맞는지, 아니면 관리자 개입이 필요한 별도 상태가 필요한지 확정하지 않았다.
   구현 착수 시 결정 필요.
3. **§1.6 "abandon-onchain" 경로.** 이 문서는 필요성과 위험을 제시했을 뿐 **승인하지 않는다.**
   `wallet-security-expert`(A-10)의 명시적 결정이 있어야 한다.
4. **§2.6 확정 컨펌 수의 최종 값.** 기본값 `15`는 임시치다. 연구/실측 이후 재조정이 필요하다.
5. **§2.7 이중 소스 교차검증 채택 여부.** 권고했으나 확정하지 않았다.
6. **§2.8 라이브러리 선택**(raw fetch vs `viem` 읽기 전용 클라이언트). 확정하지 않았다.
7. **§7.2(rev03) 3조건이 실제로 충족됐는지는 이 문서가 판단하지 않는다.** 이 문서 자체가
   "지금 착수 가능한 설계"(rev03 §8.3 항목 4)에 해당하지만, **실제 코드 병합 시점에는 그
   3조건(마스터 승인/기본값 꺼짐/0-잔고 경로 미병합)을 다시 확인해야 한다.**
8. **`TX_ALREADY_CONSUMED`의 운영 대응 절차**(§2.5) — 이것이 단순 실수인지 악의적 재사용
   시도인지 구분하는 절차, 반복 시 계정 조치 여부는 설계하지 않았다. 보안 인시던트 대응
   프로세스의 영역이며 `wallet-security-expert`/운영 정책 소관으로 넘긴다.
9. **`web/src/lib/onchain/*`의 owned-scope 등재.** §2.2에서 밝힌 대로 이 경로는 아직 어느
   에이전트 정의 파일의 scope 표에도 없다. 코드 착수 전에 `doc-keeper`가 정리해야 할 항목.
10. **W-7 상세 설계 자체.** 이 문서는 데이터 홈만 지정했고, 실제 관리자 화면·필드 검증 로직은
    설계하지 않았다.

---

## 7. 이 문서가 승인하지 않는 것 (명시)

- **마이그레이션 실행 승인이 아니다.** §1.4/§2.6/§2.10의 스키마 조각은 개념 초안이며,
  `prisma migrate dev`/`deploy`를 실행하지 않았고 실행 조건은 rev03 §7.2의 3조건 그대로다.
- **코드 작성·병합 승인이 아니다.** 이번 세션에서 실제로 작성/병합한 애플리케이션 코드는
  없다(설계 문서 자체만 신규 작성).
- **§1.6(abandon-onchain)의 채택 승인이 아니다.** 명시적으로 미승인 상태로 남긴다.
- **§2.6(확정 컨펌 수)·§2.7(이중 소스)·§2.8(라이브러리)의 최종 결정이 아니다.**
- **A-3의 설계가 아니다.** A-3는 `prisma-db-expert`가 별도로 작성했고, 이 문서는 §3에서 그
  인터페이스를 소비·정합화했을 뿐이다. 단 §6-1의 tx 합류 여부는 **A-3 쪽에서도 아직 확정하지
  않은 것으로 확인**했다 — 이는 A-3의 누락이 아니라 두 문서가 병행 작성되며 자연히 남은
  접합부다.
- **`assertExecutionAllowed`/`getCoinAuthority` 등 A-2 인터페이스 자체의 재정의가 아니다.**
  이 문서는 A-2를 소비할 뿐이다.
- **W-1의 재작업이 아니다.** 이미 완료·병합된 것으로 확인하고 전제로만 삼았다.

## 8. 다음 단계 제안

1. `prisma-db-expert` — §1.4의 스키마 조각(`WithdrawalStatus.AWAITING_ONCHAIN`,
   `WithdrawalRequest` 확장 필드, `WithdrawalOnchainVerificationAttempt`,
   `WithdrawalOnchainSettlement`)을 검토·확정. **§6-1(placeHold 등이 외부 tx를 받는지)을
   A-3와 함께 확정하는 것이 최우선.** `PlatformSetting` 확장(§2.6/§2.10, `withdrawalOnchainMinConfirmations`
   하한 강제 포함)도 함께. **`PlatformSetting.withdrawalOnchainMinConfirmations`를 갱신하는
   관리자 엔드포인트**(강제 지점 1, §2.6)의 소유·구현 담당을 확정할 것 — 이 문서 범위 밖이므로
   담당이 아직 명시되지 않았다.
2. `wallet-security-expert` (A-10) — **완료.** 조건부 승인 + 필수 보완 2건(§2.6 하한 강제,
   §1.8 릴리스 순서 요구) 지정 → 이 개정에서 반영 완료. §1.6(abandon 경로)·§2(검증 헬퍼 신뢰
   경계)·§3(홀드-원장 연동 경계)의 나머지 열린 결정은 여전히 후속 리뷰/구현 착수 시점 대상.
3. `doc-keeper` — §6-9(`web/src/lib/onchain/*` scope 등재)을 구조적 변경으로 처리할지 판단.
   **아울러 이 개정의 §2.2가 명시한 소유·리뷰 요구(scope: `web-shared-expert`, 모든 변경에
   `wallet-security-expert` 리뷰 필수)를 공식 scope 표에 반영할지 함께 판단.**
4. `product-planner`(A-7) — §1.7 데이터 계약을 기반으로 관리자 큐 화면·사용자 출금 상태 표시
   화면 설계. A-3의 로컬 잔고 표시 요구와 함께 검토.
5. `deploy-manager` — 구현 착수 이후 실제 배포 단계에서 **§1.8 "릴리스 순서 요구"를 배포 단위
   분리 요청에 대한 거부 근거로 적용할 것**: `GET /api/nia/withdrawals` 병합 조건 수정과
   `submit-tx` 신설은 반드시 같은 배포로 묶는다.
6. 마스터 — Q-M3(회사 지갑 주소·보유량)·Q-M5(입금 레일 방향)는 여전히 미회신이며, 이 문서의
   설계 자체는 그 회신 없이도 유효하지만 **정산 가동(발행)과 로컬 원장 구현 착수**는 rev03
   §8이 정한 대로 그 회신을 기다린다.
