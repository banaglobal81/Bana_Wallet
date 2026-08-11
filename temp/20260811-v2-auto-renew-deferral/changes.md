# V2 자동갱신 — CUT-4 착수 전 판정

## 왜 필요한가
`web-wallet-expert`가 CUT-3(T-6)에서 발견: CUT-1의 `maturePositionV2`는 단순 만기 처리만 하고,
레거시 `stakingRenew.ts`의 `matureOrRenewPosition`에 해당하는 V2 자동갱신 결정 엔진이 없다.
CUT-4에서 사용자 API/화면이 열리면 자동갱신을 켠 포지션이 조용히 갱신되지 않는다.

## 무엇을 판정하는가
1. CUT-4 전에 V2 자동갱신 엔진을 신규 구현할 것인가
2. 1차 컷오버에서 V2 자동갱신을 비활성화할 것인가
3. 기타

## 산출물
- `docs/specs/staking-v2-auto-renew-cutover-ruling.md` (판정 문서)
- rev05 CP-3 / §5.2② 개정 요구 (문서 수정은 별도, 이 판정이 근거)

## 코드는 건드리지 않는다
PM 경계. 요구사항만 정의하고 구현은 `web-shared-expert` / `web-wallet-expert` /
`product-planner` / `qa-lead`에게 배정.
