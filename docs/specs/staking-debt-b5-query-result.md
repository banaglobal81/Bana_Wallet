# B-5 부채 총액 쿼리 — 로컬 DB 실행 결과 및 프로덕션 재현 방법

> 작성: `prisma-db-expert` · 2026-08-10
> 관련: `docs/specs/staking-yield-system-v2-prd.md` §13 **B-5 / H-5**
> ("현재 라이브 포지션 수와 미충당 부채 총액(그랜트 원금 포함)" — 운영 DB 집계, 담당: **사람**)
> 참고: `docs/specs/staking-payout-rail-prd.md`, `docs/specs/admin-staking-debt-visibility-frd.md`,
> `web/src/app/api/admin/staking/stats/route.ts`(같은 SQL 로직의 최초 구현)

**이 문서는 B-5를 해소하지 않는다.** PRD가 명시한 대로 B-5/H-5는 "운영 DB 집계" 항목이며 담당은
**사람**이다. 이 문서가 제공하는 것은 (1) 재사용 가능한 쿼리, (2) 로컬 개발 DB에서 그 쿼리를
실제로 돌려본 예시 결과와 그 결과의 한계, (3) 사람이 프로덕션에서 같은 쿼리를 **안전하게**
재현할 수 있는 절차뿐이다. **프로덕션 수치는 이 문서에 없다.**

---

## 1. 재사용 쿼리

`web/src/app/api/admin/staking/stats/route.ts`가 관리자 패널에서 쓰는 것과 동일한 집계 로직이다.
전량 `SELECT`이며 어떤 쓰기도 없다.

```sql
-- (A) 코인별 분해
SELECT coin,
  COALESCE(SUM(CASE WHEN status = 'ACTIVE' THEN principal::numeric ELSE 0 END), 0)::text AS "activePrincipal",
  COALESCE(SUM(CASE WHEN status = 'ACTIVE' AND "grantedByAdminId" IS NOT NULL THEN principal::numeric ELSE 0 END), 0)::text AS "grantedActivePrincipal",
  COALESCE(SUM("paidInterest"::numeric), 0)::text AS "unpaidInterest", -- = ledgeredInterest; hubSettled는 구조적으로 0 (route.ts의 HUB_SETTLED 주석 참조)
  COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS "activeCount",
  COUNT(*) FILTER (WHERE status = 'MATURED')::int AS "maturedCount",
  COUNT(*)::int AS "totalCount",
  COUNT(*) FILTER (WHERE status = 'PAID')::int AS "settledStatusCount" -- INV-1 워치독: 항상 0이어야 함
FROM "StakePosition"
GROUP BY coin
ORDER BY coin;

-- (B) 그랜트 포지션 총계 (전 코인) — B-5가 명시한 "그랜트 원금 포함" 항목
SELECT
  COUNT(*)::int AS "grantPositionCount",
  COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS "grantActiveCount",
  COALESCE(SUM(CASE WHEN status = 'ACTIVE' THEN principal::numeric ELSE 0 END), 0)::text AS "grantActivePrincipalAllCoins"
FROM "StakePosition"
WHERE "grantedByAdminId" IS NOT NULL;

-- (C) 플랫폼 전체 (전 코인 합계) — B-5의 "현재 라이브 포지션 수와 미충당 부채 총액"
SELECT
  COALESCE(SUM(CASE WHEN status = 'ACTIVE' THEN principal::numeric ELSE 0 END), 0)::text AS "activePrincipalAllCoins",
  COALESCE(SUM("paidInterest"::numeric), 0)::text AS "unpaidInterestAllCoins",
  COUNT(*)::int AS "totalPositions",
  COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS "totalActive",
  COUNT(*) FILTER (WHERE status = 'MATURED')::int AS "totalMatured",
  COUNT(*) FILTER (WHERE status = 'PAID')::int AS "totalPaidStatus",
  COUNT(DISTINCT "userId")::int AS "distinctUsers"
FROM "StakePosition";

-- (D) 원장 정합성 확인 (SUM(StakingPayout.amount)가 SUM(StakePosition.paidInterest)와 일치해야 함)
SELECT COUNT(*)::int AS "payoutRowCount", MIN("paidAt") AS "earliest", MAX("paidAt") AS "latest",
  COALESCE(SUM(amount::numeric), 0)::text AS "sumAmount"
FROM "StakingPayout";
```

