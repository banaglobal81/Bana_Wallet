# 설계 문서 T-16 — 관리자 크레딧(`ADMIN_ADJUSTMENT_CREDIT`) 화면 FRD

> 작성: `product-planner` · 2026-08-11
> **근거 문서(읽은 순서):** `staking-yield-system-v2-prd-rev05-creation-path-cutover.md`
> **§4A 전체(AC-1~AC-14)** · §5.1 CUT-2b · §7 T-15~T-19 · §7.2 AC-C15~AC-C19 · §7.3(이 문서의 위임 항목) →
> `...-design-a8-admin-dashboard-frd.md`(PoR 패널·인시던트 배너·3상태 분리 원리) →
> `...-design-a5-withdrawal-queue.md`(§1.6-1 타이핑 확인 선례 · §7 수동 서명) →
> `admin-staking-debt-visibility-frd.md`(N-1~N-5 금액 표기, E-1~E-5 3상태) →
> 코드 실측: `web/src/lib/localLedger.ts:86-252, 278-330` ·
> `web/src/app/[locale]/admin/withdrawals/page.tsx` ·
> `web/src/app/[locale]/admin/staking/page.tsx:432-444`(`isGrant` 배지 선례) ·
> `web/src/components/admin/reserve/SolvencyIncidentBanner.tsx` ·
> `web/src/components/admin/AdminSidebar.tsx:25-34` · `web/src/utils/adminApi.ts:95-131, 226-251` ·
> `web/src/utils/adminLedgerFormat.ts` · `web/src/app/api/auth/register/route.ts:20`
>
> **지위: 설계 문서다. 구현 지시서가 아니다.** 이 문서는 코드를 한 줄도 변경하지 않았고
> 마이그레이션을 실행하지 않았다. 구현은 T-17(`web-shared-expert`) · T-18(`web-admin-expert`)이며,
> **배포는 T-19(`wallet-security-expert`) 리뷰 통과 이후**다(rev05 AC-14 — 이 문서가 그 게이트를 풀지 못한다).
>
> **범위:** 관리자 잔고 조정 화면(크레딧 + 차감) · 확인 UX · 사유 유형 · 한도 표시 ·
> 에러 코드 표시 문구 · **AC-10 출금 큐 표식** · 6로케일 카피.
> **범위 밖:** 라우트 구현·잠금 경계(T-17) · 스키마(T-15) · PoR 대시보드의 `adminAdjustmentNetCreditTotal`
> 렌더 상세(A-8 §6.2 소관, 이 문서는 §3.4에서 **상시 노출 요구만** 건다) · 사용자 화면(rev05 §5.2 ④ —
> *"사용자 화면에 관리자 크레딧의 흔적을 남기지 않는다"*) · 게임/밴드 표면(무관).

---

## 0. 요약 — 이 문서의 여섯 가지 판정

| # | 판정 | 요지 |
|---|------|------|
| **J-1** | **킬 스위치 OFF의 정직한 표현은 "메뉴 은닉 + 금액 상시 노출"이다. 숨기는 것은 입구이지 부채가 아니다** | AC-13(메뉴 미렌더)과 *"정직하게 비활성 표시, 숨기지 말 것"* 은 충돌하지 않는다 — **은닉 대상은 액션 진입점이고, 노출 대상은 이미 발행된 금액**이다. ① 메뉴는 미렌더(AC-13 불변) ② URL 직접 진입 시 페이지는 **200 + `DISABLED` 상태를 정직하게 렌더**(폼 없음) ③ **`adminAdjustmentNetCreditTotal`은 킬 스위치와 무관하게 PoR 대시보드에 항상 렌더**(AC-9). 이 셋이 함께여야 "숨기지 않았다"가 참이다 → §3.4 |
| **J-2** | **이 화면의 상태는 "켜짐/꺼짐" 2개가 아니라 7개다. 하나로 뭉치면 관리자가 잘못된 다음 행동을 한다** | `LOADING` / `LOAD_FAILED` / `DISABLED` / `NO_LOCAL_COIN` / `LIMITS_UNSET` / `CAP_EXHAUSTED` / `READY`. 특히 **`LIMITS_UNSET`(한도 `null` = 차단)** 과 `DISABLED`는 관리자가 취할 조치가 서로 다르다 — 전자는 설정값 입력, 후자는 토글. 같은 "사용 불가"로 그리면 둘 다 해결되지 않는다 → §3 |
| **J-3** | **한도 3종은 크기가 다른 게 아니라 적용 범위가 다르다 — 범위 라벨이 없으면 반드시 오독된다** | 1회(**이 거래 한 건**) / 24h(**나 한 사람**, 롤링) / 누적(**이 코인 전체, 순증**). 셋을 한 표에 숫자만 나열하면 관리자는 24h 사용량을 플랫폼 전체로 읽는다. 그리고 **롤링 창에는 "리셋 시각"이 없다** — *"자정에 초기화"* 류 카피를 금지한다 → §4.5 |
| **J-4** | **타이핑 확인을 "정확한 문자열 일치"로 구현하면 통제가 죽는다** | `100` vs `100.00`, `Admin@X.com` vs `admin@x.com`에서 거부하면 관리자는 확인란을 **장애물**로 인식하고, 다음 단계는 폼 값을 **복사·붙여넣기**하는 것이다. 그 순간 AC-3의 목적(*"내가 누구에게 얼마를"* 을 다시 읽게 만든다)이 사라진다. **금액은 `Decimal` 비교, 이메일은 trim+lowercase 비교, 붙여넣기는 차단**이 정답이다 → §4.6 |
| **J-5** | **이 표면의 최대 이중 발행 경로는 권한 남용이 아니라 "애매한 실패 후의 재시도"다** | 커밋 직후 응답이 유실되면(타임아웃) 관리자는 반드시 다시 누른다. `LocalLedgerEntry`는 `@@unique(coin, idempotencyKey)`를 **이미 갖고 있고**(`localLedger.ts:156-161`) 아무도 쓰지 않는다. **확인 모달 진입 시 1회 생성한 키를 재시도에서 재사용**하게 하는 것이 이 화면이 져야 할 책임이다 → §5 DC-6 |
| **J-6** | **AC-10 표식의 "부재"는 그 자체로 '깨끗함'을 주장한다 — `null`을 분리하지 않으면 조회 실패가 무표식으로 렌더된다** | 승인자는 배지가 없는 행을 *"관리자 조정 없음"* 으로 읽는다. 순증 조회가 실패했을 때도 똑같이 배지가 없으면, **화면이 확인하지 않은 사실을 확인한 것처럼 말한다.** `net > 0` / `net < 0` / `net == 0` / `null`(확인 불가) **4상태**로 렌더한다 → §8 |

**그리고 이 문서는 rev05 §4A에 없는 통제 공백 하나를 발견했다** — **코인 선택에 제약이 없다.**
`balanceAuthority = HUB`인 코인에 로컬 크레딧을 발행하면, 그것은 준비금 대시보드가 인시던트로
경보하는 바로 그 상태(`HUB_COIN_HAS_LOCAL_BALANCE`, `SolvencyIncidentBanner.tsx:19`)를 **관리자가
버튼 한 번으로 제조하는 것**이다. §6-V7 · §13 E-3에서 요구와 escalation으로 적는다.

---

## 1. Goal

관리자가 이 화면에서 **자신이 무엇을 하는지 오해할 수 없게** 만든다. 구체적으로 네 질문에 화면이 답한다.

| 질문 | 답을 주는 요소 |
|---|---|
| **① 이 버튼이 만드는 것은 무엇인가** | 경고 배너 3문장(§4.2) — PoR 없는 생성 / 즉시 부채 / 인출 승인 아님 |
| **② 지금 이것을 쓸 수 있는가, 없다면 무엇을 해야 하는가** | 7상태 기계(§3) — 상태마다 **다음 행동이 다르다** |
| **③ 내가 누구에게 얼마를 하는가** | 대상 미리보기(§4.4) + 타이핑 재확인(§4.6) |
| **④ 얼마까지 할 수 있는가** | 한도 패널(§4.5) — 3종 × 적용 범위 × 사용량/잔여 |

**비목표(명시):**
- **일괄·다중 대상 UI를 만들지 않는다**(AC-12). 목록 선택, 체크박스 다중 선택, CSV 드롭존을
  **화면에 두지 않는다** — 있으면 언젠가 쓰인다.
- **사용자 검색 결과 목록을 만들지 않는다.** 대상은 **이메일 완전 일치 1건**이다(§4.4 근거).
- **이 화면에서 한도값·킬 스위치를 편집하지 않는다.** 편집은 플랫폼 설정 소관이며, 여기서는
  **읽기 전용 + 설정 화면으로의 링크**만 둔다(발행 화면과 한도 편집이 한 화면에 있으면
  "막히면 그 자리에서 한도를 올린다"가 기본 동작이 된다).
- **성공을 축하하지 않는다.** 결과 화면에 성공 톤·긍정 아이콘·초록 대형 체크를 두지 않는다(§4.7).

---

## 2. 이 문서가 바꿀 수 없는 것 (rev05 §4A 승계 — 재확인만)

| ID | 구속 사항 | 이 문서에서의 반영 |
|---|---|---|
| **AC-1** | 승인 용도 **2종만**(내부 E2E 검증 시드 / 대사 불일치 수동 정정). 대량·이벤트성 지급 금지 | §4.3 용도 고지 블록 + §9 `scopeBody` 카피가 금지 용도를 **명시적으로 열거** |
| **AC-2** | 상단 고정 배너 + 확인 모달, **접기·닫기 불가**, 3문장 필수, 안심 문구 금지 | §4.2 + §10 AC-T16-08/09 |
| **AC-3** | **체크박스 금지.** 타이핑 대상은 **대상 이메일 + 금액**(고정 문구 아님). 서버 재검증 | §4.6 + §10 AC-T16-10~12 |
| **AC-4** | 사유 유형 4종 필수 선택 + 서술. `adjustmentReason`에 `"<유형>: <서술>"` 저장. `OTHER`는 20자 이상 | §4.3 + §5 DC-4 + §10 AC-T16-13/14 |
| **AC-5** | 신원은 **세션에서만**. 본문에 오면 **400 거부**. `AuditLog.detail`에 유형·IP·직후 L1 | §5 DC-3(금지 필드) + §4.7(결과에 L1 표시) |
| **AC-6** | 한도 3종 + `adminCreditEnabled` 킬 스위치. **`null` = 무제한이 아니라 거부** | §3 상태 `LIMITS_UNSET` + §4.5 |
| **AC-9** | `adminAdjustmentNetCreditTotal`은 PoR 대시보드에 노출(0이어도 숨기지 않음) | §3.4 — 이 화면의 은닉과 **분리** |
| **AC-10** | 출금 승인 큐에 표식. **차단이 아니라 표시** | §8 |
| **AC-11** | 차감은 `available` 기준. 거부 시 **다음 행동 안내** | §4.8 + §7 |
| **AC-12** | 이메일로 **1회 1명**. 존재하지 않으면 400 | §4.4 |
| **AC-13** | 킬 스위치 OFF → 라우트 403 + **메뉴 항목 미렌더** | §3.4 — **메뉴는 은닉, 페이지는 정직** |

> **이 표의 항목은 이 문서가 완화할 수 없다.** 아래 §4~§8은 전부 **이 제약 위에서의 구체화**이며,
> 이 문서가 새로 **추가**한 요구(§6-V7 코인 제약, §5 DC-6 멱등키)는 통제를 **좁히는 방향**이다.

---

## 3. 화면 상태 기계 — 7상태

### 3.1 상태와 판별자

우선순위는 **위에서 아래**다. 두 조건이 동시에 참이면 **위쪽이 이긴다.**

| # | 상태 | 판별자(서버가 결정) | 화면 | 폼 |
|---|---|---|---|---|
| 1 | **`LOADING`** | 초기 fetch 미완 | 스켈레톤 + "불러오는 중" | 없음 |
| 2 | **`LOAD_FAILED`** | 설정/한도/코인 조회 중 하나라도 실패 | **경고 배너는 렌더**(항상) + `loadFailed` 문구 | **없음** |
| 3 | **`DISABLED`** | `adminCreditEnabled === false` | `statusDisabled` 칩 + `disabledTitle/Body/Where` | **없음** |
| 4 | **`NO_LOCAL_COIN`** | `balanceAuthority='LOCAL'`인 `ManagedCoin` 0건 | `unavailableNoCoin` | **없음** |
| 5 | **`LIMITS_UNSET`** | 한도 3종 중 **하나라도** `null` | `statusUnconfigured` 칩 + **어느 항목이 미설정인지 개별 표시** | **없음** |
| 6 | **`CAP_EXHAUSTED`** | 24h 또는 누적 잔여 ≤ 0 | `statusCapReached` 칩 + 해당 한도 행 강조 | **읽기 전용으로 렌더**(무엇이 막혔는지 보이도록), 제출 버튼 없음 |
| 7 | **`READY`** | 위 전부 통과 | 정상 | 전체 |

> **왜 `LOAD_FAILED`가 `DISABLED`보다 위인가.** 조회 실패 상태에서 `adminCreditEnabled`는
> *"false"* 가 아니라 *"모른다"* 다. 모르는 것을 꺼진 것으로 그리면, 실제로 켜져 있는 동안
> 화면이 꺼졌다고 말한다 — 그러면 관리자는 설정 화면에 가서 **이미 켜진 토글을 한 번 더 끄고 켠다.**
> 그 두 번의 토글은 전부 `AuditLog`에 남아 사후 조사에서 *"왜 이때 껐다 켰지?"* 라는 유령 단서가 된다.

> **왜 `CAP_EXHAUSTED`만 폼을 읽기 전용으로라도 렌더하는가.** 나머지 여섯 상태는 *"이 표면 자체가
> 지금 동작하지 않는다"* 이고, `CAP_EXHAUSTED`는 *"표면은 동작하는데 남은 한도가 없다"* 다.
> 후자에서 폼을 통째로 지우면 관리자는 **얼마가 남았는지 보러 다른 화면으로 나가야 한다.**
> `docs/patterns/product-planner.md` — *"비활성 버튼과 사용 불가 상태는 서로 다른 주장이다."*

