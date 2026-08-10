# 진행 상황 — 스테이킹 이자 지급 레일 PRD

| # | 단계 | 상태 |
|---|------|------|
| 1 | `staking-payout-rail-investigation.md` 정독 | 완료 |
| 2 | 핵심 주장 코드 레벨 재검증 (pm 패턴: "승인 전 근거 코드를 직접 읽어라") | 완료 |
| 3 | 추가 발견사항 정리 (F-A ~ F-E) | 완료 |
| 4 | 심각도/우선순위 판정 | 완료 |
| 5 | 정산 타이밍 정책 결정 (A/B/C) | 완료 — Option C 채택 |
| 6 | 차단 전제조건 및 질의서 작성 | 완료 |
| 7 | `docs/specs/staking-payout-rail-prd.md` 작성 | 완료 |
| 8 | 사람 최종 승인 | **대기 중 — 구현 착수 금지** |

## 재검증에서 확인한 사실 (조사 문서 주장 대비)

확인됨:
- `runStakingSettlement`은 외부 I/O 없음, Postgres만 씀 (`stakingSettle.ts:54-137`)
- `available = niaBal.minus(locked)`, `paidInterest` 미반영 (`withdrawals/route.ts:231`)
- `lockedPrincipalByCoin`은 ACTIVE 원금만 합산 (`staking.ts:69-79`)
- `StakePositionStatus.PAID`는 어디에도 할당되지 않음 (`schema.prisma:39`)
- `ReferralBonusPayout`은 동일 결함, 현재 env 게이트로 비활성

조사 문서에 없던 추가 발견:
- F-A: **BANA만 스테이킹 가능** (`admin/staking/products/route.ts:73`) → 레일 문제는
  단일 자산(플랫폼 자체 토큰) 문제로 축소/재정의됨
- F-B: 관리자 그랜트 포지션의 원금이 `locked`에 합산되어 **사용자의 실제 출금 가능
  BANA를 차감**함 (`admin/staking/positions/route.ts:104-125` + `staking.ts:69-79`
  + `withdrawals/route.ts:231`)
- F-C: `paidInterest`는 증분이 아니라 `perDay × dueDays` 재계산으로 덮어씀
  (`stakingSettle.ts:83`) → 신규 `settledInterest`를 델타로 유도하면 안 됨
- F-D: 출금 가용액 검사가 `if (locked.gt(0))` 안에서만 실행됨
  (`withdrawals/route.ts:212`) → Option B의 구조적 함정
- F-E: `web/src/lib/stakingRenew.ts`가 현재 워크트리에 **없음** (다른 에이전트 작성 중).
  `staking.ts:5` / `stakingSettle.ts:6`가 이미 import 중 → 조사 문서 fact 3의 인용은
  현시점 재검증 불가. 갱신 시 원금 합성 방식 재확인 필요.