`unpaidInterest`는 정의상 `ledgeredInterest − hubSettled`이며 `hubSettled`는
`staking-payout-rail-prd.md`가 확인한 대로 지급 레일이 없으므로 구조적 상수 `0`이다
(`web/src/app/api/admin/staking/stats/route.ts:18-25`의 `HUB_SETTLED` 주석 참고). 따라서
`unpaidInterest == SUM(StakePosition.paidInterest)`이며, 쿼리 (D)로 `StakingPayout` 원장과
반드시 일치해야 한다(불일치 시 원장 붕괴 — 그 자체가 사고 신호).

---

## 2. 로컬 개발 DB 실행 결과 (2026-08-10, `bana_wallet_dev`, localhost:5432)

로컬 개발 DB(`web/.env`의 `DATABASE_URL`)에 대해 위 쿼리 (A)~(D)를 직접 실행했다.
실행 전 `npx prisma migrate status`로 스키마가 최신(26개 마이그레이션, drift 없음)임을 확인했다.

### (A) 코인별 분해

| coin | activePrincipal | grantedActivePrincipal | unpaidInterest | activeCount | maturedCount | totalCount | settledStatusCount |
|------|------------------|-------------------------|-----------------|-------------|---------------|------------|----------------------|
| USDT | 0                | 0                       | 3150            | 0           | 1             | 1          | 0                    |

### (B) 그랜트 포지션 총계

| grantPositionCount | grantActiveCount | grantActivePrincipalAllCoins |
|---------------------|-------------------|-------------------------------|
| 0                   | 0                 | 0                              |

### (C) 플랫폼 전체

| activePrincipalAllCoins | unpaidInterestAllCoins | totalPositions | totalActive | totalMatured | totalPaidStatus | distinctUsers |
|---------------------------|--------------------------|------------------|--------------|---------------|--------------------|-----------------|
| 0                          | 3150                     | 1                | 0            | 1             | 0                   | 1               |

### (D) 원장 정합성

| payoutRowCount | earliest | latest | sumAmount |
|-----------------|----------|--------|-----------|
| 90              | 2026-08-10T03:47:46.142Z | 2026-08-10T03:47:46.142Z | 3150 |

`sumAmount`(3150) == `unpaidInterestAllCoins`(3150) — 정합성 확인됨. `settledStatusCount` /
`totalPaidStatus`는 0 — INV-1 워치독 정상.

### 해당 포지션의 원본 행 (참고용, 계산 재현을 위해)

```json
{
  "id": "cd9ca126cc95141978166d35a",
  "userId": "c368bcc862f1747f2a1ee52f6",
  "coin": "USDT",
  "status": "MATURED",
  "principal": "5000",
  "dailyRatePct": "0.7",
  "termDays": 90,
  "paidInterest": "3150",
  "daysPaid": 90,
  "grantedByAdminId": null,
  "startAt": "2026-08-04T22:47:39.253Z",
  "maturityAt": "2026-11-02T22:47:39.253Z",
  "createdAt": "2026-08-10T03:47:39.254Z"
}
```

`3150 = 5000 × 0.7% × 90`. `daysPaid = 90`이 `termDays = 90`과 이미 같은데 `maturityAt`은
아직 약 3개월 남은 미래 시점이다 — **실사용 정산 워커가 만든 유기적 데이터가 아니라
`web/prisma/seedStaking.ts`류 시드 스크립트가 "만기 완료" 상태를 즉시 재현하기 위해 만든
합성 픽스처 행**이라는 신호다.