### 3.2 금지 사항 (상태 표현)

- **`disabled` 속성 하나로 6개 상태를 표현하지 않는다.** 상태마다 **다른 문구 + 다른 다음 행동**을 준다.
- **`LOAD_FAILED`에서 숫자 `0`을 렌더하지 않는다.** 잔고·한도 사용량·순증 전부 `—` + 문구.
  (`docs/patterns/product-planner.md` — *"머니 화면에서 '불러오기 실패'와 '0'은 같게 렌더되면 안 된다."*)
- **`LOADING`에서 폼을 먼저 그리고 나중에 지우지 않는다.** 깜빡임은 "잠깐 열려 있었다"는 오해를 만든다.

### 3.3 T2 권위 정지(`authorityAlertStage = T2_HALTED`)일 때

**차단하지 않는다. 대신 알린다.**

근거: T2는 *"로컬 원장 발행 · 신규 체결 · 출금 실행 정지"*(rev03 X-3′)인데, **대사 불일치 정정은
그 정지 상태를 해소하기 위해 해야 하는 일**이다. 정정 도구를 정지 대상에 넣으면 인시던트에서
빠져나올 수단이 함께 잠긴다 — A-3가 `ADMIN_ADJUSTMENT_*`를 발행 게이트에서 제외한 원래 이유
(`localLedger.ts:86-96`)와 같은 논리다.

> **요구 T16-S1.** `READY` 상태에서 해당 코인이 T2인 경우, 기존 `SolvencyIncidentBanner`
> (`web/src/components/admin/reserve/SolvencyIncidentBanner.tsx`)를 **경고 배너 바로 아래**에 렌더한다.
> 새 컴포넌트를 만들지 않는다(출금 큐가 이미 같은 방식으로 쓴다 —
> `admin/withdrawals/page.tsx:149`). **이 배너는 폼을 비활성화하지 않는다.**
> → 이 판단의 최종 확인은 §13 E-2(`pm` · `wallet-security-expert`).

### 3.4 (J-1) 킬 스위치 OFF에서 "숨기는 것"과 "숨기지 않는 것"

| 대상 | OFF일 때 | 근거 |
|---|---|---|
| `AdminSidebar` / `AdminBottomNav` / 설정 화면 바로가기 | **렌더하지 않는다.** 플래그를 **모르는 동안(로딩 중)에도 렌더하지 않는다**(fail-closed) | AC-13 ⓑ. 플래그 확인 전 렌더 → 확인 후 제거는 "한순간 존재했다"를 남긴다 |
| `POST /api/admin/credit` | **403 + `ADMIN_CREDIT_DISABLED`** | AC-13 ⓐ |
| `/admin/credit` 페이지 자체(URL 직접 진입) | **200 + `DISABLED` 상태 렌더.** 404·리다이렉트·빈 화면 **금지** | 관리자가 북마크·문서 링크로 들어온다. 404는 *"이 기능이 없어졌다"* 는 **틀린 사실**을 가르친다 |
| PoR 대시보드 `adminAdjustmentNetCreditTotal` | **항상 렌더**(0이면 회색 `0`, 0이 아니면 주의색) | AC-9. **이미 발행된 부채는 스위치와 무관하다** |
| 출금 큐 표식(§8) | **항상 렌더** | 같은 이유 — 표식은 과거 발행분에 대한 사실이다 |

> **이 표가 J-1의 전부다.** *"숨기지 않는다"* 는 **금액에 대한 요구**이고, *"메뉴에서 뺀다"* 는
> **액션에 대한 요구**다. 둘을 같은 축에 놓으면 하나를 어길 수밖에 없다.

---

## 4. 화면 구조와 플로우

경로: **`/admin/credit`** (nav 키 `nav.adminCredit`) · i18n 네임스페이스 **`adminCredit`**
스타일 기준: 기존 관리자 화면 토큰 승계(`bg-[#06132a]` / 카드 `bg-[#112643]/70 border-[#1E3559]`).
**색 토큰의 최종 확정은 `ui-ux-designer`(T-14)** — 이 문서는 **의미**만 고정한다.

### 4.1 영역 배치 (위 → 아래)

```
① 뒤로가기(설정)              ← 기존 /admin/withdrawals 패턴 승계
② 헤더: 제목 + 상태 칩        ← 상태 칩은 §3의 7상태 중 하나
③ 경고 배너 (고정, 닫기 없음)  ← AC-2 ①
③' T2 인시던트 배너(조건부)    ← §3.3
④ 승인 용도 고지 블록          ← AC-1
⑤ 한도 패널 (3종)             ← AC-6 / §4.5
⑥ 방향 선택 (크레딧 / 차감)    ← §4.8
⑦ 폼: 대상 → 코인 → 금액 → 사유 유형 → 서술
⑧ 대상 미리보기 패널 (⑦의 이메일 확정 시 표시)
⑨ [확인 단계로] 버튼
   → 확인 모달(경고 재게시 + 요약 + 타이핑 2칸) → 제출
⑩ 결과 패널
```

### 4.2 ③ 경고 배너 — AC-2 확정 카피

- **`role="alert"`, 닫기/접기 컨트롤 없음.** `SolvencyIncidentBanner`의 구조를 따르되
  **색은 로즈(위반)가 아니라 주의색(앰버 계열)** — 로즈는 *"지금 위반이 발생했다"* 에 예약돼 있고
  (A-8 §8), 이 배너는 상시 표시이므로 로즈를 쓰면 **로즈가 일상이 되어 진짜 인시던트가 묻힌다.**
  같은 화면에 T2 로즈 배너가 함께 뜰 수 있으므로 **두 색이 달라야 한다.**
- **문구는 3문장 전부**, 순서 고정(W-1 → W-2 → W-3). 요약·축약 금지.
- **모든 상태에서 렌더한다** — `DISABLED`·`LOAD_FAILED`에서도. 배너는 *"이 표면이 무엇인가"* 에 대한
  설명이지 *"지금 실행 가능한가"* 에 대한 설명이 아니다.

| 키 | 대응 | 의미 고정(rev05 §4A.2) |
|---|---|---|
| `warnPor` | **W-1** | 준비금 검증(PoR) 없이 즉시 사용 가능한 잔고를 생성한다 |
| `warnLiability` | **W-2** | 발행 즉시 회사 부채가 된다. 준비금 뒷받침 여부는 이 화면에서 검증되지 않는다 |
| `warnNotWithdrawal` | **W-3** | 온체인 인출을 승인하지 않는다. 실제 출금은 별도 승인 + 온체인 검증을 거친다 |

> **금지어(6로케일 전부).** *"안전"·"문제없"·"걱정"·"safe"·"no risk"·"don't worry"·"安全"·"没问题"·
> *"an toàn"·"ปลอดภัย"* 를 `adminCredit` 네임스페이스에 **넣지 않는다.** grep 가능한 인수 기준으로
> 못 박는다(AC-T16-09). 근거: A-7 §7.2 — *"경고와 안심을 나란히 두면 사용자는 안심만 읽는다."*
> **W-3는 안심 문구가 아니라 범위 한정 문구다** — *"이건 인출이 아니다"* 이지 *"그러니 괜찮다"* 가 아니다.

### 4.3 ④ 승인 용도 고지 + ⑦ 사유 유형

용도 고지 블록(`scopeTitle` / `scopeBody`)은 **금지 용도를 명시적으로 열거**한다. 허용만 적으면
관리자는 *"이건 금지라고 안 적혀 있으니 되겠지"* 로 읽는다.

**사유 유형 셀렉터(AC-4):**

| 값(저장 토큰) | 라벨 키 | 서술 최소 길이 | 비고 |
|---|---|---|---|
| `E2E_VERIFICATION` | `reasonE2E` | **4** | 어떤 검증 회차인지 적게 한다 |
| `RECONCILIATION_FIX` | `reasonRecon` | **4** | 인시던트/대사 실행 식별자 |
| `INCIDENT_COMPENSATION` | `reasonIncident` | **4** | |
| `OTHER` | `reasonOther` | **20** | AC-4 명시 요구 |

- **기본 선택 없음.** 첫 항목이 미리 선택돼 있으면 선택 행위 자체가 사라진다 → 미선택 시 진행 불가.
- **길이는 코드포인트로 센다**(`Array.from(s).length`). UTF-16 단위로 세면 이모지·일부 CJK에서
  실제 분량과 어긋난다. **앞뒤 공백 trim + 연속 공백 1칸 축약 후** 측정한다(`"..................."` 회피).
- **4는 이 문서가 정한 하한**이다(rev05는 `OTHER`의 20만 규정). 근거: `"."` 한 글자로 통과하면
  AC-4가 목표한 *"사후에 이 크레딧들이 무엇이었는지 집계"* 가 다시 불가능해진다. 완화 아님 — 추가다.

### 4.4 ⑦-⑧ 대상 지정과 미리보기

**입력은 이메일 텍스트 1칸.** 자동완성 드롭다운·사용자 목록·`GET /api/admin/users` 검색을
**붙이지 않는다.** 근거: 목록에서 고르는 행위는 **읽지 않고 클릭하는 행위**로 퇴화하며,
이 표면에서 가장 흔한 사고는 권한 남용이 아니라 **대상 오타**다(AC-3 근거 그대로).
이메일을 손으로 쓰게 하면 그 자체가 1차 확인이고, §4.6의 타이핑이 2차 확인이 된다.

- 이메일은 **trim + lowercase** 후 조회한다(저장이 lowercase다 — `api/auth/register/route.ts:20`).
- 미존재 → **400 `ADMIN_CREDIT_USER_NOT_FOUND`**, 문구는 *"이 화면은 계정을 만들지 않는다"* 를 포함.

**⑧ 대상 미리보기 패널** — 이메일이 해석되면 즉시 표시한다(제출 전).

| 항목 | 의미 | 왜 제출 전에 필요한가 |
|---|---|---|
| `balance` | 로컬 원장 잔고 | |
| `held` | ACTIVE 홀드 합(스테이킹 원금 + 출금 대기) | |
| `available` | `balance − held` | **AC-11 거부를 사전에 없앤다.** 차감 가능액을 제출 후에 알려주는 것은 늦다 |
| `adminAdjustmentNet` | 이 사용자·코인의 관리자 조정 순증 | **같은 E2E 계정에 중복 크레딧하는 사고**를 막는 유일한 단서 |

- **3상태 분리 필수:** `targetLoading` / `targetError` / 실제 값. **조회 실패 시 `0`을 그리지 않는다.**
- `held > 0`이면 `targetHint`(홀드 설명)를 함께 렌더한다 — 차감이 왜 막힐 수 있는지 미리 설명한다.

### 4.5 ⑤ 한도 패널 — (J-3) 범위가 다른 세 개

**표 3행. 각 행은 [라벨 · 적용 범위 · 상한 · 사용 · 잔여] 5열.**

| 행 | 라벨 키 | 적용 범위 키 | 범위의 의미 | 사용량 정의 |
|---|---|---|---|---|
| 1회 | `limitPerTx` | `scopePerTx` | **지금 이 한 건** | 사용량 없음(`—`). 사용량 열을 비우고 **`0`을 쓰지 않는다** |
| 24시간 | `limitPerDay` | `scopePerDay` | **로그인한 나 한 사람**, 최근 24시간 롤링 | `Σ` 내 크레딧(24h) |
| 누적 | `limitCumulative` | `scopeCumulative` | **이 코인 전체**, 전 관리자, **순증**(크레딧 − 차감) | `Σ CREDIT − Σ DEBIT` |

**필수 규칙**

1. **적용 범위 라벨은 생략 불가.** "20,000 중 5,000 사용"만 있으면 관리자는 이것을 플랫폼 전체로 읽는다.
2. **롤링 창에 "리셋"·"초기화"·"자정"·"내일"을 쓰지 않는다.** 24h 롤링에는 리셋 시점이 없다.
   `limitRollingNote` — *"오래된 건이 24시간을 지나면 그만큼 회복된다"*.
3. **누적 순증은 감소할 수 있다**(차감 시). 라벨은 *"누적 발행"* 이 아니라 **"누적 순증"**.
   *"발행"* 이라고 쓰면 값이 줄어드는 것을 관리자가 버그로 읽는다.
4. **잔여(`remaining`)를 클라이언트에서 계산하지 않는다.** 서버가 **거부를 판정하는 그 함수**로
   산출해 내려준 값을 그대로 렌더한다(§5 DC-5). 근거: `docs/patterns/product-planner.md` —
   *"한도 수치를 클라이언트에서 유도하면 서버 규칙이 바뀌는 순간까지만 맞다."*
5. **`null`은 `∞`가 아니라 `limitUnset`("미설정 — 실행 불가")으로 렌더**하고, 그 행을 주의색으로 강조한다.
   이 반전(다른 `PlatformSetting`과 반대)이 이 표면의 핵심 안전 성질이므로 **화면에서도 보여야 한다.**
6. **조회 실패 시 `limitError`.** 상한·사용·잔여 전부 `—`.

### 4.6 ⑨ 확인 모달과 타이핑 재확인 — AC-3

**모달 구성(위 → 아래):**

```
[제목]  크레딧 발행 확인   /  차감 실행 확인      ← 방향이 제목에 들어간다
[경고 3문장 재게시]                              ← AC-2 ② (접기 불가, 요약 금지)
[요약]  대상: {email}
        금액: {amount} {coin}
        사유: {유형 라벨} — {서술}
[확인]  ① 대상 이메일을 직접 입력           ← placeholder에 정답을 넣지 않는다
        ② 금액을 직접 입력
[버튼]  취소                 [크레딧 발행] / [차감 실행]
```

**비교 규칙(J-4)**

| 입력 | 비교 방법 | 통과 예 | 불통과 예 |
|---|---|---|---|
| 이메일 | `trim().toLowerCase()` 동치 | `Admin@X.com` ↔ `admin@x.com` | `admin@x.co` |
| 금액 | **`new Decimal(a).eq(new Decimal(b))`** — 파싱 불가 시 불일치 | `100` ↔ `100.00` ↔ `100.` | `10`, `1000`, `1,00` |

