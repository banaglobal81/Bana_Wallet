# 설계 문서 A-7 — 화면·플로우 FRD (로컬 잔고 · 클레임 · BANA 출금 · 관리자 큐 · 입금 레일)

> 작성: `product-planner` · 2026-08-10
> **근거 문서(읽은 순서):** `staking-yield-system-v2-INDEX.md` →
> `staking-yield-system-v2-prd.md`(개정 01 — §10 고지 판정, §11 R-U1~R-U30) →
> `...-rev02-balance-authority.md`(개정 02 — 모델 C, X-1~X-4) →
> `...-rev03-rebuild-and-exclusivity.md`(개정 03 — §2 권위 전환 UX, §3 입금 레일, §4 출금
> 레일·클레임 축소, §7.2 A-7 작업 정의) → `...-design-a2-balance-authority.md`(A-2) →
> `...-design-a3-local-ledger.md`(A-3) → `...-design-a5-withdrawal-queue.md`(A-5) →
> `staking-page-v2-screen-flow-frd.md`(PS-A — **이미 구현·배포된 라이브 화면**) →
> 실측: `web/src/components/Wallet.tsx` · `Deposit.tsx` · `Withdraw.tsx` ·
> `web/messages/en.json` · `web/prisma/schema.prisma`
>
> **지위: 설계 문서다. 구현 지시서가 아니다.**
> rev03 §7.2/§7.3의 게이트는 미해제이며, **이 문서의 어떤 화면도 지금 만들지 않는다.**
> 특히 **클레임 버튼·밴드 UI는 이번 범위 밖이다**(밴드는 V2-BAND 트랙, 별도 사람 승인).
> 지금 라이브인 것은 **PS-A뿐**이며, 이 문서는 PS-A 위에 **무엇이 어떻게 얹히는가**를 정한다.
> 코드는 이 문서가 작성하지 않는다.

---

## 0. 이 문서가 답하는 것 / 답하지 않는 것

| 답한다 | 답하지 않는다 |
|--------|---------------|
| 로컬 잔고(A-3)의 사용자 표시 규칙과 허브 잔고와의 시각적 분리 | 픽셀·색·타이포·토큰 (→ `ui-ux-designer`, A-11) |
| 클레임(내부 DB 트랜잭션)의 화면·카피·모호한 결과 처리 | 클레임 API·정산 엔진 구현 (→ `web-shared-expert`) |
| BANA 출금의 가스·최소 금액 고지, `AWAITING_ONCHAIN`의 사용자 표현 | 온체인 검증 헬퍼 내부 로직 (A-5 §2가 이미 소유) |
| 관리자 큐의 레일 구분·txHash 제출·검증 결과 표시 | 관리자 부채·준비금 대시보드 (→ A-8, 별도 문서) |
| 입금 레일의 정직한 "지원하지 않음" 표현 | 입금 레일 자체의 선택(D-B2/D-C) — Q-M5 미회신 |
| 에러 코드 → 표시 문구, 6로케일 카피 원문 | 스키마 컬럼명·마이그레이션 (→ `prisma-db-expert`) |
| A-2 §6-2("T1 예외 승인 UX 필요 여부")에 대한 답 | 법무 판단, B-10 결과에 따른 고지 문안 (→ 사람) |

**이 문서가 승인하지 않는 것(명시):**
- 클레임 버튼·클레임 API 연동의 구현 착수 승인이 아니다(rev03 §8.3 금지 ③ 유효).
- BANA 출금 레일을 켜는 것에 대한 승인이 아니다(Q-M3 미회신).
- 밴드 UI(밴드 미터·최대 가산율 표기)에 대한 어떤 설계도 포함하지 않는다(V2-BAND).
- 입금 레일 방식의 결정이 아니다(Q-M5). §7은 **레일이 없는 동안의 표시**만 정한다.

---

## 1. 설계 원칙

PS-A(`staking-page-v2-screen-flow-frd.md`) §1의 **L-1~L-8을 전부 승계**하고, 로컬 권위·출금
레일·입금 레일 때문에 새로 필요해진 것만 아래에 더한다.

### LA-1 (최상위) — 잔고가 둘이면 화면도 둘이다. 합계는 존재하지 않는다

X-2("두 권위를 어떤 화면에서도 합산하지 않는다")의 UI 형태다. 허브 권위 잔고와 로컬 권위
잔고는 **다른 블록**에 렌더되고, **각자의 로딩/실패/영(0) 상태**를 갖고, **어떤 총계 행도
만들지 않는다.** 두 값을 더하는 컴포넌트가 필요해 보이는 순간은 X-1′가 깨졌다는 신호다.

> 이 원칙은 "예쁘지 않다"는 이유로 가장 먼저 깨질 원칙이다. 그래서 AC(§10 AC-A7-01/02)로
> 잠그고, 합산 코드의 부재를 기계 검사 대상으로 만든다.

### LA-2 — 사용자에게 "권위"라는 개념을 설명하지 않는다. 결과의 차이만 설명한다

`balanceAuthority` / HUB / LOCAL / 원장 / 권위는 **내부 용어이며 화면에 등장하지 않는다.**
사용자가 알아야 하는 차이는 정확히 셋이다:
1. 이 잔고는 저 잔고와 **더해지지 않는다**.
2. **밖으로 보내는 방법이 다르다**(검토 후 온체인 전송 — 즉시가 아니다).
3. **지금은 입금할 수 없다**.

이 셋을 말하는 데 "권위"라는 단어는 필요 없다. 반대로 "이 자산은 저희 원장에서 관리됩니다"
같은 문장은 정보가 0이면서 불안만 만든다.

### LA-3 — 세 축은 각각 명시 플래그이며, 데이터 존재로 추론하지 않는다

PS-A R-D1의 확장이다. 서로 독립인 **세 개의 레일 축**이 있고, 각 축은 서버가 내려주는
명시 플래그로만 결정된다.

| 축 | 플래그 | 값 | 오늘(2026-08-10) |
|----|--------|-----|------------------|
| 클레임 | `yieldRail` | `LEDGER_ONLY` / `CLAIM_LIVE` / `CLAIM_PAUSED` | `LEDGER_ONLY` |
| BANA 출금 | `localWithdrawRail` | `UNAVAILABLE` / `LIVE` / `PAUSED` | `UNAVAILABLE` |
| BANA 입금 | `localDepositRail` | `UNSUPPORTED` / `LIVE` / `PAUSED` | `UNSUPPORTED` |

> **세 축을 하나의 "BANA 기능 켜짐" 불린으로 합치지 않는다.** 실제로 셋은 서로 다른 시점에
> 열린다 — 클레임은 Q-M3(준비금)에, 출금은 Q-M3 + 관리자 운영 준비에, 입금은 Q-M5(레일 선택)에
> 걸려 있다. 하나로 합치면 가장 늦은 것이 나머지를 인질로 잡거나, 반대로 가장 이른 것이
> 나머지를 거짓으로 켠다.

### LA-4 — "없음"과 "멈춤"과 "당신이 채울 조건"은 세 개의 다른 화면이다

PS-A §3.3의 상태칩 규칙을 세 축 전부로 확대한다.

| 사용자에게 참인 문장 | 렌더 |
|---|---|
| "이 기능은 제공되지 않는다"(레일 부재) | **비버튼 상태칩.** 조건 암시 금지 |
| "제공되지만 지금 멈춰 있다"(킬 스위치·점검·T2 정지) | **비버튼 상태칩** + 사유 |
| "당신이 조건을 채우면 눌린다"(금액 0, 최소 미만, 주소 미입력) | **비활성 버튼** |
| "지금 누를 수 있다" | 활성 버튼 |

**액션 슬롯 자체를 삭제하지 않는다.** 슬롯의 존재가 "이 돈은 아직 나가지 않았다"는 정보다
(R-U3의 취지, `docs/patterns/product-planner.md` "A disabled button and an unavailable state").

### LA-5 — 진행형 표현은 "실제로 사람이 진행 중일 때"만 쓴다. 그래도 ETA는 쓰지 않는다

PS-A의 "정산 준비 중 금지" 원칙을 정밀화한다. 두 상황은 다르다.

| 상황 | 진행형 허용? | 근거 |
|---|---|---|
| 클레임/입금 레일 **부재** | **금지.** "준비 중", "곧", "coming soon" 전부 금지 | 진행하는 주체가 없다. 진행형은 일정을 함의하고 우리는 일정을 모른다 |
| 출금 `AWAITING_ONCHAIN` | **허용 — 단 한정된 형태로.** "승인되었으며 전송을 기다리고 있습니다" | 실제로 관리자가 처리 대기열에 있다. 진행 중인 것을 진행 중이라 쓰는 것은 정직이다 |
| 출금 `AWAITING_ONCHAIN`의 **소요 시간** | **금지.** "보통 N시간", "24시간 이내" 금지 | 처리 SLA는 미결정이다(rev03 §11-17). SLA가 확정되고 **운영이 그것을 지킬 수 있음이 관측된 뒤에만** 문구를 추가한다 |

> **"전송 중"이라고 쓰지 않는다.** `AWAITING_ONCHAIN`은 "승인됨 + 아직 아무것도 전송되지
> 않았을 수 있음"이다. "전송 중"은 이미 체인에 나갔다는 뜻이고, 그것이 참인지 시스템은
> 검증 전까지 알지 못한다(W-4). **모르는 것을 아는 것처럼 쓰는 것이 이 프로젝트가 정정하려는
> 원래 결함이다.**

### LA-6 — 관리자에게 "승인"과 "송금"은 절대 같은 버튼이 아니다

W-3의 UI 형태다. 승인 버튼은 **자금을 보내지 않는다.** 그 사실이 버튼 옆에 문장으로 있어야
하고, 승인 후 화면은 "이제 당신이 밖에서 전송해야 한다"로 바뀌어야 한다. 이 둘이 시각적으로
같은 사건처럼 보이면 관리자는 승인만 하고 전송을 잊거나, 전송하고 승인을 잊는다.

### LA-7 — 검증되지 않은 txHash는 사용자에게 보여주지 않는다

관리자가 제출한 해시는 W-4가 통과시키기 전까지 **주장**이다. 그 단계의 해시를 사용자 화면에
노출하면, 되돌린(reverted)·금액 불일치 트랜잭션이 사용자에게 **지급 증거**로 읽힌다.
사용자에게 해시는 `onchainVerifiedAt`이 채워진 뒤에만 나타난다.

### LA-8 — 게임화 금지는 클레임이 쉬워졌다고 완화되지 않는다

D-4 / C-7 / R-U5 승계. 클레임이 내부 이동이 되어 **즉시·확실**해졌다는 사실은, 오히려
연출을 붙이고 싶은 유혹을 키운다. 금지 항목을 다시 못 박는다: 파티클·사운드·카운트업
애니메이션·축하 문구·느낌표·연속 수령 기록(스트릭)·"보너스"·배지·수령 유도 넛지(만기 안내
1건 제외). 성공 표시는 **정보 수준의 1줄**이다.

---

## 2. 표면 지도 — 어느 화면이 무엇을 바꾸는가

