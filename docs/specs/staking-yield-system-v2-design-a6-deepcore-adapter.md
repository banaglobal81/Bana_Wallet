# 설계 문서 A-6 — DEEP CORE 어댑터 계획 (DC-1~DC-4)

> 작성: `game-planner` · 2026-08-10
> **근거 문서(읽은 순서):** `staking-yield-system-v2-INDEX.md` → `staking-yield-system-v2-prd.md`(개정 01) →
> `...-rev02-balance-authority.md` → `...-rev03-rebuild-and-exclusivity.md`(**최신·최우선**, 특히
> §5.3 DC-1~DC-4 · §5.4 CS-3/삭제 범위 · §7.2 A-6) → `staking-yield-system-v2-design-a4-staking-schema.md`
> (**§8 DC-1 보존 13행 매핑표 — 이 문서의 직접 입력**) → `staking-yield-system-v2-design-a5-withdrawal-queue.md`(형식 정합) →
> `deep-core-02-progression-frd.md`(P-1~P-6 · §2 XP 소스 · §5.2 오도미터 · §7 AC) ·
> `deep-core-05-screen-flow-frd.md`(§4.1/§4.2 상태 기계 · G-7 · AC-S1~S8) · `deep-core-00-overview-and-gate.md` §6.3(M-1)
> **코드 실측:** `web/src/lib/deepCoreProgress.ts`(전체 75행), `deepCoreProgressMath.ts`(전체 236행),
> `deepCoreProgressMath.test.ts`(전체 199행 · `it` 19개), `stakingMath.ts`, `stakingSettle.ts`,
> `platformSettings.ts`, `app/api/staking/positions/route.ts`, `utils/stakingApi.ts:130-199`,
> `components/staking/deep-core/**`(status 문자열 비교 0건 확인), `prisma/schema.prisma:338-351`
>
> **지위: 계약 문서다. 구현 지시서가 아니고 착수 승인도 아니다.** 이 문서는 A-4가 §8.3에서
> `game-planner`에게 명시적으로 위임한 선택(필드명 재포장 vs 타입 개명)을 확정하고, 어댑터가
> 만족해야 할 인수 기준과 컷오버 순서를 고정한다. **코드는 `game-developer`가 쓴다.**
> 이 문서는 `web/src/`를 한 줄도 수정하지 않았다.

---

## 0. 컴플라이언스 확인 — 이 문서는 `pm` 머니 게이트를 건드리지 않는다

DEEP CORE Phase 0은 **결과가 전부 코스메틱**이며(00 §6.7 승인 유효), 수익 연동은
`deep-core-04-yield-linkage-GATED.md`로 분리되어 **여전히 게이트 상태**다. 이 문서가 다루는
어댑터는 **읽기 전용이고 게임 전용 쓰기가 0건**이라는 오늘의 성질을 그대로 보존하는 작업이다.
따라서 "게임 결과가 BANA 토큰/포인트/랭크/발행을 크레딧하는가"라는 물음에 **아니오**이며,
`pm` 사인오프 대상 항목이 이 문서에 없다.

**단, 신스키마는 오늘 구스키마에 없던 유혹적인 필드를 노출한다.** 아래 §2.4의 **금지 읽기
목록(AD-9)** 이 이 문서에서 가장 중요한 방어선이다 — 어댑터가 무엇을 읽을지가 아니라
**무엇을 절대 읽지 않을지**를 고정한다.

---

## 1. 이 문서의 범위

**만드는 것**
- A-4 §8.1의 13행 매핑표를 어댑터 **코드 델타**로 번역한 표(§2.1) — 어느 줄이 어떻게 바뀌는가
- A-4가 위임한 미결 선택의 확정 — **AD-1**(필드명 재포장 vs 타입 개명)
- 13행 표에 **없는 4개의 숨은 의존**과 그에 대한 요구(**AD-4~AD-8**) — 이것이 이 문서의 실제 값어치다
- 인수 기준(§3) — 기존 단위 테스트 19개가 그린이어야 한다는 계약 + `game-developer`가 **추가로**
  써야 할 회귀 테스트 6종
- 컷오버 순서(§4) — CO-0~CO-5 단계별 "게임이 무엇을 읽고 무엇을 렌더하는가"와 롤백 레버

**만들지 않는 것 (다음 담당자에게 명시적으로 넘김)**
- 어댑터 코드 자체 — `game-developer`
- 신규 포지션/정산 API 라우트와 화면 — `product-planner`(A-7) → `web-shared-expert`
- v2 정산 워커·`maturePositionV2` 구현 — `web-shared-expert` / `worker/`
- `GameProfile`/`GameXpEntry` 영속화(02 §6 · `deep-core-p0-schema-handoff.md`) — **A-6과 무관하며
  이 컷오버로 앞당겨지지 않는다.** 오늘처럼 전량 파생을 유지한다
