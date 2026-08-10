# 변경 내용 — 스테이킹 이자 지급 레일 PRD

## 무엇을 (What)
`docs/specs/staking-payout-rail-investigation.md`(작성: `web-shared-expert`)를 정식 PRD로
승격 → `docs/specs/staking-payout-rail-prd.md` 신규 작성.

PRD가 확정하는 것:
1. 심각도/우선순위 판정 (2트랙 분리: 공시 정정 P0-즉시 / 지급 레일 P1-차단됨)
2. 정산 타이밍 정책 결정 — 조사 문서의 Option A/B를 모두 기각하고 **Option C(명시적 클레임)** 채택
3. 착수 전 차단 전제조건 B-1..B-6 (특히 Nia-Hub 운영자 크레딧 API 존재 여부 — 사람이
   Nia-Hub 측에 직접 질의해야만 답이 나옴)
4. 다음 단계 담당자별 작업 분배 및 순서

## 왜 (Why)
- `StakePosition.paidInterest`는 BANA 자체 Postgres에만 존재하며 사용자의 실제 출금 가능
  잔고가 되는 코드 경로가 없음이 코드 레벨로 확인됨. 그럼에도 `/staking`은 이를
  "Paid to date"로 표시 중 → 실사용자 자금 관련 허위 표시.
- 이 이슈는 DEEP CORE 게임 프로젝트의 P1(실보상 연동) 게이트 G-1
  (`docs/specs/deep-core-00-overview-and-gate.md` §6)의 해제 조건이며, 게이트를 유지/해제할
  근거 문서가 필요함.
- 조사 문서는 "구현 명세" 성격이라 제품 판단(우선순위, 정책 선택, 승인 조건, 오너십)이
  비어 있음. 그 판단은 `pm`의 몫.

## 코드에 미치는 영향
이 작업 자체는 코드를 변경하지 않음(문서만). 다만 PRD는 향후 다음 영역의 변경을 지시함:
- Track 1(즉시): `Staking.tsx` 문구, `web/messages/*.json` 6개 로케일, 관리자 통계 라우트
- Track 2(차단): `schema.prisma` 마이그레이션, 신규 클레임 엔드포인트, Nia-Hub 클라이언트

## 건드리지 않는 것
- `web/src/components/staking/deep-core/**` (다른 에이전트 작업 중)
- `web/src/lib/stakingRenew.ts` (다른 에이전트 작성 중 — 현재 워크트리에 파일 부재)
- 모든 코드 파일 (pm은 코드 편집 금지)