| 표면 | 파일(실측) | 이 문서가 바꾸는 것 | 시점 |
|---|---|---|---|
| 잔고 화면 | `web/src/components/Wallet.tsx` | 로컬 잔고 블록 신설, 합산 금지, `stakedRows()` 이중계상 제거(§3.5) | 로컬 원장 구축 시 |
| 입금 | `web/src/components/Deposit.tsx` | 미지원 자산 명시 고지 블록, X-7 fail-closed 3상태 분리 | **일부는 지금도 유효**(§7.6) |
| 출금 | `web/src/components/Withdraw.tsx` | LOCAL 레일 분기, 수수료·최소 금액 고지, 상태 사전 확장 | 출금 레일 구축 시 |
| 스테이킹 | PS-A 구현분(B2 YIELD PANEL) | 클레임 슬롯이 `ENABLED`로 갈 수 있게 되고, 이동 대상 표현이 "지갑"→"BANA 잔고"로 정정 | 클레임 가동 시 |
| 활동 이력 | `api/nia/withdrawals` 소비 화면 | `AWAITING_ONCHAIN`·LOCAL `APPROVED` 누락 회귀 수정(A-5 §1.8) | 출금 레일 구축 시 |
| 관리자 출금 큐 | `app/[locale]/admin/**` | 레일 컬럼, txHash 제출·검증 패널 | 출금 레일 구축 시 |

---

## 3. 로컬 잔고 표시 (LB)

### 3.1 목표

사용자가 **자기 BANA가 얼마이고, 그중 얼마를 지금 쓸 수 있고, 나머지가 왜 묶여 있는지**를
한 화면에서 오해 없이 읽는다. 그리고 그 숫자를 다른 잔고와 **더하지 않는다.**

### 3.2 표시하는 수치와 그 정의

A-3 §4.1의 `getUserCoinBalance(userId, coin) → { balance, held, available }`가 유일한 출처다.

| # | 표시 | 값 | 사용자 카피 라벨 |
|---|------|-----|------------------|
| ⓐ | 총 잔고 | `balance` (= `UserCoinBalance.balance`) | `잔고` |
| ⓑ | 사용 가능 | `available` = `balance − Σ ACTIVE holds` | `사용 가능` |
| ⓒ | 보류 — 스테이킹 | Σ `STAKE_PRINCIPAL_LOCK` 홀드 | `스테이킹 잠금` |
| ⓓ | 보류 — 출금 신청 | Σ `WITHDRAWAL_PENDING` 홀드 | `출금 신청 보류` |

| ID | 요구 |
|----|------|
| **LB-1** | **ⓒ와 ⓓ를 하나의 "잠김"으로 합치지 않는다.** 두 홀드는 사용자에게 완전히 다른 사건이다 — ⓒ는 본인이 약정한 기간이고, ⓓ는 **이미 밖으로 나가는 중인 돈**이다. 합치면 "왜 잔고가 줄었는지" 질문에 화면이 답하지 못한다 |
| **LB-2** | ⓑ는 **서버가 계산해 내려준 값**을 그대로 렌더한다. 클라이언트가 ⓐ에서 ⓒ·ⓓ를 빼서 만들지 않는다(`docs/patterns/product-planner.md` — "Deriving a lock/limit figure client-side survives only until the server rule changes". 실제로 오늘 `Staking.tsx:139-145`가 이 방식으로 틀려 있었다) |
| **LB-3** | ⓓ가 0보다 크면 **해당 출금 신청으로 가는 링크**를 함께 렌더한다. 사유 없는 차감은 사고로 읽힌다 |
| **LB-4** | 홀드 사유가 위 둘 외의 값(`ADMIN_MANUAL` 등)으로 관측되면 **합계에서 빼지 말고 "기타 보류"로 별도 행**을 만든다. 모르는 사유를 아는 사유에 흡수시키면 대사 불가능한 화면이 된다 |
| **LB-5** | 금액은 서버가 준 decimal 문자열을 **그대로** 출력한다. 로케일 포맷팅·반올림·유효자릿수 절단 금지(PS-A N-3 승계). **주의: 현재 `Withdraw.tsx:243`·`276`이 `toSignificantDigits(8)`로 절단하고 있다 — BANA는 18 decimals(N-14)이므로 이 절단은 로컬 잔고 화면에 그대로 옮겨오면 안 된다** |

### 3.3 배치 — 두 개의 블록, 하나의 총계 없음

`Wallet.tsx`의 「Balances」 카드를 **두 개의 헤더 붙은 블록**으로 나눈다.

```
┌─ 잔고 ─────────────────────────────────────────────────────────┐
│                                                                 │
│  【그룹 1】 입출금 계정                                          │
│    (오늘의 표 그대로 — 지갑/자산/사용 가능/잠김)                 │
│    …USDT, BTC, …                                                │
│                                                                 │
│  ──────────────────────────────────────────────────             │  ← 시각적 분리선
│                                                                 │
│  【그룹 2】 플랫폼 발행 자산                                     │
│    BANA        잔고 1,234.5678…                                 │
│                사용 가능 1,000.0000…                             │
│                스테이킹 잠금 200.0000…                           │
│                출금 신청 보류 34.5678…  [신청 보기]              │
│    ⓘ BANA는 BANA 플랫폼이 발행한 자산입니다. 출금은 신청 후      │
│      검토를 거쳐 온체인 전송으로 처리됩니다.                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
        ※ 두 그룹을 더한 값은 어디에도 표시되지 않는다
```

| ID | 요구 |
|----|------|
| **LB-6** | 두 그룹은 **각자 독립한 로딩/실패/영(0) 상태**를 갖는다. 한쪽 조회 실패가 다른 쪽을 숨기지 않는다(현재 `Wallet.tsx:105-110`이 이미 이 원칙을 부분 적용 중 — 허브 실패만 패널을 실패시킨다. 로컬 그룹에도 같은 결로 적용) |
| **LB-7** | **로딩·실패를 `0`으로 렌더하지 않는다.** 세 상태를 각각 문구로 구분한다(`docs/patterns/product-planner.md` — "On a money screen, 'failed to load' and 'zero' must not render the same"). 로컬 잔고에서 이 실수는 특히 위험하다 — 사용자가 자기 돈이 사라졌다고 읽는다 |
| **LB-8** | 그룹 간 정렬·병합·필터를 공유하지 않는다. 「모든 코인 보기」 토글(`Wallet.tsx:192-204`)은 **그룹 1에만** 적용된다 |
| **LB-9** | 그룹 2가 비어 있어도(사용자 BANA 잔고 0) 블록과 설명 1줄은 렌더한다. 존재 자체가 정보다 |
| **LB-10** | 그룹 헤더·설명 카피에 **"권위/authority/원장/ledger"를 쓰지 않는다**(LA-2) |

> **그룹명은 카피 결정 사항이다.** 위의 「입출금 계정」/「플랫폼 발행 자산」은 제약을 만족하는
> 후보이며 최종안이 아니다. 제약은 셋이다 — ① 내부 용어 금지 ② 둘이 같은 주머니라고 읽히지
> 않을 것 ③ 한쪽이 더 안전하거나 더 진짜라고 읽히지 않을 것. 최종 확정은 `ui-ux-designer`(A-11)
> + `pm`.

### 3.4 코인 경보 상태(A-2 `authorityAlertStage`)의 사용자 표시

| 단계 | 사용자 화면 | 근거 |
|---|---|---|
| `CLEAR` | 변화 없음 | — |
| `T1_WARNING` | **사용자 화면에 아무것도 표시하지 않는다.** 잔고·출금·조회 전부 평상시 그대로 | X-3′ 원문 "사용자 기능은 정지하지 않는다". T1은 우리 쪽 관측 신호이지 사용자에게 일어난 사건이 아니다. 여기서 배너를 띄우면 아무 조치도 할 수 없는 사용자에게 불안만 준다 |
| `T2_HALTED` | **잔고는 그대로 보인다**(조회 유지). 출금 액션 슬롯이 `UNAVAILABLE` 상태칩으로 바뀌고 `notice.coinHalted` 1줄. 스테이킹 체결·클레임도 같은 방식으로 정지 표기 | X-3′ "조회는 유지한다 — 사용자가 자기 잔고를 볼 수 없게 만들면 사고 대응이 아니라 사고 확대다" |

> **`T2_HALTED` 카피의 경계.** 사용자에게 원인을 설명하지 않는다(내부 사고 조사 중인 상태다).
> 동시에 사용자 잘못으로 읽히게도 하지 않는다. 채택 문구: **"이 자산의 출금 처리를 일시
> 중지했습니다. 잔고는 그대로 기록되어 있습니다."** — 일정 함의 금지(LA-5), "점검"이라는 말도
> 쓰지 않는다(점검은 예정된 것을 뜻하고 T2는 예정된 것이 아니다).

> **A-2 §6-2에 대한 답 — T1 예외 승인 UI는 만들지 않는다.**
> A-2가 `product-planner`에게 넘긴 질문("T1_WARNING 상태에서 관리자 예외 승인 UX가 필요한가")의
> 답은 **아니오**다. 근거 셋:
> ① T1이 차단하는 것은 "관리자 승인 없는 신규 발행"인데, V2-CORE 시점에 발행은 어차피 Q-M3
>    미회신으로 꺼져 있다 — 우회할 대상이 없다.
> ② 예외 승인 버튼을 만들면 그것이 **정상 운영 절차가 된다.** X-3′가 2단계 설계를 택한
>    이유 자체가 "한 번의 과잉 발동이 가드를 죽인다"였는데, 상시 우회 버튼은 같은 죽음을
>    반대편에서 만든다.
> ③ 정말로 T1 상태에서 발행이 필요한 날이 오면, 그것은 화면 한 번의 클릭이 아니라 X-4′
>    권위 전환 절차(A-2 §2.4의 별도 절차 화면)를 밟아야 하는 상황일 가능성이 높다.
> **필요해지면 그때 만든다. 지금 만들면 필요해지기 전에 쓰인다.**

### 3.5 기존 구현과의 충돌 — 로컬 원장 도입 시 반드시 함께 고칠 것

| ID | 충돌 | 실측 위치 | 요구 |
|----|------|-----------|------|
| **LB-C1** | **스테이킹 원금의 이중 계상.** `stakedRows()`가 포지션 원금을 합산해 **합성 잔고 행**(`walletType: 'staking'`, `locked`)을 만든다. LOCAL 권위에서 이 원금은 A-3의 `STAKE_PRINCIPAL_LOCK` 홀드로 **이미 그룹 2에 표시**된다 | `Wallet.tsx:39-53`, `:115` | LOCAL 권위 코인에 대해서는 `stakedRows()`를 **생성하지 않는다.** 그룹 2의 ⓒ가 유일한 표시다 |
| **LB-C2** | **미결제 출금의 비가시성.** 오늘 화면에는 `WithdrawalRequest`가 만든 홀드 개념이 없다. 요청을 낸 사용자는 사용 가능 잔고가 줄어든 이유를 화면에서 찾을 수 없다 | 전 화면 | LB-1/LB-3 |
| **LB-C3** | **BANA 0 행이 허브 카탈로그 패딩으로 만들어진다.** `zeroRows()`가 `supportedSymbols(markets, managed)`로 BANA 0 행을 그룹 1에 넣는다 | `Wallet.tsx:60-81` | LOCAL 코인은 그룹 1의 패딩 대상에서 **제외**한다. 그러지 않으면 같은 코인이 두 그룹에 나타나고, 그 화면은 X-1′ 위반처럼 보인다(실제로는 표시 버그다 — 그래서 더 나쁘다) |
| **LB-C4** | **`Wallet.tsx`의 「입금하기」 CTA가 코인 무관하게 입금 화면으로 보낸다** | `Wallet.tsx:219-224` | 코인 스코프 입금 진입점은 **그 코인의 `localDepositRail`을 존중**해야 한다(§7). 잔고 0 빈 상태의 범용 CTA는 유지 가능하나, BANA 행에서 출발하는 입금 CTA는 만들지 않는다 |