**필수 규칙**

- **체크박스·"CONFIRM" 고정 문구·슬라이더·길게 누르기 — 어떤 변형도 금지**(AC-3 원문).
- **두 확인란 모두 붙여넣기 차단**(`onPaste` 무력화 + `autoComplete="off"`). 안내 문구 `confirmPasteBlocked`를
  칸 아래 상시 표시한다 — 차단만 하고 이유를 안 적으면 관리자는 **입력이 고장 났다**고 읽는다.
  **키보드 입력·IME·스크린리더는 절대 방해하지 않는다**(붙여넣기만 막는다).
- **placeholder에 정답을 넣지 않는다.** `placeholder="admin@x.com"` 은 확인을 **베끼기**로 만든다.
- **불일치 피드백은 blur 이후**에만 뜬다(타이핑 도중 빨간 글씨는 정상 입력 중에도 뜬다).
  두 칸을 **개별 메시지**로 처리한다(어느 칸이 틀렸는지 모르면 관리자는 둘 다 다시 친다).
- **제출 버튼은 두 칸 모두 일치할 때만 활성.** 그리고 **서버가 다시 검증한다**(§5 DC-3) —
  클라이언트 비활성화는 통제가 아니다.
- **모달 열림 = 멱등키 생성 시점**(§5 DC-6). 모달을 닫고 다시 열면 **새 키**, 같은 모달에서의
  재시도는 **같은 키**.

### 4.7 ⑩ 결과 패널

**성공 시 표시 항목(전부 필수):**

| 항목 | 키 | 왜 |
|---|---|---|
| 제목(방향별) | `resultCreditTitle` / `resultDebitTitle` | |
| 대상 · 금액 | `resultAmountLine` | |
| 새 잔고(가용 포함) | `resultNewBalance` | 다음 행동(체결/출금)의 전제 |
| **이 코인의 로컬 원장 부채 총액(L1)** | `resultLiability` | **AC-5-2 ⓒ가 감사 로그에 남기는 값을 화면에도 보여준다.** W-2("즉시 회사 부채")를 **숫자로 확인시키는 순간**이 여기다 |
| 원장 항목 id | `resultEntryId` | 사후 조사 진입점 |
| 감사 기록 고지 | `resultAuditNote` | |
| 멱등 리플레이 여부 | `resultReplay` | 재시도가 중복 발행이 아니었음을 **명시** |

**금지:**
- 성공 톤(*"성공적으로 지급되었습니다"*, *"완료!"*, 대형 초록 체크, 축하 애니메이션).
  특히 **"지급"** 은 rev05 CP-1의 금지 어휘 계열이다 — 이것은 지급이 아니라 **발행**이다.
- **결과 화면에서 곧바로 같은 폼을 재사용하지 않는다.** `resultAgain`을 눌러야 폼이 초기화된
  상태로 돌아온다(연속 실행을 관성으로 만들지 않는다).

### 4.8 ⑥ 방향 — 크레딧 / 차감(`ADMIN_ADJUSTMENT_DEBIT`)

**한 화면 · 두 모드 · 상호 배타 탭.** 근거: 차감은 크레딧의 **회수 경로**이며(AC-1 ⓐ의 정상 업무 흐름:
*"크레딧 → 스테이킹 → 검증 종료 후 회수"*), 별도 화면으로 분리하면 회수가 **잊힌다**(미해결 28).

**필수 규칙**
- **기본 선택은 크레딧이 아니라 "미선택"이 아니다** — 기본은 **크레딧**이되, **차감 탭은 색·아이콘·
  버튼 문구가 전부 다르다.** 두 모드가 같아 보이면 방향 오조작이 발생하고, 방향 오조작은
  §4.6의 타이핑 확인(이메일·금액)으로 **잡히지 않는다**(둘 다 같은 값이므로).
- **확인 모달 제목과 제출 버튼 문구에 방향이 반드시 들어간다**(`confirmSubmitCredit` / `confirmSubmitDebit`).
- 차감 모드에서는 미리보기의 **`available`을 강조**하고, 입력 금액이 그것을 넘으면
  **제출 전에** `errors.ADMIN_ADJUSTMENT_DEBIT_EXCEEDS_AVAILABLE`과 **같은 문구**를 인라인으로 보여준다.
  (서버가 최종 판정이지만, 관리자가 확인 모달까지 갔다가 거부당할 이유가 없다.)

---

## 5. 데이터 계약 (T-17 · `web-shared-expert`)

| ID | 요구 |
|---|---|
| **DC-1** | **`GET /api/admin/credit/context?coin=<symbol>`** — 화면 진입 시 1회. 응답: `{ enabled, coins:[{symbol, balanceAuthority, authorityAlertStage}], limits:[…], state:'ok'\|'error' }`. **`enabled`·`coins`·`limits` 중 하나라도 산출 실패면 `state:'error'`** 이고 클라이언트는 §3의 `LOAD_FAILED`로 간다. 부분 성공을 부분 렌더하지 않는다 |
| **DC-2** | **`GET /api/admin/credit/target?email=&coin=`** — `{ found, userId, email, balance, held, available, adminAdjustmentNet, state:'ok'\|'error' }`. **`found:false`와 `state:'error'`는 다른 필드다**(없는 사용자 ≠ 조회 실패). 어떤 경우에도 금액 필드에 `"0"`을 대입해 내려보내지 않는다 — 모르면 `null` |
| **DC-3** | **`POST /api/admin/credit`** 요청 본문: `{ direction:'CREDIT'\|'DEBIT', email, coin, amount, reasonType, description, confirmEmail, confirmAmount, idempotencyKey }`. **금지 필드: `createdByAdminId` · `createdByEmail` · `adjustmentReason` · `userId`.** 하나라도 오면 **400**(무시 아님 — AC-5-1). `confirmEmail`/`confirmAmount`는 서버가 **다시 비교**한다(§4.6과 동일 규칙) |
| **DC-4** | **`adjustmentReason`은 서버가 조립한다:** `` `${reasonType}: ${description}` ``. 접두사는 **로케일 라벨이 아니라 기계 토큰**(`E2E_VERIFICATION:` 등)이어야 한다 — 로케일 문자열을 저장하면 AC-4가 목표한 사후 집계가 언어별로 쪼개진다 |
| **DC-5** | **한도의 `limit` / `used` / `remaining`은 전부 서버 산출**이며, **거부를 판정하는 함수와 같은 함수**에서 나온다. 클라이언트는 뺄셈을 하지 않는다. `used`가 계산 불가면 `null`(→ `limitError`) |
| **DC-6** | **(신규 · J-5) `idempotencyKey`는 필수 입력이다.** 클라이언트가 확인 모달 진입 시 1회 생성(UUID)하고, 같은 모달에서의 재시도는 같은 키를 보낸다. 라우트는 **`ManagedCoin` 행 잠금(AC-7) 획득 직후, 한도 검사보다 먼저** 키 존재를 확인하고, 존재하면 **한도를 재검사하지 않고** 기존 결과를 `idempotentReplay:true`로 반환한다. **한도 재검사를 먼저 하면, 이미 성공한 크레딧의 재시도가 "한도 초과"로 렌더된다** |
| **DC-7** | 성공 응답: `{ entryId, direction, coin, amount, userEmail, balanceAfter, availableAfter, localLedgerBalanceTotalAfter, adminAdjustmentNetCreditTotalAfter, auditLogId, idempotentReplay }` |
| **DC-8** | 실패 응답: `{ ok:false, code, message, detail? }`. `code`는 §7의 토큰. **`detail`에는 화면이 문구를 구성하는 데 필요한 수치만**(`limit`/`used`/`remaining`/`balance`/`held`/`available`). **비밀·내부 스택은 절대 넣지 않는다** |
| **DC-9** | 출금 큐 데이터 계약 확장 — §8 참조 |

---

## 6. 입력 검증 규칙

| ID | 필드 | 규칙 | 위반 시 |
|---|---|---|---|
| **V1** | `email` | 필수. trim + lowercase. 형식 검사는 **느슨하게**(`@` 포함 정도) — 엄격한 정규식이 실제 계정을 막는 사고가 더 크다 | 인라인 문구 / 서버 `ADMIN_CREDIT_USER_NOT_FOUND` |
| **V2** | `amount` | 필수. **`decimal.js`로 파싱**(CLAUDE.md 규칙 2 — `Number()`/`parseFloat()` 금지). `> 0`, 유한. 천 단위 구분자·공백 입력은 **입력 즉시 정규화**해서 표시(확인 단계에서 형식 불일치 사고를 없앤다) | `amountInvalid` |
| **V3** | `amount` | 1회 상한 초과는 **제출 전 인라인 경고**(서버가 최종 판정) | `errors.ADMIN_CREDIT_LIMIT_PER_TX` |
| **V4** | `reasonType` | 4종 중 하나. **기본 선택 없음** | 진행 불가 |
| **V5** | `description` | trim + 공백 축약 후 코드포인트 길이 ≥ (`OTHER`면 20, 그 외 4) | `descriptionTooShort` / `descriptionRequired` |
| **V6** | `confirmEmail`/`confirmAmount` | §4.6 비교 규칙. **서버 재검증** | `errors.ADMIN_CREDIT_CONFIRMATION_MISMATCH` |
| **V7** | `coin` | **(신규 요구) `balanceAuthority = 'LOCAL'`인 `ManagedCoin`만 허용.** 선택지가 1개면 드롭다운이 아니라 **읽기 전용 칩**으로 렌더하되 **클라이언트에 코인 심볼을 하드코딩하지 않는다.** 0개면 상태 `NO_LOCAL_COIN` | 서버 거부 — 제안 코드 `ADMIN_CREDIT_COIN_NOT_LOCAL`(§13 E-3) |
| **V8** | `direction` | `CREDIT`/`DEBIT`. 차감은 **`available` 기준**(AC-11) | `errors.ADMIN_ADJUSTMENT_DEBIT_EXCEEDS_AVAILABLE` |

> **V7의 근거를 정확히 적는다.** `HUB` 권위 코인에 로컬 잔고를 만드는 것은 준비금 대시보드가
> **인시던트 코드 `HUB_COIN_HAS_LOCAL_BALANCE`로 경보하는 상태**다(`SolvencyIncidentBanner.tsx:19`).
> 즉 이 제약이 없으면, 관리자는 **경보를 울리는 상태를 버튼 한 번으로 제조**할 수 있다.
> rev05 §4A에는 이 제약이 없다 — 이 문서가 추가하는 통제이며, **좁히는 방향이므로 승인 범위 안**이다.

---

## 7. 에러 코드 → 표시 문구 매핑

**공통 규칙 3가지.**
1. **모든 에러 문구는 "다음에 무엇을 하라"를 포함한다.** *"실패했습니다"* 로 끝나는 문구는 이 화면에 없다.
2. **모르는 코드를 위한 렌더링이 반드시 있다.** 없으면 다음에 추가되는 코드가 **화면에서 투명해진다**
   (`SolvencyIncidentBanner`의 `UNKNOWN_CODE` 선례를 그대로 따른다).
3. **모르는 코드일 때 "실행되지 않았습니다"라고 단정하지 않는다.** 서버가 무엇을 했는지 화면은 모른다.
   정직한 문구는 *"결과를 확인할 수 없다"* + *"같은 확인 화면에서의 재시도는 중복 발행되지 않는다"*(DC-6)다.

| 코드 | HTTP | 키 | 문구의 핵심(6로케일은 §9) |
|---|---|---|---|
| `ADMIN_CREDIT_DISABLED` | 403 | `errors.ADMIN_CREDIT_DISABLED` | 꺼져 있음 · 설정에서 켤 수 있음 · **토글도 감사에 남음** |
| `ADMIN_CREDIT_LIMIT_PER_TX` | 400 | `errors.ADMIN_CREDIT_LIMIT_PER_TX` | 1회 상한 {limit} · **"여러 건으로 나누어 실행하지 말 것"** |
| `ADMIN_CREDIT_LIMIT_PER_DAY` | 400 | `errors.ADMIN_CREDIT_LIMIT_PER_DAY` | **내** 24h 합계가 상한 도달 · **롤링 회복**(리셋 아님) |
| `ADMIN_CREDIT_CUMULATIVE_CAP` | 400 | `errors.ADMIN_CREDIT_CUMULATIVE_CAP` | 이 코인 누적 **순증** 상한 도달 · **회수(차감)로 회복** · 상향은 별도 판단 |
| `ADMIN_CREDIT_CONFIRMATION_MISMATCH` | 400 | `errors.ADMIN_CREDIT_CONFIRMATION_MISMATCH` | 확인 입력 불일치 · **직접 입력 필요** |
| `ADMIN_ADJUSTMENT_DEBIT_EXCEEDS_AVAILABLE` | 400 | `errors.ADMIN_ADJUSTMENT_DEBIT_EXCEEDS_AVAILABLE` | 잔고 {balance} 중 {held}가 홀드 · 가용 {available} · **"먼저 만기·해제를 기다리거나 포지션을 정리"**(AC-11 원문) |
| `ADMIN_CREDIT_USER_NOT_FOUND` | 400 | `errors.ADMIN_CREDIT_USER_NOT_FOUND` | 철자 확인 · **이 화면은 계정을 만들지 않음** |
| `ADMIN_CREDIT_COIN_NOT_LOCAL` *(제안)* | 400 | `errors.ADMIN_CREDIT_COIN_NOT_LOCAL` | 로컬 권위 코인만 조정 가능 |
| *(그 외 전부)* | — | `errors.UNKNOWN` | 코드 원문 표시 · **결과 확인 불가** · 원장 확인 후 판단 · 같은 확인 화면 재시도는 중복 아님 |

