# status — DEEP CORE 수익 연동 게이트 사인오프

**작성:** `pm` · 2026-08-10 · **상태: 완료**

| # | 단계 | 상태 |
|---|------|------|
| 1 | 게이트 문서 4종 정독 (00/02/03/04) | 완료 |
| 2 | `docs/patterns/pm.md` 자기 규칙 확인 | 완료 |
| 3 | 코드 검증 — 지급 레일, 출금 산식, 원장 선례 | 완료 (C1~C3) |
| 4 | 코드 검증 — 적립 상한 누락, minAmount nullable | 완료 (C4~C5) |
| 5 | 코드 검증 — 빌드 파손 주장 사실 확인 | 완료 (C6 — 주장 반증) |
| 6 | Q1~Q5 판단 확정 | 완료 |
| 7 | `deep-core-00` §6 사인오프 기록 | 완료 |
| 8 | `deep-core-04` 헤더 게이트 상태 갱신 (해제 조건 G-1~G-3로 교체) | 완료 |
| 9 | `docs/patterns/pm.md` 교훈 기록 | 완료 |
| 10 | 후속 위임 (researcher / web-shared-expert / game-designer / game-developer) | 상위 에이전트 소관 |

## 변경된 파일

- `docs/specs/deep-core-00-overview-and-gate.md` — §6 사인오프 신설, §1.1·§3·§4에 갱신 배너
- `docs/specs/deep-core-04-yield-linkage-GATED.md` — 헤더 게이트 상태 교체, E-6/§5.4/§6.1/AB-15/
  AC-Y15·Y16/§10 판정 열 반영
- `docs/patterns/pm.md` — 교훈 1건 추가

**코드 파일은 하나도 건드리지 않았다.**

## 미해결 (사인오프 이후 추적 대상)

- **G-1 / EQ-1** 지급 레일 미정 — `web-shared-expert` 명세 필요. **최우선 차단 조건.**
- **G-2 / EQ-3+EQ-4** 관할 판정 수단 + 법률 자문 — `User.locale` 사용 불가로 확정.
- **G-3 / EQ-2** 재원·월 예산 숫자.
- **EQ-5/EQ-6** 세무 표기 / 중단 사전고지 기간 — P1 착수 전까지 유예.
- **M-1**은 Phase 0 구현에 즉시 반영되어야 함 (게이트와 무관).