- V2-BAND(밴드 보너스·MP 연동) 관련 일체 — 게이트 유지

---

## 2. 요청 1 — 13행 매핑표를 어댑터 코드 델타로

### 2.1 파일별 변경 — `deepCoreProgress.ts`가 유일한 변경 대상

실측: 게임이 DB를 만지는 지점은 `deepCoreProgress.ts`의 **쿼리 2개뿐**이다(`:49` 포지션,
`:67` 정산행). 그 외 게임 파일 어디에도 `prisma` import가 없다.

| 위치(현행) | 오늘 | 컷오버 후 | 근거 |
|---|---|---|---|
| `:26` | `import { stakingDayMs } from '@/lib/stakingMath'` | **v2 정산 시간 모듈에서 import** | **AD-4** — `stakingMath.ts`는 rev03 §5.4 삭제 대상. 방치하면 빌드 파손 |
| `:49` | `prisma.stakePosition.findMany` | `prisma.stakePositionV2.findMany` → (CO-5 후) 다시 `prisma.stakePosition` | A-4 §3.1(접미사는 임시) · **AD-8** |
| `:52-56` select | `id, status, startAt, maturityAt, termDays, daysPaid, coin, principal, renewedFromPositionId, product:{minAmount}` | **문자열 완전 동일** | 13행 표 #1~#10 — 열 이름 무변경 |
| `:50` orderBy | `startAt: 'asc'` | 동일 | — |
| `:58` | `getPlatformSettings()` 반환 행을 **그대로** 넘김(구조적 타이핑) | **명시 매핑 객체로 좁혀서** 넘김 | **AD-5** |
| `:67` | `prisma.stakingPayout.findMany` | `prisma.stakeYieldLedgerEntry.findMany` | 13행 표 #11~#13 |
| `:69` orderBy | `paidAt: 'desc'` | `settledAt: 'desc'` | #13 이름 변경 |
| `:70` take | `20_000` | **동일 유지** | 행 카디널리티 불변(포지션×정산일 1행, `@@unique([positionId,dayIndex])` 승계) |
| `:71` select | `{ positionId, paidAt }` | `{ positionId, settledAt }` | #11~#13 |
| `:74` | `deriveDeepCoreState(positions, payouts, ...)` | `payouts`를 **`{ positionId, paidAt: r.settledAt }`로 재포장해서** 전달 | **AD-1** |

**13행 중 실제 코드가 바뀌는 것은 #13(`paidAt`→`settledAt`) 하나뿐이고, #2(`status` 값 집합
축소)는 코드 변화 0이다.** 나머지 11개는 Prisma 접근자 이름만 바뀐다. 어댑터 델타의 실제 위험은
매핑표 안이 아니라 **매핑표 밖(§2.3)** 에 있다.

### 2.2 확정 — AD-1 / AD-2 / AD-3

> **AD-1 (확정). 2단계에서는 어댑터가 `settledAt → paidAt`으로 재포장한다.
> `deepCoreProgressMath.ts`와 그 테스트 파일은 바이트 단위로 동일하게 유지한다.**
> 이름 위생(`paidAt`은 A-4 원칙 3이 금지하는 "지급 함의" 이름이다)은 **별도 3단계 커밋**으로
> 미룬다 — 그때 `DeepCorePayoutRow.paidAt → settledAt` 개명 + 테스트 헬퍼 `payout()` 1줄 수정을
> 함께 하고, **모든 `expect()` 기대값은 한 글자도 바뀌지 않아야 한다**를 그 커밋의 인수 기준으로 삼는다.
>
> **왜 이 순서인가.** DC-2의 인수 기준은 "기존 단위 테스트가 통과할 것"이다. 개명을 컷오버와
> 같은 커밋에 넣으면 테스트 파일 자체를 수정해야 하고, 그 순간 "테스트가 빨간 이유가 스키마
> 전환 때문인지 개명 때문인지"가 모호해진다. **컷오버 커밋에서 테스트 파일이 diff에 등장하면
> 그 자체가 계약 위반 신호**여야 한다 — 이것이 이 결정의 전부다. `settings` 플래그(AD-5)도
> 같은 이유로 같은 처리를 받는다.

> **AD-2 (확정). `status` 값 집합 축소(`PAID` 제거)에 대해 어댑터는 아무것도 하지 않는다.**
> A-4 §8.2가 실측으로 증명했고(순수 모듈의 3개 검사 지점 전부 `=== 'ACTIVE'` / `!== 'ACTIVE'`),
> **클라이언트 쪽도 재확인했다**: `components/staking/deep-core/**` 전수 grep 결과 `'MATURED'`/
> `'ACTIVE'` 문자열 비교 0건이며, `DeepCoreWell.status`는 `utils/stakingApi.ts:152`에서 `string`으로
> 실어 나르기만 한다. **서버·클라이언트 어느 쪽도 구체 상태 문자열에 의존하지 않는다.**