### 3.6 데이터 계약 (`web-shared-expert` 인계)

| ID | 요구 |
|----|------|
| **R-A7-1** | 잔고 응답은 **권위별로 그룹이 분리된 구조**로 내려온다. 예: `{ custody: BalanceRow[], platform: LocalBalanceRow[] }`. **하나의 평평한 배열에 권위 필드를 얹는 형태를 쓰지 않는다** — 그 형태는 소비자가 `.reduce()` 한 줄로 합산하게 만들고, X-2는 코드 리뷰로만 지켜지게 된다 |
| **R-A7-2** | `LocalBalanceRow = { coin, balance, available, holds: { stakePrincipal, withdrawalPending, other } }`. 전부 서버 계산 decimal 문자열. `available`을 클라이언트가 유도하지 않는다(LB-2) |
| **R-A7-3** | 그룹 2의 조회 실패는 **그룹 2만** 실패 상태로 내려온다(부분 실패 표현이 응답에 존재해야 한다). 전체 200 + 빈 배열로 뭉개지 않는다 |
| **R-A7-4** | 코인별 `alertStage`(`CLEAR`/`T1_WARNING`/`T2_HALTED`)와 세 레일 플래그(LA-3)를 함께 내려준다. 클라이언트는 이 값으로만 분기하고, 데이터 유무로 추론하지 않는다 |

---

## 4. 클레임 — 내부 원장 이동 (CLM)

> **범위 경고.** rev03 §8.3 금지 ③에 따라 **클레임 킬 스위치 ON은 금지**이며, 이 절은
> `yieldRail = CLAIM_LIVE`가 되었을 때의 설계다. **지금 라이브 화면(PS-A)의 수령 슬롯은
> `UNAVAILABLE` 상태칩 그대로 유지된다.** 이 절을 근거로 클레임 버튼을 만들지 않는다.

### 4.1 무엇이 바뀌었는가 — 그리고 그것이 카피를 어떻게 틀리게 만드는가

rev03 §4.4에서 클레임은 외부 호출에서 **로컬 원장 크레딧**(A-3 `STAKING_CLAIM`)으로 축소됐다.
그 결과 **PS-A가 이미 배포한 카피 3종이 모델 (C) 아래에서 부정확해진다.**

| 라이브 키 | 현재 문구 | (C)에서의 문제 | 정정 |
|---|---|---|---|
| `staking.yield.claimableHelp` | "수령하면 **지갑 잔고**로 옮겨집니다." | 옮겨지는 곳은 **BANA 잔고**이고, 그 잔고는 **바로 밖으로 보낼 수 없다**(출금 신청 필요). 사용자는 "지갑 잔고 = 자유롭게 쓸 수 있는 돈"으로 읽는다 | §8.1 |
| `staking.yield.claimedHelp` | "**지갑 잔고**로 옮겨진 금액입니다." | 위와 동일 | §8.1 |
| `staking.claim.confirmBody` / `succeeded` | "{amount} {coin}이 **지갑 잔고로** 옮겨집니다/옮겨졌습니다." | 위와 동일 | §8.2 |

> **정정 시점 권고: 지금 한다.** ②(수령 완료)는 PS-A에서 항상 0이므로 지금 문구를 바꾸는 것은
> 사용자 영향이 0이고, 6로케일 배선 비용도 지금이 가장 싸다. 클레임을 켜는 날 함께 고치려
> 하면, 그날 고칠 것이 가장 많고 이 항목은 가장 눈에 안 띈다.

### 4.2 화면 — PS-A B2(YIELD PANEL) 위에 얹힌다

새 블록을 만들지 않는다. PS-A §4.2의 3수치 + 수령 슬롯 구조를 그대로 쓰고, 슬롯의 상태만
`yieldRail = CLAIM_LIVE`에서 `DISABLED`/`ENABLED`로 갈 수 있게 된다.

```
┌─ BANA ───────────────────────────────────────────────────────┐
│ 수령 가능 수익      수령 완료           잠긴 원금            │
│ 12.34567890         0                   1,000.00000000       │
│ 스테이킹 원장에     BANA 잔고로         약정이 끝날 때까지   │
│ 기록된 금액…        옮겨진 금액…        출금할 수 없습니다   │
│                                                              │
│ [ 12.34567890 BANA 수령 ]                                    │
│ 수령하면 BANA 잔고로 즉시 반영됩니다. 외부 주소로 보내려면   │  ← 신규 1줄
│ 출금을 신청해야 합니다.                                      │
└──────────────────────────────────────────────────────────────┘
```

| ID | 요구 |
|----|------|
| **CLM-1** | 수령 슬롯 아래 **`claim.destinationNote` 1줄을 상시 렌더**한다(접기·툴팁 금지). 클레임이 "돈을 자유롭게 만드는 행위"로 오인되는 것을 막는 유일한 지점이다 |
| **CLM-2** | 확인 다이얼로그는 **필수**(PS-A CL-1 승계). 내부 이동이 되어 실패 위험이 줄었다는 것이 확인을 없앨 이유는 아니다 — 1회성이고 전액이며 되돌리는 UI가 없다 |
| **CLM-3** | 확인 다이얼로그 본문에 **이동 대상과 그 다음 절차**를 함께 쓴다(§8.2 `confirmBody` + `confirmNote2`) |
| **CLM-4** | **수수료 줄을 렌더하지 않는다.** Q-M6 미회신이며 PM 권고는 영구 0이다. 0인 수수료를 "수수료 0"이라 표시하는 것도 금지 — 존재하지 않는 비용을 암시한다(개정 01 §10 조건부 고지 규칙). 수수료 관련 i18n 키를 **만들지 않는다** |
| **CLM-5** | 클레임 성공 후 **게임 상태는 아무것도 변하지 않는다**(C-7 / PS-A CL-4 / AC-V17 승계) |
| **CLM-6** | 클레임 성공은 **그룹 2 잔고(ⓐ·ⓑ)를 즉시 증가**시킨다. 두 화면이 다른 시점에 갱신되면 사용자는 돈이 사라진 구간을 본다. 스테이킹 페이지에서 클레임한 뒤 잔고 화면으로 이동했을 때 값이 반영되어 있어야 한다(캐시 무효화 요구) |

### 4.3 "즉시"를 정직하게 쓰는 방법

**쓸 수 있는 것:** "즉시 반영됩니다" — 참이다. A-3 §4.2의 `creditLocalLedger`는 하나의 DB
트랜잭션이며 성공이면 잔고가 이미 바뀌어 있다.

**쓸 수 없는 것:**

| 금지 문구 | 왜 |
|---|---|
| "즉시 사용할 수 있습니다" | 출금은 검토 큐를 거친다. 이 문장은 (C)에서 거짓이다 |
| "지갑으로 즉시 입금됩니다" | "지갑"은 외부 지갑으로 읽힌다. 온체인으로 나간 것이 아니다 |
| "출금 가능해집니다" | 출금 **신청**이 가능해질 뿐이다 |
| "축하합니다 / 획득했습니다 / 오늘도 수령!" | LA-8 |

**채택형:** *"수령하면 BANA 잔고로 즉시 반영됩니다. 외부 주소로 보내려면 출금을 신청해야
합니다."* — 두 문장이 한 세트다. 앞 문장만 쓰면 과장이 되고, 뒤 문장만 쓰면 클레임이 무의미해
보인다.

### 4.4 모호한 결과 — 재시도 버튼 대신 재조회

(C)에서 서버 트랜잭션은 성공 아니면 롤백이다(C-4가 클레임에서 소멸). 그러나 **브라우저는
여전히 모호할 수 있다** — 응답이 유실된 경우다. PS-A는 이 상황을 `claim.failedReview`(확인 중,
재시도 금지)로 종결시켰다. **(C)에서는 더 나은 답이 있다.**

```
[수령] 탭 → in-flight
  ├ 200 성공 → ①→0, ② += 금액, 그룹 2 잔고 증가. 1줄 결과. 연출 없음
  ├ 명시적 오류 코드 → §9 표의 문구. 슬롯 원복
  └ 네트워크 타임아웃 / 응답 유실
        → `claim.resultUnknownRefresh` 표시 + [상태 새로고침] 버튼
        → 재조회 결과가 곧 답이다:
             ① 이 0으로 바뀌고 잔고가 늘었으면 → 성공했던 것 (성공 표시로 전환)
             ① 이 그대로면 → 아무 일도 없었다 (슬롯 원복, 다시 수령 가능)
```

| ID | 요구 |
|----|------|
| **CLM-7** | **재시도(같은 요청 재전송) 버튼을 만들지 않는다.** 만드는 것은 **[상태 새로고침]**이다. 둘은 다르다 — 하나는 돈을 다시 움직이려 시도하고, 하나는 이미 일어난 일을 확인한다 |
| **CLM-8** | 클라이언트 낙관적 갱신 금지. in-flight 중 이탈·새로고침 시 서버 상태를 다시 읽어 렌더한다(PS-A CL-2 승계) |
| **CLM-9** | `claim.resultUnknownRefresh`는 **"실패했습니다"라고 쓰지 않는다.** 실패했는지 모른다. 문구: "결과를 확인하지 못했습니다. 상태를 새로 불러오십시오." |
| **CLM-10** | 서버는 `CLAIM_IN_PROGRESS`(동시 요청)를 계속 반환할 수 있어야 한다(PS-A EG-10 승계) — 클라이언트 락만으로 방어하지 않는다 |

> **왜 이것이 PS-A CL-3보다 나은가.** PS-A의 "확인 중으로 종결, 재시도 없음"은 **허브 호출의
> 부분 성공 가능성** 때문이었다. (C)에는 부분 성공이 없다 — 원장 증가는 전부이거나 전무다.
> 그러므로 "모른다"를 영구 잠금으로 만들 이유가 사라졌고, **재조회 한 번으로 진실이 확정된다.**
> 이것은 규칙 완화가 아니라 **위험이 실제로 사라진 자리에서 규칙을 정확하게 다시 그은 것**이다.

### 4.5 클레임 화면이 만들지 않는 것

- 최소 수령 금액 UI: (C)에서 클레임은 실비가 0이므로 최소 금액의 근거가 없다. **PS-A EG-11의
  `claim.minimum` 경로는 로컬 클레임에서 렌더하지 않는다.** 최소 금액은 **출금**에 존재한다(§5).
