# 스테이킹 수익 시스템 v2 — 문서 읽기 순서 (INDEX)

> 작성: `pm` · 2026-08-10 · **갱신 2026-08-11 (개정 05 최종 확정 반영 — Q-M7/Q-M8/Q-M9 회신)**
> **v2 관련 문서는 6개이며 누적 개정 구조다. 아래 순서로 읽고, 충돌 시 뒤 문서가 이긴다.**
> 부모 문서를 단독으로 읽으면 낡은 전제 위에서 판단하게 된다.

| 순서 | 문서 | 지위 |
|------|------|------|
| 1 | `staking-yield-system-v2-prd.md` | **개정 01 — 본체.** 밴드 모델·그랜트·상한·데이터 모델·고지·화면 |
| 2 | `staking-yield-system-v2-prd-rev02-balance-authority.md` | **개정 02.** 잔고 권위 = 코인별 분할(모델 C), PoR-1, 배타성 X-1~X-4 |
| 3 | `staking-yield-system-v2-prd-rev03-rebuild-and-exclusivity.md` | **개정 03.** 배타성 재정의(X-1′/X-3′), 입금 레일, 출금 큐 편입, 전면 재구축, 게이트 G-0⁗/G-1‴, 프로그램 분할(V2-CORE/V2-BAND), §14 전면 대체 |
| 4 | `staking-yield-system-v2-prd-rev04-core-design-synthesis.md` | **개정 04.** A-2~A-10 설계 종합 판정. **PoR-1′ → PoR-1″ 좌변 재정의**(원금 이중 계상 해소), 레퍼럴·보상 플랜 처리(PoR-S1), PoR-G1/G2, H-2′, 설계 단계 종료 판정 |
| 5 | `staking-yield-system-v2-prd-rev05-creation-path-cutover.md` | **개정 05 — 최신·최우선. 2026-08-11 최종 확정본.** 생성 경로의 V2 컷오버. 읽기/쓰기 분열 실측(N-32~N-50), CS-1′(v1 그랜트·체결 라우트 봉쇄), **초기 상품 구성 확정(CP-5′/CP-7′ — 전부 `CLOSED` 생성, 1차 개설 10/30/90일 3종)**, **부채 상한 CP-10**, **관리자 크레딧 표면 §4A(AC-1~AC-14)**, 컷오버 순서 CUT-0~CUT-6(+CUT-2b), 레퍼럴 조용한-0 회귀(CP-8), 담당자 배정 T-1~T-19 |
| 6 | `staking-payout-rail-prd.md` | 선행 조사·Track 1. **개정 03 §5.5에서 Track 1의 UI 정정 작업은 폐기됨**(대상 화면이 삭제 대상). 관리자 부채 가시화만 V2-CORE로 흡수 |

## 절별 최신 소유권 (충돌 시 참조)

| 주제 | 최신 판정 위치 |
|------|----------------|
| 밴드 모델·수식·계약 불변성(A1′) | 개정 01 §3 |
| 그랜트 락 구조(G-A~G-D) | 개정 01 §6 (단 **V2-CORE에서는 그랜트 생성 자체를 차단** — 개정 04 §1.8 G-E, **v1 라우트 소급 봉쇄는 개정 05 §2.2 CS-1′**) |
| 상한 체계(L-1~L-5) | 개정 01 §7 (단 L-4는 개정 02 §4.3에서 PoR의 하위 구획으로 재정의) |
| 데이터 모델 의미 요구·수수료/한도 설정(T-1~T-8) | 개정 01 §8 (단 T-2는 개정 03 W-7의 T-2′로 권위별 분기) |
| 고지 문구 판정 | 개정 01 §10 (+ **체결 화면 확장은 개정 05 CP-1**, **관리자 크레딧 경고 3문장은 개정 05 §4A.2 AC-2**) |
| 화면 요구(R-U1~R-U30) | 개정 01 §11 (+ 개정 03 A-7에서 로컬 잔고·BANA 출금 표면 추가, **+ S-STAKE v2는 개정 05 §7.1 / 관리자 크레딧 화면은 §7.3으로 `product-planner` 인계**) |
| **잔고 권위 모델 (C)** | 개정 02 §2 |
| **준비금 불변식** | **개정 04 §1 — PoR-1″.** 좌변은 개정 04가 소유(개정 02 §4.2·개정 03 §3.4 좌변 폐기). **우변 정의는 개정 03 §3.4 승계.** **표시 항목 1건 추가(`adminAdjustmentNetCreditTotal`, `SUBSET_OF_LOCAL_BALANCE`, `leftTotal`에 미가산) — 개정 05 §4A.5 AC-9** |
| **부채 스트림 등록부(PoR-S1)·레퍼럴/보상 플랜 처리** | **개정 04 §2** (+ **레퍼럴 트리 SQL의 V2 이설은 개정 05 §6.1 CP-8**) |
| **배타성 요구** | **개정 03 §2 (X-1′/X-2/X-3′/X-4′/X-6/X-7/X-8)** — X-7 해석은 **개정 04 §4.1 N-6**. **X-3′ T2의 "신규 체결 정지" 배선은 개정 05 §3.2 ⓑ CP-2** |
| **BANA 입금 레일** | **개정 03 §3** + A-7 §7 (해석 확정: 개정 04 §4.1 N-6). **레일 부재가 만드는 체결 불가는 개정 05 §1.4.** **Q-M5 여전히 미회신 — 관리자 크레딧(§4A)은 입금 레일의 대체가 아니다(AC-1)** |
| **BANA 출금 실행·승인 큐** | **개정 03 §4** + A-5. 수수료 필드 의미는 **개정 04 §4.1 N-4/N-5**. **관리자 조정 크레딧 잔고의 큐 표식은 개정 05 §4A.6 AC-10** |
| **로컬 원장 크레딧 표면(관리자 조정)** | **개정 05 §4A 전체 (AC-1~AC-14)** — A-3 §4.2의 게이트 제외 판정을 승계하되, 용도 한정·3중 한도·타이핑 확인·분리 가시성을 이 절이 추가한다 |
| **전환/마이그레이션 전략** | **개정 03 §5 — 개정 01 §5는 폐기됨(프로덕션 0건)** |
| **컷오버 실행 순서·영향 범위·담당 배정** | **개정 05 §5 · §7** (개정 04 §6.2 순서 2~8을 대체). **CUT-2b(관리자 크레딧)는 최종 확정 시 신설** |
| **초기 V2 상품 구성(기간·이율·정원·상태)** | **개정 05 §4 (CP-5′ / CP-6 / CP-7′ / CP-10)** — Q-M8/Q-M9 회신으로 확정. **이율은 "1차 개설 한정 잠정 승계값"이며 미해결 30** |
| **부채 총량 상한** | **개정 05 §4.6 CP-10** — `maxInterestLiabilityCapBana`(`PlatformSetting`). `null` = 개설 거부(fail-closed 반전 규약) |
| **게이트** | **개정 03 §6 (G-0⁗ / G-1‴) + 개정 01 §9 G-2′/G-3′.** 생성·정산에 PoR 게이트가 없다는 코드 확인은 **개정 05 §3.1**. **관리자 크레딧이 게이트를 우회하되 L1에는 계상된다는 확인은 개정 05 N-50 · §4A.5** |
| **마이그레이션 실행 조건** | **개정 04 §5** — V2-CORE 마이그레이션은 실행 완료(`20260810075816_...`). 이후 단계는 개정 05 §5. **추가 마이그레이션 1건 필요: 개정 05 T-15** |
| **차단 항목 최종 목록** | **개정 05 §8** — **Q-M7/Q-M8/Q-M9 회신 완료(2026-08-11)**, **Q-M3 / Q-M5 / Q-M6 여전히 미회신**, Q-M10/Q-M11(경량) 신설 |