> **AD-3 (확정). `daysPaid`는 컬럼을 그대로 읽는다. 정산행 `COUNT`로 유도하지 않는다.**
> DC-1이 "또는 정산행 개수로 유도 가능할 것"을 허용했지만 채택하지 않는다. 근거 셋:
> ① A-4 SETTLE-1이 정산행 insert와 `daysPaid` 갱신을 **단일 트랜잭션**으로 묶으므로 두 값은
> 구조적으로 어긋날 수 없다 — 컬럼은 "보증된 캐시"다(A-4 원칙 2/6). ② 유도로 바꾸면 포지션마다
> 집계 쿼리가 추가되어 매 페이지 로드 비용이 변한다(게임은 `load()`에 얹혀 가는 부수 계산이다 — 05 G-7).
> ③ 게임이 파생의 **두 번째 독립 계산자**가 되면, 어긋났을 때 어느 쪽이 진실인지 게임이 판정하는
> 위치에 서게 된다. **어긋남은 정산 버그이지 게임이 덮을 일이 아니다** — `Math.max(daysPaid, count)`
> 류의 방어 코드를 넣지 않는다.

### 2.3 매핑표에 없는 의존 — 여기가 실제 파손 지점이다

A-4 §8.1의 13행은 **Prisma 필드 의존**만 센다. 게임이 실제로 의존하는 것은 그보다 넷 더 많다.

> **AD-4 (필수). "스테이킹 1일 = 몇 ms"의 단일 출처가 컷오버 후에도 존재해야 하고, 게임은 그것을
> import 해야 한다. 게임이 자기 사본을 만들면 안 된다.**
>
> 실측: `deepCoreProgress.ts:26`이 `stakingMath.ts`의 `stakingDayMs()`를 import하고, 그 값이
> `deriveDeepCoreState`의 `dayMs` 인자로 들어가 **M-1 가드의 dayKey 전부**(`charterOpenDayKeys`,
> `byDay`)를 만든다. `stakingMath.ts`는 rev03 §5.4 **삭제 대상**이다.
> - 파손 형태: 삭제 즉시 **빌드 실패**(눈에 띄는 실패 — 그나마 다행).
> - 진짜 위험은 그 다음이다: 급하게 게임 모듈 안에 `const DAY_MS = 86_400_000`을 복사하는 것.
>   그러면 데모/테스트 빌드(`STAKING_DAY_MS` 압축)에서 **게임의 dayKey와 정산의 dayKey가 갈라지고**,
>   M-1의 "하루 1회" 가드와 `xp.lift`의 "하루 3포지션" 상한이 조용히 무력화된다. 이것은 파밍
>   가드 우회이며 조용히 통과한다.
> - 요구: v2 정산 모듈 소유자(`web-shared-expert`)가 **동일 계약**의 접근자를 export 한다 —
>   `NEXT_PUBLIC_STAKING_DAY_MS` → `STAKING_DAY_MS` → 유효하지 않으면 `86_400_000`, 서버·클라이언트
>   양쪽에서 읽힘. 게임은 그것을 import 한다. **`docs/patterns/game-planner.md`가 이미 기록한
>   "하드코딩 24시간 금지" 항목의 직접 적용이다.**

