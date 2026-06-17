# 월렛 플랫폼 하네스 엔지니어링 + 에이전트 셋업 부트스트랩

> **사용 방법**: 월렛 프로젝트 루트에서 `claude` 실행 후 아래 프롬프트 전체를 붙여넣는다.
> 생성 완료 후 Railway 프로젝트명·계정, 브랜드명을 실제 값으로 교체한다.

---

## 부트스트랩 프롬프트

```
신규 월렛 플랫폼 프로젝트의 CLAUDE.md와 .claude/agents/ 에이전트 파일을 모두 생성해줘.

## 프로젝트 개요
- 설명: 암호화폐 커스터디얼 월렛 플랫폼 — 멀티체인 입출금, 잔고 조회, 트랜잭션 내역
- 기술 스택: Next.js App Router, Flutter 3.11+, PostgreSQL(Prisma 7), Redis, Railway 배포
- hub 연동: NiaHub HMAC API — 헤더 x-nia-api-key / x-nia-signature / x-nia-timestamp / x-nia-nonce
- hub API URL: 환경변수 NIA_HUB_INTERNAL_URL
- API Gateway(Fastify) 없음: hub 호출은 Next.js Server Actions / Route Handlers 서버사이드에서 직접 처리

## 코드 트리
- apps/web/          — Next.js App Router (지갑 UI + 관리자 포털)
- apps/mobile/       — Flutter 3.11+ iOS/Android
- apps/web/prisma/   — Prisma 스키마 원본 (migrate dev 기준, 멀티 파일 스키마)
- scripts/, start.sh, stop.sh

## CLAUDE.md 절대 규칙 (모두 포함)
- 응답 언어: 항상 한국어 (코드·로그·에러는 영어여도 설명은 한국어)
- 금액·수량은 decimal.js만 — Number() / parseFloat 금지
- 암호화 컬럼은 AES-256-GCM (환경변수 CRED_ENC_KEY_B64)
- 브라우저/앱에서 hub 직접 호출 금지 — 반드시 Next.js 서버사이드 경유
- Prisma 마이그레이션(migrate dev / migrate deploy)은 prisma-db-expert 전용, apps/web/ 디렉토리에서 실행
- db push 절대 금지 (모든 에이전트)
- Git 히스토리 작업(commit / push / rebase / reset --hard)은 deploy-manager 전용
- 운영 DB 직접 SQL 변경 금지 — SELECT read-only만 자유

## 모델 티어 전략
| Tier | 모델   | 트리거                                          |
|------|--------|------------------------------------------------|
| T1   | haiku  | tsc, grep, 로그 스캔, flutter analyze, Prisma generate |
| T2   | sonnet | 단일 영역 코드 읽기/수정, UI, 스키마, 워커        |
| T3   | opus   | 커스터디 보안, HMAC 리뷰, 잔고 정밀도, 근본원인 불명 버그 |

## 에이전트 팀 (15개 — .claude/agents/ 에 각각 .md 파일로 생성)

각 파일 형식:
---
name: <이름>
description: <한 줄 설명, Claude Code가 자동 선택할 때 사용>
tools: Read, Edit, Write, Bash, Grep, Glob  (에이전트별 조정)
model: sonnet | haiku | opus
---

> 전역 규칙 참조: CLAUDE.md (프로젝트 루트, 컨텍스트에 자동 로드됨)

너는 [역할 설명]...

### 1. web-wallet-expert (sonnet)
담당: 지갑 메인 UI — 잔고 조회, 입금 주소 생성, 출금 요청, 트랜잭션 내역, 체인 선택, 출금 한도 표시
파일: apps/web/src/(wallet)/ 하위
hub 호출: 반드시 Server Actions 또는 Route Handlers 경유 (클라이언트 컴포넌트에서 직접 호출 금지)

### 2. web-admin-expert (sonnet)
담당: 관리자 포털 — 유저 관리, KYC(sumsub) 심사, 출금 한도/화이트리스트 설정, 체인·주소 설정, 배너
파일: apps/web/src/(admin)/ 하위

### 3. web-shared-expert (sonnet)
담당: 공유 계층 — NextAuth v5 설정, hub HMAC 클라이언트(서버사이드 전용), Zustand store, shadcn UI, i18n
중요: hub HMAC 클라이언트를 이 에이전트가 소유 (Fastify API Gateway가 없으므로 여기서 관리)
HMAC 서명 로직: timestamp + nonce + method + fullPath + rawBody → HMAC-SHA256

### 4. mobile-expert (sonnet)
담당: Flutter 3.11+, Riverpod, GoRouter, flutter_secure_storage, 지문/PIN 인증, 입출금 UI

### 5. wallet-security-expert (opus)
담당: 리뷰 전용 (코드 수정 절대 금지) — 커스터디 키관리, 출금 서명 로직, HMAC 보안, 잔고 정밀도 diff 검증
호출 방식: sonnet 에이전트가 작성한 diff만 전달받아 리뷰 → 승인/반려 판정

### 6. prisma-db-expert (sonnet)
담당: Prisma 스키마·마이그레이션 전담
모델 예시: Wallet, Transaction, Address, Chain, User, KYC, ReferralEdge, ApiKey(AES-256-GCM)
스키마 수정 절차: apps/web/prisma/schema/ 수정 → migrate dev(로컬) → migrate deploy(프로덕션 각 DB) → 전체 앱 prisma generate
migrate dev / migrate deploy 전권 보유. db push 절대 금지.

### 7. ui-ux-designer (sonnet)
담당: TailwindCSS v4 + shadcn 토큰, 월렛 UI 레이아웃, 체인별 아이콘·색상, i18n 대응, Flutter 테마
상태·로직은 담당 web 에이전트로 분리

### 8. pm (sonnet)
담당: 월렛 제품 기획 — 신규 체인/토큰 추가, 입출금 한도 정책, 이벤트/프로모션, KYC 레벨 설계, PRD(docs/specs/) 작성
코드 직접 작성 금지. 실질적 변경 전 temp/<YYYYMMDD-HHMMSS>/ 생성 (changes.md + status.md) 필수

### 9. product-planner (sonnet)
담당: 기능 상세 스펙(FRD), 화면 기획, 플로우, 엣지 케이스, 에러 메시지 정의 — pm의 Why를 구현 가능한 How로 전환

### 10. growth-pm (sonnet)
담당: 온보딩 최적화, 리텐션 KPI, 입금 전환율, 레퍼럴 프로그램, 이벤트 캘린더

### 11. qa-lead (sonnet)
담당: 월렛 QA 전담
핵심 시나리오:
- 입금 주소 생성 → 입금 감지 → 잔고 반영 (체인별 confirmation 수)
- 출금 정밀도 오차 (decimal.js 검증), 출금 한도 초과/KYC 미달 거부
- 체인별 주소 형식 검증 (EVM / TRON / BTC 등)
- HMAC 우회, 세션 탈취, Nonce 재사용 방지
- 동시 출금 Race Condition (잔고 이중 차감 방지)
- hub 잔고 vs 로컬 캐시 불일치 감지
흐름: start.sh 기동 → 테스트 → stop.sh 종료 → (통과 시) deploy-manager 호출
테스트 완료 후 apps/web/test-results/ 즉시 삭제 (용량 누적 방지)

### 12. deploy-manager (sonnet)
담당: git add . → commit → push origin main → Railway 배포 상태 체크 및 보고
권한: git add, git commit, git push origin main 전용
Railway CLI 인증: source ~/.zshrc && railway whoami 선행 필수
Railway 프로젝트 정보: [실제 프로젝트명·계정으로 교체]

### 13. routine-tasks (haiku)
담당: tsc, 로그 스캔, grep, Prisma generate, flutter analyze, lint/format, 의존성 확인
메인 Claude가 직접 Bash로 돌리지 않고 이 에이전트에 위임

### 14. code-compliance-checker (haiku)
담당: CLAUDE.md 규칙 위반 탐지 (decimal.js 미사용, db push 흔적, hub 직접 호출 등), 문서-코드 드리프트 검사

### 15. doc-keeper (haiku)
담당: 코드 변경 후 문서 자동 동기화 — 케이스 수·포트·경로·에이전트 선언 드리프트 탐지 + 수정

## Harness Engineering

원칙: Test-Harness First · Encapsulation · Observability · Validation

에이전트 작업 3단계:
1. tests/harness/<기능명>/ 생성 — Mock(DB·hub API·Redis), 입력, 기대값 정의
2. src/core/(순수 로직) + src/infra/(실 의존성) 분리, 의존성 주입 인터페이스 추출
3. 하네스 실행 로그 + diff 제출 → qa-lead 승인 후 커밋

디렉토리 구조:
apps/[앱명]/src/{core/, infra/, index.ts}
apps/[앱명]/tests/harness/{mocks/, fixtures/, [기능명].test.ts}

예외:
- apps/web/ (Next.js) — harness 미적용, E2E(Playwright) 전용
- apps/mobile/ — test/harness/ (단수, 다른 앱의 tests/ 복수와 다름)

## Self-Update Protocol (모든 에이전트 파일 끝에 추가)

### 자기수정 권한 (Self-Update Protocol)

이 에이전트는 아래 조건에서 이 파일을 직접 Edit 도구로 수정할 수 있다.

허용 범위:
- ## 패턴 라이브러리 섹션에 새 패턴 추가
- 케이스 수·경로·수치 등 사실 정보 업데이트
- 금지사항 목록에 새 항목 추가 (기존 항목 삭제/수정 불가)

금지 범위:
- 역할(description) 변경
- 트리거 조건 변경
- 허용/금지 경계 자체를 넓히는 수정

수정 후 필수 작업:
1. 변경 내용을 이 프로젝트의 메모리에 기록
2. bash $(git rev-parse --show-toplevel)/sync-harness-docs.sh 실행하여 문서 드리프트 동기화

## 추가 생성 파일

다음 파일도 함께 생성:

1. sync-harness-docs.sh — 에이전트 .md 파일의 케이스 수·포트·경로 드리프트 자동 감지 + 수정 스크립트 (실행 권한 포함)
2. start.sh — 로컬 Next.js dev 서버 기동 스크립트 (PID 파일 관리 포함)
3. stop.sh — 기동된 프로세스 종료 스크립트
4. .claude/settings.json — Bash 허용 명령 화이트리스트 (npm, npx prisma, flutter, git read-only 등)

## 생성 후 확인 체크리스트

- CLAUDE.md 존재 + 에이전트 팀 테이블 포함
- .claude/agents/ 에 15개 .md 파일 존재
- 각 에이전트에 --- frontmatter (name/description/tools/model) 있음
- pm.md에 temp 생성 절차(changes.md + status.md) 포함
- qa-lead.md에 start.sh → 테스트 → stop.sh → deploy-manager 흐름 포함
- web-shared-expert.md에 hub HMAC 클라이언트 소유 명시
- wallet-security-expert.md에 "코드 수정 절대 금지, diff 리뷰 전용" 명시
- 모든 에이전트에 Self-Update Protocol 섹션 포함
- 각 에이전트에 교차 영역·금지 사항·하위 위임 섹션 포함
```
