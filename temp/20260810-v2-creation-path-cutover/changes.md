# 변경 사항 — V2 스테이킹 생성 경로 컷오버 (rev05)

작성: `pm` · 2026-08-10

## 왜 (Why)

V2-CORE(권위 계층 A-2 · 로컬 원장 A-3 · v2 스키마 A-4 · 출금 온체인 검증 A-5)는 구현·배포됐다.
그러나 **스테이킹 포지션을 만드는 경로만 v1에 남아 있다.** 그 결과 오늘 프로덕션은
"읽기는 V2, 쓰기는 v1"인 분열 상태다:

- `deepCoreProgress.ts`(게임 상태)와 `localLedger.ts`(PoR-1″ 좌변·INV-P5)는 **V2 테이블만** 읽는다.
- `/api/staking/stake`·`/api/staking/products`·`/api/admin/staking/*`·`referralTree.ts`는 **v1 테이블만** 쓰고 읽는다.

즉 지금 v1 경로로 포지션이 하나라도 생기면 **준비금 불변식에도, 게임에도 보이지 않는 부채**가 된다.
동시에 사용자는 어느 쪽으로도 스테이킹할 수 없다(잔고 권위 불일치 + 로컬 BANA 잔고 0).

## 무엇 (What)

산출물 1건 (문서만 — 코드 변경 없음):

- `docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md` (신규)
  - 판정 P-21~P-28, 실측 N-32~N-45
  - 초기 V2 상품 구성 결정 (요청 1)
  - 컷오버 단계 CUT-0~CUT-6 + 영향 범위 전수 (요청 2)
  - 레퍼럴 등 연동 기능 영향 (요청 3)
  - 담당자 배정 (요청 4)
  - 마스터 확인 질문 Q-M7~Q-M9
- `docs/specs/staking-yield-system-v2-INDEX.md` (개정 05 행 추가)

## 코드 변경

**없다.** 이 문서는 계획이며, 구현은 §7의 담당자에게 인계된다.
