# CS-2′ 프로덕션 재조회 — 2026-08-11

> 담당: `prisma-db-expert` · 근거: `docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md` §5.0 (요구 CS-2′)
> **조회만 수행. 쓰기 없음.** `prisma db push` 사용 안 함. `UPDATE`/`INSERT`/`DELETE` 없음.

## 0. 결론 (한 줄)

**`StakePosition` 행 수 = 0.** §5.0의 무효화 조건("v1 포지션이 1건이라도 있으면 이 문서의 컷오버는
무효")에 **해당하지 않는다.** CUT-1 착수를 막는 사유는 이 재조회에서 발견되지 않았다.

다만 **AC-8 재개 조건이 이미 충족됐다** — `role='ADMIN'` 계정이 **2개**로, §4A.4 AC-8이 못 박은
"4-eyes 필수 전환" 임계선(2개 이상)에 이미 도달해 있다. 아래 §2에서 강조한다.

또한 **본 재조회와 별개로, 프로덕션 마이그레이션이 로컬보다 2건 뒤처져 있음을 발견했다**(§4).
이번 작업 범위(조회)는 아니므로 배포하지 않았다 — 승인 필요.

---

## 1. 조회 결과 (실측)

접속: `web/.env.production.local`의 `DATABASE_URL`(Railway public proxy, `reseau.proxy.rlwy.net:54541`,
database `railway`) 사용. Prisma Client(`@prisma/adapter-pg`)로 조회, 읽기 전용.

| # | 대상 | 결과 |
|---|------|------|
| 1 | `StakePosition` 전체 건수 | **0**(status별 그룹도 0행 — 즉 데이터 없음) |
| 2 | `StakingPayout` 전체 건수 | **0** |
| 3 | `ReferralBonusPayout` 전체 건수 | **0** |
| 4 | `WithdrawalRequest` 상태별 건수 | **0**(전체 0건, 상태별 그룹도 0행) |
| 5 | `StakePositionV2` 전체 건수 | **0** |
| 6 | `StakeYieldLedgerEntry` 전체 건수 | **0** |
| 7 | `UserCoinBalance` 중 `balance != '0'`인 행 수 | **0**(전체 `UserCoinBalance` 행 자체가 0건) |
| 8 | `LocalBalanceHold` 중 `status='ACTIVE'`인 건수 | **0** |
| 9 | `PlatformControlledAddress` 중 `active=true`인 건수/목록 | **1건** — `coin=BANA`, `network=BINANCE`, `label=COMPANY_TREASURY`, `address=0x0Ecf2806da71ac9f2014C6b33f10390fd85e78Fa`, `addedAt=2026-08-10T15:18:36.669Z` |
| 10 | `StakingProduct` status별 건수 | **`CLOSED`: 5건** (다른 status 0건) — CS-1 봉쇄 상태 유지 확인 |
| 11 | `User` 중 `role='ADMIN'` 계정 수 | **2건** (전체 `User` 10건 중) — **§2 강조 참조** |
| 12 | `LocalLedgerEntry` `reasonCode`별 건수·합계(AC-9 기준선) | **0건**(전체 `LocalLedgerEntry` 행 자체가 0건 — 기준선은 "전부 0") |

### 참고 — 프로덕션 마이그레이션 적용 현황 재확인

`StakingProduct.status` 5건 전부 `CLOSED`로, rev05 §2.2 CS-1′ 이전 rev03 CS-1의 결과가 그대로
유지되고 있음을 데이터로 재확인했다(코드 레벨 CS-1′ 봉쇄는 별도 배포 사안).

---

## 2. 강조 — AC-8 재개 조건 도달 (관리자 계정 2개)

문서 §4A.4 요구 AC-8 원문:

> *"이번 라운드에서는 [4-eyes를] 구현하지 않는다... 재개 조건(무조건): 관리자 계정이 2개 이상이
> 되는 시점에 4-eyes를 필수로 전환한다. 그 시점을 알기 위해 CS-2′에 관리자 계정 수 조회를
> 추가한다."*

이번 조회 결과 `role='ADMIN'` 계정이 **정확히 2개**다. 즉 **AC-8이 "무조건 재개"라고 못 박은
그 조건이 이미 충족된 상태다.** 이것은 CUT-1 진행을 막는 사유는 아니지만(CS-2′ 무효화 조건은
`StakePosition`에만 걸림), **CUT-2b(관리자 크레딧 표면) 착수 전에 4-eyes(2인 승인) 구현 여부를
`pm`/마스터가 재확인해야 하는 사안**이다. 관리자 크레딧은 §4A가 "PoR 게이트를 우회하는 준비금
검사 없는 잔고 생성 버튼"이라고 명시한 표면이므로, 이 임계값 도달을 묻히지 않고 보고한다.

---

## 3. 무효화 판정

§5.0 원문: **"v1 포지션이 1건이라도 있으면 이 문서의 컷오버는 무효가 되고 개정 01 §5(승계 전략)로
돌아간다."**

`StakePosition` = 0건 → **무효화 조건 미충족. 컷오버 진행 가능.** 다른 11개 항목도 무효화 판정에는
관여하지 않지만, 전부 "0건" 또는 이미 알려진 상태(`StakingProduct` 5건 CLOSED, `PlatformControlledAddress`
1건 active)로, 개정 04~05가 서술한 실측(N-23~N-50)과 어긋나지 않는다.

---

## 4. 범위 밖 발견 — 프로덕션 마이그레이션 드리프트 (승인 대기, 미배포)

이번 작업(조회)과 별개로 확인 절차상(CLAUDE.md rule 7) `migrate status`를 로컬·프로덕션 양쪽에
실행했다. **프로덕션이 로컬보다 마이그레이션 2건 뒤처져 있다:**

- `20260810172206_admin_credit_platform_settings_and_por_column`
  — `PlatformSetting`에 `adminCreditCumulativeCap`/`adminCreditEnabled`/`adminCreditMaxPerDay`/
  `adminCreditMaxPerTx`/`maxInterestLiabilityCapBana` 컬럼 추가, `ReserveVerificationRun`에
  `adminAdjustmentNetCreditTotal` 컬럼 추가. **추가적(additive)** — 기존 데이터 손실 없음. 새 컬럼은
  전부 nullable 또는 기본값 지정.
- `20260810182644_admin_credit_platform_settings_null_defaults`
  — 위 컬럼들의 `DEFAULT`를 제거하고, 이미 기본값으로 채워진 기존 행을 다시 `NULL`로 되돌리는
  **데이터 수정 포함**(`wallet-security-expert` T-17 리뷰 반영 — "마스터 승인 없이 산정된 숫자는
  기본값으로도 남아 있으면 안 된다"는 fail-closed 정정). **금전(잔고/원장) 컬럼은 건드리지 않는다**
  — `PlatformSetting`은 설정값이지 `String` 금액 원장이 아니다.

두 마이그레이션 모두 이번 조회 대상 12개 테이블(`StakePosition` 등)에는 영향이 없으므로 §1의
조회 결과 신뢰성에는 영향을 주지 않는다. **배포하지 않았다** — CS-2′는 조회만 요구했고, 배포는
별도 승인 사안이다. 배포를 원하면 알려달라 — 승인 시 `web/`에서
`(set -a && source .env.production.local && set +a && npx prisma migrate deploy)`로 진행한다.

---

## 5. 사용한 조회 방법 (재현성)

Prisma Client(`@prisma/adapter-pg`, `pg.Pool`)로 프로덕션 `DATABASE_URL`에 연결해 `groupBy`/`count`/
`findMany` 읽기 전용 쿼리만 실행. `UserCoinBalance.balance`의 0 여부 판정과 `LocalLedgerEntry.amount`
합계는 `decimal.js`(`Decimal`)로 계산해 CLAUDE.md rule 2를 준수했다(`Number()`/`parseFloat` 미사용 —
다만 결과가 전부 0건이라 합계 자체는 공집합). 조회에 사용한 스크립트는 세션 스크래치패드에만
존재했고 저장소에는 남기지 않았다(작업 종료 시 삭제).