> **`ADMIN_CREDIT_LIMIT_PER_TX` 문구가 "나누어 실행하지 말 것"을 반드시 포함하는 이유.**
> 1회 상한은 **가장 쉽게 우회되는 한도**다 — 5,000이 막히면 2,500을 두 번 하면 된다. 화면이
> 그 방법을 알려주지 않아도 관리자는 3초 만에 떠올린다. **떠올리는 것을 막을 수는 없으므로,
> 그것이 통제 우회임을 문구가 명시**한다. (기술적 차단은 24h·누적 한도의 몫이며, 우회 탐지는
> T-19 리뷰 범위다.)

---

## 8. AC-10 — 출금 승인 큐(`/admin/withdrawals`)의 표식

### 8.1 데이터 계약 (DC-9)

`WithdrawalRequest`(`web/src/utils/adminApi.ts:95-120`)에 **필드 1개 추가**:

```
adminAdjustmentNetCredit: string | null
  // 요청자의 해당 coin 관리자 조정 순증 (= Σ ADMIN_ADJUSTMENT_CREDIT − Σ ADMIN_ADJUSTMENT_DEBIT)
  // null = "산출하지 못함"(조회 실패). "0"과 절대 같은 값이 아니다.
```

- **서버가 판정한다**(A-8 IN-5 원리 승계 — 클라이언트는 렌더만).
- **`null`로 대체하는 `"0"` 폴백을 라우트에 넣지 않는다.** `.catch(() => '0')`은 이 필드에서 금지다.

### 8.2 렌더링 — (J-6) 4상태

기존 `isGrant` 배지(`admin/staking/page.tsx:439-443`)의 **구조를 그대로 승계**한다:
작은 pill, `text-[9px]~[10px] font-mono font-bold`, `rounded-full`, `border`, `data-testid`.

| 상태 | 조건 | 렌더 | 색 |
|---|---|---|---|
| **표식** | `net > 0` | `adminCreditMarker` — *"이 사용자의 잔고에는 관리자 조정 크레딧 {amount} {coin}이 포함되어 있습니다"* | **주의색(로즈·에메랄드 아님)** |
| **역표식** | `net < 0` | `adminCreditMarkerNegative` — *"관리자 조정 순차감 {amount} {coin}이 반영되어 있습니다"* | 중립색 |
| **없음** | `net == 0` | **아무것도 렌더하지 않는다** | — |
| **확인 불가** | `net == null` | `adminCreditMarkerUnknown` — *"확인하지 못했습니다 — '없음'이 아니라 '확인 불가'입니다"* | 중립색 |

**배치와 색의 제약**

- **배치: 금액 셀(`colAmount`) 아래 줄.** 사용자 셀이 아니다 — 이 표식은 *"누구인가"* 가 아니라
  *"나갈 돈의 출처 구성"* 에 대한 사실이다. 기존 `feeAmount`/`debitTotal` 보조행과 같은 자리다
  (`admin/withdrawals/page.tsx:189-195`).
- **색: 그 행에 이미 있는 두 배지와 구별되어야 한다.** 같은 행에 rail 배지(LOCAL=앰버 / HUB=블루)와
  status 배지(PENDING/AWAITING_ONCHAIN=앰버, PROCESSING=인디고, APPROVED=에메랄드, REJECTED=로즈)가
  있다. **앰버·인디고·에메랄드·로즈는 이미 다른 의미를 갖고 있으므로 재사용하지 않는다.**
  권고: **바이올렛 계열**(`violet-500/10` · `violet-300` · `violet-500/25`). **최종 토큰은 T-14.**
- **로즈 금지의 이유는 의미다.** 로즈는 이 관리자 표면 전체에서 *"위반/거부"* 이고,
  AC-10은 **차단이 아니라 표시**다. 로즈로 그리면 승인자는 이 행을 **거부해야 할 행**으로 읽는다.
- **승인/거부 버튼의 상태를 바꾸지 않는다.** `disabled`를 걸지 않고, 확인 대화상자 문구도 바꾸지 않는다.
- 표식 옆(또는 툴팁)에 `adminCreditMarkerHint` — *"판단 재료일 뿐이며 승인을 막지 않습니다"* 를 둔다.

### 8.3 카피의 귀속 제약 (중요)

**문구는 "이 사용자의 잔고"에 대한 진술이어야 하며, "이 출금"에 대한 진술이면 안 된다.**
잔고는 대체 가능(fungible)하므로 *"이 출금은 관리자가 만든 돈이다"* 는 **화면이 알 수 없는 주장**이다.
`net`이 출금 요청액보다 크든 작든 문구는 동일하다 — **금액 비교로 문구를 분기시키지 않는다.**
(분기시키면 그 분기 자체가 귀속 주장이 된다.)

---

## 9. 6로케일 카피 원문

> **네임스페이스 `adminCredit`(신규) + `adminWithdrawals` 4키 추가 + `nav.adminCredit` 1키.**
> 담당: `web-admin-expert`(T-18)가 `web/messages/{en,ko,ja,zh,vi,th}.json`에 반영.
> **키 패리티 필수**(AC-T16-21). 플레이스홀더 이름은 **6로케일 동일**해야 한다.

### 9.1 `en`

```json
"nav": { "adminCredit": "Balance adjustment" },
"adminCredit": {
  "pageTitle": "Admin balance adjustment",
  "pageSubtitle": "Creates or removes local balance for one user. Internal verification and reconciliation only.",
  "statusReady": "Enabled",
  "statusDisabled": "Off",
  "statusUnconfigured": "Limits not set",
  "statusCapReached": "Limit reached",
  "warnTitle": "Read this before you act",
  "warnPor": "This credit creates a spendable balance with no proof-of-reserve check.",
  "warnLiability": "The amount becomes the company's liability the moment it is created. This screen does not verify that reserves back it.",
  "warnNotWithdrawal": "This credit does not authorise an on-chain withdrawal. Sending funds still requires a separate approval and on-chain verification.",
  "scopeTitle": "Approved uses",
  "scopeBody": "Two uses only — seeding an internal end-to-end verification account, and correcting a reconciliation mismatch. Do not use for events, promotions, airdrops, deposits, or bulk payouts.",
  "disabledTitle": "Balance adjustment is off",
  "disabledBody": "This surface is off by default. Adjustments run only while it is on, and turning it on or off is itself recorded in the audit log.",
  "disabledWhere": "Turn it on in Platform Settings, and turn it off again when you are done.",
  "unconfiguredTitle": "Limits are not set, so nothing can be issued",
  "unconfiguredBody": "The per-transaction, 24-hour and cumulative limits must all be set before an adjustment can run. Unset does not mean unlimited — it means blocked.",
  "unavailableNoCoin": "No coin uses the local ledger. This screen can only adjust locally-authoritative coins.",
  "loadFailed": "Could not load this screen's data. A missing figure here means \"unknown\", not \"zero\". If a refresh does not fix it, do not run an adjustment.",
  "modeCredit": "Credit",
  "modeDebit": "Debit (recover)",
  "modeDebitHint": "Removes balance. Only the available part can be removed — anything held by a stake or a pending withdrawal cannot.",
  "fieldEmail": "Target user (email)",
  "fieldEmailPlaceholder": "Type the full email address",
  "fieldCoin": "Coin",
  "fieldAmount": "Amount",
  "fieldAmountPlaceholder": "e.g. 100",
  "amountInvalid": "Enter an amount greater than zero.",
  "fieldReason": "Reason type",
  "reasonSelect": "Select a reason type",
  "reasonE2E": "Internal E2E verification seed",
  "reasonRecon": "Reconciliation fix",
  "reasonIncident": "Incident compensation",
  "reasonOther": "Other",
  "fieldDescription": "Description",
  "descriptionPlaceholder": "What is this adjustment for? Include the run or incident it belongs to.",
  "descriptionRequired": "A description is required.",
  "descriptionTooShort": "Write at least {min} characters.",
  "targetTitle": "Target account",
  "targetBalance": "Balance",
  "targetHeld": "Held",
  "targetAvailable": "Available",
  "targetAdminNet": "Admin adjustments so far (net)",
  "targetHint": "Held covers stake principal and pending withdrawals. A debit can only take from the available part.",
  "targetLoading": "Looking up…",
  "targetError": "Could not read this account's balance. The figures above are unknown, not zero.",
  "targetNotFound": "No user with that email.",
  "limitsTitle": "Limits",
  "limitPerTx": "Per transaction",
  "limitPerDay": "Per 24 hours",
  "limitCumulative": "Cumulative net",
  "scopePerTx": "this adjustment",
  "scopePerDay": "you, rolling 24h",
  "scopeCumulative": "this coin, all admins",
  "limitUsed": "Used",
  "limitRemaining": "Remaining",
  "limitUnset": "Not set — blocked",
  "limitError": "Unknown",
  "limitRollingNote": "A rolling 24-hour total. There is no reset time — capacity comes back as older entries pass the 24-hour mark.",
  "review": "Review and confirm",
  "confirmTitleCredit": "Confirm credit",
  "confirmTitleDebit": "Confirm debit",
  "confirmTarget": "To",
  "confirmAmount": "Amount",
  "confirmReason": "Reason",
  "confirmTypeEmail": "Type the target email to confirm",
  "confirmTypeAmount": "Type the amount to confirm",
  "confirmMismatchEmail": "This does not match the email above.",
  "confirmMismatchAmount": "This does not match the amount above.",
  "confirmPasteBlocked": "Pasting is disabled here — type it yourself.",
  "confirmSubmitCredit": "Issue credit",
  "confirmSubmitDebit": "Remove balance",
  "cancel": "Cancel",
  "resultCreditTitle": "Credit issued",
  "resultDebitTitle": "Balance removed",
  "resultAmountLine": "{email} · {amount} {coin}",
  "resultNewBalance": "New balance {balance} {coin} (available {available})",
  "resultLiability": "Local ledger liability for this coin is now {total} {coin}.",
  "resultEntryId": "Ledger entry {id}",
  "resultAuditNote": "This adjustment is recorded in the audit log.",
  "resultReplay": "This request was already processed — nothing was issued twice.",
  "resultAgain": "Make another adjustment",
  "errors": {
    "ADMIN_CREDIT_DISABLED": "Balance adjustment is off. Turn it on in Platform Settings — the toggle itself is recorded in the audit log.",
    "ADMIN_CREDIT_LIMIT_PER_TX": "Over the per-transaction limit of {limit} {coin}. Do not split it into several smaller adjustments — if you genuinely need more, the limit itself has to be reviewed.",
    "ADMIN_CREDIT_LIMIT_PER_DAY": "Your own adjustments in the last 24 hours have reached the {limit} {coin} limit. There is no reset time — capacity comes back as older entries pass the 24-hour mark.",
    "ADMIN_CREDIT_CUMULATIVE_CAP": "Cumulative net adjustments for {coin} have reached the {limit} limit. Recovering balance with a debit frees capacity; raising the limit is a separate decision.",
    "ADMIN_CREDIT_CONFIRMATION_MISMATCH": "The confirmation entries do not match the form. Re-read the target email and the amount, and type them yourself.",
    "ADMIN_ADJUSTMENT_DEBIT_EXCEEDS_AVAILABLE": "More than this account can give up. Of {balance} {coin}, {held} is held by a stake or a pending withdrawal, so only {available} can be removed now. Wait for maturity or release, or clear the position first, then try again.",
    "ADMIN_CREDIT_USER_NOT_FOUND": "No user with that email. Check the spelling — this screen does not create accounts.",
    "ADMIN_CREDIT_COIN_NOT_LOCAL": "This coin is not locally authoritative. Only coins whose balance authority is LOCAL can be adjusted here.",
    "UNKNOWN": "The server returned a code this screen does not recognise ({code}). The outcome is unknown — check the ledger before deciding what to do. Retrying from the same confirmation screen will not issue twice."
  }
},
"adminWithdrawals": {
  "adminCreditMarker": "Balance includes {amount} {coin} of admin adjustment credit",
  "adminCreditMarkerNegative": "Balance reflects {amount} {coin} of net admin adjustment debit",
  "adminCreditMarkerUnknown": "Admin adjustment total unavailable — unknown, not none",
  "adminCreditMarkerHint": "Shown for your judgement. It does not block approval."
}
```

### 9.2 `ko`