---

## 3. 이 숫자를 프로덕션 부채 추정에 쓸 수 있는가 — 쓸 수 없다

**로컬 DB 결과는 프로덕션 부채 규모의 추정치로 절대 쓰지 말 것.** 근거:

1. **DB 자체가 다르다.** 로컬은 `bana_wallet_dev`(로컬 Postgres, localhost:5432)이고 프로덕션은
   Railway의 별도 Postgres 인스턴스다. 데이터는 완전히 분리되어 있다.
2. **로컬 데이터는 시드/테스트 데이터로 보인다.** 포지션이 1건뿐이고, `daysPaid`가 `termDays`와
   같은데 `maturityAt`은 미래이며, 90개의 `StakingPayout` 행이 **전부 동일한 `paidAt` 타임스탬프**
   (2026-08-10T03:47:46.142Z, 밀리초까지 동일)로 찍혀 있다 — 5분 주기 정산 워커가 하루씩 쌓은
   유기적 이력이 아니라 배치 스크립트가 한 번에 만든 픽스처라는 뜻이다.
3. **그랜트 포지션이 0건이다.** B-4(그랜트 실입금 확인)의 전제인 그랜트 데이터 자체가 로컬에
   없으므로, 그랜트 원금 포함 부채는 로컬에서 원천적으로 계산 불가능하다.
4. **PRD N-8이 이미 이 사실을 명시했다.** "라이브 포지션이 몇 건인가"는 이 리포지토리(코드)로는
   답할 수 없고, §13의 결론대로 **운영 DB 집계는 사람이 프로덕션에서 직접 해야 한다.**

즉 이번 조회가 실제로 검증한 것은 **"쿼리 자체가 스키마와 맞고, 관리자 패널의 집계 로직과
동일하게 동작하며, 결과가 `StakingPayout` 원장과 정합한다"**는 것이지 부채의 크기가 아니다.

---

## 4. 프로덕션에서 안전하게 재현하는 방법 (사람이 실행)

`prisma-db-expert`는 프로덕션 DB에 대해 **읽기 전용 `SELECT`만** 허용된다(직접 쓰기·마이그레이션
데이터 수정 금지). B-5/H-5는 PRD가 담당자를 **사람**으로 명시했으므로, 아래 절차는 사람(또는 사람의
명시적 승인 아래 `prisma-db-expert`)이 수행한다.

### 방법 1 — `psql` (권장, 가장 단순)

```bash
cd web
(set -a && source .env.production.local && set +a && \
  psql "$DATABASE_URL" -f /dev/stdin) <<'SQL'
-- 위 §1의 (A)(B)(C)(D) 쿼리를 그대로 붙여넣기
SQL
```

`web/.env.production.local`은 gitignore 대상이며 Railway 퍼블릭 프록시 URL(`DATABASE_PUBLIC_URL`)을
담고 있다 — 이 파일이 없거나 연결이 거부되면 `deploy-manager`에게 재조회를 요청해야 한다(직접
`railway` CLI 실행 금지, CLAUDE.md 규칙 6).

### 방법 2 — 이번에 쓴 것과 동일한 tsx 스크립트

`web/.env.production.local`의 `DATABASE_URL`을 가리키도록 환경을 바꾼 뒤, §1의 쿼리를 그대로
`$queryRawUnsafe`로 실행하는 스크립트(이번 조회에 쓴 스크립트와 동일 구조 — `dotenv/config` →
`pg.Pool` → `PrismaPg` adapter → `PrismaClient`)를 1회성으로 돌리고 즉시 삭제한다. 스크립트는
전량 `SELECT`만 포함해야 하며 어떤 `INSERT`/`UPDATE`/`DELETE`/DDL도 포함해서는 안 된다.

```bash
cd web
(set -a && source .env.production.local && set +a && npx tsx <스크립트 경로>)
```