- 부분 수령·금액 입력: 클레임 단위는 사용자×코인 전액이다(C-5).
- 수령 예약·자동 수령: 스트릭 유인과 구조적으로 같아진다(LA-8).

---

## 5. BANA 출금 (WD)

### 5.1 목표

사용자가 **얼마를 보낼 수 있고, 무엇이 차감되며, 지금 어느 단계에 있는지**를 정확히 알고,
그 단계 표시가 **실제로 일어난 일보다 앞서가지 않는다.**

### 5.2 진입 — 가용 잔고의 출처가 바뀐다

| ID | 요구 |
|----|------|
| **WD-1** | LOCAL 코인의 출금 가능액은 **A-3 `getUserCoinBalance().available`**이다. 허브 잔고 응답에서 유도하지 않는다. **현재 `Withdraw.tsx:30-39, 148`은 허브 잔고 행만 합산하므로, BANA는 항상 잔고 0으로 계산되어 `hasNoBalance`(`:163`)로 빠지고 `noBalanceHint`("No {asset} available to withdraw — deposit first.")가 표시된다. 이 문구는 (C)에서 이중으로 틀린다 — 잔고는 다른 곳에 있고, 입금은 지원하지 않는다** |
| **WD-2** | 코인 선택 목록에 LOCAL 코인이 나타나는 조건은 `localWithdrawRail = LIVE`다. `UNAVAILABLE`/`PAUSED`이면 **목록에 나타나되 선택 시 상태칩**으로 처리한다(LA-4 — 사라지면 사용자는 검색을 계속한다) |
| **WD-3** | 출금 화면은 **한 요청에 한 권위**만 다룬다. 코인 선택으로 레일이 결정되고, 그 이후 화면의 문구·수수료·상태 사전이 전부 그 레일의 것으로 바뀐다 |

### 5.3 가스비·최소 출금 금액 고지 (W-7 / T-2′)

T-2′: **LOCAL 코인의 수수료는 관리자 설정값이 유일한 값이며, 가스 실비를 하한으로 삼는다.
최소 출금 금액은 그 하한보다 충분히 커야 한다.**

| ID | 요구 |
|----|------|
| **WD-4** | **수수료와 최소 금액은 금액 입력 단계에서, 누르기 전에 보인다.** 400 응답으로 알려주는 설계 금지(PS-A EG-11과 같은 원칙) |
| **WD-5** | **관리자 설정값이 없으면 출금을 열지 않는다.** 수수료 미설정은 "수수료 0"이 아니다. **현재 `Withdraw.tsx:109`가 관리자 추가 코인에 대해 `fee: '0', min: '0'`을 폴백으로 넣는다 — 이 폴백은 "이 출금의 수수료는 0"이라는 아무도 설정한 적 없는 주장을 화면에 렌더한다.** LOCAL 코인에 대해 이 폴백을 제거하고, 값이 없으면 `localWithdrawRail`을 `UNAVAILABLE`로 취급한다 |
| **WD-6** | 수수료 문구는 **무엇을 위한 비용인지** 말한다. "네트워크 수수료"는 허브 레일의 표현이고, LOCAL 레일에서는 회사 지갑이 부담하는 **온체인 전송 비용**이다. 채택: `withdraw.feeLocalHelp` — "온체인 전송 비용을 충당하는 수수료입니다. BANA로 차감됩니다." **가스가 BNB로 지불된다는 내부 사실을 사용자에게 설명하지 않는다**(사용자가 BNB를 준비해야 한다는 오해를 만든다) |
| **WD-7** | 최소 출금 금액 문구는 **이유를 붙이지 않는다.** "수수료보다 커야 하므로"는 내부 사정이다. `withdraw.belowMin`(기존 키) 재사용: "최소 출금 금액은 {min} {asset}입니다." |
| **WD-8** | 금액 요약은 **세 줄**로 고정한다. 두 줄로 줄이면 반드시 하나가 모호해진다 |

```
보내는 금액        100.000000000000000000 BANA   ← 수신 주소에 실제로 도착하는 금액
수수료               2.000000000000000000 BANA
────────────────────────────────────────────
잔고에서 차감      102.000000000000000000 BANA   ← 홀드/차감되는 총액
```

> **열린 접합부 — `WithdrawalRequest.amount`의 의미(§11-1).** 실측 결과 `WithdrawalRequest`에
> **수수료 필드가 없다**(`schema.prisma:122-142`). 그런데 A-5 §2.4-6은 온체인 검증이
> `expectedAmount = wr.amount`와 Transfer 로그 값의 **정확 일치**를 요구하고, A-3 §4.3의
> `executeHold`는 **홀드 금액**을 차감한다. 수수료가 존재하는 순간 이 둘은 같은 수가 될 수
> 없다. **권고: `amount`(온체인 전송액) / `feeAmount` / `debitTotal = amount + feeAmount`를
> 각각 저장하고, 홀드 = `debitTotal`, 검증 = `amount`, W-2 불변식을
> `Σ홀드 == Σ(amount + feeAmount)`로 다시 쓴다.** 화면은 세 값을 전부 표시한다(WD-8).
> **확정은 `prisma-db-expert` + `web-shared-expert`(A-5) 소관이며, 결정 전에는 출금 화면을
> 구현할 수 없다** — 어느 숫자를 "당신이 받는 금액"이라 부를지가 정해지지 않았기 때문이다.

### 5.4 사용자 상태 사전 — `AWAITING_ONCHAIN`을 포함한 전 상태

| 서버 상태 | 레일 | 사용자 표시 | 부가 표시 |
|---|---|---|---|
| `PENDING` | 공통 | **검토 대기** | 홀드로 잔고가 줄어 있음을 잔고 화면과 일치시킴(LB-3) |
| `PROCESSING` | 공통 | **검토 대기**(같은 표시) | 찰나의 내부 상태다. 별도 사용자 상태를 만들면 새로고침 타이밍에 따라 상태가 오락가락한다 |
| `AWAITING_ONCHAIN` | LOCAL | **승인됨 · 전송 대기** | `withdraw.status.awaitingOnchainHelp` 1줄. **txHash 미노출**(LA-7). **소요 시간 미표시**(LA-5) |
| `APPROVED` | HUB | **완료** | 기존 그대로 |
| `APPROVED` | LOCAL | **완료** | txHash + 블록 익스플로러 링크 + 확정 시각(`onchainVerifiedAt`) |
| `REJECTED` | 공통 | **거절됨** | 사유(있으면). 홀드 해제로 잔고가 복구되었음을 명시 |
| `FAILED` | 공통 | **처리되지 않음** | "요청이 처리되지 않았습니다. 잔고는 그대로입니다." 재시도 버튼 없음 |

| ID | 요구 |
|----|------|
| **WD-9** | `AWAITING_ONCHAIN`의 문구는 **"승인되었으며 전송을 기다리고 있습니다"**다. "전송 중"·"처리 중"·"곧 도착"·시간 추정 전부 금지(LA-5) |
| **WD-10** | 사용자에게 보이는 txHash는 `onchainVerifiedAt != null`일 때만 렌더한다(LA-7). **검증 시도 이력·실패 사유는 사용자에게 노출하지 않는다** — 관리자 운영 정보이며, 사용자에게는 "아직 완료되지 않음"이라는 사실 하나가 정확한 상태다 |
| **WD-11** | 상태 변화 시 잔고 화면의 ⓓ(출금 신청 보류)와 **항상 정합**해야 한다. 요청이 `APPROVED`가 되면 ⓓ가 줄고 ⓐ도 줄어야 하며, `REJECTED`면 ⓓ만 줄고 ⓐ는 그대로다 |
| **WD-12** | **이력 병합 회귀(A-5 §1.8)를 함께 고친다.** 현재 `GET /api/nia/withdrawals`는 로컬 행을 `PENDING/PROCESSING/REJECTED/FAILED`일 때만 병합하므로, ① `AWAITING_ONCHAIN` 구간에 사용자 화면에서 요청이 **사라지고** ② LOCAL `APPROVED`는 **완료 후 영원히 사라진다**. 화면 요구로 다시 못 박는다: **LOCAL 레일 요청은 모든 상태에서 사용자 이력에 보인다** |

### 5.5 해피 패스

```
잔고 화면(그룹 2) 또는 출금 메뉴 진입
  → 코인 BANA 선택 → 네트워크 선택(단일이면 자동)
  → 금액 입력: 사용 가능 = A-3 available (WD-1)
       [최대] = available − 수수료  (수수료를 뺀 값. 오늘 `handleMax`와 같은 규약)
  → 수신 주소 입력 (EVM 정규식 + 저장된 주소)
  → 요약 3줄 확인 (WD-8) + 되돌릴 수 없음 고지
  → [출금 신청]
  → 서버: 잔고검증 + 홀드 + 요청 생성이 하나의 트랜잭션 (A-5 §3.2)
  → 결과 화면: "출금을 신청했습니다" + 요청 ID + 상태 「검토 대기」
  → 잔고 화면: ⓑ 감소, ⓓ 증가  (같은 새로고침 안에서)
```

### 5.6 엣지 케이스 & 에러 경로

| ID | 상황 | 화면 | 금지 |
|----|------|------|------|
| **WE-1** | `localWithdrawRail = UNAVAILABLE` | 코인 선택 시 **상태칩** + `withdraw.railUnavailable`. 금액 입력 폼 자체를 렌더하지 않는다 | 비활성 버튼(조건을 채우면 될 것처럼 보인다), "준비 중" |
| **WE-2** | `localWithdrawRail = PAUSED`(운영 중지) | 상태칩 + `withdraw.railPaused` | 일정 함의 |
| **WE-3** | 코인 `T2_HALTED` | 상태칩 + `notice.coinHalted`. **잔고는 계속 보인다** | 잔고 숨김, 원인 설명 |
| **WE-4** | 수수료·최소 금액 미설정 | WE-1과 동일 처리(WD-5) | 수수료 0 표시 |
| **WE-5** | `available` 부족 | 비활성 버튼 + `withdraw.amountExceedsAvailable`(가용액 명시) | 총 잔고 기준으로 판정 |
| **WE-6** | 최소 금액 미만 | 비활성 버튼 + `belowMin` | 신청 후 400 |
| **WE-7** | 이미 보류 중인 요청이 있어 available이 줄어 있음 | 금액 필드 옆 `withdraw.heldNote`("출금 신청 보류 {amount} {coin} 제외") + 해당 요청 링크 | 이유 없이 줄어든 숫자만 보여주기 |
| **WE-8** | 잔고 조회 실패 | **신청 버튼 비활성 + "잔고를 불러오지 못했습니다"**. LOCAL 레일은 fail-closed다(W-1) — 서버 검증에 맡기고 입력을 허용하는 PS-A EG-9의 완화는 **적용하지 않는다** | 잔고 0으로 간주, 낙관적 진행 |
| **WE-9** | 주소 형식 오류 | 기존 `invalidAddress` | 서버 왕복 |
| **WE-10** | 자기 자신(플랫폼 통제 주소)으로 출금 시도 | 서버가 거부 → `WITHDRAW_ADDRESS_NOT_ALLOWED`. **주소 목록의 존재를 노출하지 않는 문구**로 | 통제 주소 목록 유출 |
| **WE-11** | 신청 직후 새로고침·이탈 | 서버 상태로 재구성. 중복 신청이 만들어지지 않아야 한다(A-5 in-flight 가드 + 홀드) | 클라이언트 낙관적 상태 |
| **WE-12** | 세션 만료 | 입력값 보존 + 로그인 유도(PS-A EG-13 승계) | 조용한 실패 |

