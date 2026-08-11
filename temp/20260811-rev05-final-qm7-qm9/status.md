# 진행 상황 — rev05 최종 확정

| # | 항목 | 상태 |
|---|------|------|
| 1 | rev05 본문 정독 | 완료 |
| 2 | A-3 `LocalLedgerReasonCode` taxonomy 재확인 (`ADMIN_ADJUSTMENT_CREDIT` 게이트 제외 근거) | 완료 — A-3 §592 |
| 3 | PoR-1″ 좌변 실계산 확인 (`runReserveVerification` L1) | 완료 — L1 = Σ `UserCoinBalance.balance`, 관리자 크레딧 포함됨 |
| 4 | `ReserveVerificationRun` 컬럼 구성 확인 (분리 가시성 부재) | 완료 — 전용 컬럼 없음 → AC-9 신설 |
| 5 | `debitLocalLedger` 홀드 미검사 발견 | 완료 — N-48 |
| 6 | DEEP CORE `maxTermDays` 산출 위치 확인 | 완료 — N-49 (사용자별) |
| 7 | abandon-onchain 마찰 확인 패턴 확인 (A-5 §1.6) | 완료 — 타이핑 확인 수준 승계 |
| 8 | rev05 문서 갱신 (§0/§1.6/§4/§4A/§5/§7/§8/§9/§10) | 완료 |

## 후속 (이 세션 밖)

- `product-planner` — T-8(S-STAKE v2 FRD) · T-16(관리자 크레딧 화면 FRD)
- `wallet-security-expert` — T-19. **이 리뷰 통과 전 CUT-2b 배포 금지**
- `prisma-db-expert` — T-2(CS-2′) · T-15(`PlatformSetting` 4종 + `ReserveVerificationRun` 1종)
- 마스터 — Q-M3 / Q-M5 / Q-M6 여전히 미회신