### 공통 주의사항

- **`prisma migrate deploy`/`migrate dev`/`db push`를 이 작업과 섞지 않는다.** 이번 작업은 순수
  조회이며 스키마 변경이 전혀 없다.
- 실행 전 `(set -a && source .env.production.local && set +a && npx prisma migrate status)`로
  프로덕션 마이그레이션이 로컬과 일치하는지 확인해두면, 조회 대상 컬럼(`grantedByAdminId`,
  `paidInterest` 등)이 로컬과 동일한 스키마임을 보장할 수 있다(이번 세션에서는 로컬 `migrate
  status`만 확인했고 — "Database schema is up to date!", 26개 마이그레이션 — 프로덕션에는
  연결하지 않았다).
- 결과를 저장할 때 사용자 식별자(`userId`, `email`)가 섞인 개별 행이 아니라 §1 (A)(B)(C)(D)의
  **집계 결과만** 남긴다.
- 결과를 이 문서 §2와 같은 형식으로 `staking-yield-system-v2-prd.md` §13 B-5/H-5 옆에 추가하거나
  별도로 이어붙이면, 그 시점부터 B-5가 해소된 것으로 표시할 수 있다.

---

## 5. 결론

- B-5/H-5는 **여전히 미해소**다. 이 문서는 그것을 사람이 프로덕션에서 즉시 재현할 수 있도록
  쿼리와 절차를 준비해 둔 것이지, 답을 제공한 것이 아니다.
- 로컬 개발 DB에서 확인한 것은 쿼리의 정확성과 원장 정합성(§2)뿐이며, 데이터 자체는 합성
  시드 픽스처로 보여 프로덕션 부채 규모와 무관하다(§3).
- 그랜트 원금 포함 여부(H-2)와 무관하게, §1 (B) 쿼리는 그랜트 활성 원금을 항상 별도로 뽑아내므로
  H-2-a/H-2-b 어느 쪽이 채택되어도 같은 쿼리 결과에서 바로 계산할 수 있다.

---

## 6. B-2-i 실증 조회 결과 — 프로덕션 (2026-08-10, `prisma-db-expert` 실행)

> 관련: `docs/specs/staking-yield-system-v2-prd.md` §2.1.2 B-2-i, §13 질의서
> ("사용자 주도 스테이킹이 실제로 성공한 적이 있는가"로 BANA의 Nia-Hub 자산 등록 여부를 실증)

**요청자:** `pm` (B-2-i 판정용). **실행자:** `prisma-db-expert`, `.env.production.local`
(Railway 퍼블릭 프록시)로 프로덕션 DB에 직접 연결. **전량 읽기 전용 `SELECT`**, 쓰기·마이그레이션
없음. 조회 전 `npx prisma migrate status`로 로컬·프로덕션 모두 "26 migrations, up to date"
확인(drift 없음) — 조회 대상 컬럼(`grantedByAdminId` 등)이 로컬과 동일한 스키마임이 보장됨.

### 6.1 `StakePosition` — 그랜트 여부·상태 분해

```sql
SELECT "grantedByAdminId" IS NULL AS "isUserInitiated", status, COUNT(*)::int AS cnt
FROM "StakePosition" GROUP BY 1, 2 ORDER BY 1 DESC, 2;
```

결과: **0 rows.** `StakePosition` 테이블에 프로덕션에 단 한 건도 없다 — 사용자 주도(user-initiated)
0건, 관리자 그랜트(admin-granted) 0건, 도합 0건. `status`(ACTIVE/MATURED) 분해도 당연히 없음.

### 6.2 정황 확인 — 이게 데이터가 아예 없는 빈 DB가 아님을 확인