## 설계 산출물 (V2-CORE, rev03 §7.2 A-2~A-11)

| ID | 문서 | 담당 | 상태 |
|----|------|------|------|
| A-2 | `staking-yield-system-v2-design-a2-balance-authority.md` | `prisma-db-expert` | 구현·배포 완료 |
| A-3 | `staking-yield-system-v2-design-a3-local-ledger.md` | `prisma-db-expert` | 구현·배포 완료 (개정 04 §1.5 애드덤 반영). **§4.2의 `ADMIN_ADJUSTMENT_CREDIT` 게이트 제외 판정은 유효하며, 그 위에 얹는 운영 통제가 개정 05 §4A** |
| A-4 | `staking-yield-system-v2-design-a4-staking-schema.md` | `prisma-db-expert` | **스키마만 완료. §9의 인터페이스 계약 4종 미구현** → 개정 05 T-3 |
| A-5 | `staking-yield-system-v2-design-a5-withdrawal-queue.md` | `web-shared-expert` | 구현·배포 완료. **§1.6 abandon-onchain은 여전히 미승인** — 그 마찰 확인 수준(타이핑 확인)은 개정 05 AC-3이 승계 |
| A-6 | `staking-yield-system-v2-design-a6-deepcore-adapter.md` | `game-planner` | 어댑터 V2 컷오버 완료 (`deepCoreProgress.ts`) |
| A-7 | `staking-yield-system-v2-design-a7-screen-flow-frd.md` | `product-planner` | 완료. **단 체결 흐름(S-STAKE)은 범위 밖** → 개정 05 §7.1 |
| A-8 | `staking-yield-system-v2-design-a8-admin-dashboard-frd.md` | `product-planner` | 완료. **데이터 계약 1건 추가**(`adminAdjustmentNetCreditTotal`) → 개정 05 AC-9 |
| A-9 | `docs/research/2026-08-10-bsc-deposit-detection-and-band-legal-issues.md` | `researcher` | 완료 (확정 깊이 숫자 미확정 유지) |
| A-10 | (`wallet-security-expert` 리뷰 — A-3/A-5에 반영됨) | `wallet-security-expert` | 완료. **컷오버 리뷰는 개정 05 T-4, 관리자 크레딧 표면 리뷰는 T-19(배포 게이트)로 재소집** |
| A-11 | (미착수 — 시각 설계·디자인 토큰) | `ui-ux-designer` | 착수 가능 (+ 개정 05 T-14의 경고 배너 주의색 토큰) |

## 인접 문서

- `deep-core-00-overview-and-gate.md` — Phase 0 승인(§6.7) 유효. §6.2 게이트는 개정 01 §9 → 개정 03 §6으로 재정의됨
- `deep-core-04-yield-linkage-GATED.md` — 개정 01 §3.5가 흡수·부분 폐기
- `staking-debt-b5-query-result.md` — 프로덕션 실측(포지션 0건). 개정 03 N-27의 근거. **컷오버 당일 재조회는 개정 05 §5.0 CS-2′**(관리자 계정 수·`LocalLedgerEntry` 사유별 기준선 추가)
- `admin-staking-debt-visibility-frd.md` — V2-CORE로 흡수(개정 03 §5.5), 데이터 계약은 A-8이 대체
- `staking-page-v2-screen-flow-frd.md` (PS-A) — 시트 기반 스테이킹 화면 구조. 데이터 소스만 V2로 교체(개정 05 §5.2 ④)