---

## 6. 관리자 큐 (ADM)

> A-5 §1.7이 남긴 데이터 계약 위에 화면을 정의한다. **A-5가 정한 상태기계·검증 절차를
> 재정의하지 않는다.**

### 6.1 목표

관리자가 **두 레일을 헷갈리지 않고**, 승인이 송금이 아님을 알고, 자기가 실행한 전송을
시스템이 **독립 검증**하도록 만든다.

### 6.2 목록 화면

| ID | 요구 |
|----|------|
| **ADM-1** | **레일 컬럼은 1급 필드다**(W-9). 「허브 자동」 / 「수동 온체인」 — 정렬·필터 가능. 목록에서 이 구분이 보이지 않으면 관리자가 잘못된 조치를 한다(rev03 W-9 원문) |
| **ADM-2** | 기본 필터를 **「내 조치가 필요한 것」**으로 둔다: `PENDING` + `AWAITING_ONCHAIN`. `AWAITING_ONCHAIN`이 기본 목록에서 빠지면 **승인만 하고 전송을 잊는 경로**가 열린다 — 이것이 이 화면의 최대 운영 리스크다 |
| **ADM-3** | 각 행: 요청일시 / 사용자(email) / 코인 / 보내는 금액 / 수수료 / 차감 총액 / 레일 / 상태 / 홀드 상태 / 최근 검증 결과 |
| **ADM-4** | **`AWAITING_ONCHAIN` 체류 시간을 행에 표시**한다(예: "3시간 12분 경과"). SLA가 없더라도 **경과 시간은 사실**이며, 잊힌 요청을 드러내는 유일한 신호다. 임계 시간 초과 행은 시각적으로 구분한다(임계값은 `PlatformSetting`, 기본값은 운영이 정한다) |
| **ADM-5** | 홀드 상태(`ACTIVE`/`RELEASED`/`EXECUTED`)를 그대로 표시한다. `AWAITING_ONCHAIN`인데 홀드가 `ACTIVE`가 아닌 행은 **불변식 위반**이므로 경보 스타일로 렌더한다 |
| **ADM-6** | 세 상태(로딩/실패/영)를 구분해 렌더한다. 빈 목록을 "처리할 것 없음"으로 렌더하되, 조회 실패는 **절대 빈 목록으로 렌더하지 않는다**(`docs/patterns/product-planner.md`, `admin/staking/page.tsx:69`의 `.catch(() => [])` 패턴을 그대로 복제하지 않을 것) |

### 6.3 상세 — 승인은 송금이 아니다

```
┌ 출금 요청 #wr_abc123 ────────────────────────────────────────┐
│ 상태  PENDING          레일  수동 온체인 (LOCAL)             │
│ 사용자 user@example.com                                      │
│ 보내는 금액  100.000000000000000000 BANA                     │
│ 수수료        2.000000000000000000 BANA                      │
│ 차감 총액   102.000000000000000000 BANA   홀드 ACTIVE        │
│ 수신 주소  0xabc…def                                         │
│                                                              │
│ [ 승인 ]  [ 거절 ]                                           │
│ ⚠ 승인은 자금을 보내지 않습니다. 승인 후 전송은 관리자가      │
│   직접 실행합니다.                                            │
└──────────────────────────────────────────────────────────────┘
```

| ID | 요구 |
|----|------|
| **ADM-7** | 승인 버튼 옆의 **"승인은 자금을 보내지 않습니다"는 필수 문구**이며 접기·툴팁 금지(LA-6) |
| **ADM-8** | HUB 레일 상세에서는 이 문구를 렌더하지 않는다(거기서는 승인이 곧 실행이다). 두 레일에서 같은 버튼이 다른 의미를 갖는다는 것 자체가 위험이므로, **버튼 라벨도 분기한다**: HUB「승인 및 전송」 / LOCAL「승인(전송 대기로 이동)」 |
| **ADM-9** | 승인 실패(`assertExecutionAllowed`가 T2로 거부, A-5 §6-2)는 **명시적 오류 표시**이며 상태를 조용히 되돌리지 않는다 |

### 6.4 전송 지시 블록 (`AWAITING_ONCHAIN` 진입 후)

이 블록의 목적은 하나다 — **관리자가 `AMOUNT_MISMATCH`/`WRONG_CONTRACT`를 만들지 않게 하는 것.**
A-5 §2.4는 근사 일치를 통과시키지 않으므로, 오타 하나가 곧 재작업이다.

```
┌ 전송 정보 (이 값 그대로 전송) ───────────────────────────────┐
│ 체인            BSC (chainId 56)                     [복사]  │
│ 토큰 컨트랙트   0x154a8Ca…                           [복사]  │
│ 수신 주소       0xabc…def                            [복사]  │
│ 전송 금액       100.000000000000000000               [복사]  │
│ ⚠ 금액은 정확히 일치해야 합니다. 반올림·부분 전송은          │
│   검증을 통과하지 못합니다.                                   │
│ ⚠ 수수료 2 BANA는 사용자 잔고에서 차감되며, 온체인으로       │
│   전송하는 금액에는 포함되지 않습니다.                        │
└──────────────────────────────────────────────────────────────┘
```

| ID | 요구 |
|----|------|
| **ADM-10** | 전송 금액은 **사용자에게 도착해야 하는 금액**(`amount`)이며 `debitTotal`이 아니다. 두 값이 같은 블록에 나란히 있으면 반드시 잘못 복사된다 — 그래서 전송 정보 블록에는 **`amount`만** 넣고 수수료는 경고 문장으로만 언급한다 |
| **ADM-11** | 각 값에 개별 복사 버튼. 조합된 문자열(예: "100 BANA to 0x…")을 복사 대상으로 만들지 않는다 |
| **ADM-12** | 금액은 **decimal 문자열 원본**을 그대로 표시·복사한다. 절단·지수 표기·천 단위 구분 금지 |

### 6.5 txHash 제출 · 검증 결과

```
┌ 전송 확인 ───────────────────────────────────────────────────┐
│ 트랜잭션 해시  [ 0x…                                    ]     │
│ [ 검증 ]                                                     │
│                                                              │
│ ─ 검증 시도 이력 ──────────────────────────────────────      │
│ 14:32  0x9f2…  AMOUNT_MISMATCH                               │
│        expected 100.000000000000000000,                      │
│        observed  99.500000000000000000                       │
│ 14:35  0x71c…  INSUFFICIENT_CONFIRMATIONS (8/15)             │
│        내용은 일치, 확정 대기 중                              │
│ 14:41  0x71c…  PASS → 정산 완료                               │
└──────────────────────────────────────────────────────────────┘
```

| ID | 요구 |
|----|------|
| **ADM-13** | 검증 결과는 **일시적/영구적**을 시각적으로 구분한다(A-5 §2.5 표를 그대로 배선). 일시적(`TX_NOT_FOUND`, `TX_PENDING`, `INSUFFICIENT_CONFIRMATIONS`, `RPC_UNAVAILABLE`)은 **재시도 안내**, 영구적(`TX_REVERTED`, `NO_TRANSFER_EVENT`, `WRONG_CONTRACT`, `WRONG_RECIPIENT`, `AMOUNT_MISMATCH`)은 **해시 재확인 안내** |
| **ADM-14** | `RPC_UNAVAILABLE`은 **실패가 아니라 판정 불가**로 렌더한다. 실패 색·실패 아이콘을 쓰지 않는다. "확인할 수 없습니다"이지 "틀렸습니다"가 아니다(A-5 §2.1-3) |
| **ADM-15** | `INSUFFICIENT_CONFIRMATIONS`는 **"내용 일치, 확정 대기"**로 표시하고 관측 컨펌/필요 컨펌을 함께 보여준다. 이것을 실패로 렌더하면 관리자가 이미 성공한 전송을 재전송한다 — **가장 비싼 오표시다** |
| **ADM-16** | `TX_ALREADY_CONSUMED`는 **상향 심각도**로 렌더한다(A-5 §2.5). "이 해시는 이미 다른 요청의 정산에 사용되었습니다" + 해당 요청 링크 |
| **ADM-17** | **검증 실패가 상태를 바꾸지 않는다는 사실이 화면에 보여야 한다.** 실패 후에도 상태는 `AWAITING_ONCHAIN`으로 남고, 그 사실을 명시한다(W-5) |
| **ADM-18** | 시도 이력은 **전부 보존·표시**한다. 최신 결과가 이전 결과를 덮어쓰지 않는다(A-5 §1.4의 설계 의도가 화면에서 무효화되지 않도록) |
| **ADM-19** | 쿨다운(429)은 검증 실패로 기록·표시하지 않는다. 버튼 비활성 + 남은 시간만 표시(A-5 §2.10) |
| **ADM-20** | 실패 사유 코드는 **원문 코드 + 로컬라이즈된 짧은 설명 + `detail` 원문**을 함께 보여준다. 코드를 숨기면 운영 티켓에서 서로 다른 말로 같은 사고를 부르게 된다 |

### 6.6 관리자 화면이 만들지 않는 것 (명시)

| ID | 금지 | 이유 |
|----|------|------|
| **ADM-N1** | **「완료로 표시」/「강제 정산」 버튼** | W-4를 정면으로 무효화한다. 정산은 검증 통과로만 일어난다. 이 버튼이 존재하면 검증 헬퍼 전체가 장식이 된다 |
| **ADM-N2** | **「abandon-onchain」(전송 대기 → 거절)** | A-5 §1.6이 **미승인**으로 남겼다. `wallet-security-expert`(A-10) 결정 전까지 렌더하지 않는다. 채택 시에는 타이핑 확인 + 상급 권한 + 상향 감사 기록이 함께여야 한다(A-5 §1.6) |
| **ADM-N3** | **일괄 승인 / 일괄 검증** | LOCAL 레일의 승인은 사람이 그 뒤에 실물 전송을 해야 하는 약속이다. 일괄 처리는 그 약속을 무의식적으로 만든다 |
| **ADM-N4** | **개인키·서명·니모닉 입력 필드** | rev03 §8.3 금지 ⑥. 이 화면에 그런 입력이 등장하는 순간 설계 위반이다 |

---

## 7. 입금 레일 UX (DEP)

### 7.1 현재 사실

- BANA `depositEnabled = false`(N-24, 2026-08-10 06:28 UTC 전환 완료).
- 그 결과 `Deposit.tsx:72-79`의 병합 필터(`n.depositEnabled !== false`)에 걸려 **BANA가 코인
  선택 목록에서 조용히 사라졌다.**