```sql
SELECT 'User' tbl, COUNT(*) FROM "User"
UNION ALL SELECT 'StakingProduct', COUNT(*) FROM "StakingProduct"
UNION ALL SELECT 'StakePosition', COUNT(*) FROM "StakePosition"
UNION ALL SELECT 'StakingPayout', COUNT(*) FROM "StakingPayout"
UNION ALL SELECT 'WithdrawalRequest', COUNT(*) FROM "WithdrawalRequest"
UNION ALL SELECT 'ReferralBonusPayout', COUNT(*) FROM "ReferralBonusPayout"
UNION ALL SELECT 'AuditLog', COUNT(*) FROM "AuditLog";
```

| tbl | cnt |
|---|---|
| User | 9 |
| StakingProduct | 5 |
| StakePosition | **0** |
| StakingPayout | 0 |
| WithdrawalRequest | 0 |
| ReferralBonusPayout | 0 |
| AuditLog | 1 |

프로덕션은 실제 운영 DB다(User 9명, AuditLog 1건 — 완전히 빈 프로비저닝 직후 DB가 아니다).
그런데도 `StakePosition`이 정확히 0건이다.

`StakingProduct`도 함께 확인했다 — 5개 상품이 모두 `coin = 'BANA'`, `status = 'OPEN'`, 생성일
`2026-07-03`(오늘 `2026-08-10` 기준 **5주 이상 전**)이다:

| id | coin | name | status | createdAt |
|---|---|---|---|---|
| cmr4ek8nz... | BANA | BANA 10-Day | OPEN | 2026-07-03 |
| cmr4ek8o1... | BANA | BANA 30-Day | OPEN | 2026-07-03 |
| cmr4ek8o3... | BANA | BANA 90-Day | OPEN | 2026-07-03 |
| cmr4ek8o5... | BANA | BANA 180-Day | OPEN | 2026-07-03 |
| cmr4ek8o7... | BANA | BANA 360-Day | OPEN | 2026-07-03 |

### 6.3 판정 — B-2-i에 대해 요청된 이분법으로는 답할 수 없다 (제3의 결과)

요청서가 예상한 두 갈래는:
- (i) 사용자 주도 포지션이 존재 → BANA가 이미 허브 자산으로 등록되어 있다는 강한 정황.
- (ii) 사용자 주도 포지션이 0건(그랜트만 존재) → BANA 미등록 가능성이 높다는 정황.

**실제 결과는 그 어느 쪽도 아니다.** 그랜트 포지션도 0건이다. 관리자 그랜트 경로는 (PRD가
명시한 대로) 허브 잔고 확인을 거치지 않으므로 BANA 등록 여부와 무관하게 언제든 만들 수 있는데,
그마저 한 건도 없다. 즉 이 데이터는 **"BANA가 등록 안 되어 있어서 사용자 스테이킹이 다 막혔다"**는
가설과도, **"BANA가 등록돼 있어서 사용자 스테이킹이 성공했다"**는 가설과도 부합하지 않는다 —
둘 다에 대해 **무증거(no evidence)** 다. 대신 관찰되는 사실은:

- BANA 상품 5종이 5주 넘게 `OPEN` 상태로 존재했다.
- 그 5주 동안 사용자 주도든 관리자 그랜트든 단 한 건의 포지션도 생성되지 않았다.
- 관리자 그랜트 UI/API가 실제로 쓰인 적이 없다는 뜻이거나(운영 절차 문제), 스테이킹 화면
  자체에 아무도 도달하지 못했거나(UX/노출 문제), 혹은 코드가 배포된 뒤에도 실사용이 전혀
  없었다는 뜻이다 — 이 중 어느 것도 이 쿼리만으로는 구분할 수 없다.

**결론: B-2-i는 이 조회로 해소되지 않는다.** "사용자 스테이킹이 성공한 적 있는가"라는
간접 증거 방법 자체가 전제("누군가 시도했다")를 충족하지 못해 무력화됐다. BANA가 Nia-Hub에
자산으로 등록되어 있는지 직접 확인하려면 §6.4로 넘어가야 한다.