```json
"nav": { "adminCredit": "잔고 조정" },
"adminCredit": {
  "pageTitle": "관리자 잔고 조정",
  "pageSubtitle": "한 명의 사용자에게 로컬 잔고를 생성하거나 회수합니다. 내부 검증과 대사 정정 전용입니다.",
  "statusReady": "사용 가능",
  "statusDisabled": "꺼짐",
  "statusUnconfigured": "한도 미설정",
  "statusCapReached": "한도 도달",
  "warnTitle": "실행 전에 읽으세요",
  "warnPor": "이 크레딧은 준비금 검증(PoR) 없이 즉시 사용 가능한 잔고를 생성합니다.",
  "warnLiability": "발행한 금액은 그 즉시 회사의 부채가 됩니다. 준비금이 이를 뒷받침하는지는 이 화면에서 검증되지 않습니다.",
  "warnNotWithdrawal": "이 크레딧은 온체인 인출을 승인하지 않습니다. 실제 출금은 별도의 승인과 온체인 검증을 거칩니다.",
  "scopeTitle": "승인된 용도",
  "scopeBody": "두 가지뿐입니다 — 내부 E2E 검증 계정 시드, 대사 불일치 수동 정정. 이벤트·프로모션·에어드랍 지급, 입금 대체, 일괄 지급에는 사용할 수 없습니다.",
  "disabledTitle": "잔고 조정이 꺼져 있습니다",
  "disabledBody": "이 기능은 기본적으로 꺼져 있습니다. 켜져 있는 동안에만 조정이 실행되며, 켜고 끈 것 자체가 감사 로그에 기록됩니다.",
  "disabledWhere": "플랫폼 설정에서 켤 수 있습니다. 작업이 끝나면 다시 끄세요.",
  "unconfiguredTitle": "한도가 설정되지 않아 실행할 수 없습니다",
  "unconfiguredBody": "1회·24시간·누적 상한이 모두 설정되어야 조정을 실행할 수 있습니다. 미설정은 무제한이 아니라 차단입니다.",
  "unavailableNoCoin": "로컬 원장을 쓰는 코인이 없습니다. 이 화면은 로컬 권위 코인만 조정할 수 있습니다.",
  "loadFailed": "화면 데이터를 불러오지 못했습니다. 여기서 비어 있는 값은 0이 아니라 확인 불가입니다. 새로고침해도 같으면 조정을 실행하지 마세요.",
  "modeCredit": "크레딧",
  "modeDebit": "차감(회수)",
  "modeDebitHint": "잔고를 줄입니다. 가용 잔고 안에서만 가능하며, 스테이킹·출금 대기로 묶인 금액은 차감할 수 없습니다.",
  "fieldEmail": "대상 사용자(이메일)",
  "fieldEmailPlaceholder": "이메일 주소를 전부 입력하세요",
  "fieldCoin": "코인",
  "fieldAmount": "금액",
  "fieldAmountPlaceholder": "예: 100",
  "amountInvalid": "0보다 큰 금액을 입력하세요.",
  "fieldReason": "사유 유형",
  "reasonSelect": "사유 유형을 선택하세요",
  "reasonE2E": "내부 E2E 검증 시드",
  "reasonRecon": "대사 불일치 정정",
  "reasonIncident": "인시던트 보상",
  "reasonOther": "기타",
  "fieldDescription": "서술",
  "descriptionPlaceholder": "무엇을 위한 조정인지, 어떤 검증 회차·인시던트에 속하는지 적으세요.",
  "descriptionRequired": "서술은 필수입니다.",
  "descriptionTooShort": "{min}자 이상 입력하세요.",
  "targetTitle": "대상 계정",
  "targetBalance": "잔고",
  "targetHeld": "홀드",
  "targetAvailable": "가용",
  "targetAdminNet": "지금까지의 관리자 조정(순증)",
  "targetHint": "홀드는 스테이킹 원금과 출금 대기로 묶인 금액입니다. 차감은 가용 잔고 안에서만 가능합니다.",
  "targetLoading": "조회 중…",
  "targetError": "이 계정의 잔고를 읽지 못했습니다. 위 수치는 0이 아니라 확인 불가입니다.",
  "targetNotFound": "그 이메일의 사용자가 없습니다.",
  "limitsTitle": "한도",
  "limitPerTx": "1회",
  "limitPerDay": "24시간",
  "limitCumulative": "누적 순증",
  "scopePerTx": "이번 조정 1건",
  "scopePerDay": "본인, 최근 24시간",
  "scopeCumulative": "이 코인 전체, 전 관리자",
  "limitUsed": "사용",
  "limitRemaining": "잔여",
  "limitUnset": "미설정 — 실행 불가",
  "limitError": "확인 불가",
  "limitRollingNote": "최근 24시간 기준 합계입니다. 정해진 리셋 시각은 없으며, 오래된 건이 24시간을 지나면 그만큼 회복됩니다.",
  "review": "확인 단계로",
  "confirmTitleCredit": "크레딧 발행 확인",
  "confirmTitleDebit": "차감 실행 확인",
  "confirmTarget": "대상",
  "confirmAmount": "금액",
  "confirmReason": "사유",
  "confirmTypeEmail": "대상 이메일을 직접 입력해 확인하세요",
  "confirmTypeAmount": "금액을 직접 입력해 확인하세요",
  "confirmMismatchEmail": "위의 이메일과 다릅니다.",
  "confirmMismatchAmount": "위의 금액과 다릅니다.",
  "confirmPasteBlocked": "이 칸은 붙여넣기가 되지 않습니다 — 직접 입력하세요.",
  "confirmSubmitCredit": "크레딧 발행",
  "confirmSubmitDebit": "잔고 차감",
  "cancel": "취소",
  "resultCreditTitle": "크레딧이 발행되었습니다",
  "resultDebitTitle": "잔고가 차감되었습니다",
  "resultAmountLine": "{email} · {amount} {coin}",
  "resultNewBalance": "새 잔고 {balance} {coin}(가용 {available})",
  "resultLiability": "이 코인의 로컬 원장 부채 총액은 이제 {total} {coin}입니다.",
  "resultEntryId": "원장 항목 {id}",
  "resultAuditNote": "이 조정은 감사 로그에 기록되었습니다.",
  "resultReplay": "이미 처리된 요청입니다 — 중복 발행되지 않았습니다.",
  "resultAgain": "다른 조정 실행",
  "errors": {
    "ADMIN_CREDIT_DISABLED": "잔고 조정이 꺼져 있습니다. 플랫폼 설정에서 켤 수 있으며, 토글 자체가 감사 로그에 기록됩니다.",
    "ADMIN_CREDIT_LIMIT_PER_TX": "1회 상한 {limit} {coin}을 초과했습니다. 여러 건으로 나누어 실행하지 마세요 — 정말 더 필요하다면 상한 자체를 재검토해야 합니다.",
    "ADMIN_CREDIT_LIMIT_PER_DAY": "최근 24시간 동안 본인이 실행한 조정 합계가 상한 {limit} {coin}에 도달했습니다. 정해진 리셋 시각은 없으며, 오래된 건이 24시간을 지나면 그만큼 회복됩니다.",
    "ADMIN_CREDIT_CUMULATIVE_CAP": "{coin}의 누적 순증이 상한 {limit}에 도달했습니다. 차감으로 회수하면 한도가 회복되며, 상한 상향은 별도의 판단입니다.",
    "ADMIN_CREDIT_CONFIRMATION_MISMATCH": "확인 입력이 폼의 값과 일치하지 않습니다. 대상 이메일과 금액을 다시 읽고 직접 입력하세요.",
    "ADMIN_ADJUSTMENT_DEBIT_EXCEEDS_AVAILABLE": "이 계정이 내놓을 수 있는 금액을 넘습니다. 잔고 {balance} {coin} 중 {held}가 스테이킹·출금 대기로 묶여 있어 지금 차감 가능한 금액은 {available}입니다. 먼저 만기·해제를 기다리거나 포지션을 정리한 뒤 다시 시도하세요.",
    "ADMIN_CREDIT_USER_NOT_FOUND": "그 이메일의 사용자가 없습니다. 철자를 확인하세요 — 이 화면은 계정을 만들지 않습니다.",
    "ADMIN_CREDIT_COIN_NOT_LOCAL": "이 코인은 로컬 권위 코인이 아닙니다. 잔고 권위가 LOCAL인 코인만 여기서 조정할 수 있습니다.",
    "UNKNOWN": "이 화면이 모르는 코드가 반환되었습니다({code}). 결과를 확인할 수 없으니 원장을 먼저 확인한 뒤 판단하세요. 같은 확인 화면에서의 재시도는 중복 발행되지 않습니다."
  }
},
"adminWithdrawals": {
  "adminCreditMarker": "이 사용자의 잔고에는 관리자 조정 크레딧 {amount} {coin}이 포함되어 있습니다",
  "adminCreditMarkerNegative": "이 사용자의 잔고에는 관리자 조정 순차감 {amount} {coin}이 반영되어 있습니다",
  "adminCreditMarkerUnknown": "관리자 조정 내역을 확인하지 못했습니다 — 없음이 아니라 확인 불가입니다",
  "adminCreditMarkerHint": "판단 재료일 뿐이며 승인을 막지 않습니다."
}
```

### 9.3 `ja`

```json
"nav": { "adminCredit": "残高調整" },
"adminCredit": {
  "pageTitle": "管理者残高調整",
  "pageSubtitle": "ユーザー1名のローカル残高を生成または回収します。内部検証と照合修正の専用機能です。",
  "statusReady": "利用可能",
  "statusDisabled": "オフ",
  "statusUnconfigured": "上限が未設定",
  "statusCapReached": "上限に到達",
  "warnTitle": "実行する前にお読みください",
  "warnPor": "このクレジットは、準備金証明（PoR）の検証なしに、即座に利用可能な残高を生成します。",
  "warnLiability": "発行した金額は、その時点で会社の負債になります。準備金が裏付けているかどうかは、この画面では検証されません。",
  "warnNotWithdrawal": "このクレジットはオンチェーン出金を承認しません。実際の出金には別途の承認とオンチェーン検証が必要です。",
  "scopeTitle": "承認された用途",
  "scopeBody": "2つだけです — 内部E2E検証アカウントのシード、照合不一致の手動修正。イベント・プロモーション・エアドロップの配布、入金の代替、一括付与には使用できません。",
  "disabledTitle": "残高調整はオフです",
  "disabledBody": "この機能は既定でオフです。オンの間だけ調整が実行され、オン・オフの切り替え自体が監査ログに記録されます。",
  "disabledWhere": "プラットフォーム設定でオンにできます。作業が終わったら必ずオフに戻してください。",
  "unconfiguredTitle": "上限が未設定のため実行できません",
  "unconfiguredBody": "1回・24時間・累計の上限がすべて設定されている場合のみ調整を実行できます。未設定は無制限ではなく、ブロックを意味します。",
  "unavailableNoCoin": "ローカル台帳を使用するコインがありません。この画面はローカル権限のコインのみ調整できます。",
  "loadFailed": "この画面のデータを読み込めませんでした。ここで空欄の値は「0」ではなく「不明」です。再読み込みしても同じ場合は、調整を実行しないでください。",
  "modeCredit": "クレジット",
  "modeDebit": "差引（回収）",
  "modeDebitHint": "残高を減らします。利用可能額の範囲内のみ可能で、ステーキングや出金待ちで拘束された分は差し引けません。",
  "fieldEmail": "対象ユーザー（メール）",
  "fieldEmailPlaceholder": "メールアドレスを全文入力してください",
  "fieldCoin": "コイン",
  "fieldAmount": "金額",
  "fieldAmountPlaceholder": "例: 100",
  "amountInvalid": "0より大きい金額を入力してください。",
  "fieldReason": "理由の種別",
  "reasonSelect": "理由の種別を選択してください",
  "reasonE2E": "内部E2E検証シード",
  "reasonRecon": "照合不一致の修正",
  "reasonIncident": "インシデント補償",
  "reasonOther": "その他",
  "fieldDescription": "説明",
  "descriptionPlaceholder": "何のための調整か、どの検証回・インシデントに属するかを記入してください。",
  "descriptionRequired": "説明は必須です。",
  "descriptionTooShort": "{min}文字以上入力してください。",
  "targetTitle": "対象アカウント",
  "targetBalance": "残高",
  "targetHeld": "拘束中",
  "targetAvailable": "利用可能",
  "targetAdminNet": "これまでの管理者調整（純増）",
  "targetHint": "拘束中は、ステーキング元本と出金待ちの金額です。差引は利用可能額の範囲内のみ可能です。",
  "targetLoading": "照会中…",
  "targetError": "このアカウントの残高を読み取れませんでした。上の数値は0ではなく不明です。",
  "targetNotFound": "そのメールアドレスのユーザーは存在しません。",
  "limitsTitle": "上限",
  "limitPerTx": "1回",
  "limitPerDay": "24時間",
  "limitCumulative": "累計純増",
  "scopePerTx": "今回の調整1件",
  "scopePerDay": "本人・直近24時間",
  "scopeCumulative": "このコイン全体・全管理者",
  "limitUsed": "使用",
  "limitRemaining": "残り",
  "limitUnset": "未設定 — 実行不可",
  "limitError": "不明",
  "limitRollingNote": "直近24時間の合計です。決まったリセット時刻はなく、古い件が24時間を過ぎるとその分だけ回復します。",
  "review": "確認へ進む",
  "confirmTitleCredit": "クレジット発行の確認",
  "confirmTitleDebit": "差引実行の確認",
  "confirmTarget": "対象",
  "confirmAmount": "金額",
  "confirmReason": "理由",
  "confirmTypeEmail": "対象のメールアドレスを自分で入力して確認してください",
  "confirmTypeAmount": "金額を自分で入力して確認してください",
  "confirmMismatchEmail": "上のメールアドレスと一致しません。",
  "confirmMismatchAmount": "上の金額と一致しません。",
  "confirmPasteBlocked": "この欄は貼り付けできません — 自分で入力してください。",
  "confirmSubmitCredit": "クレジットを発行",
  "confirmSubmitDebit": "残高を差し引く",
  "cancel": "キャンセル",
  "resultCreditTitle": "クレジットを発行しました",
  "resultDebitTitle": "残高を差し引きました",
  "resultAmountLine": "{email} · {amount} {coin}",
  "resultNewBalance": "新しい残高 {balance} {coin}（利用可能 {available}）",
  "resultLiability": "このコインのローカル台帳負債の合計は現在 {total} {coin} です。",
  "resultEntryId": "台帳エントリ {id}",
  "resultAuditNote": "この調整は監査ログに記録されました。",
  "resultReplay": "すでに処理済みのリクエストです — 二重に発行されていません。",
  "resultAgain": "別の調整を行う",
  "errors": {
    "ADMIN_CREDIT_DISABLED": "残高調整はオフです。プラットフォーム設定でオンにできます。切り替え自体も監査ログに記録されます。",
    "ADMIN_CREDIT_LIMIT_PER_TX": "1回の上限 {limit} {coin} を超えています。複数回に分けて実行しないでください — 本当に必要であれば、上限そのものを見直す必要があります。",
    "ADMIN_CREDIT_LIMIT_PER_DAY": "直近24時間にご自身が実行した調整の合計が上限 {limit} {coin} に達しました。決まったリセット時刻はなく、古い件が24時間を過ぎるとその分だけ回復します。",
    "ADMIN_CREDIT_CUMULATIVE_CAP": "{coin} の累計純増が上限 {limit} に達しました。差引で回収すると上限に余裕が戻ります。上限の引き上げは別途の判断です。",
    "ADMIN_CREDIT_CONFIRMATION_MISMATCH": "確認入力がフォームの値と一致しません。対象のメールアドレスと金額をもう一度読み、自分で入力してください。",
    "ADMIN_ADJUSTMENT_DEBIT_EXCEEDS_AVAILABLE": "このアカウントが差し出せる額を超えています。残高 {balance} {coin} のうち {held} がステーキング・出金待ちで拘束されているため、今差し引けるのは {available} です。まず満期・解除を待つかポジションを整理してから、もう一度お試しください。",
    "ADMIN_CREDIT_USER_NOT_FOUND": "そのメールアドレスのユーザーは存在しません。綴りをご確認ください — この画面はアカウントを作成しません。",
    "ADMIN_CREDIT_COIN_NOT_LOCAL": "このコインはローカル権限ではありません。残高権限が LOCAL のコインのみここで調整できます。",
    "UNKNOWN": "この画面が認識できないコードが返されました（{code}）。結果を確認できないため、台帳を確認してから判断してください。同じ確認画面からの再試行で二重発行されることはありません。"
  }
},
"adminWithdrawals": {
  "adminCreditMarker": "このユーザーの残高には管理者調整クレジット {amount} {coin} が含まれています",
  "adminCreditMarkerNegative": "このユーザーの残高には管理者調整の純差引 {amount} {coin} が反映されています",
  "adminCreditMarkerUnknown": "管理者調整の内訳を確認できませんでした — 「なし」ではなく「不明」です",
  "adminCreditMarkerHint": "判断材料としての表示であり、承認を妨げるものではありません。"
}
```