- 자체 입금 레일은 미착수이며 방식조차 미정이다(Q-M5 미회신). Q-M5가 "(나) 로컬 원장 유지"로
  회신되면 BANA는 계속 자체 감지(D-B2/D-C)로 간다.

### 7.2 판정 — "사라짐"은 메시지가 아니다

목록에서 사라진 자산은 사용자에게 **"이 서비스가 고장났나"** 또는 **"다른 경로로 보내면
되겠지"**로 읽힌다. 후자가 실제 자금 사고를 만든다. 특히 **과거에 BANA 입금 주소를 발급받은
사용자가 있을 수 있다**(B-10 미확인) — 그 사용자에게 오늘의 화면은 아무 말도 하지 않는다.

> **X-7과의 정합(중요).** rev03 X-7은 *"로컬 입금 레일이 구축되기 전까지 입금 화면에
> 노출하지 않는다"*고 썼다. 이 문서는 그것을 **"주소로 가는 경로를 만들지 않는다"**로 읽고,
> **"자산의 존재와 미지원 사실을 말하지 않는다"**로는 읽지 않는다. 아래 설계는 **어떤 경우에도
> 주소 생성 호출을 발생시키지 않으므로** X-7의 실질(되돌릴 수 없는 주소 발급 방지)을 그대로
> 지킨다. **X-7을 더 엄격하게(=화면에 문자열조차 금지) 읽어야 한다면 `pm`이 §11-5에서
> 판정해 달라.**

### 7.3 세 가지 상태를 절대 섞지 않는다

| 상태 | 조건 | 표시 | 주소 생성 |
|---|---|---|---|
| **미지원** | `localDepositRail = UNSUPPORTED` (레일 자체가 없음) | `deposit.unsupportedAsset` — **"BANA는 현재 입금을 지원하지 않습니다."** | 호출하지 않음 |
| **판정 불가** | 허브 markets 조회 실패 등 X-7 fail-closed | `deposit.checkUnavailable` — "지금은 확인할 수 없습니다. 잠시 후 다시 시도하십시오." | 호출하지 않음 |
| **정상** | HUB 권위 + 허브 지원 + 활성 | 오늘의 흐름 그대로 | 호출 |

| ID | 요구 |
|----|------|
| **DEP-1** | 위 세 상태에 **서로 다른 문구**를 쓴다. 현재 `Deposit.tsx:197-201`은 `addrError`와 주소 부재를 하나로 묶어 `networkUnavailable`/`addressError`("잠시 후 다시 시도")로 렌더한다. **미지원 자산에 "잠시 후 다시 시도"를 보여주는 것은 사용자를 무한히 기다리게 하는 것이다** |
| **DEP-2** | **미지원 상태에서 일정을 함의하는 어떤 표현도 쓰지 않는다.** 금지: 준비 중, 곧, 예정, coming soon, まもなく, 即将, sắp, เร็ว ๆ นี้ (PS-A AC-V10과 같은 lint 대상) |
| **DEP-3** | 미지원 자산은 **코인 선택기에서 선택 불가**하며, 선택해도 주소 단계로 진행하지 않는다. 검색 기능이 있는 선택기라면 검색 결과에 **비선택 항목 + "입금 미지원"** 배지로 나타난다(사라지지 않는다) |
| **DEP-4** | 입금 화면 하단에 **미지원 자산 고지 블록**을 상시 렌더한다(§8.4 `deposit.unsupportedBlock`). 대상 코인 목록은 서버 플래그로 렌더하며 하드코딩하지 않는다 |
| **DEP-5** | **과거 발급 주소 경고를 함께 렌더한다**(B-10 대응): "이전에 발급된 BANA 입금 주소가 있더라도 사용하지 마십시오. 해당 주소로 보낸 자산은 자동으로 반영되지 않습니다. 이미 보내셨다면 고객지원에 문의하십시오." — **"복구할 수 없습니다"라고 단정하지 않는다**(B-10 결과 미확인). **"반영됩니다"라고도 하지 않는다**(자동 크레딧 경로가 없다는 것은 확정 사실이다) |
| **DEP-6** | 「최근 입금」 목록은 허브 데이터이므로 그대로 둔다. 다만 **로컬 코인의 입금이 여기 나타날 수 없다는 점**을 이용해, 목록 상단에 코인 필터나 "BANA 입금 없음" 같은 문구를 만들지 않는다 — 존재하지 않는 기능의 부재를 설명하는 UI는 소음이다 |

### 7.4 향후 레일 도입 시의 슬롯 (설계 예고 — 지금 만들지 않는다)

Q-M5 회신 후 D-C(해시 제출) 또는 D-B2(입금 컨트랙트)가 채택되면 아래가 필요해진다.
**이번 범위 밖이며, 지금 슬롯을 비워 두는 UI도 만들지 않는다**(빈 자리 예고 금지 — PS-A L-8과
같은 원칙).

| 항목 | 필요해질 것 |
|---|---|
| 확정 깊이(DP-2) | "확인 중" 상태 표시 + **인출 가능 잔고에 미포함**임을 명시. 두 잔고를 만드는 것이 아니라 §3.2의 홀드와 같은 축으로 표현할 것 |
| 최소 입금(DP-4) | 미만 입금은 **크레딧되지 않되 기록된다**는 사실을 사전 고지 |
| 잘못된 네트워크/토큰(DP-5) | 사전 고지 + 사후 안내. **복구에 키가 필요한 케이스는 "복구 불가"라고 정직하게 쓴다**(DP-5 원문) |
| D-C 해시 제출 | 사용자용 제출 폼 + 관리자 승인 큐. §6과 **대칭 구조**로 설계(rev03 §3.2 PM 권고) |
| D-B2 컨트랙트 | `approve + deposit` 2트랜잭션 UX + "그냥 주소로 보낸 사용자"에 대한 백스톱 안내 |

### 7.5 SLA 미정이 만드는 제약

rev03 §11-17이 명시한 대로 D-C의 처리 SLA는 제품 결정이며 미정이다. **SLA가 정해지기 전에는
입금 대기 화면에 소요 시간을 쓸 수 없다**(LA-5). 이것은 D-C 채택 여부 판단의 입력이기도 하다 —
"며칠 걸릴 수 있으나 얼마인지 말할 수 없는" 입금 경험이 수용 가능한지가 곧 D-B2로 넘어가는
시점을 정한다.

### 7.6 지금 실행 가능한 부분 (게이트 무관)

§7의 요구 중 **DEP-1 / DEP-2 / DEP-4 / DEP-5는 로컬 원장·입금 레일과 무관하게 오늘 유효하다.**
오늘 BANA 입금은 이미 꺼져 있고, 화면은 그 사실을 말하지 않고 있다. 이 간극은 v2 게이트와
아무 관계가 없다.

> **단 이것도 자동 착수 대상은 아니다.** rev03 §7.1-0d(B-10 확인)의 결과에 따라 DEP-5 문구가
> 강해져야 할 수 있으므로, **B-10 확인과 함께 처리할 것을 권고**한다. 순서를 뒤집어 문구를
> 먼저 배포하면, B-10에서 실제 도착 자금이 발견됐을 때 "문의하십시오"가 이미 배포된 상태에서
> 대응 절차가 없는 상황이 된다.

---

## 8. 카피 원문 (EN 소스 / KO)

> `web/messages/en.json`이 소스 로케일이다. 6로케일 배선은 구현 담당.
> PS-A §8의 톤 규칙 T-1~T-7을 **전부 승계**하고 아래를 더한다.

> **T-8 (신규).** **"지갑(wallet)"이라는 단어를 로컬 잔고에 쓰지 않는다.** 사용자에게 "지갑"은
> 자기가 통제하는 외부 지갑 또는 즉시 쓸 수 있는 돈을 뜻한다. 로컬 잔고는 둘 다 아니다.
> 대체어: **"BANA 잔고" / "your BANA balance"**.

### 8.1 잔고 (`walletPage.*` 확장)

| 키 | EN | KO |
|----|-----|-----|
| `groupCustody` | Deposit & withdrawal account | 입출금 계정 |
| `groupPlatform` | Platform-issued assets | 플랫폼 발행 자산 |
| `groupPlatformHelp` | BANA is issued by the BANA platform. This balance is recorded by BANA. To send it to an external address, request a withdrawal; requests are reviewed and then sent on-chain. | BANA는 BANA 플랫폼이 발행한 자산입니다. 이 잔고는 BANA가 기록합니다. 외부 주소로 보내려면 출금을 신청하며, 신청 건은 검토를 거쳐 온체인으로 전송됩니다. |
| `localBalanceLabel` | Balance | 잔고 |
| `localAvailableLabel` | Available | 사용 가능 |
| `localHoldStake` | Locked for staking | 스테이킹 잠금 |
| `localHoldWithdrawal` | Held for a withdrawal request | 출금 신청 보류 |
| `localHoldOther` | Other hold | 기타 보류 |
| `localHoldWithdrawalLink` | View request | 신청 보기 |
| `localEmpty` | No BANA recorded yet. | 아직 기록된 BANA가 없습니다. |
| `localLoadFailed` | Could not load this balance. | 이 잔고를 불러오지 못했습니다. |

정정 대상(라이브):

| 키 | 현재 | 정정 후 EN | 정정 후 KO |
|----|------|-----------|-----------|
| `staking.yield.claimableHelp` | "…moved to your wallet balance." | Recorded in your staking ledger. Claim it to move it to your BANA balance. | 스테이킹 원장에 기록된 금액입니다. 수령하면 BANA 잔고로 옮겨집니다. |
| `staking.yield.claimedLabel` | Claimed to wallet / 지갑 수령 완료 | Claimed | 수령 완료 |
| `staking.yield.claimedHelp` | "Already moved to your wallet balance." | Already moved to your BANA balance. | BANA 잔고로 옮겨진 금액입니다. |
| `staking.yield.lockedHelp` | "…stays in your wallet…" | Your principal stays in your BANA balance but cannot be withdrawn until the term ends. | 원금은 BANA 잔고에 그대로 있으며, 약정이 끝날 때까지 출금할 수 없습니다. |

### 8.2 클레임 (`staking.claim.*` 확장·정정)

| 키 | EN | KO |
|----|-----|-----|
| `destinationNote` | Claiming moves the amount to your BANA balance right away. To send it to an external address, request a withdrawal. | 수령하면 BANA 잔고로 즉시 반영됩니다. 외부 주소로 보내려면 출금을 신청해야 합니다. |
| `confirmBody` **(정정)** | {amount} {coin} will be moved to your BANA balance. This is all {coin} yield recorded up to now. | {amount} {coin}이 BANA 잔고로 옮겨집니다. 지금까지 기록된 {coin} 수익 전액입니다. |
| `confirmNote2` **(신규)** | Sending it to an external address is a separate request that is reviewed first. | 외부 주소로 보내는 것은 검토를 거치는 별도의 신청입니다. |
| `succeeded` **(정정)** | {amount} {coin} moved to your BANA balance. | {amount} {coin}이 BANA 잔고로 옮겨졌습니다. |
| `resultUnknownRefresh` **(신규)** | The result could not be confirmed. Reload the status to see whether it went through. | 결과를 확인하지 못했습니다. 상태를 새로 불러오면 처리 여부를 확인할 수 있습니다. |
| `refreshStatus` **(신규)** | Reload status | 상태 새로고침 |