### 6.4 Nia-Hub 실제 API 직접 확인 — 이번 세션에서는 생략함

요청서 2번(`GET /api/v1/wallets?currency=BANA` 직접 호출)은 **이번 세션에서 수행하지 않았다.**
이유:

1. **권한 밖.** 이 호출은 `niaWalletRequest()`(`web/src/lib/nia/client.ts`)를 거쳐야 하고, 이는
   `NIA_API_SECRET`으로 HMAC 서명한다. `CLAUDE.md` 규칙 4에 따라 이 HMAC 서명 경로는
   **`web-shared-expert` 소유**이며 `prisma-db-expert`의 스코프(DB·마이그레이션)가 아니다.
2. **엔드포인트 자체가 특정 사용자 계정에 종속된다.** 코드 확인 결과(`stake/route.ts:100`,
   `nia/balance/route.ts:14`) 이 엔드포인트는 `query: { userId: niaUserId, currency }` 형태로
   **반드시 특정 유저의 허브 계정(`niaUserId`)을 지정해야 한다.** "BANA가 자산으로 등록되어
   있는가"라는 전역 질문에 답하려면 실제 프로덕션 유저 9명 중 한 명의 허브 계정 컨텍스트를
   빌려야 한다는 뜻이고, 이는 사람 승인 없이 `prisma-db-expert`가 임의로 실행하기에는 범위가
   넓다(실제 외부 API 호출, 실사용자 컨텍스트 사용).
3. 요청서 자체가 "어렵거나 위험하면 생략하고 1번 결과만으로 보고" 하도록 명시했다.

**대안 제안:** 이 확인이 여전히 필요하면, 프로덕션 유저 1명의 `niaUserId`를 빌려
`GET /api/v1/wallets?currency=BANA`를 호출하는 것은 `web-shared-expert`(HMAC 클라이언트 소유자)
스코프이며, 사람의 명시적 승인 아래 진행해야 한다. 혹은 더 간단한 대안으로 **관리자 스테이킹
그랜트를 1건 실제로 실행**해 보는 방법이 있다 — 그랜트 경로도 코드상 잔고 확인 없이 포지션만
만들지만, 그 이후 이자 지급 시점에 허브 정산이 필요한 흐름(`staking-payout-rail-prd.md`가 지적한
지급 레일 부재)이 있다면 그 지점에서 간접적으로 드러날 수 있다. 다만 이는 §6.3에서 관찰된 대로
"그랜트 경로 자체가 지금까지 한 번도 쓰인 적 없다"는 별도 사실과 얽혀 있어 B-2-i 전용 실증
수단으로는 깨끗하지 않다.

### 6.5 요약

| 질문 | 답 |
|---|---|
| 프로덕션에 사용자 주도(비그랜트) `StakePosition`이 존재하는가 | **아니오. 0건.** |
| 프로덕션에 관리자 그랜트 `StakePosition`이 존재하는가 | **아니오. 0건.** (참고 정보 — 요청 범위 밖이지만 판정에 영향) |
| 이 결과가 BANA의 Nia-Hub 자산 등록 여부를 확정하는가 | **아니오.** 그랜트/사용자 양쪽 다 0건이라 어느 가설과도 부합하는 무증거 상태 |
| `GET /api/v1/wallets?currency=BANA` 실제 호출 결과 | **미수행** — 스코프 밖(HMAC 비밀은 `web-shared-expert` 소유) + 실사용자 계정 컨텍스트 필요 + 요청서가 위험 시 생략을 허용 |

B-2-i는 여전히 **미해소**다. `pm`이 판정을 마무리하려면 (a) `web-shared-expert`에게 사람 승인 하에
실제 허브 조회를 위임하거나, (b) 파트너(Nia-Hub 운영사)에게 "BANA가 자산 목록에 등록되어 있는가"를
직접 질의하는 것이 가장 깨끗한 다음 단계로 보인다.
