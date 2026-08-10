# 스테이킹 수익 시스템 v2 — 문서 읽기 순서 (INDEX)

> 작성: `pm` · 2026-08-10 (개정 04 반영)
> **v2 관련 문서는 5개이며 누적 개정 구조다. 아래 순서로 읽고, 충돌 시 뒤 문서가 이긴다.**
> 부모 문서를 단독으로 읽으면 낡은 전제 위에서 판단하게 된다.

| 순서 | 문서 | 지위 |
|------|------|------|
| 1 | `staking-yield-system-v2-prd.md` | **개정 01 — 본체.** 밴드 모델·그랜트·상한·데이터 모델·고지·화면 |
| 2 | `staking-yield-system-v2-prd-rev02-balance-authority.md` | **개정 02.** 잔고 권위 = 코인별 분할(모델 C), PoR-1, 배타성 X-1~X-4 |
| 3 | `staking-yield-system-v2-prd-rev03-rebuild-and-exclusivity.md` | **개정 03.** 배타성 재정의(X-1′/X-3′), 입금 레일, 출금 큐 편입, 전면 재구축, 게이트 G-0⁗/G-1‴, 프로그램 분할(V2-CORE/V2-BAND), §14 전면 대체 |
| 4 | `staking-yield-system-v2-prd-rev04-core-design-synthesis.md` | **개정 04 — 최신·최우선.** A-2~A-10 설계 종합 판정. **PoR-1′ → PoR-1″ 좌변 재정의**(원금 이중 계상 해소), 레퍼럴·보상 플랜 처리(PoR-S1), PoR-G1/G2, H-2′, 설계 단계 종료 판정 |
| 5 | `staking-payout-rail-prd.md` | 선행 조사·Track 1. **개정 03 §5.5에서 Track 1의 UI 정정 작업은 폐기됨**(대상 화면이 삭제 대상). 관리자 부채 가시화만 V2-CORE로 흡수 |

## 절별 최신 소유권 (충돌 시 참조)

| 주제 | 최신 판정 위치 |
|------|----------------|
| 밴드 모델·수식·계약 불변성(A1′) | 개정 01 §3 |
| 그랜트 락 구조(G-A~G-D) | 개정 01 §6 (단 **V2-CORE에서는 그랜트 생성 자체를 차단** — 개정 04 §1.8 G-E) |
| 상한 체계(L-1~L-5) | 개정 01 §7 (단 L-4는 개정 02 §4.3에서 PoR의 하위 구획으로 재정의) |
| 데이터 모델 의미 요구·수수료/한도 설정(T-1~T-8) | 개정 01 §8 (단 T-2는 개정 03 W-7의 T-2′로 권위별 분기) |
| 고지 문구 판정 | 개정 01 §10 |
| 화면 요구(R-U1~R-U30) | 개정 01 §11 (+ 개정 03 A-7에서 로컬 잔고·BANA 출금 표면 추가) |
| **잔고 권위 모델 (C)** | 개정 02 §2 |
| **준비금 불변식** | **개정 04 §1 — PoR-1″.** 좌변은 개정 04가 소유(개정 02 §4.2·개정 03 §3.4 좌변 폐기). **우변 정의는 개정 03 §3.4 승계** |
| **부채 스트림 등록부(PoR-S1)·레퍼럴/보상 플랜 처리** | **개정 04 §2** |
| **배타성 요구** | **개정 03 §2 (X-1′/X-2/X-3′/X-4′/X-6/X-7/X-8)** — X-7 해석은 **개정 04 §4.1 N-6** |
| **BANA 입금 레일** | **개정 03 §3** + A-7 §7 (해석 확정: 개정 04 §4.1 N-6) |
| **BANA 출금 실행·승인 큐** | **개정 03 §4** + A-5. 수수료 필드 의미는 **개정 04 §4.1 N-4/N-5** |
| **전환/마이그레이션 전략** | **개정 03 §5 — 개정 01 §5는 폐기됨(프로덕션 0건)** |
| **게이트** | **개정 03 §6 (G-0⁗ / G-1‴) + 개정 01 §9 G-2′/G-3′** |
| **마이그레이션 실행 조건** | **개정 04 §5 — rev03 §7.2의 3조건 + 조건 ④(Q-M5 의존 범위) + 선행조건 P-1~P-3** |
| **담당자별 다음 단계** | **개정 04 §6 (개정 03 §7을 갱신)** |
| **차단 항목 최종 목록** | **개정 04 §6.3 (개정 03 §8을 갱신)** |
| **마스터 확인 질문** | **개정 03 §9 (Q-M3 / Q-M5 / Q-M6 미회신) — 상태는 개정 04 §6.3** |

## 설계 산출물 (V2-CORE, rev03 §7.2 A-2~A-11)

| ID | 문서 | 담당 | 개정 04의 구속 |
|----|------|------|----------------|
| A-2 | `staking-yield-system-v2-design-a2-balance-authority.md` | `prisma-db-expert` | 변경 없음 |
| A-3 | `staking-yield-system-v2-design-a3-local-ledger.md` | `prisma-db-expert` | **§2.6 좌변 컬럼 구성 대체**(개정 04 §1.5) + `referralPayableTotal`·PoR-S1·`NO_RESERVE_BASIS` 신설 |
| A-4 | `staking-yield-system-v2-design-a4-staking-schema.md` | `prisma-db-expert` | **H-2′ + 요구 G-E 반영 필요**(개정 04 §1.8) |
| A-5 | `staking-yield-system-v2-design-a5-withdrawal-queue.md` | `web-shared-expert` | **수수료 필드 확정 반영**(개정 04 §4.1 N-4/N-5). `abandon-onchain`은 V2-CORE 범위 밖 확정 |
| A-6 | `staking-yield-system-v2-design-a6-deepcore-adapter.md` | `game-planner` | **Q-A6-1 답: dayMs 단일 출처는 v2 정산 모듈이 export**(개정 04 §4.1 N-7) |
| A-7 | `staking-yield-system-v2-design-a7-screen-flow-frd.md` | `product-planner` | **§11.1-1/2/5/9, §11.3-1 판정 완료**(개정 04 §4.1 N-4~N-6, N-8, N-9) |
| A-8 | `staking-yield-system-v2-design-a8-admin-dashboard-frd.md` | `product-planner` | **Q1/Q2/Q3/Q8 판정 완료.** `componentRole` 5값 확장(개정 04 §1.6) |
| A-9 | `docs/research/2026-08-10-bsc-deposit-detection-and-band-legal-issues.md` | `researcher` | 확정 깊이 숫자 미확정 유지(개정 04 §4.2 D-3) |
| A-10 | (`wallet-security-expert` 리뷰 — A-3/A-5에 반영됨) | `wallet-security-expert` | HIGH 2건 반영 완료. `abandon-onchain` 미구현 확정 |
| A-11 | (미착수 — 시각 설계·디자인 토큰) | `ui-ux-designer` | 지금 착수 가능(개정 04 §5.4) |

## 인접 문서

- `deep-core-00-overview-and-gate.md` — Phase 0 승인(§6.7) 유효. §6.2 게이트는 개정 01 §9 → 개정 03 §6으로 재정의됨
- `deep-core-04-yield-linkage-GATED.md` — 개정 01 §3.5가 흡수·부분 폐기
- `staking-debt-b5-query-result.md` — 프로덕션 실측(포지션 0건). 개정 03 N-27의 근거
- `admin-staking-debt-visibility-frd.md` — V2-CORE로 흡수(개정 03 §5.5), 데이터 계약은 A-8이 대체