### 9.4 `zh`

```json
"nav": { "adminCredit": "余额调整" },
"adminCredit": {
  "pageTitle": "管理员余额调整",
  "pageSubtitle": "为单个用户生成或收回本地余额。仅用于内部验证与对账修正。",
  "statusReady": "可用",
  "statusDisabled": "已关闭",
  "statusUnconfigured": "未设置上限",
  "statusCapReached": "已达上限",
  "warnTitle": "执行前请先阅读",
  "warnPor": "此额度将在未经储备金证明（PoR）验证的情况下，立即生成可用余额。",
  "warnLiability": "发放的金额在生成的瞬间即成为公司的负债。本页面不会验证储备金是否足以支撑该金额。",
  "warnNotWithdrawal": "此额度不代表批准链上提现。实际提现仍需另行审批并通过链上验证。",
  "scopeTitle": "已批准的用途",
  "scopeBody": "仅两种 — 为内部端到端验证账户注入种子余额，以及手动修正对账差异。不得用于活动、推广、空投发放、替代充值或批量发放。",
  "disabledTitle": "余额调整已关闭",
  "disabledBody": "此功能默认关闭。只有在开启期间才能执行调整，且开启与关闭本身都会记入审计日志。",
  "disabledWhere": "可在平台设置中开启。操作完成后请重新关闭。",
  "unconfiguredTitle": "未设置上限，无法执行",
  "unconfiguredBody": "必须同时设置单次、24小时与累计上限后才能执行调整。未设置不等于无限制，而是被阻止。",
  "unavailableNoCoin": "没有使用本地账本的币种。本页面只能调整本地权威币种。",
  "loadFailed": "无法加载本页面的数据。此处的空值表示“未知”，而非“0”。若刷新后仍然如此，请勿执行调整。",
  "modeCredit": "增加",
  "modeDebit": "扣减（收回）",
  "modeDebitHint": "减少余额。仅可在可用余额范围内扣减，被质押或提现待处理锁定的部分无法扣减。",
  "fieldEmail": "目标用户（邮箱）",
  "fieldEmailPlaceholder": "请完整输入邮箱地址",
  "fieldCoin": "币种",
  "fieldAmount": "金额",
  "fieldAmountPlaceholder": "例如 100",
  "amountInvalid": "请输入大于 0 的金额。",
  "fieldReason": "原因类型",
  "reasonSelect": "请选择原因类型",
  "reasonE2E": "内部端到端验证种子",
  "reasonRecon": "对账差异修正",
  "reasonIncident": "事故补偿",
  "reasonOther": "其他",
  "fieldDescription": "说明",
  "descriptionPlaceholder": "请说明此次调整的用途，以及所属的验证批次或事故编号。",
  "descriptionRequired": "说明为必填项。",
  "descriptionTooShort": "请至少输入 {min} 个字符。",
  "targetTitle": "目标账户",
  "targetBalance": "余额",
  "targetHeld": "锁定",
  "targetAvailable": "可用",
  "targetAdminNet": "迄今的管理员调整（净增）",
  "targetHint": "锁定包含质押本金与待处理提现。扣减只能在可用余额范围内进行。",
  "targetLoading": "查询中…",
  "targetError": "无法读取该账户余额。以上数值为未知，而非 0。",
  "targetNotFound": "不存在使用该邮箱的用户。",
  "limitsTitle": "上限",
  "limitPerTx": "单次",
  "limitPerDay": "24小时",
  "limitCumulative": "累计净增",
  "scopePerTx": "本次调整",
  "scopePerDay": "本人，滚动 24 小时",
  "scopeCumulative": "该币种全部，全体管理员",
  "limitUsed": "已用",
  "limitRemaining": "剩余",
  "limitUnset": "未设置 — 无法执行",
  "limitError": "未知",
  "limitRollingNote": "为最近 24 小时的滚动合计。没有固定的重置时间；较早的记录超过 24 小时后，额度会相应恢复。",
  "review": "进入确认",
  "confirmTitleCredit": "确认发放额度",
  "confirmTitleDebit": "确认执行扣减",
  "confirmTarget": "目标",
  "confirmAmount": "金额",
  "confirmReason": "原因",
  "confirmTypeEmail": "请手动输入目标邮箱以确认",
  "confirmTypeAmount": "请手动输入金额以确认",
  "confirmMismatchEmail": "与上方的邮箱不一致。",
  "confirmMismatchAmount": "与上方的金额不一致。",
  "confirmPasteBlocked": "此处已禁用粘贴 — 请手动输入。",
  "confirmSubmitCredit": "发放额度",
  "confirmSubmitDebit": "扣减余额",
  "cancel": "取消",
  "resultCreditTitle": "额度已发放",
  "resultDebitTitle": "余额已扣减",
  "resultAmountLine": "{email} · {amount} {coin}",
  "resultNewBalance": "新余额 {balance} {coin}（可用 {available}）",
  "resultLiability": "该币种的本地账本负债总额现为 {total} {coin}。",
  "resultEntryId": "账本条目 {id}",
  "resultAuditNote": "本次调整已记入审计日志。",
  "resultReplay": "该请求此前已处理 — 未重复发放。",
  "resultAgain": "执行其他调整",
  "errors": {
    "ADMIN_CREDIT_DISABLED": "余额调整已关闭。可在平台设置中开启，开关操作本身也会记入审计日志。",
    "ADMIN_CREDIT_LIMIT_PER_TX": "超过单次上限 {limit} {coin}。请勿拆分为多笔执行 — 若确有需要，应重新审视上限本身。",
    "ADMIN_CREDIT_LIMIT_PER_DAY": "您本人在最近 24 小时内的调整合计已达上限 {limit} {coin}。没有固定的重置时间；较早的记录超过 24 小时后，额度会相应恢复。",
    "ADMIN_CREDIT_CUMULATIVE_CAP": "{coin} 的累计净增已达上限 {limit}。通过扣减收回可释放额度；上调上限属于另一项决策。",
    "ADMIN_CREDIT_CONFIRMATION_MISMATCH": "确认输入与表单内容不一致。请重新阅读目标邮箱与金额，并手动输入。",
    "ADMIN_ADJUSTMENT_DEBIT_EXCEEDS_AVAILABLE": "超出该账户可交出的金额。余额 {balance} {coin} 中有 {held} 被质押或待处理提现锁定，当前仅可扣减 {available}。请先等待到期或解锁，或清理相关仓位后再试。",
    "ADMIN_CREDIT_USER_NOT_FOUND": "不存在使用该邮箱的用户。请检查拼写 — 本页面不会创建账户。",
    "ADMIN_CREDIT_COIN_NOT_LOCAL": "该币种不是本地权威币种。只有余额权威为 LOCAL 的币种才能在此调整。",
    "UNKNOWN": "服务器返回了本页面无法识别的代码（{code}）。结果未知，请先核对账本再决定后续操作。在同一确认页面重试不会重复发放。"
  }
},
"adminWithdrawals": {
  "adminCreditMarker": "该用户的余额中包含管理员调整额度 {amount} {coin}",
  "adminCreditMarkerNegative": "该用户的余额中已反映管理员调整净扣减 {amount} {coin}",
  "adminCreditMarkerUnknown": "无法确认管理员调整记录 — 是“未知”，而非“没有”",
  "adminCreditMarkerHint": "仅作为判断参考，不会阻止审批。"
}
```

### 9.5 `vi`

```json
"nav": { "adminCredit": "Điều chỉnh số dư" },
"adminCredit": {
  "pageTitle": "Điều chỉnh số dư (quản trị)",
  "pageSubtitle": "Tạo hoặc thu hồi số dư nội bộ cho một người dùng. Chỉ dùng để kiểm chứng nội bộ và sửa lệch đối soát.",
  "statusReady": "Đang bật",
  "statusDisabled": "Đã tắt",
  "statusUnconfigured": "Chưa đặt hạn mức",
  "statusCapReached": "Đã chạm hạn mức",
  "warnTitle": "Đọc trước khi thực hiện",
  "warnPor": "Khoản ghi có này tạo ra số dư khả dụng ngay lập tức mà không qua kiểm chứng dự trữ (PoR).",
  "warnLiability": "Số tiền phát hành trở thành nợ của công ty ngay tại thời điểm tạo. Màn hình này không kiểm chứng dự trữ có bảo chứng cho khoản đó hay không.",
  "warnNotWithdrawal": "Khoản ghi có này không phê duyệt rút tiền on-chain. Việc rút tiền thực tế vẫn cần phê duyệt riêng và kiểm chứng on-chain.",
  "scopeTitle": "Mục đích được phê duyệt",
  "scopeBody": "Chỉ hai mục đích — cấp số dư mồi cho tài khoản kiểm chứng E2E nội bộ, và sửa lệch đối soát thủ công. Không dùng cho sự kiện, khuyến mãi, airdrop, thay cho nạp tiền, hay chi trả hàng loạt.",
  "disabledTitle": "Điều chỉnh số dư đang tắt",
  "disabledBody": "Chức năng này mặc định tắt. Chỉ khi bật mới thực hiện được điều chỉnh, và việc bật/tắt cũng được ghi vào nhật ký kiểm toán.",
  "disabledWhere": "Có thể bật trong Cài đặt nền tảng. Hãy tắt lại sau khi hoàn tất.",
  "unconfiguredTitle": "Chưa đặt hạn mức nên không thể thực hiện",
  "unconfiguredBody": "Phải đặt đủ cả ba hạn mức: mỗi lần, 24 giờ và luỹ kế. Chưa đặt không có nghĩa là không giới hạn — nghĩa là bị chặn.",
  "unavailableNoCoin": "Không có đồng nào dùng sổ cái nội bộ. Màn hình này chỉ điều chỉnh được các đồng có thẩm quyền số dư nội bộ.",
  "loadFailed": "Không tải được dữ liệu của màn hình này. Ô trống ở đây nghĩa là \"không rõ\", không phải \"0\". Nếu tải lại vẫn vậy, đừng thực hiện điều chỉnh.",
  "modeCredit": "Ghi có",
  "modeDebit": "Ghi nợ (thu hồi)",
  "modeDebitHint": "Giảm số dư. Chỉ trừ được trong phần khả dụng; phần đang bị giữ bởi staking hoặc lệnh rút chờ xử lý thì không.",
  "fieldEmail": "Người dùng đích (email)",
  "fieldEmailPlaceholder": "Nhập đầy đủ địa chỉ email",
  "fieldCoin": "Đồng",
  "fieldAmount": "Số lượng",
  "fieldAmountPlaceholder": "ví dụ 100",
  "amountInvalid": "Nhập số lớn hơn 0.",
  "fieldReason": "Loại lý do",
  "reasonSelect": "Chọn loại lý do",
  "reasonE2E": "Số dư mồi cho kiểm chứng E2E nội bộ",
  "reasonRecon": "Sửa lệch đối soát",
  "reasonIncident": "Bồi thường sự cố",
  "reasonOther": "Khác",
  "fieldDescription": "Diễn giải",
  "descriptionPlaceholder": "Điều chỉnh này để làm gì, thuộc đợt kiểm chứng hay sự cố nào?",
  "descriptionRequired": "Bắt buộc nhập diễn giải.",
  "descriptionTooShort": "Nhập ít nhất {min} ký tự.",
  "targetTitle": "Tài khoản đích",
  "targetBalance": "Số dư",
  "targetHeld": "Đang giữ",
  "targetAvailable": "Khả dụng",
  "targetAdminNet": "Điều chỉnh của quản trị đến nay (ròng)",
  "targetHint": "Phần đang giữ gồm tiền gốc staking và lệnh rút chờ xử lý. Ghi nợ chỉ thực hiện được trong phần khả dụng.",
  "targetLoading": "Đang tra cứu…",
  "targetError": "Không đọc được số dư của tài khoản này. Các số ở trên là không rõ, không phải 0.",
  "targetNotFound": "Không có người dùng với email đó.",
  "limitsTitle": "Hạn mức",
  "limitPerTx": "Mỗi lần",
  "limitPerDay": "24 giờ",
  "limitCumulative": "Luỹ kế ròng",
  "scopePerTx": "lần điều chỉnh này",
  "scopePerDay": "chính bạn, 24h trượt",
  "scopeCumulative": "đồng này, mọi quản trị viên",
  "limitUsed": "Đã dùng",
  "limitRemaining": "Còn lại",
  "limitUnset": "Chưa đặt — bị chặn",
  "limitError": "Không rõ",
  "limitRollingNote": "Tổng theo 24 giờ trượt. Không có mốc đặt lại; hạn mức hồi lại khi các bản ghi cũ vượt qua mốc 24 giờ.",
  "review": "Sang bước xác nhận",
  "confirmTitleCredit": "Xác nhận ghi có",
  "confirmTitleDebit": "Xác nhận ghi nợ",
  "confirmTarget": "Đến",
  "confirmAmount": "Số lượng",
  "confirmReason": "Lý do",
  "confirmTypeEmail": "Tự gõ lại email đích để xác nhận",
  "confirmTypeAmount": "Tự gõ lại số lượng để xác nhận",
  "confirmMismatchEmail": "Không khớp với email ở trên.",
  "confirmMismatchAmount": "Không khớp với số lượng ở trên.",
  "confirmPasteBlocked": "Ô này không cho dán — hãy tự gõ.",
  "confirmSubmitCredit": "Phát hành ghi có",
  "confirmSubmitDebit": "Trừ số dư",
  "cancel": "Huỷ",
  "resultCreditTitle": "Đã phát hành ghi có",
  "resultDebitTitle": "Đã trừ số dư",
  "resultAmountLine": "{email} · {amount} {coin}",
  "resultNewBalance": "Số dư mới {balance} {coin} (khả dụng {available})",
  "resultLiability": "Tổng nợ sổ cái nội bộ của đồng này hiện là {total} {coin}.",
  "resultEntryId": "Bút toán {id}",
  "resultAuditNote": "Điều chỉnh này đã được ghi vào nhật ký kiểm toán.",
  "resultReplay": "Yêu cầu này đã được xử lý trước đó — không phát hành trùng.",
  "resultAgain": "Thực hiện điều chỉnh khác",
  "errors": {
    "ADMIN_CREDIT_DISABLED": "Điều chỉnh số dư đang tắt. Bạn có thể bật trong Cài đặt nền tảng; thao tác bật/tắt cũng được ghi vào nhật ký kiểm toán.",
    "ADMIN_CREDIT_LIMIT_PER_TX": "Vượt hạn mức mỗi lần là {limit} {coin}. Đừng chia nhỏ thành nhiều lần — nếu thực sự cần nhiều hơn, phải xem xét lại chính hạn mức đó.",
    "ADMIN_CREDIT_LIMIT_PER_DAY": "Tổng điều chỉnh của chính bạn trong 24 giờ qua đã chạm hạn mức {limit} {coin}. Không có mốc đặt lại; hạn mức hồi lại khi các bản ghi cũ vượt qua mốc 24 giờ.",
    "ADMIN_CREDIT_CUMULATIVE_CAP": "Luỹ kế ròng của {coin} đã chạm hạn mức {limit}. Thu hồi bằng ghi nợ sẽ giải phóng hạn mức; nâng hạn mức là một quyết định riêng.",
    "ADMIN_CREDIT_CONFIRMATION_MISMATCH": "Nội dung xác nhận không khớp với biểu mẫu. Hãy đọc lại email đích và số lượng, rồi tự gõ.",
    "ADMIN_ADJUSTMENT_DEBIT_EXCEEDS_AVAILABLE": "Vượt quá số mà tài khoản này có thể nhả ra. Trong {balance} {coin}, có {held} đang bị giữ bởi staking hoặc lệnh rút chờ xử lý, nên hiện chỉ trừ được {available}. Hãy chờ đáo hạn/giải phóng hoặc xử lý vị thế trước, rồi thử lại.",
    "ADMIN_CREDIT_USER_NOT_FOUND": "Không có người dùng với email đó. Kiểm tra lại chính tả — màn hình này không tạo tài khoản.",
    "ADMIN_CREDIT_COIN_NOT_LOCAL": "Đồng này không thuộc thẩm quyền số dư nội bộ. Chỉ các đồng có thẩm quyền LOCAL mới điều chỉnh được ở đây.",
    "UNKNOWN": "Máy chủ trả về mã mà màn hình này không nhận biết ({code}). Không xác định được kết quả — hãy kiểm tra sổ cái trước khi quyết định. Thử lại từ cùng màn hình xác nhận sẽ không phát hành trùng."
  }
},
"adminWithdrawals": {
  "adminCreditMarker": "Số dư của người dùng này bao gồm {amount} {coin} ghi có từ điều chỉnh của quản trị",
  "adminCreditMarkerNegative": "Số dư của người dùng này đã phản ánh {amount} {coin} ghi nợ ròng từ điều chỉnh của quản trị",
  "adminCreditMarkerUnknown": "Không xác định được điều chỉnh của quản trị — là \"không rõ\", không phải \"không có\"",
  "adminCreditMarkerHint": "Chỉ là thông tin để bạn cân nhắc; không chặn việc phê duyệt."
}
```

