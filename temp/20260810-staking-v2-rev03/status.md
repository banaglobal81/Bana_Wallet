# status — staking v2 PRD 개정 03

| # | 단계 | 상태 |
|---|------|------|
| 1 | 개정 01 PRD 정독 (`staking-yield-system-v2-prd.md`, 1146줄) | 완료 |
| 2 | 개정 02 정독 (`...-rev02-balance-authority.md`) | 완료 |
| 3 | B-5/B-2-i 조회 결과 정독 (`staking-debt-b5-query-result.md`) | 완료 |
| 4 | DEEP CORE Phase 0 읽기 계약 실측 (`lib/deepCoreProgress.ts:44-75`) | 완료 |
| 5 | 출금 큐 실측 (`api/admin/withdrawals/[id]/approve`, `lib/withdrawals.ts`, `api/nia/withdrawals`) | 완료 |
| 6 | 삭제 대상 범위 실측 (`lib/staking*.ts` 7 · `api/staking/**` 5 · `api/admin/staking/**` 5) | 완료 |
| 7 | 개정 03 작성 | 완료 |
| 8 | 부모 문서 상호 참조 | **INDEX 문서로 대체** — 이 세션에 Edit 도구가 없어 1146줄 파일 헤더를 수정할 수 없었음. `staking-yield-system-v2-INDEX.md`(신규)가 읽기 순서와 절별 소유권을 고정 |

## 산출물

- `docs/specs/staking-yield-system-v2-prd-rev03-rebuild-and-exclusivity.md` (신규, 본 산출물)
- `docs/specs/staking-yield-system-v2-INDEX.md` (신규, 읽기 순서 고정)

## 코드 변경

없음. 문서만.

## 남은 것 (사람)

- **Q-M3** 회사 지갑 주소·온체인 BANA 보유량 — 발행 착수의 유일한 최상위 차단
- **Q-M5** 허브 등록 가능성이 허브 입금 도입 의도인가 — 로컬 원장 구현 착수 전 필요
- **Q-M6** 클레임 수수료 영구 0 확정 (PM 권고)
- **CS-1** 프로덕션 `StakingProduct` 5건 CLOSED 전환 승인 (clean-slate 전제 고정)
- **B-10** 과거 BANA 입금 주소 발급/입금 도착 여부 확인
- H-1 / H-3 / H-4 — **V2-BAND 한정** (V2-CORE는 막지 않음)

## 후속 (doc-keeper 대행 요청 사항)

`docs/specs/staking-yield-system-v2-prd.md`와 `...-rev02-balance-authority.md`의 헤더에
"개정 03이 최우선이며 INDEX를 먼저 읽으라"는 1줄 포인터를 추가하면 좋음(내용 변경 없음).
