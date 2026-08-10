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