### 9.6 `th`

```json
"nav": { "adminCredit": "การปรับยอดคงเหลือ" },
"adminCredit": {
  "pageTitle": "การปรับยอดคงเหลือโดยผู้ดูแล",
  "pageSubtitle": "สร้างหรือเรียกคืนยอดคงเหลือภายในของผู้ใช้หนึ่งราย ใช้เพื่อการตรวจสอบภายในและการแก้ไขการกระทบยอดเท่านั้น",
  "statusReady": "ใช้งานได้",
  "statusDisabled": "ปิดอยู่",
  "statusUnconfigured": "ยังไม่ได้ตั้งวงเงิน",
  "statusCapReached": "ถึงวงเงินแล้ว",
  "warnTitle": "อ่านก่อนดำเนินการ",
  "warnPor": "เครดิตนี้สร้างยอดคงเหลือที่ใช้ได้ทันที โดยไม่ผ่านการตรวจสอบเงินสำรอง (PoR)",
  "warnLiability": "จำนวนที่ออกให้จะกลายเป็นหนี้สินของบริษัททันทีที่สร้าง หน้าจอนี้ไม่ได้ตรวจสอบว่ามีเงินสำรองรองรับหรือไม่",
  "warnNotWithdrawal": "เครดิตนี้ไม่ได้อนุมัติการถอนบนเชน การถอนจริงยังต้องผ่านการอนุมัติแยกต่างหากและการตรวจสอบบนเชน",
  "scopeTitle": "การใช้งานที่ได้รับอนุมัติ",
  "scopeBody": "มีเพียงสองกรณี — การให้ยอดตั้งต้นแก่บัญชีทดสอบ E2E ภายใน และการแก้ไขความคลาดเคลื่อนของการกระทบยอดด้วยมือ ห้ามใช้กับกิจกรรม โปรโมชัน แอร์ดรอป การแทนการฝาก หรือการจ่ายเป็นชุด",
  "disabledTitle": "การปรับยอดคงเหลือถูกปิดอยู่",
  "disabledBody": "ฟังก์ชันนี้ปิดไว้เป็นค่าเริ่มต้น จะปรับได้เฉพาะช่วงที่เปิดเท่านั้น และการเปิด-ปิดเองก็ถูกบันทึกในบันทึกการตรวจสอบ",
  "disabledWhere": "เปิดได้ที่การตั้งค่าแพลตฟอร์ม และปิดกลับเมื่อทำงานเสร็จ",
  "unconfiguredTitle": "ยังไม่ได้ตั้งวงเงิน จึงดำเนินการไม่ได้",
  "unconfiguredBody": "ต้องตั้งวงเงินครบทั้งสามแบบ คือ ต่อครั้ง ต่อ 24 ชั่วโมง และสะสม จึงจะดำเนินการได้ การไม่ตั้งค่าไม่ได้แปลว่าไม่จำกัด แต่แปลว่าถูกบล็อก",
  "unavailableNoCoin": "ไม่มีเหรียญที่ใช้บัญชีแยกประเภทภายใน หน้าจอนี้ปรับได้เฉพาะเหรียญที่ยอดคงเหลืออยู่ภายในระบบเท่านั้น",
  "loadFailed": "โหลดข้อมูลของหน้านี้ไม่สำเร็จ ค่าที่ว่างอยู่ตรงนี้หมายถึง \"ไม่ทราบ\" ไม่ใช่ \"0\" หากรีเฟรชแล้วยังเหมือนเดิม อย่าดำเนินการปรับยอด",
  "modeCredit": "เพิ่มยอด",
  "modeDebit": "หักยอด (เรียกคืน)",
  "modeDebitHint": "ลดยอดคงเหลือ หักได้เฉพาะส่วนที่ใช้ได้ ส่วนที่ถูกกันไว้จากการสเตกหรือคำขอถอนที่รออยู่จะหักไม่ได้",
  "fieldEmail": "ผู้ใช้เป้าหมาย (อีเมล)",
  "fieldEmailPlaceholder": "พิมพ์ที่อยู่อีเมลให้ครบ",
  "fieldCoin": "เหรียญ",
  "fieldAmount": "จำนวน",
  "fieldAmountPlaceholder": "เช่น 100",
  "amountInvalid": "กรอกจำนวนที่มากกว่า 0",
  "fieldReason": "ประเภทเหตุผล",
  "reasonSelect": "เลือกประเภทเหตุผล",
  "reasonE2E": "ยอดตั้งต้นสำหรับการตรวจสอบ E2E ภายใน",
  "reasonRecon": "แก้ไขความคลาดเคลื่อนของการกระทบยอด",
  "reasonIncident": "ชดเชยเหตุขัดข้อง",
  "reasonOther": "อื่น ๆ",
  "fieldDescription": "คำอธิบาย",
  "descriptionPlaceholder": "ระบุว่าการปรับครั้งนี้ทำเพื่ออะไร และอยู่ในรอบตรวจสอบหรือเหตุขัดข้องใด",
  "descriptionRequired": "ต้องกรอกคำอธิบาย",
  "descriptionTooShort": "กรอกอย่างน้อย {min} ตัวอักษร",
  "targetTitle": "บัญชีเป้าหมาย",
  "targetBalance": "ยอดคงเหลือ",
  "targetHeld": "ถูกกันไว้",
  "targetAvailable": "ใช้ได้",
  "targetAdminNet": "การปรับโดยผู้ดูแลจนถึงตอนนี้ (สุทธิ)",
  "targetHint": "ส่วนที่ถูกกันไว้คือเงินต้นสเตกและคำขอถอนที่รออยู่ การหักยอดทำได้เฉพาะภายในส่วนที่ใช้ได้",
  "targetLoading": "กำลังค้นหา…",
  "targetError": "อ่านยอดคงเหลือของบัญชีนี้ไม่ได้ ตัวเลขด้านบนคือไม่ทราบ ไม่ใช่ 0",
  "targetNotFound": "ไม่มีผู้ใช้ที่ใช้อีเมลนี้",
  "limitsTitle": "วงเงิน",
  "limitPerTx": "ต่อครั้ง",
  "limitPerDay": "ต่อ 24 ชั่วโมง",
  "limitCumulative": "สะสมสุทธิ",
  "scopePerTx": "การปรับครั้งนี้",
  "scopePerDay": "ตัวคุณเอง ย้อนหลัง 24 ชม.",
  "scopeCumulative": "เหรียญนี้ ผู้ดูแลทุกคน",
  "limitUsed": "ใช้ไป",
  "limitRemaining": "คงเหลือ",
  "limitUnset": "ยังไม่ได้ตั้ง — ดำเนินการไม่ได้",
  "limitError": "ไม่ทราบ",
  "limitRollingNote": "เป็นยอดรวมย้อนหลัง 24 ชั่วโมงแบบเลื่อน ไม่มีเวลารีเซ็ตที่แน่นอน วงเงินจะคืนมาเมื่อรายการเก่าพ้น 24 ชั่วโมง",
  "review": "ไปยังขั้นยืนยัน",
  "confirmTitleCredit": "ยืนยันการเพิ่มยอด",
  "confirmTitleDebit": "ยืนยันการหักยอด",
  "confirmTarget": "ถึง",
  "confirmAmount": "จำนวน",
  "confirmReason": "เหตุผล",
  "confirmTypeEmail": "พิมพ์อีเมลเป้าหมายด้วยตนเองเพื่อยืนยัน",
  "confirmTypeAmount": "พิมพ์จำนวนด้วยตนเองเพื่อยืนยัน",
  "confirmMismatchEmail": "ไม่ตรงกับอีเมลด้านบน",
  "confirmMismatchAmount": "ไม่ตรงกับจำนวนด้านบน",
  "confirmPasteBlocked": "ช่องนี้วางไม่ได้ — ต้องพิมพ์เอง",
  "confirmSubmitCredit": "ออกเครดิต",
  "confirmSubmitDebit": "หักยอดคงเหลือ",
  "cancel": "ยกเลิก",
  "resultCreditTitle": "ออกเครดิตแล้ว",
  "resultDebitTitle": "หักยอดคงเหลือแล้ว",
  "resultAmountLine": "{email} · {amount} {coin}",
  "resultNewBalance": "ยอดคงเหลือใหม่ {balance} {coin} (ใช้ได้ {available})",
  "resultLiability": "หนี้สินในบัญชีแยกประเภทภายในของเหรียญนี้ตอนนี้คือ {total} {coin}",
  "resultEntryId": "รายการบัญชี {id}",
  "resultAuditNote": "การปรับครั้งนี้ถูกบันทึกในบันทึกการตรวจสอบแล้ว",
  "resultReplay": "คำขอนี้ถูกดำเนินการไปแล้ว — ไม่มีการออกซ้ำ",
  "resultAgain": "ทำการปรับรายการอื่น",
  "errors": {
    "ADMIN_CREDIT_DISABLED": "การปรับยอดคงเหลือถูกปิดอยู่ เปิดได้ที่การตั้งค่าแพลตฟอร์ม และการเปิด-ปิดเองก็ถูกบันทึกในบันทึกการตรวจสอบ",
    "ADMIN_CREDIT_LIMIT_PER_TX": "เกินวงเงินต่อครั้งที่ {limit} {coin} อย่าแบ่งทำหลายรายการ — หากจำเป็นจริง ต้องทบทวนตัววงเงินเอง",
    "ADMIN_CREDIT_LIMIT_PER_DAY": "ยอดรวมการปรับของคุณเองในช่วง 24 ชั่วโมงที่ผ่านมาถึงวงเงิน {limit} {coin} แล้ว ไม่มีเวลารีเซ็ตที่แน่นอน วงเงินจะคืนมาเมื่อรายการเก่าพ้น 24 ชั่วโมง",
    "ADMIN_CREDIT_CUMULATIVE_CAP": "ยอดสะสมสุทธิของ {coin} ถึงวงเงิน {limit} แล้ว การเรียกคืนด้วยการหักยอดจะทำให้วงเงินคืนมา ส่วนการเพิ่มวงเงินเป็นการตัดสินใจแยกต่างหาก",
    "ADMIN_CREDIT_CONFIRMATION_MISMATCH": "ข้อความยืนยันไม่ตรงกับแบบฟอร์ม อ่านอีเมลเป้าหมายและจำนวนอีกครั้ง แล้วพิมพ์ด้วยตนเอง",
    "ADMIN_ADJUSTMENT_DEBIT_EXCEEDS_AVAILABLE": "เกินจำนวนที่บัญชีนี้ปล่อยออกได้ จากยอด {balance} {coin} มี {held} ถูกกันไว้จากการสเตกหรือคำขอถอนที่รออยู่ จึงหักได้เพียง {available} ในตอนนี้ โปรดรอครบกำหนดหรือปลดล็อก หรือจัดการสถานะสเตกก่อน แล้วลองอีกครั้ง",
    "ADMIN_CREDIT_USER_NOT_FOUND": "ไม่มีผู้ใช้ที่ใช้อีเมลนี้ ตรวจสอบการสะกด — หน้าจอนี้ไม่สร้างบัญชีให้",
    "ADMIN_CREDIT_COIN_NOT_LOCAL": "เหรียญนี้ไม่ได้อยู่ภายใต้ยอดคงเหลือภายในระบบ ปรับได้เฉพาะเหรียญที่ยอดคงเหลือเป็นแบบ LOCAL เท่านั้น",
    "UNKNOWN": "เซิร์ฟเวอร์ส่งรหัสที่หน้าจอนี้ไม่รู้จัก ({code}) ไม่ทราบผลลัพธ์ — โปรดตรวจสอบบัญชีแยกประเภทก่อนตัดสินใจ การลองใหม่จากหน้าจอยืนยันเดิมจะไม่ทำให้เกิดการออกซ้ำ"
  }
},
"adminWithdrawals": {
  "adminCreditMarker": "ยอดคงเหลือของผู้ใช้รายนี้รวมเครดิตจากการปรับโดยผู้ดูแล {amount} {coin}",
  "adminCreditMarkerNegative": "ยอดคงเหลือของผู้ใช้รายนี้สะท้อนการหักสุทธิจากการปรับโดยผู้ดูแล {amount} {coin}",
  "adminCreditMarkerUnknown": "ตรวจสอบรายการปรับโดยผู้ดูแลไม่ได้ — คือ \"ไม่ทราบ\" ไม่ใช่ \"ไม่มี\"",
  "adminCreditMarkerHint": "แสดงเพื่อประกอบการพิจารณา ไม่ได้ขัดขวางการอนุมัติ"
}
```

