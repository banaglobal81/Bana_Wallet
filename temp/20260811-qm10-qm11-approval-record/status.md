# 진행 상황 — Q-M10 · Q-M11 승인 기록 정정

> `pm` · 2026-08-11

| # | 단계 | 상태 |
|---|---|---|
| 1 | 모순 실측 — 코드 주석 vs rev05 §8.3 / rev05a §10 / T-16 §12 / INDEX | **완료** |
| 2 | 코드 반영값 확인(`schema.prisma` + `migration.sql`) | **완료** — 5000/20000/100000/10000, 승인값과 일치 |
| 3 | rev05b 부속 확정 문서 발행 | **완료** |
| 4 | rev05 §8.3 · rev05a §10 · T-16 §12 · INDEX 포인터 삽입 | **`doc-keeper` 위임**(rev05b §6) |
| 5 | 기존 `PlatformSetting` 행의 실제 값 확인 | **대기** — T-2(CS-2′)에 REC-3으로 등재 |
| 6 | T-19 재리뷰 시 감사 근거 재확인 + 킬 스위치 단독 잠금 검토 | **대기** — `wallet-security-expert` |

## 실측 근거 (행 번호)

- `web/prisma/schema.prisma:174-183` — 한도 3종 `@default("5000"/"20000"/"100000")`
- `web/prisma/schema.prisma:193-195` — `maxInterestLiabilityCapBana @default("10000")`
- `web/prisma/migrations/20260810172206_admin_credit_platform_settings_and_por_column/migration.sql:2-6`
- `docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md:936-945` (§8.3)
- `docs/specs/staking-yield-system-v2-prd-rev05a-admin-credit-rulings.md:279` (§10)
- `docs/specs/staking-yield-system-v2-design-t16-admin-credit-frd.md:1143` (§12)
- `docs/specs/staking-yield-system-v2-INDEX.md:39`

## 코드 변경

**0줄.** 이 세션은 문서만 발행했다.

## 열린 항목

- 기존 `PlatformSetting` 행의 실제 값은 DB 조회 없이 단정할 수 없다 → REC-3.
- 한도 3종이 non-null이 되면서 배포 시점 잠금이 킬 스위치 단독 → rev05b §5, T-19 항목.