**삭제·미생성:** 클레임 수수료 관련 키를 만들지 않는다(CLM-4). PS-A의 `claim.minimum`은
로컬 클레임 경로에서 렌더하지 않는다(§4.5).

### 8.3 출금 (`withdraw.*` 확장)

| 키 | EN | KO |
|----|-----|-----|
| `railUnavailable` | Withdrawing {coin} is not available. | {coin} 출금은 제공되지 않습니다. |
| `railPaused` | {coin} withdrawals are stopped right now. | {coin} 출금이 현재 중지되어 있습니다. |
| `coinHalted` | Withdrawals for this asset are stopped. Your balance is recorded as it is. | 이 자산의 출금 처리를 일시 중지했습니다. 잔고는 그대로 기록되어 있습니다. |
| `availableLabel` | Available to withdraw | 출금 가능 |
| `heldNote` | {amount} {coin} is held for a withdrawal request you already made. | 이미 신청한 출금 건으로 {amount} {coin}이 보류 중입니다. |
| `amountExceedsAvailable` | Available to withdraw is {available} {coin}. | 출금 가능 금액은 {available} {coin}입니다. |
| `feeLocalLabel` | Fee | 수수료 |
| `feeLocalHelp` | Covers the cost of the on-chain transfer. It is charged in {coin}. | 온체인 전송 비용을 충당하는 수수료입니다. {coin}으로 차감됩니다. |
| `sendAmountLabel` | Amount to send | 보내는 금액 |
| `debitTotalLabel` | Deducted from your balance | 잔고에서 차감 |
| `statusPending` | Awaiting review | 검토 대기 |
| `statusAwaitingOnchain` | Approved · awaiting transfer | 승인됨 · 전송 대기 |
| `statusAwaitingOnchainHelp` | This request was approved and is waiting to be sent on-chain. | 이 신청은 승인되었으며 온체인 전송을 기다리고 있습니다. |
| `statusCompletedLocal` | Completed | 완료 |
| `statusRejected` | Rejected | 거절됨 |
| `statusRejectedHelp` | The held amount is available in your balance again. | 보류되었던 금액은 다시 잔고에서 사용할 수 있습니다. |
| `statusFailed` | Not processed | 처리되지 않음 |
| `statusFailedHelp` | This request was not processed. Your balance is unchanged. | 이 신청은 처리되지 않았습니다. 잔고는 그대로입니다. |
| `txHashLabel` | Transaction | 트랜잭션 |
| `viewOnExplorer` | View on block explorer | 블록 익스플로러에서 보기 |

### 8.4 입금 (`deposit.*` 확장)

| 키 | EN | KO |
|----|-----|-----|
| `unsupportedAsset` | {coin} deposits are not supported. | {coin} 입금은 지원하지 않습니다. |
| `unsupportedBadge` | Deposits not supported | 입금 미지원 |
| `unsupportedBlockTitle` | Assets that cannot be deposited | 입금할 수 없는 자산 |
| `unsupportedBlockBody` | {coins} cannot be deposited to this account. Do not send them to any address shown elsewhere. | {coins}은(는) 이 계정으로 입금할 수 없습니다. 다른 곳에 표시된 주소로 보내지 마십시오. |
| `formerAddressWarning` | If you were given a {coin} deposit address before, do not use it. Assets sent to it are not credited automatically. If you have already sent some, contact support. | 이전에 발급된 {coin} 입금 주소가 있더라도 사용하지 마십시오. 해당 주소로 보낸 자산은 자동으로 반영되지 않습니다. 이미 보내셨다면 고객지원에 문의하십시오. |
| `checkUnavailable` | This cannot be checked right now. Try again in a moment. | 지금은 확인할 수 없습니다. 잠시 후 다시 시도하십시오. |

### 8.5 관리자 (`admin.withdrawals.*`)

| 키 | EN | KO |
|----|-----|-----|
| `railHub` | Hub (automatic) | 허브 자동 |
| `railLocal` | Manual on-chain | 수동 온체인 |
| `approveHub` | Approve and send | 승인 및 전송 |
| `approveLocal` | Approve (move to awaiting transfer) | 승인(전송 대기로 이동) |
| `approveLocalWarning` | Approving does not send funds. You must execute the transfer yourself afterwards. | 승인은 자금을 보내지 않습니다. 승인 후 전송은 관리자가 직접 실행해야 합니다. |
| `transferInfoTitle` | Transfer details (send exactly these values) | 전송 정보 (이 값 그대로 전송) |
| `transferExactWarning` | The amount must match exactly. Rounded or partial transfers will not pass verification. | 금액은 정확히 일치해야 합니다. 반올림·부분 전송은 검증을 통과하지 못합니다. |
| `transferFeeNote` | The {fee} {coin} fee is deducted from the user's balance and is not part of the on-chain transfer. | 수수료 {fee} {coin}은 사용자 잔고에서 차감되며, 온체인 전송 금액에는 포함되지 않습니다. |
| `verifyTitle` | Confirm transfer | 전송 확인 |
| `verifyAction` | Verify | 검증 |
| `verifyKeepsStatus` | A failed check does not change the request status. | 검증에 실패해도 신청 상태는 바뀌지 않습니다. |
| `verifyUnknown` | Could not check right now — this is not a failure. | 지금은 확인할 수 없습니다 — 실패가 아닙니다. |
| `verifyWaitingConfirmations` | Matches. Waiting for confirmations ({have}/{need}). | 내용이 일치합니다. 확정 대기 중입니다 ({have}/{need}). |
| `verifyAlreadyConsumed` | This transaction hash has already settled another request. | 이 트랜잭션 해시는 이미 다른 신청의 정산에 사용되었습니다. |
| `awaitingElapsed` | Awaiting transfer for {duration} | 전송 대기 {duration} 경과 |

### 8.6 번역 브리프 (PS-A §9.3의 N-1~N-10에 추가)

| # | 지침 |
|---|------|
| **N-11** | **"지갑/wallet"을 로컬 잔고 문맥에서 쓰지 않는다**(T-8). ja `ウォレット`, zh `钱包`, vi `ví`, th `กระเป๋า`도 동일 |
| **N-12** | `statusAwaitingOnchain`을 "전송 중/送金中/转账中/đang gửi/กำลังโอน"으로 번역하지 않는다. **대기(waiting)**이지 진행(in transit)이 아니다 |
| **N-13** | `unsupportedAsset`에 "아직/yet/まだ/暂时/tạm thời/ชั่วคราว" 같은 **일시성 부사를 넣지 않는다.** 일시적이라는 정보가 없다 |
| **N-14** | `formerAddressWarning`의 "자동으로 반영되지 않습니다"를 "반영되지 않습니다"로 줄이지 않는다. 자동 크레딧의 부재는 확정 사실이고 수동 구제 가능성은 미확정이다 — **부사가 그 차이를 담고 있다** |
| **N-15** | 관리자 문구도 6로케일 대상이다. 단 **실패 사유 코드(`AMOUNT_MISMATCH` 등)와 `detail` 원문은 번역하지 않는다**(ADM-20) |

---

## 9. 에러 코드 → 표시 문구

> 서버 `code` → `staking.error.<CODE>` / `withdraw.error.<CODE>` / `deposit.error.<CODE>`.
> 매핑되지 않은 코드는 `GENERIC`으로 폴백하고, **서버 영문 메시지를 그대로 사용자에게 노출하지
> 않는다**(PS-A §7.2 규약 승계). PS-A의 기존 표는 그대로 유효하며 아래를 더한다.

| 코드 | 영역 | EN | KO |
|------|------|-----|-----|
| `WITHDRAW_RAIL_UNAVAILABLE` | 출금 | Withdrawing {coin} is not available. | {coin} 출금은 제공되지 않습니다. |
| `WITHDRAW_RAIL_PAUSED` | 출금 | {coin} withdrawals are stopped right now. | {coin} 출금이 현재 중지되어 있습니다. |
| `WITHDRAW_COIN_HALTED` | 출금 | Withdrawals for this asset are stopped. Your balance is recorded as it is. | 이 자산의 출금 처리를 일시 중지했습니다. 잔고는 그대로 기록되어 있습니다. |
| `WITHDRAW_INSUFFICIENT_AVAILABLE` | 출금 | Available to withdraw is {available} {coin}. | 출금 가능 금액은 {available} {coin}입니다. |
| `WITHDRAW_BELOW_MIN` | 출금 | The minimum withdrawal is {min} {coin}. | 최소 출금 금액은 {min} {coin}입니다. |
| `WITHDRAW_FEE_NOT_CONFIGURED` | 출금 | Withdrawing {coin} is not available. | {coin} 출금은 제공되지 않습니다. |
| `WITHDRAW_ADDRESS_NOT_ALLOWED` | 출금 | This destination address cannot be used. | 이 수신 주소는 사용할 수 없습니다. |
| `WITHDRAW_BALANCE_CHECK_FAILED` | 출금 | Your balance could not be checked. Try again in a moment. | 잔고를 확인하지 못했습니다. 잠시 후 다시 시도하십시오. |
| `DEPOSIT_NOT_SUPPORTED` | 입금 | {coin} deposits are not supported. | {coin} 입금은 지원하지 않습니다. |
| `DEPOSIT_CHECK_UNAVAILABLE` | 입금 | This cannot be checked right now. Try again in a moment. | 지금은 확인할 수 없습니다. 잠시 후 다시 시도하십시오. |
| `CLAIM_RAIL_UNAVAILABLE` | 클레임 | Claiming is not available yet. | 수령은 아직 제공되지 않습니다. |

> `WITHDRAW_FEE_NOT_CONFIGURED`가 `RAIL_UNAVAILABLE`과 **같은 사용자 문구를 갖는 것은
> 의도적이다.** 사용자에게 두 사건은 구분할 이유가 없고(둘 다 "지금 못 한다"), 구분해 보여주면
> 내부 설정 상태를 노출한다. **코드는 분리하고 문구는 합친다** — 운영은 코드로 진단한다.

---

## 10. 수용 기준 (AC)

PS-A §10의 AC-V1~AC-V24는 **그대로 유효**하다. 아래는 A-7이 추가하는 것이다.

