# status — StakedSummaryCard R-U7 판정

| 단계 | 담당 | 상태 |
|------|------|------|
| 소스 대조 검증(8개 위반 항목) | `pm` | 완료 2026-08-11 |
| 우선순위·범위 판정 | `pm` | 완료 — SS-1/2/3 승인, M-1~M-5 수정 |
| FRD 부칙 기재 | `product-planner` | **승인됨 · 착수 대기** |
| DC-8 교차참조 1줄 | `product-planner` | 승인됨 · 위와 동일 티켓 |
| 컴포넌트 변경 | `web-wallet-expert` | **차단 — 사용자 별도 go-ahead 필요**(라이브 프로덕션 UI) |
| AC 검증 | `qa-lead` | 대기 |
| SS-4: `accruedInterest` 삭제 | `web-wallet-expert` | 비차단 — v1 `stakingSettle.ts` 폐기 티켓에 귀속 |

## 우선순위 판정
`web-wallet-expert`의 **다음 UI 티켓**으로 올린다(일반 큐 삽입 아님).
근거: (a) 프로덕션 워커 가동으로 실사용자 노출 가능, (b) 최다 트래픽 2개 화면,
(c) 서버 의존 0 — 클라이언트 전용이라 조정 비용 없음, (d) 남은 AC-V5 위반 최후 1건.

## 미해결
- 만기 카운트다운 시계 설계(M-1) — 별도 항목, 담당 미지정.
- v1 `StakePosition.accruedInterest` 컬럼 정리 — v1 폐기 시 `prisma-db-expert`.