---

## 10. 인수 기준 (AC-T16-xx) — `qa-lead`(T-11) 인계

| ID | 인수 기준 | 근거 |
|---|---|---|
| **AC-T16-01** | 킬 스위치 OFF에서 `AdminSidebar`·`AdminBottomNav`·설정 바로가기 어디에도 항목이 없다. **플래그 로딩 중에도 렌더되지 않는다**(먼저 그렸다 지우기 금지) | AC-13 ⓑ · §3.4 |
| **AC-T16-02** | 킬 스위치 OFF에서 `/admin/credit` 직접 진입 시 **200 + `DISABLED` 렌더**. 입력 필드·제출 버튼이 **DOM에 하나도 없다**. 404/리다이렉트가 아니다 | J-1 · §3.4 |
| **AC-T16-03** | 킬 스위치 OFF 상태에서도 PoR 대시보드의 `adminAdjustmentNetCreditTotal`은 렌더된다(0이면 회색 `0`) | AC-9 · §3.4 |
| **AC-T16-04** | 한도 3종 중 하나라도 `null`이면 상태는 `LIMITS_UNSET`이고 제출 경로가 없다. **어느 항목이 미설정인지 행 단위로 표시**된다 | AC-6 · §3.1 |
| **AC-T16-05** | 한도·대상 조회 실패 시 **숫자 `0`이 어디에도 렌더되지 않는다**(`—` + 문구). 로딩/실패/진짜 0이 서로 다르게 보인다 | §3.2 |
| **AC-T16-06** | 한도 3행 각각에 적용 범위 라벨이 있다. 6로케일 어디에도 24h 항목에 "리셋/초기화/자정/내일" 계열 표현이 없다 | J-3 · §4.5-2 |
| **AC-T16-07** | 클라이언트 코드에 잔여 한도 계산(뺄셈)이 없다 — 서버 `remaining`을 그대로 렌더한다(grep 검증) | DC-5 |
| **AC-T16-08** | 경고 3문장이 **상단 배너와 확인 모달 양쪽**에 전문으로 렌더되고, 두 곳 모두 닫기/접기 컨트롤이 없다. `DISABLED`·`LOAD_FAILED`에서도 배너는 렌더된다 | AC-2 · §4.2 |
| **AC-T16-09** | `adminCredit` 네임스페이스 6로케일 전체에 §4.2의 **안심 금지어가 0건**이다 | AC-2 |
| **AC-T16-10** | 확인 단계에 **체크박스가 없고**, 타이핑 칸은 **이메일·금액 2개**다. 두 칸 모두 붙여넣기가 차단되고 그 사실이 문구로 안내된다 | AC-3 · §4.6 |
| **AC-T16-11** | `100` ↔ `100.00`은 일치, `10`·`1000`은 불일치. `Admin@X.com` ↔ `admin@x.com`은 일치. **금액 비교에 `Number()`/`parseFloat()`가 쓰이지 않는다** | J-4 · CLAUDE.md 규칙 2 |
| **AC-T16-12** | 클라이언트를 우회해(직접 POST) 확인값을 틀리게 보내면 서버가 `ADMIN_CREDIT_CONFIRMATION_MISMATCH`로 거부한다 | AC-3 · AC-C19 |
| **AC-T16-13** | 사유 유형 미선택 시 진행 불가. `OTHER`는 서술 20 코드포인트 미만이면 거부, 그 외 유형은 4 미만이면 거부. **공백만·연속 공백 패딩은 통과하지 못한다** | AC-4 · §4.3 |
| **AC-T16-14** | `adjustmentReason`은 **서버가** `"<기계 토큰>: <서술>"` 로 조립한다. 본문에 `adjustmentReason`/`createdByAdminId`/`createdByEmail`/`userId`가 오면 **400**(무시 아님) | AC-4 · AC-5-1 · DC-3/4 |
| **AC-T16-15** | 확인 모달 진입 시 생성된 `idempotencyKey`로 **같은 요청을 2회 보내면 원장 행은 1건**이고, 두 번째 응답은 `idempotentReplay:true`로 **성공 렌더**된다(한도 초과로 거부되지 않는다) | J-5 · DC-6 |
| **AC-T16-16** | 코인 선택지는 `balanceAuthority='LOCAL'`만 포함한다. LOCAL 코인 0건이면 `NO_LOCAL_COIN`. 서버는 비-LOCAL 코인 요청을 거부한다. **클라이언트에 코인 심볼 하드코딩이 없다** | §6-V7 |
| **AC-T16-17** | 홀드가 걸린 계정에 차감 시도 → 거부되고, 화면에 **`balance`/`held`/`available` 실제 값 + 다음 행동**이 함께 표시된다. *"실패했습니다"* 만 표시되는 경로가 없다 | AC-11 · AC-C17 |
| **AC-T16-18** | 결과 화면에 성공 톤 문구·대형 초록 체크·"지급" 어휘가 없고, **새 잔고 + 갱신된 L1**이 표시된다 | §4.7 · CP-1 계열 |
| **AC-T16-19** | 출금 큐: `net>0` 표식 / `net<0` 역표식 / `net==0` 무표식 / `null` "확인 불가" 칩의 **4상태가 전부 렌더된다**. 표식이 승인·거부 버튼의 `disabled`를 바꾸지 않는다 | AC-10 · J-6 · §8.2 |
| **AC-T16-20** | 표식 색이 같은 행의 rail 배지·status 배지와 구별되며, **로즈·에메랄드를 쓰지 않는다** | §8.2 |
| **AC-T16-21** | `en` 기준 `adminCredit` 키 집합이 `ko/ja/zh/vi/th`에 **누락 0**이고, 플레이스홀더 이름이 6로케일 동일하다 | §9 |

---

## 11. 핸드오프

| 받는 곳 | 항목 |
|---|---|
| **T-17 `web-shared-expert`** | DC-1~DC-8(특히 **DC-6 멱등키 처리 순서** — 잠금 → 멱등 확인 → 한도 검사) · §6-V7 코인 제약 · 확인값 서버 재검증 · 에러 코드 8종 발행 |
| **T-18 `web-admin-expert`** | §3 상태 기계 · §4 화면 · §8 출금 큐 표식(DC-9 필드 추가 포함) · §9 6로케일 반영 · AC-13 메뉴 은닉(사이드바·하단바·설정 바로가기 3곳 전부) |
| **T-14 `ui-ux-designer`** | 경고 배너 **주의색**(로즈와 구별) · `LIMITS_UNSET`/`CAP_EXHAUSTED` 강조색 · **출금 큐 표식 색 토큰**(같은 행의 앰버·인디고·에메랄드·로즈와 충돌 없이) |
| **T-19 `wallet-security-expert`** | §3.3(T2에서 조정을 허용한다는 판단) · §6-V7 · DC-6(멱등키가 한도 우회에 쓰일 수 없는지) · DC-3 금지 필드 · §8 표식이 승인 판단을 바꾸지 않는지 |
| **T-11 `qa-lead`** | §10 AC-T16-01~21. rev05 AC-C15~AC-C19와 **중복이 아니라 화면 층 보강**이다 |
| **`pm`** | §13 escalation 4건 |

---

## 12. 이 문서가 승인하지 않는 것 (명시)

- **킬 스위치를 켜는 것이 아니다.** `adminCreditEnabled`는 `false`로 배포된다(rev05 §5.1 CUT-2b).
- **한도 초기값의 확정이 아니다.** Q-M10 미회신이며, 미설정 상태는 §3의 `LIMITS_UNSET`으로 **안전하게** 렌더된다.
- **AC-8(4-eyes) 도입이 아니다.** rev05가 이번 라운드 미구현으로 판정했고 이 문서는 그것을 바꾸지 않는다.
  **다만 도입 시 이 화면의 변경 지점은 §4.6 확인 모달 하나**임을 기록해 둔다(2인째 승인 대기 상태가
  §3의 8번째 상태로 추가된다).
- **코드 작성·마이그레이션 실행이 아니다.** 이 세션에서 변경한 애플리케이션 코드는 0줄이다.
- **배포 게이트의 해제가 아니다.** AC-14(T-19 리뷰 통과)는 그대로다.
- **사용자 화면 노출의 승인이 아니다.** rev05 §5.2 ④ — 사용자에게 조정 흔적을 표시하지 않는다.

---

## 13. Escalation / 열린 질문

| # | 항목 | 이 문서의 입장 | 확인 받을 곳 |
|---|---|---|---|
| **E-1** | **AC-13(메뉴 미렌더)과 "정직하게 비활성 표시" 요청의 충돌** | §3.4로 해소했다 — **메뉴는 은닉, 페이지는 `DISABLED`로 정직, 금액은 PoR 대시보드에 상시 노출.** AC-13을 완화하지 않았다 | `pm` 확인 |
| **E-2** | **T2 권위 정지 코인에 대해 관리자 조정을 허용할 것인가** | **허용하되 인시던트 배너를 함께 표시**(§3.3). 근거: 정정 도구를 정지시키면 인시던트 탈출 수단이 함께 잠긴다 — A-3가 이 사유 코드를 게이트에서 제외한 논리와 동일 | `pm` · `wallet-security-expert`(T-19) |
| **E-3** | **비-LOCAL 코인 크레딧 차단(신규 코드 `ADMIN_CREDIT_COIN_NOT_LOCAL`)** | rev05 §4A에 없는 통제. **없으면 `HUB_COIN_HAS_LOCAL_BALANCE` 인시던트를 버튼으로 제조할 수 있다.** 7번째 에러 코드 신설이 필요 | `pm` 승인 · T-17 구현 |
| **E-4** | **`idempotencyKey` 필수화(DC-6)** | AC-6/AC-7을 **강화**하는 방향이며, `LocalLedgerEntry`의 기존 unique 제약을 쓰므로 스키마 변경이 없다. 다만 **한도 검사보다 멱등 확인이 먼저**여야 한다는 순서 요구가 T-17의 잠금 설계와 맞물린다 | T-17 · T-19 |
| **E-5** | **AC-10의 "순증분이 `0`이 아니면"이 음수까지 포함하는 문제** | 문언 그대로면 순차감 계정에도 *"크레딧이 포함되어 있다"* 는 **거짓 문구**가 붙는다. §8.2에서 **4상태로 분리**해 해소했다. rev05 AC-10 문언 자체의 정정이 필요한지 판단 요청 | `pm` |
| **E-6** | **미해결 28(E2E 크레딧 회수 시점)과의 접점** | 이 화면은 §4.4의 `adminAdjustmentNet` 표시로 *"이 계정에 아직 회수 안 된 조정이 있다"* 를 **보여주기는 한다.** 그러나 **회수를 강제하지도, 미회수 목록을 만들지도 않는다** — 그것은 런북 항목이며 이 문서의 범위 밖 | `qa-lead` · `deploy-manager` 런북 |

---

*선행: `staking-yield-system-v2-prd-rev05-creation-path-cutover.md` §4A · §7.3 ·
`...-design-a8-admin-dashboard-frd.md` · `...-design-a5-withdrawal-queue.md` ·
후속: T-17(`web-shared-expert` 라우트) · T-18(`web-admin-expert` 화면·표식·로케일) ·
T-19(`wallet-security-expert` 보안 리뷰 — **배포 게이트**) · T-11(`qa-lead` 인수)*