| ID | 기준 |
|----|------|
| **AC-A7-01** | 허브 잔고와 로컬 잔고를 더한 값이 화면 어디에도 렌더되지 않는다. 두 그룹의 값을 하나의 배열로 합치거나 `reduce`로 합산하는 코드가 0건 |
| **AC-A7-02** | 잔고 응답이 권위별로 분리된 구조로 내려오며, 평평한 배열 + 권위 필드 형태가 아니다(R-A7-1) |
| **AC-A7-03** | 로컬 잔고의 로딩·실패·영(0)이 서로 다르게 렌더된다. 실패 시 `0`이 표시되지 않는다 |
| **AC-A7-04** | ⓒ(스테이킹 잠금)와 ⓓ(출금 신청 보류)가 별도 행으로 렌더되며 하나로 합산되지 않는다 |
| **AC-A7-05** | `available`이 클라이언트에서 `balance − holds`로 계산되지 않고 서버 값으로 렌더된다 |
| **AC-A7-06** | LOCAL 권위 코인에 대해 `stakedRows()` 합성 행이 생성되지 않으며, 같은 코인이 두 그룹에 동시에 나타나지 않는다 |
| **AC-A7-07** | 화면·카피 어디에도 "권위 / authority / 원장 / ledger"가 사용자 문자열로 등장하지 않는다(6로케일) |
| **AC-A7-08** | `T1_WARNING` 상태에서 사용자 화면의 렌더 결과가 `CLEAR`와 **완전히 동일**하다 |
| **AC-A7-09** | `T2_HALTED` 상태에서 잔고는 계속 렌더되고, 출금 액션이 **비버튼 상태칩**으로 바뀐다 |
| **AC-A7-10** | 클레임 관련 카피에서 이동 대상이 "지갑"이 아니라 "BANA 잔고"다(6로케일, T-8 lint) |
| **AC-A7-11** | 클레임 슬롯 아래 `claim.destinationNote`가 상시 렌더되며 접기 안에 있지 않다 |
| **AC-A7-12** | 클레임 결과 모호 시 렌더되는 것은 **[상태 새로고침]**이며, 같은 요청을 재전송하는 버튼이 존재하지 않는다 |
| **AC-A7-13** | 클레임 성공 후 그룹 2 잔고가 같은 화면 갱신 안에서 증가한다 |
| **AC-A7-14** | 클레임 수수료 관련 i18n 키가 메시지 파일에 존재하지 않는다 |
| **AC-A7-15** | 클레임 성공·실패 어느 경우에도 게임 상태(XP/SV/MP/연출)가 변하지 않는다(AC-V17 재확인) |
| **AC-A7-16** | LOCAL 출금 금액 요약이 **보내는 금액 / 수수료 / 차감 총액 세 줄**로 렌더된다 |
| **AC-A7-17** | 수수료 또는 최소 금액이 설정되지 않은 LOCAL 코인에서 출금 폼이 렌더되지 않으며, "수수료 0"이 표시되지 않는다 |
| **AC-A7-18** | LOCAL 출금 가능액이 허브 잔고 응답이 아니라 로컬 `available`에서 온다 |
| **AC-A7-19** | `AWAITING_ONCHAIN` 상태의 사용자 문구에 시간 추정·"전송 중" 표현이 없다(6로케일 lint) |
| **AC-A7-20** | `onchainVerifiedAt`이 없는 요청에 대해 사용자 화면에 txHash가 렌더되지 않는다 |
| **AC-A7-21** | LOCAL 레일 요청이 `PENDING`·`AWAITING_ONCHAIN`·`APPROVED` **전 상태에서** 사용자 이력에 나타난다(A-5 §1.8 회귀 방지) |
| **AC-A7-22** | 관리자 목록의 기본 필터에 `AWAITING_ONCHAIN`이 포함된다 |
| **AC-A7-23** | 관리자 목록에 레일 컬럼이 존재하고 필터 가능하다 |
| **AC-A7-24** | LOCAL 승인 버튼 옆에 `approveLocalWarning`이 접기 없이 렌더되고, 버튼 라벨이 HUB와 다르다 |
| **AC-A7-25** | 전송 정보 블록이 `amount`만 복사 대상으로 제공하며, `debitTotal`이 복사 가능한 형태로 그 안에 있지 않다 |
| **AC-A7-26** | 관리자 화면에 "완료로 표시"/"강제 정산"/"abandon" 버튼이 존재하지 않는다 |
| **AC-A7-27** | `INSUFFICIENT_CONFIRMATIONS`와 `RPC_UNAVAILABLE`이 실패가 아닌 대기/판정불가 스타일로 렌더된다 |
| **AC-A7-28** | 검증 시도 이력이 누적 표시되며 최신 결과가 이전 결과를 덮어쓰지 않는다 |
| **AC-A7-29** | 검증 실패 후에도 상태가 `AWAITING_ONCHAIN`으로 유지되고 그 사실이 화면에 표기된다 |
| **AC-A7-30** | 입금 화면에서 미지원 자산이 **"잠시 후 다시 시도"** 계열 문구로 렌더되지 않는다 |
| **AC-A7-31** | 미지원 자산 문구에 일정을 함의하는 표현이 없다(6로케일, PS-A AC-V10과 같은 lint 목록에 §8.6 N-13 어휘 추가) |
| **AC-A7-32** | 미지원 자산에 대해 `createDepositAddress` 호출이 발생하지 않는다(네트워크 호출 0건) |
| **AC-A7-33** | 입금 화면에 미지원 자산 고지 블록과 과거 주소 경고가 렌더된다 |
| **AC-A7-34** | 신규 카피 키가 6로케일 전부에 존재하며 어느 로케일도 en 폴백으로 렌더되지 않는다 |
| **AC-A7-35** | 세 레일 축(`yieldRail`/`localWithdrawRail`/`localDepositRail`)이 서버 플래그로만 분기되며, 데이터 유무로 추론하는 코드가 0건 |

---

## 11. 열린 질문 · 인계

### 11.1 확정되지 않은 것 (이 문서가 정하지 않는다)

| # | 항목 | 누가 답하는가 | 무엇을 막는가 |
|---|------|---------------|---------------|
| **1** | **`WithdrawalRequest.amount`의 의미와 수수료 필드 부재**(§5.3). 온체인 검증은 `amount` 정확 일치를, 원장 차감은 `amount + fee`를 요구한다. 현재 스키마에 수수료 필드가 없다 | `prisma-db-expert` + `web-shared-expert`(A-5) | **출금 화면 구현 전체.** 어느 숫자를 "보내는 금액"이라 부를지가 미정이다 |
| **2** | **W-2 불변식의 재진술.** `Σ홀드 == Σ요청금액`은 수수료가 생기면 성립하지 않는다 | 위와 동일 | 대사 쿼리·QA 자동화(A-5 §3.4) |
| **3** | **Q-M6 — 클레임 수수료 영구 0** | 마스터 | 확정되면 §4.5/CLM-4가 그대로 확정된다. 미확정 상태에서는 수수료 UI를 만들지 않는 것으로 안전하게 처리됨 |
| **4** | **rev03 §11-17 — 입금/출금 처리 SLA** | `pm` + 운영 | `AWAITING_ONCHAIN`과 입금 대기의 소요 시간 문구. **SLA 없이 문구를 쓰지 않는다**(LA-5) |
| **5** | **X-7의 해석**(§7.2) — "입금 화면에 노출하지 않는다"가 문자열 고지까지 금지하는가 | `pm` | §7.3 DEP-3/DEP-4의 채택 여부 |
| **6** | **B-10 결과**(rev03 §7.1-0d) | 사람 + `web-shared-expert` | DEP-5 문구의 강도. 실제 도착 자금이 있으면 이 문서의 우선순위가 재배열된다(rev03 §11-18) |
| **7** | **그룹 명칭 최종안**(§3.3) | `ui-ux-designer`(A-11) + `pm` | 카피 확정. 제약 3개는 이 문서가 못 박았다 |
| **8** | **`AWAITING_ONCHAIN` 임계 경과 시간**(ADM-4)의 기본값 | 운영 | 관리자 목록의 강조 규칙 |
| **9** | **관리자 화면의 로케일 정책** — 실패 사유 코드 원문 유지(ADM-20)는 확정, 나머지 UI의 번역 범위는 미정 | `pm` | §8.5 배선 범위 |
| **10** | **`minConfirmations` 표시 여부.** A-5 §2.6이 숫자를 확정하지 않았다 | `researcher` 후속 + `web-shared-expert` | 관리자 화면의 `{need}` 값은 **서버 값을 렌더**하고 화면에 상수를 쓰지 않는다는 것만 이 문서가 확정 |

### 11.2 담당별 인계

| 담당 | 작업 |
|------|------|
| `pm` | §11.1의 3·4·5·6·9 판정. 특히 **5(X-7 해석)** 는 §7 전체의 채택 여부를 가른다 |
| `prisma-db-expert` | §11.1-1·2 (수수료 필드·`amount` 의미). A-3 `LocalBalanceHold`가 수수료 포함 총액을 담는지 확정 |
| `web-shared-expert` | R-A7-1~R-A7-4 데이터 계약. A-5 §1.8 이력 병합 회귀(WD-12)를 `submit-tx` 신설과 **같은 변경에서** 처리 |
| `web-wallet-expert` | §3 잔고 그룹 분리, §5 출금 화면, §7 입금 고지. **구현 착수는 게이트 해제 이후** |
| `web-admin-expert` | §6 관리자 큐. A-8(부채·준비금 대시보드)과 같은 관리자 IA 안에서 조율 |
| `ui-ux-designer` (A-11) | 두 잔고 그룹의 시각 분리(LA-1), 상태칩 3종 토큰, 검증 결과의 일시적/영구적/판정불가 3계열 색, 그룹 명칭 |
| `wallet-security-expert` (A-10) | ADM-N2(abandon 경로) 판정. §6.4 전송 지시 블록이 운영 실수를 줄이는지 vs 정보 노출을 늘리는지 |
| `qa-lead` | §10 AC 전부 + §5.6 WE-1~WE-12 + §6 검증 결과 7종 렌더 시나리오화 |
| `game-planner` | 클레임 카피 정정(§8.1/§8.2)이 게임 표면 문구와 충돌하지 않는지 확인. **클레임은 게임 상태를 읽지도 쓰지도 않는다**(AC-A7-15) |

### 11.3 `pm`에게 올리는 항목

| # | 항목 |
|---|------|
| 1 | **라이브 카피 정정 3종(§4.1)을 지금 처리할 것을 권고한다.** ②가 항상 0인 지금이 사용자 영향 0이고 비용도 최소다. 클레임을 켜는 날로 미루면 그날 가장 눈에 안 띄는 항목이 된다 |
| 2 | **§7.6 — 입금 미지원 고지는 v2 게이트와 무관하게 오늘 유효한 결함이다.** 단 B-10 확인과 **함께** 배포할 것을 권고한다(순서를 뒤집으면 "문의하십시오"만 있고 절차가 없는 상태가 된다) |
| 3 | **A-2 §6-2에 대한 답: T1 예외 승인 UI를 만들지 않는다**(§3.4). 필요해지면 그때 만든다 |
| 4 | **§11.1-1(수수료 필드)이 출금 화면 구현의 실질적 선행 조건이다.** 설계는 이 문서로 끝났으나, 이 접합부가 정해지지 않으면 화면을 만들 수 없다 |
| 5 | **PS-A CL-3의 완화(§4.4)** — 클레임의 모호한 실패를 영구 잠금에서 재조회로 바꿨다. 근거는 (C)에 부분 성공이 없다는 것이다. **부분 성공이 존재할 수 있는 설계로 되돌아가면 이 완화도 함께 되돌려야 한다** |

---

*선행: `staking-yield-system-v2-prd-rev03-rebuild-and-exclusivity.md` §7.2 A-7 ·
병행: A-2 / A-3 / A-5 설계 문서 · 후속: A-8(관리자 대시보드 FRD) · A-11(시각 설계)*
