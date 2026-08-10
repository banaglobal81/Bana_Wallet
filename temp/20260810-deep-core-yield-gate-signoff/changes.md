# changes — DEEP CORE 수익 연동 게이트 사인오프

**작성:** `pm` · 2026-08-10
**대상:** `docs/specs/deep-core-00-overview-and-gate.md` §4 Q1~Q5 (게이트 판단)

## 무엇을 왜 바꾸는가

`game-planner`가 스테이킹 게임화 기획(DEEP CORE 00~06)을 제출하면서, "게임 스탯(MP)이 실제
스테이킹 지급액을 증가시키는" 메커닉을 본인 운영 규칙상 게이트 처리했다. 이 게이트의 해제·유지
판단은 `pm` 전속 권한이므로, 본 작업은 그 판단을 기록하는 것이다.

### 변경 대상 파일 (문서만 — 코드 변경 없음)
- `docs/specs/deep-core-00-overview-and-gate.md` — §6 사인오프 절 추가 (Q1~Q5 답변 + pm 수정 요구사항)

### 코드 조사 결과 (사인오프 근거 — `docs/patterns/pm.md` "load-bearing claim을 코드로 검증" 규칙)

| # | 확인 사항 | 결과 |
|---|-----------|------|
| C1 | 스테이킹 이자의 실제 지급 경로 | **없음.** `StakingPayout` + `StakePosition.paidInterest`는 BANA DB 기록일 뿐, 출금 가능 잔고를 증가시키지 않는다 |
| C2 | 출금 가능액 산식 | `nia 잔고 − 잠긴 원금`. `paidInterest` 미반영 (`api/nia/withdrawals/route.ts:231`) |
| C3 | `ReferralBonusPayout` 선례 | 동일하게 행만 생성, 잔고 크레딧 없음 + env로 OFF |
| C4 | `charter_open` 상한 | **없음.** 02 §2 / 03 §2.1 모두 무제한. AB-4의 3포지션 상한은 `lift`에만 적용 |
| C5 | `StakingProduct.minAmount` | `String?` — nullable. 최소 예치금 없는 상품 생성 가능 |
| C6 | `Staking.tsx` 빌드 파손 주장(00 §3) | **거짓/오래됨.** import는 이미 제거되어 주석(:365-372)으로 대체됨 |
| C7 | 관할 판별용 `User.locale` | 사용자가 직접 변경 가능한 UI 언어 설정 → 관할 통제 수단이 될 수 없음 |
| C8 | "Rewards Earned" UI | `Staking.tsx:375` 가 `paidInterest`를 이미 사용자에게 표시 중 (미지급 금액) |

## 결정 요지

- **P0 (코스메틱 진행형): 무조건 승인, 즉시 착수.**
- **P1 설계: 원칙 승인** — 재설계 요구 없음. 그림자 원장 + 계약 이율 불변 + 선형·하드캡 구조는 옳다.
- **P1 구현: 미승인 (게이트 유지).** 해제 조건 3건(EQ-1 지급 레일, 법무, 재원) 충족 시 자동 해제.
- **Q2:** `game-planner` 권고 수용 (원금 비례 적립 불채택) + `charter_open` 상한 신설 요구.