> **AD-5 (필수). S-2(보고 지연)를 판정하는 플래그는 "게임이 세는 행을 쓰는 워커"의 플래그여야 한다
> — 컷오버 후에는 `stakingV2WorkerEnabled`다.**
>
> 실측: `deepCoreProgressMath.ts:216`이 `settings.stakingWorkerEnabled === false`일 때
> `S2_REPORTING_PAUSED`를 렌더한다. A-4 §3.6은 `stakingV2WorkerEnabled`를 **의도적으로 분리**해
> 신설했다(기본 `false`). 어댑터가 구 플래그를 계속 읽으면, v2 워커가 꺼져 있는데도 게임이
> `S1_RUNNING`(정상 가동)을 렌더한다 — **05 §4.2가 명시적으로 금지한 "산출이 멈춘 것을 숨기는"
> 상태 거짓말**이다.
> - 구현 형태(AD-1과 동일한 이유로 순수 모듈은 건드리지 않는다):
>   `deriveDeepCoreState(positions, payouts, { maintenanceMode: s.maintenanceMode, stakingWorkerEnabled: s.stakingV2WorkerEnabled }, ...)`
>   — 순수 모듈의 필드 이름 `stakingWorkerEnabled`는 **게임 도메인 용어**("내 행을 쓰는 워커가
>   켜져 있는가")로 남고, 3단계 위생 커밋에서 권위 중립적 이름으로 개명 제안한다.
> - **두 플래그를 `&&`/`||`로 합치지 않는다.** 두 권위를 합산하지 않는다는 A-2 X-2와 같은 결이다 —
>   합치는 순간 어느 워커가 멈춰서 S-2가 떴는지 화면이 답할 수 없게 된다.
> - **부수 효과가 오히려 바람직하다:** 컷오버 직후 v2 워커는 꺼져 있어야 하므로(rev03 §8.3 금지 ②),
>   v2 포지션을 처음 체결한 사용자는 `S2_REPORTING_PAUSED`를 본다. 그것이 **사실 그대로**다.
>   포지션 0건 사용자는 `deepCoreProgressMath.ts:145`의 `S0_NOT_SHOWN` 단락(短絡)이 플래그 판정보다
>   **먼저** 걸리므로, 기본값 `false`가 전원 S-2를 유발하는 일은 구조적으로 없다.

> **AD-6 (필수). `settledAt`은 "정산 실행 시각(벽시계)"이어야 한다. 일차에서 역산해
> `startAt + d × dayMs`로 채우면 안 된다.**
>
> 실측: 현행 `stakingSettle.ts:72`의 `createMany`는 `paidAt`을 명시하지 않고 스키마 기본값
> `@default(now())`(`schema.prisma:346`)에 맡긴다. 즉 **워커가 5일 밀렸다가 따라잡으면 5행이
> 전부 같은 타임스탬프**를 갖는다. A-4 §5.2 의사코드의 `settledAt: now`도 동일하다 — **의도치
> 않게 이미 일치한다.**
> - 게임이 왜 신경 쓰는가: `operatingDays`(02 §5.2 오도미터)는 **서로 다른 dayKey의 개수**이고,
>   `xp.lift`는 dayKey별 `min(포지션 수, 3) × 10`이다. 역산 방식으로 바꾸면 밀린 5일이 5개 dayKey로
>   펼쳐져 **오도미터와 XP가 소급 증가**한다 — "워커가 멈췄다 켜지면 XP가 점프한다"는, 아무도
>   설계하지 않은 보상이 생긴다.
> - 반대 방향의 알려진 트레이드오프도 명시한다: 현행(붕괴) 방식은 밀린 기간의 오도미터를
>   **과소 계상**한다. **이것은 오늘 라이브 동작이며 A-6에서 바꾸지 않는다** — 바꾸면 DC-2의
>   "동일 결과" 인수 기준과 정면 충돌한다. 더 공정한 정의를 원한다면 그것은 어댑터 변경이 아니라
>   `deep-core-02` 개정이다(§6 열린 질문 Q-A6-2).

> **AD-7 (필수). 컷오버 후에도 "읽기 전에 만기 전이를 정리하는" 경로가 남아야 한다. 단, 그 호출은
> 게임이 아니라 라우트가 한다.**
>
> 실측: `api/staking/positions/route.ts:33`이 `getDeepCoreState`보다 **먼저**
> `settleMaturedPositions(dbUserId)`를 호출한다. 이 지연(lazy) 경로가 `ACTIVE → MATURED`를 뒤집는다.
> 게임에서 이 전이에 의존하는 것: `xp.charter_complete`/`sv.charter_complete`(`status !== 'ACTIVE'`),
> `S4_IDLE_RIG`(`activeWellCount === 0`), `wells[].active`/`recentlyMatured`.
> - 파손 형태: v2 라우트가 이 선행 호출을 빠뜨리고 v2 워커도 꺼져 있으면, 만기가 지나고 전액
>   정산된 포지션이 **영구히 `ACTIVE`로 남는다** → 챕터 완료 XP가 영원히 안 들어오고 리그가
>   영원히 "가동 중"으로 보인다. 조용히 틀린다.
> - 요구: A-7의 대체 읽기 엔드포인트가 A-4 §9-2 `maturePositionV2` 상당을 **`getDeepCoreState`
>   호출 이전에** 실행한다. **게임 어댑터가 직접 호출하지 않는다** — 게임 전용 쓰기 0건은
>   DEEP CORE의 근본 계약이다(02 AC-P10, rev03 §5.3 원문 "게임 전용 쓰기는 0건").

> **AD-8 (필수). `game` 블록의 전송 표면이 재배치된다 — 게임은 자기 요청을 만들지 않는다.**
>
> 실측: `game` 블록을 실어 나르는 유일한 경로 `GET /api/staking/positions`가 rev03 §5.4
> **삭제 대상**이고, 클라이언트도 `utils/stakingApi.ts:198`에서 그 경로를 **하드코딩**한다.
> - 요구: A-7이 정의할 대체 포지션 읽기 엔드포인트가 ① 같은 `game` 블록을 같은 자리에 싣고,
>   ② 현행 라우트 `:43-48`의 **best-effort 계약**(게임 파생 실패는 절대 실전 포지션 읽기를 깨뜨리지
>   않는다 · 실패 시 `game: null` · 클라이언트는 `GAME_LOAD_FAILED`로 폴백)을 그대로 승계한다.
> - **A-7이 읽기를 여러 엔드포인트로 쪼개더라도, `game`은 화면이 `load()`에서 이미 호출하는
>   그 하나에 얹힌다. 게임 전용 라운드트립을 신설하지 않는다**(05 G-7 · AC-S2 번들 조건과 동일 취지).
> - 경계: 엔드포인트 이름·응답 스키마는 `product-planner`(A-7) 소관이다. 이 문서는 **게임 블록이
>   만족해야 할 조건**만 건다.

### 2.4 AD-9 — 금지 읽기 목록 (신스키마가 새로 만드는 유혹)

> **AD-9 (필수). 어댑터의 정산행 select는 `{ positionId, settledAt }` 두 열로 고정한다.
> 아래 필드를 게임 경로에서 읽는 코드가 존재해서는 안 된다.**
>
> | 읽으면 안 되는 것 | 어기면 무너지는 것 |
> |---|---|
> | `StakeYieldLedgerEntry.amount` / `baseAmount` | `amount ∝ principal`이다. 읽는 순간 진행도가 원금 비례가 된다 — **DC-3 / 개정 01 A7 / 02 P-2 / AC-P8 동시 위반** |
> | `bonusAmount` / `mpSnapshot` / `bonusPctSnapshot` | V2-BAND 전용 열. 게임이 읽으면 **게이트를 우회해 밴드 연동을 착수한 것**이 된다(04 GATED) |
> | `StakePositionV2.ledgeredYield` / `lastSettledAt` / `fullySettledAt` | 위와 같은 이유(금액) + 파생 중복. 게임이 필요한 시각 정보는 `settledAt`뿐이다 |
> | `UserCoinYieldSummary.*` / `LocalLedgerEntry.*` / `UserCoinBalance.*` | 클레임·잔고 표면. **C-7(게임화 금지) 직접 위반.** 게임은 클레임의 존재조차 알 필요가 없다 |
> | `PlatformSetting.stakingClaimEnabled` | 위와 동일. 게임 상태 기계에 클레임 킬 스위치가 들어가면 안 된다 |
>
> 근거: 오늘의 select가 이미 `{ positionId, paidAt }`뿐이어서 **금액을 읽을 방법이 없었다**.
> 신스키마는 같은 테이블에 금액 열을 나란히 두므로, "이왕 조인하는 김에" 한 줄 추가하는 것이
> 물리적으로 쉬워진다. **어려웠던 것이 쉬워진 자리에 명시 금지를 둔다.**

---

## 3. 요청 2 — 인수 기준

### 3.1 AC-A6-1 — 기존 단위 테스트 19개가 **수정 없이** 그린이어야 한다

> **AC-A6-1 (필수, DC-2 직역). `web/src/lib/deepCoreProgressMath.test.ts`의 `it` 19개 전부가,
> 어댑터 컷오버 커밋에서 파일을 한 글자도 수정하지 않은 채 통과해야 한다.
> 이 테스트 파일이 컷오버 커밋의 diff에 등장하면 그 자체가 계약 위반이다.**

| # | describe 블록 | `it` 수 | 잠그는 것 | 신스키마에서 이 케이스를 위협하는 것 |
|---|---|---|---|---|
| 1 | S0/S5 게이트 | 2 | 포지션 0건 → `S0_NOT_SHOWN`, 킬 스위치 → `S5_DISABLED` | **DC-4의 근거 그 자체.** 컷오버 직후 신 테이블 0건 상태의 정확한 동작 |
| 2 | 표면 상태 우선순위 | 4 | S3 > S2 > S4 > S1 | **AD-5** — 플래그 매핑을 틀리면 S-2 케이스가 실전에서 거짓말한다(테스트는 여전히 그린) |
| 3 | `xp.lift` | 3 | 정산행 없으면 0 · 하루 최대 30 · 날짜별 독립 합산 | **AD-4**(dayKey 출처) · **AD-6**(`settledAt` 의미) |
| 4 | `xp.charter_open` M-1 가드 | 5 | AC-P11(하루 1회) · AC-D11(`minAmount == null`) · AC-P9(갱신 승계) · 4번째 동시 포지션 제외 · 먼지 포지션 10개 파밍 방지 | 13행 표 #9(`renewedFromPositionId`) · #10(`product.minAmount` **nullable 유지**) · **AD-4** |
| 5 | `charterCompleteXp` 수식 | 1 | `min(300, ⌊10×termDays/3⌋)` | 없음(순수 수식) |
| 6 | `charter_complete` | 1 | `status !== 'ACTIVE' && daysPaid >= termDays`일 때만 300 XP / 50 SV | **AD-2**(값 집합 축소) · **AD-3**(`daysPaid` 출처) · **AD-7**(만기 전이 주체) |
| 7 | wells | 2 | `relativeSize`는 termDays 기준(AC-S12) · 만기 24h 잔류 | **DC-3 / AD-9** |
| 8 | AC-P8 아날로그 | 1 | 원금만 다른 두 포지션의 XP/SV가 동일 | **DC-3 / AD-9** — 이 테스트가 AD-9 위반의 자동 감지기다 |

**이 표의 오른쪽 열이 핵심이다:** 19개 중 **2번·3번(7개)은 순수 함수만으로는 위반을 잡지 못한다** —
플래그를 잘못 매핑하거나 dayMs 출처가 갈라져도 순수 테스트는 그대로 그린이다. 그래서 §3.2가 필요하다.

### 3.2 AC-A6-2 — `game-developer`가 **추가로** 써야 할 회귀 테스트 6종

> **AC-A6-2 (필수). 아래 6종은 기존 19개를 대체하지 않고 **추가**한다. 테스트의 정확한 배치
> (순수 단위 / 어댑터 단위 / 통합)와 픽스처 형태는 `game-developer`가 정하되, 6가지 성질 전부가
> 어딘가에서 잠겨야 한다.**

| ID | 잠그는 성질 | 대응 |
|---|---|---|
| **G-1 등가성** | 동일 의미의 구스키마 행 세트와 신스키마 행 세트가 **동일한 `DeepCoreState`** 를 만든다(골든 픽스처 비교, `xp`/`svEarned`/`operatingDays`/`wells`/`surfaceState` 전 필드) | DC-2 전체 |
| **G-2 따라잡기 붕괴** | 밀린 N일을 한 번에 정산한 원장 행 N개(`settledAt` 동일)가 `operatingDays === 1`, `lift === min(포지션,3)×10`을 만든다 | **AD-6** |
| **G-3 dayMs 단일 출처** | 게임이 쓰는 dayMs가 정산 모듈이 export한 그 함수의 값과 같다(게임 모듈에 자체 상수가 없다) | **AD-4** |
| **G-4 플래그 매핑** | v2 포지션 ≥1 + `stakingV2WorkerEnabled=false` → `S2_REPORTING_PAUSED`. 구 `stakingWorkerEnabled`를 뒤집어도 결과가 **바뀌지 않는다** | **AD-5** |
| **G-5 상태 집합** | 신 enum에 `PAID`가 없고, `MATURED` + `daysPaid >= termDays` 포지션이 `charter_complete`를 정확히 1회 준다 | **AD-2 / AD-3** |
| **G-6 쓰기 0건 / 읽기 최소** | 어댑터가 `findMany` 외의 Prisma 동사를 호출하지 않고, 원장 select가 `{ positionId, settledAt }` 두 열을 넘지 않는다 | **AD-9** · 게임 전용 쓰기 0건 계약 |

> G-6은 단위 테스트보다 **정적 검사(grep/lint)** 가 자연스럽다. `code-compliance-checker`가 상시
> 검출하도록 요청하는 편이 낫다는 것이 이 문서의 제안이다(§6 Q-A6-3).

### 3.3 AC-A6-3 — 순수 모듈 불변 확인

> **AC-A6-3 (필수). 컷오버 커밋에서 `deepCoreProgressMath.ts` · `deepCoreXp.ts` ·
> `deepCoreChapters.ts` · `components/staking/deep-core/**` 는 변경 0줄이어야 한다.**
> rev03 §5.4가 "어댑터만 갱신(DC-2)"이라고 못 박은 것의 검증 가능한 형태다. 이 파일들에 diff가
> 생겼다면 스키마 전환이 아니라 게임 사양 변경이 섞여 들어간 것이며, 그것은 별도 FRD 대상이다.

---

## 4. 요청 3 — 컷오버 순서

### 4.1 단계표 — 각 단계에서 게임이 무엇을 읽고 무엇을 렌더하는가

CS-3(rev03 §5.4)의 3단계에 게임 관점의 관찰 지점을 붙였다.

| 단계 | 무슨 일이 일어나는가 | 게임이 읽는 테이블 | 프로덕션 렌더 | 롤백 |
|---|---|---|---|---|
| **CO-0** 현재 | — | 구 `StakePosition`/`StakingPayout` | **전원 `S0_NOT_SHOWN`** (포지션 0건, N-27) | — |
| **CO-1** 추가 마이그레이션(CS-3 1) | 신 테이블 생성, 전부 0건·기본값 꺼짐 | **구 테이블 그대로** | 무변경(S0) | 스키마만 되돌리면 됨. 게임 무관 |
| **CO-2** 코드 컷오버(CS-3 2) | 어댑터가 신 테이블만 읽도록 전환 + AD-4~AD-8 적용 | **신 테이블만** | **여전히 S0** (신 테이블 0건) | **코드 롤백만으로 완결.** 구 테이블이 남아 있으므로 스키마 롤백 불필요 |
| **CO-3** 첫 v2 포지션 체결(게이트 해제 후) | 사용자 1명 포지션 1건 | 신 테이블 | 그 사용자만 **`S2_REPORTING_PAUSED`**(v2 워커 아직 off — 사실 그대로) | 포지션 데이터 발생. 롤백은 제품 판단 |
| **CO-4** v2 워커 ON | 첫 정산행 기록 | 신 테이블 | `S1_RUNNING`, `xp.lift` 최초 적립, 오도미터 1일 | — |
| **CO-5** 정리 마이그레이션(CS-3 3) | 구 테이블 DROP + `StakePositionV2 → StakePosition` **RENAME**(A-4 §3.1) | 신 테이블(이름만 원복) | 무변경이어야 함 | **비가역.** §4.3 |

> **CO-2가 "깨질 라이브 경험 0"인 이유를 한 문장으로:** `deepCoreProgressMath.ts:145`의
> `positions.length === 0 → S0_NOT_SHOWN` 단락이 **모든 다른 판정보다 먼저** 실행되므로,
> 신 테이블이 비어 있는 동안 어댑터는 플래그도 dayMs도 정산행도 건드리지 않고 조용히 빈 상태를
> 반환한다. rev03 DC-4가 "이 여유를 활용해 컷오버한다"고 한 것의 코드 상 근거다(재확인 완료).

### 4.2 CO-R1 — 컷오버 중 **두 스키마를 동시에 읽지 않는다** (필수)

> **요구 CO-R1. 어댑터는 어느 단계에서도 구·신 두 테이블을 함께 읽거나 두 결과를 합치지 않는다.
> "이행기 동안 둘 다 읽어서 사용자 진행도를 보존하자"는 절충안을 명시적으로 기각한다.**
>
> **기각 근거(안전이 아니라 게임 설계상의 이유다):** `xp.lift`는 dayKey별 `min(그 날 정산된
> 포지션 수, 3) × 10`이고, `charter_open`은 dayKey당 40이다. 두 소스를 합치면 **같은 날짜 키에
> 대해 상한이 두 번 적용된다** — 구 3포지션 + 신 3포지션 = 하루 60 XP. 이것은 M-1이 닫은
> 파밍 경로가 다시 열리는 것이고, 상한을 우회하는 방식이라 **조용히 통과한다**. 잔고 두 권위를
> 합산하지 않는다는 A-2 X-2와 정확히 같은 결의 판단이다.
>
> 반대급부(구 테이블의 진행도가 사라짐)는 **프로덕션에서 0이다**(포지션 0건). 로컬/스테이징
> 개발 DB에서는 진행도가 리셋된 것처럼 보일 수 있으며, **그것이 예상된 동작**이다 —
> 버그로 접수하지 않는다.

### 4.3 롤백 레버 — 코드 롤백보다 킬 스위치를 먼저 쓴다

- 1순위: **`DEEP_CORE_ENABLED=false`** → `S5_DISABLED`. 게임 표면만 마운트 해제되고 스테이킹 화면은
  정상 동작한다. 00 §M-4가 요구한 가역성이며, 해제하면 이전 상태로 정확히 복귀한다(파생이므로 손실 0).
- 2순위: 어댑터 커밋 되돌리기(CO-2 한정 — 구 테이블 존치 구간에서만 값싸다).
- **CO-5 이후에는 1순위만 남는다.** 따라서 **CO-5의 선행 조건**으로 이 문서는 다음을 요구한다:
  AC-A6-1(19개 그린) + AC-A6-2(6종 그린) + CO-4가 실환경에서 최소 1회 정산 사이클을 통과할 것.
- **CO-5는 어댑터를 두 번째로 건드린다**(RENAME으로 Prisma 접근자 이름이 되돌아온다).
  완화: 어댑터가 모델 접근을 **한 군데에서만** 하도록 작성한다(오늘도 쿼리는 2개뿐이다 — 이 성질을
  유지하면 CO-5의 diff는 2줄이다). `game-developer`에게 이 성질의 보존을 요청한다.

### 4.4 게임 텍스트 — 이 컷오버로 신규 카피 키는 **0개**다

전 단계에서 렌더되는 상태(S0/S1/S2/S4/S5)는 전부 기존 상태이고 기존 키
(`game.state.noActiveWell`, `game.state.disabled`, S-2 문구 등)를 그대로 쓴다.
**"데이터 이전 중입니다" 류의 이행기 전용 문구를 만들지 않는다** — 사용자에게 관측 가능한
변화가 없는데 문구를 만들면 없는 사건을 알리는 셈이 된다. (내러티브 플레이버는 `game-designer`
소관이며, 여기에는 그런 요구도 없다.)

---

## 5. DC-1~DC-4 최종 대조

| 요구 | 이 문서에서 |
|---|---|
| **DC-1** 13개 필드 의미 제공 | §2.1 표로 코드 델타까지 확정. 실제 코드 변화는 #13 하나 + 접근자 이름. **AD-3**로 `daysPaid` 대안을 명시적 미채택 |
| **DC-2** 어댑터만 갱신 · 기존 테스트가 인수 기준 | **AC-A6-1**(19개 무수정 그린) + **AC-A6-3**(순수 모듈 0줄 변경). **AD-1**이 개명을 3단계로 분리해 이 기준을 문자 그대로 만족 가능하게 만듦 |
| **DC-3** 원금 비례 성장 금지 | **AD-9** 금지 읽기 목록. 신스키마가 금액 열을 같은 테이블에 나란히 두므로 오늘보다 **더 위험해졌다**는 점을 명시. 자동 감지기는 기존 테스트 #8 + G-1 |
| **DC-4** 빈 상태 조용한 렌더 | §4.1 CO-2 행 + `:145` 단락 근거. 컷오버 시 깨질 라이브 경험 0을 코드 수준에서 재확인 |

---

## 6. 열린 질문 (명시적으로 넘김)

| ID | 질문 | 대상 |
|---|---|---|
| **Q-A6-1** | AD-4의 dayMs 접근자를 v2 정산 모듈 어디에 둘 것인가(파일·이름). 게임은 소비자일 뿐이라 결정권이 없다 | `web-shared-expert` (via `pm`) |
| **Q-A6-2** | AD-6의 알려진 과소 계상(따라잡기 정산이 오도미터를 1일로 붕괴)을 언젠가 고칠 것인가. 고친다면 어댑터가 아니라 `deep-core-02` 개정이며, 그 순간 기존 테스트의 기대값이 바뀐다(= DC-2 인수 기준과 충돌하므로 **컷오버와 절대 같은 커밋에 넣지 않는다**) | `pm` → `game-planner` |
| **Q-A6-3** | AD-9(금지 읽기)를 `code-compliance-checker`의 상시 검출 항목으로 등록할 것인가 | `pm` → `qa-lead` / `code-compliance-checker` |
| **Q-A6-4** | AD-8의 대체 엔드포인트 이름·응답 스키마. A-7이 정하는 대로 따르되, `game` 블록 조건 3가지는 이 문서가 고정 | `product-planner`(A-7) |
| **Q-A6-5** | 3단계 위생 커밋(`paidAt → settledAt`, 플래그 개명)을 CO-5와 같은 배포에 실을지 별도로 할지 | `game-developer` → `qa-lead` |

---

## 7. 이 문서가 승인하지 않는 것 (명시)

- **어댑터 구현 착수 승인이 아니다.** rev03 §7.2의 3조건(마이그레이션 선행 조건)이 충족되고
  CS-3 1단계가 실행되기 전에는 CO-2에 해당하는 코드가 병합되어서는 안 된다.
- **마이그레이션 실행 승인이 아니다.** A-4 §13/§14가 그대로 유효하다.
- **게임 사양 변경이 아니다.** XP 수치·곡선·M-1 가드·챕터 언락·상태 기계 어느 것도 이 문서가
  바꾸지 않는다. 바뀌는 것은 같은 값이 어느 테이블에서 오는가뿐이다.
- **04 문서(수익 연동)의 게이트 완화가 아니다.** AD-9가 오히려 그 경계를 신스키마 기준으로
  다시 못 박는다.
- **`GameProfile`/`GameXpEntry` 영속화 착수 승인이 아니다.** 이 컷오버는 그 핸드오프와 독립이며,
  전량 파생 방식을 그대로 유지한다.

---

## 8. `game-developer` 인수인계 체크리스트

1. §2.1 표대로 `deepCoreProgress.ts`만 수정. 다른 게임 파일 diff 0(AC-A6-3).
2. **AD-1** — `settledAt → paidAt` 재포장. 테스트 파일·순수 모듈 손대지 않기.
3. **AD-4** — dayMs를 v2 정산 모듈에서 import. 자체 상수 만들지 않기(Q-A6-1 확정 후).
4. **AD-5** — `stakingV2WorkerEnabled`를 명시 매핑 객체로 좁혀서 전달. 두 플래그 합치지 않기.
5. **AD-9** — 원장 select는 `{ positionId, settledAt }` 고정.
6. **AD-7/AD-8**은 게임 밖(라우트) 요구다. 대체 라우트에 만기 전이 선행 호출과 `game` 블록
   best-effort 계약이 없으면 **어댑터를 병합하지 말고 되돌려 보고**할 것.
7. AC-A6-1(19개) 그린 확인 → AC-A6-2(G-1~G-6) 추가 작성 → `qa-lead` 사인오프.
8. CO-5 시점에 Prisma 접근자가 한 번 더 바뀐다는 것을 코드 구조에 반영(모델 접근 지점 최소화).
