# 20260810 — 스테이킹 이자 시스템 v2 재구축 PRD

## 무엇이 바뀌는가

마스터 지시로 방향 전환: 기존 스테이킹 이자 시스템(`dailyRatePct` 단일 이율 +
`StakePosition`/`StakingPayout`)을 **유지·보수**하는 것이 아니라 **재설계**한다. 그리고
DEEP CORE 게임의 실보상 연동(P1)을 "기존 시스템 위에 얹는 보너스"가 아니라 **처음부터
수익률 구조의 일부**로 설계한다.

기존 산출물과의 관계:
- `docs/specs/staking-payout-rail-prd.md` (G-1 조사 PRD) — Track 1(허위 표시 정정, 부채
  가시화)은 **그대로 유효하며 v2의 선행조건**. Track 2(클레임 레일)는 v2에 흡수된다.
- `docs/specs/deep-core-00-overview-and-gate.md` §6 — Phase 0 승인 유지, P1 게이트
  G-1/G-2/G-3을 v2 기준으로 재정의한다.
- `docs/specs/deep-core-04-yield-linkage-GATED.md` — "그림자 원장 + 계약 이율 불변" 전제가
  재구축으로 바뀌므로, 무엇이 승계되고 무엇이 폐기되는지 판정한다.

## 왜

1. 현재 이자는 사용자 출금 가능 잔고가 되는 경로가 없다(미충당 부채 + 허위 표시).
2. 게임 보너스를 별도 원장으로 "얹으면" 지급 레일이 둘이 되고, 같은 계열의 결함이 두 배가 된다.
3. 재구축 기회에 (a) 지급 레일, (b) 게임 연동, (c) 그랜트 락 오작동(B-4)을 **하나의 일관된
   모델**로 해결한다.

## 산출물

- `docs/specs/staking-yield-system-v2-prd.md` (신규)

## 범위 밖 (코드 미변경)

이 작업에서 코드는 한 줄도 건드리지 않는다. 후속: `prisma-db-expert`(스키마) →
`product-planner`+`ui-ux-designer`(화면) → `web-shared-expert`/`web-wallet-expert`/
`game-developer`(구현).
