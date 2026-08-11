# FRD — 스테이킹 페이지 v2 화면·흐름 (Staking Page v2 Screen & Flow)

> 작성: `product-planner` · 2026-08-10
> 상위: `docs/specs/staking-yield-system-v2-prd.md` §11 (화면 요구사항) · §10 (고지 판정)
> 흡수: `docs/specs/staking-payout-rail-prd.md` §6 Track 1의 R-1/R-2 (허위 표시 정정 카피)
> 승계: `docs/specs/deep-core-05-screen-flow-frd.md` (게임 표면 — R-1~R-6, S-0~S-5, §6 카피)
> 게이트: `docs/specs/deep-core-00-overview-and-gate.md` §6 (P1 스코프 경계는 **여전히 유효**)
>
> **이 문서는 레이아웃과 정보구조의 설계서다. P1 UI를 지금 켜라는 지시가 아니다.**
> §3의 티어 모델(PS-A/PS-B/PS-C)이 "무엇을 언제 렌더할 수 있는가"를 정한다.
> 현재 출하 가능한 것은 **PS-A뿐**이다. PS-B는 v2 레일이 프로덕션에서 실증(G-1′)된 뒤,
> PS-C는 G-2′/G-3′ 해소 + 사람 승인 뒤에만 렌더된다.
>
> 코드는 이 문서가 작성하지 않는다. 비주얼·토큰은 `ui-ux-designer`, 구현(기존 UI 제거 포함)은
> `web-wallet-expert`, 캔버스 측 신규 prop은 `game-developer`.

---

## 0. 이 문서가 답하는 것 / 답하지 않는 것

| 답한다 | 답하지 않는다 |
|--------|---------------|
| 화면 블록 구성·배치·반응형 규칙 | 픽셀·색·타이포·토큰 (→ `ui-ux-designer`) |
| 페이지 상태 모델과 상태별 렌더 사양 | Phaser 씬 내부 구현 (→ `game-developer`) |
| 입력·검증·해피패스·엣지패스 | 스키마 컬럼명·마이그레이션 (→ `prisma-db-expert`) |
| 에러 코드 → 표시 문구 매핑 | 서버 정산·클레임 로직 (→ `web-shared-expert`) |
| 6개 로케일 카피 원문·번역 브리프 | 게임 표면 내부 카피(Crew/Depot/Ledger 시트) (→ `game-planner`) |
| 삭제 대상 UI 인벤토리 | 법률 판단, 기존 사용자 커뮤니케이션 문안(H-6) (→ 사람) |

---

## 1. 설계 원칙

### L-1 (최상위) — 고지와 상태는 인라인, 작업은 시트

> **사용자가 "발견"해야 알 수 있으면 안 되는 것**(수익 3수치, 클레임 진입점, 계약 고지,
> 저하 상태 배너, 갱신 결과 통지)은 **페이지 표면에 항상 렌더**된다.
> **사용자가 의도를 갖고 들어가는 것**(상품 목록, 금액 입력, 포지션 목록, 일별 내역)은
> **모달 시트**로 옮긴다.

이 선이 마스터가 요청한 "게임 캔버스 중심 + 폼/리스트 최소화"를 만족시키면서도 v2 PRD의
R-U1~R-U3·R-U20을 위반하지 않는 유일한 선이다. 부수 효과 하나가 오히려 유리하다 — 랜딩
표면에 상시 노출된 예치 폼은 **상시 권유**지만, 한 번의 탭 뒤에 있는 폼은 아니다(04 A4 /
FCA 유인 프레임 회피).

### L-2 — 캔버스는 시각적 중심이되 기능적으로 하중을 받지 않는다

캔버스는 페이지에서 가장 큰 요소다. 그러나 **실화폐 기능으로 가는 유일한 경로가 캔버스 안에
있어서는 안 된다.** 캔버스가 제공하는 모든 진입점(시추정 클릭 → 포지션, 빈 필드 CTA →
상품)은 반드시 DOM 컨트롤 바에 있는 경로의 **중복**이다.

근거: 05 R-1/R-5, v2 R-U19/R-U20. 캔버스 부팅 실패·WebGL 미지원·`game.pref.hide`·
`gameEnabled=false` 어느 경우에도 예치·수령·포지션 확인이 100% 동작해야 한다. 게임 진입점을
유일 경로로 두면 이 요구가 구조적으로 깨진다.

### L-3 — 실화폐 영역과 게임 영역은 절대 같은 컨테이너에 들어가지 않는다

05 R-2 / v2 R-U8 승계. 컨트롤 바를 **두 줄**로 분리한다(§4.3). 한 줄로 합치면 「기록」(게임
재화)과 「수익 내역」(실제 코인)이 같은 그룹에 놓이고, 그 순간 T-6("게임 재화와 실제 코인을
같은 문장/목록에서 섞지 않는다")이 시각적으로 깨진다.

### L-4 — 계약 수치는 표시하고 미확정 수익은 표시하지 않는다

v2 R-U7. 경계선을 정확히 긋는다.

| 허용 | 금지 |
|------|------|
| 원장에 기록된 금액(`SUM(payout.amount)`) | 초 단위로 증가하는 카운터 |
| 계약 이율 × 원금 × 약정일수 = **밴드 양 끝점**(기준 총액 / 최대 총액) | 현재 MP를 미래에 투영한 "예상 총 수익" |
| 오늘 적용 중인 이율 | 미래 MP를 가정한 이율 |
| 만기까지 남은 시간(시계) | "지금 벌고 있는 금액"(돈) |

양 끝점 표시가 허용되는 이유: 그것은 예측이 아니라 **체결로 확정된 계약 조건의 산술**이다.
그 사이 값을 보간해 하나의 숫자로 제시하는 순간 예측이 된다.

> **L-4의 적용 범위는 `/staking` 페이지가 아니다(부칙 SS-1, 2026-08-11).** L-4는 **스테이킹
> 금액을 표시하는 모든 표면**(지갑 홈·대시보드·요약 카드·위젯·게임 HUD)을 구속한다. 서버가
> 응답에서 제거한 필드를 **서버가 여전히 내려주는 다른 필드로 클라이언트에서 재구성**하는 것도
> 동일한 위반이다(DC-8 우회 금지). 상세·인벤토리·AC는 §2.5(부칙 SS).

### L-5 — 라벨은 티어에 따라 바뀐다. 안정성보다 사실이 우선한다

레일이 없는 상태에서 "수령 가능"이라 쓰면 거짓이고, 레일이 열린 뒤에도 "기록됨"만 쓰면 정보
누락이다. §8의 카피 표는 같은 숫자에 대해 티어별로 **다른 키**를 쓴다. 하나의 키를 상태로
분기하지 않는다(번역가가 문맥을 볼 수 없게 된다).

### L-6 — 레이아웃은 하나다

브레이크포인트별로 배치를 재구성하지 않는다(캔버스 높이, 그리드 열 수, 시트 표현 형태만
바뀐다). 두 개의 레이아웃은 **두 개의 고지 표면**을 의미하고, 그중 하나는 반드시 뒤처진다.

### L-7 — 클레임은 게임화하지 않는다

v2 C-7 / R-U5. 클레임 성공에 파티클·사운드·카운트업·축하 문구·연속 기록 없음. 성공 표시는
**정보 수준의 1줄**이다. 인양 연출(05 §3.3)은 **정산**에 붙는 것이지 **클레임**에 붙는 것이
아니다 — 둘을 혼동하면 안 된다.

### L-8 — 밴드 UI는 밴드가 있을 때만 존재한다

`maxBonusPctOfBase > 0`인 대상에만 밴드 미터·가산율 표기가 렌더된다. 밴드폭 0 포지션에
"최대 +0.000%"를 표시하는 것은 금지한다(§6 EG-1). 비어 있는 밴드 슬롯·"곧 제공" 예고도
금지(00 §6.5 Q4 — "자리만 비워두는 것도 금지").

---

## 2. 화면 구조

### 2.1 목표 IA

```
/staking
┌──────────────────────────────────────────────────────────────┐
│ header  (pageTitle / pageSubtitle)                     [설정] │
├──────────────────────────────────────────────────────────────┤
│ 【B1】 STAGE                                                  │
│   DEEP CORE 캔버스 + HUD 오버레이 (기존 DeepCoreEmbed 재사용) │  ← 시각적 중심
│   h-[220px] / sm:h-[300px] / lg:h-[380px]                     │
├──────────────────────────────────────────────────────────────┤
│ 【B2】 YIELD PANEL  (실화폐 · 항상 DOM · 캔버스와 무관)       │
│   코인별 1행:  ① 기록/수령가능  ② 수령완료  ③ 잠긴 원금       │  ← 절대 합산 금지
│   [ 수령 ] 슬롯 (3가지 렌더 중 하나 — §4.2.3)                 │
│   고지 1줄 (disclosureNoLoss — 밴드 프로그램 ON일 때)         │
├──────────────────────────────────────────────────────────────┤
│ 【B3】 VAULT BAR  (실화폐 진입점 — 3버튼)                     │
│   [ 예치 ]   [ 내 포지션 · N ]   [ 수익 내역 ]                │
├──────────────────────────────────────────────────────────────┤
│ 【B4】 RIG BAR  (게임 진입점 — 기존 DeepCoreControlBar)       │
│   [ 크루 ]   [ 보급창 ]   [ 기록 ]                            │
├──────────────────────────────────────────────────────────────┤
│ 【B5】 INLINE NOTICES (조건부, 위→아래 우선순위)              │
│   점검 / 정산 중지 / 만기 수령 안내 / 자동갱신 결과 통지      │
└──────────────────────────────────────────────────────────────┘

시트 (모달, 동시 1개만):
  S-STAKE   예치 시트 (상품 목록 → 금액 입력 → 체결 확인)
  S-POS     내 포지션 시트 (목록 + 행 확장 상세)
  S-YIELD   수익 내역 시트 (일별, 기준/가산 분해)
  S-INFO    지급 안내 시트 (PS-A 전용, 본문은 H-6 대기)
  + 기존 게임 시트 3종 (Crew / Depot / Ledger)
```

### 2.2 블록 순서를 이렇게 정한 이유

- **B2가 B1 바로 아래**: 캔버스 다음으로 사용자의 눈이 가는 자리에 실제 돈이 있어야 한다.
  게임 컨트롤 바(B4)가 수익 패널보다 위에 오면 "게임이 먼저, 돈이 나중"이 된다.
- **B3이 B4보다 위**: 같은 형태의 버튼 행이 둘이므로 순서가 곧 위계다. 실화폐가 위다.
- **B5가 맨 아래**: 통지는 읽고 닫는 것이지 매번 마주치는 것이 아니다. 단 **점검/정산 중지
  배너만은 예외로 B2 바로 위에 렌더**한다(수치가 왜 멈췄는지를 수치보다 먼저 알려야 한다).

### 2.3 반응형 (L-6)

| 브레이크포인트 | 캔버스 | B2 그리드 | 시트 |
|---------------|--------|-----------|------|
| 기본(모바일) | `h-[220px]` | 코인 행 세로 스택, 3수치 1열 | 하단 바텀시트, 전체폭 |
| `sm` | `h-[300px]` | 3수치 3열 | 하단 바텀시트 |
| `lg` | `h-[380px]` | 3수치 3열 + 수령 버튼 우측 정렬 | 중앙 모달 `max-w-2xl` |

캔버스 내부 렌더 해상도는 **960×540 고정**(05 G-1). 변경 없음.

### 2.4 삭제 인벤토리 — `web/src/components/Staking.tsx`

`web-wallet-expert` 인계용. **제거**:

| 대상 | 현재 위치 | 사유 |
|------|-----------|------|
| "Rewards Earned" 섹션 + `Paid to date` | `:385-402` | 허위 표시(Track 1 R-1). **하드코딩 영문 — i18n조차 되어 있지 않아 R-2가 구조적으로 위반 상태** |
| Earn 상품 목록 섹션 전체 | `:405-497` | S-STAKE 시트로 이관 |
| 인라인 예치 폼 + `earnPreview` | `:443-485`, `:457` | S-STAKE 시트로 이관 + 예측치 표시 금지(L-4) |
| My Stakes 목록 섹션 | `:500-591` | S-POS 시트로 이관 |
| `accruedInterest` 실시간 계산·표시 | `:14`, `:546`, `:574-575` | R-U7 위반(초 단위 증가 카운터) |
| 클라이언트 측 `lockedByCoin` 재계산 | `:139-145` | §7 R-D2 — 그랜트 락 완화(G-B) 후 클라이언트 재계산은 반드시 틀린다 |
| `id="staking-earn-section"` 스크롤 타깃 | `:405` | 섹션 소멸 → HUD 빈 상태 CTA가 S-STAKE 시트를 열도록 변경(§4.1) |

**유지·이동**:

| 대상 | 처리 |
|------|------|
| `DeepCoreEmbed` 렌더 | B1으로 그대로 |
| `WellBadge` | S-POS 시트의 포지션 행 안으로 이동 |
| 자동 갱신 토글·6행 우선순위 표·확인 시트·에러 매핑 | S-POS 시트 안으로 **로직 변경 없이** 이동 |
| 갱신 결과 통지(S3, 14일 창, localStorage 해제) | B5 인라인으로 유지 |
| `staking.autoRenew.*` 카피 전체 | 변경 없음 |

> **이 인벤토리는 `Staking.tsx` 한 파일만 열거했고, 그것이 누락의 원인이었다(부칙 SS-1).**
> 같은 원칙(L-4/R-U7)의 구속을 받는 `StakedSummaryCard.tsx`가 이 표에 없었기 때문에 지갑
> 홈·대시보드에는 초당 증가 카운터가 그대로 남았다. §2.5(부칙 SS)를 함께 읽는다.

---

## 3. 페이지 상태 모델

### 3.1 두 축은 직교한다

게임 표면 상태(05 §4.1의 S-0~S-5)와 **지급 레일 티어**는 서로 독립이다. 어느 쪽도 다른 쪽을
숨기거나 대체하지 않는다.

```
지급 레일 티어 (실화폐 축)                게임 표면 상태 (게임 축)
┌──────────────────────────────┐         ┌────────────────────────┐
│ PS-A  원장 전용 (현재)        │         │ S-0 미노출              │
│   클레임 레일 없음            │    ×    │ S-1 가동 중             │
├──────────────────────────────┤         │ S-2 보고 지연           │
│ PS-B  클레임 가동             │         │ S-3 점검                │
│   G-1′ 해제 후                │         │ S-4 유휴 리그           │
├──────────────────────────────┤         │ S-5 게임 중단           │
│ PS-C  밴드 상품 제공          │         └────────────────────────┘
│   G-2′ + G-3′ + 사람 승인 후  │
└──────────────────────────────┘         + game.pref.hide (사용자 설정)
```

**B2/B3과 그 하위 시트는 게임 축의 어떤 값에서도 동일하게 렌더된다.** 이것이 L-2의 검증
가능한 형태다(AC-V3).

### 3.2 티어별 렌더 사양

| 요소 | PS-A (원장 전용) | PS-B (클레임 가동) | PS-C (밴드 제공) |
|------|------------------|--------------------|------------------|
| ① 수치 라벨 | `yield.recordedLabel` "기록된 수익" | `yield.claimableLabel` "수령 가능 수익" | PS-B와 동일 |
| ① 보조 설명 | `yield.recordedHelp` | `yield.claimableHelp` | PS-B와 동일 |
| ② 수령 완료 | 렌더 O (항상 0) | 렌더 O | 렌더 O |
| ③ 잠긴 원금 | 렌더 O | 렌더 O | 렌더 O |
| 수령 슬롯 | `UNAVAILABLE` 상태칩 | `DISABLED`(0원) 또는 `ENABLED` | PS-B와 동일 |
| 밴드 미터 | 렌더 X | 렌더 X | 밴드 상품·밴드 포지션에만 O |
| HUD 채굴력 옆 | `game.mp.cosmeticOnly` | `game.mp.cosmeticOnly` | 실제 적용 가산율 **또는** `mp.noBandPosition` |
| 계약 고지(§8.3) | 렌더 X | 렌더 X | 체결 흐름에 필수 |
| 일별 내역 base/bonus 분해 | 분해 없음(전액 base) | 분해 없음(전액 base) | 분해 필수 |

**티어는 서버가 내려주는 명시 플래그로만 결정된다(§7 R-D1). 데이터 존재 여부로 추론 금지.**
"클레임 API가 200을 주면 PS-B" 같은 추론은 킬 스위치(C-6)를 UI에서 무력화한다.

### 3.3 PS-A의 세 하위 상태 — 수령 슬롯

| 하위 상태 | 조건 | 렌더 |
|----------|------|------|
| PS-A1 기본 | 레일 미가동 | 비버튼 상태칩 + `claim.unavailable` + [자세히] → S-INFO |
| PS-A2 점검 | `maintenanceMode` | 상태칩 + `claim.maintenance` |
| PS-B-paused | 레일은 있으나 킬 스위치 OFF(C-6) | 상태칩 + `claim.paused` |

> **왜 "비활성 버튼"이 아니라 "상태칩"인가.** 비활성 버튼은 "조건만 채우면 눌린다"는 뜻이다.
> PS-A에서 그 조건은 사용자가 채울 수 있는 것이 아니다. 비활성 버튼은 사용자를 기다리게
> 하고, 상태칩은 사실을 말한다. 반면 PS-B에서 잔액이 0일 때는 실제로 "조건을 채우면 눌리는"
> 상황이므로 **비활성 버튼**이 맞다(R-U3).

> **"정산 준비 중" 표현을 채택하지 않는 이유.** 마스터가 예시로 든 문구다. "준비 중"은
> 완료를 암시하는 진행형이고, 사용자는 거기서 임박한 일정을 읽는다. B-1(허브 크레딧 수단)이
> 미확인인 지금 우리는 **일정을 알지 못하며**, 알지 못하는 것을 암시하는 것은 지금 정정하려는
> 바로 그 문제의 반복이다. 채택 문구는 일정을 함의하지 않는 사실 서술이다:
> **"지갑으로의 지급은 아직 제공되지 않습니다."** "곧", "coming soon", 임의 ETA는 전 로케일
> 금지(AC-V10).

> **S-INFO 시트의 본문은 이 문서가 쓰지 않는다.** "왜 지금까지 표시가 부정확했는가"는 v2 PRD
> H-6(사람·법무 결정)이다. 이 문서는 **슬롯과 진입점만** 정의한다. H-6 확정 전에는 [자세히]
> 링크를 렌더하지 않고 `claim.unavailable` 1줄만 표시한다(빈 시트를 여는 것보다 낫다).

---

## 4. 블록별 상세 사양

### 4.1 B1 — STAGE (캔버스 + HUD)

기존 `DeepCoreEmbed` 트리를 **그대로** 재사용한다(05 G-3, v2 R-U22). 변경 2건만:

| # | 변경 | 담당 |
|---|------|------|
| CH-1 | S-4(유휴 리그) HUD의 빈 상태 CTA가 `#staking-earn-section` 스크롤 대신 **S-STAKE 시트를 연다**. `DeepCoreEmbed`에 `onOpenStake?: () => void` prop 추가 | `game-developer` + `web-wallet-expert` |
| CH-2 | 시추정 → 포지션 역방향 이동을 위해 캔버스에 `focusWellId?: string \| null` prop 추가(§5.5) | `game-developer` |

HUD 채굴력 표기 규칙(R-U18의 정밀화). **셋 중 정확히 하나만 렌더된다**:

| 조건 | 렌더 |
|------|------|
| `bandProgram = OFF` | `game.mp.cosmeticOnly` (기존 키, 05 §6.4) |
| `bandProgram = ON` **and** 사용자의 밴드 포지션 수 = 0 | `staking.mp.noBandPosition` (**신설**) |
| `bandProgram = ON` **and** 밴드 포지션 ≥ 1 | 실제 적용 가산율 `game.hud.bonusRate` |

세 번째 문자열을 신설하는 이유: 프로그램은 켜져 있는데 밴드 포지션이 없는 사용자에게
`cosmeticOnly`("지급액에 영향을 주지 않습니다")를 보여주면 **오늘은 참이지만 내일은 거짓**이
되고, 반대로 가산율을 보여주면 적용 대상이 없는데 수치를 보여주는 것이 된다. 상호 배타는
테스트로 잠근다(AC-V11, 05 AC-S7 확장).

### 4.2 B2 — YIELD PANEL

#### 4.2.1 구조 (코인별 1행)

```
┌─ BANA ───────────────────────────────────────────────────────┐
│ 기록된 수익        지갑 수령 완료      잠긴 원금              │
│ 12.34567890        0                   1,000.00000000         │
│ 스테이킹 원장에    지갑 잔고로         원금은 지갑에 그대로   │
│ 기록된 금액…       옮겨진 금액…        있으며…                │
│                                                               │
│ [ 지갑으로의 지급은 아직 제공되지 않습니다 ]                  │  ← PS-A
└───────────────────────────────────────────────────────────────┘
```

- **세 수치는 어떤 조합으로도 합산되지 않는다**(R-U1). 총합 행·"총 자산" 표기 금지.
- ①이 0이어도 행은 렌더된다(R-U3의 취지 — 존재 자체가 정보다). 단 포지션 이력이 한 번도
  없는 사용자(S-0)에게는 코인 행 대신 `yield.empty` 1줄.
- 다중 코인은 세로 스택. 현재 스테이킹 가능 자산은 BANA 하나(v2 N-6)이므로 실질 1행이지만,
  **코인 선택 드롭다운을 만들지 않는다** — 클레임 단위가 사용자×코인(C-5)이므로 행마다
  자기 수령 버튼을 갖는 구조가 그대로 확장된다.
- 금액은 모노스페이스. 서버가 준 decimal 문자열을 **로케일 포맷팅하지 않는다**(§9 N-3).

#### 4.2.2 각 수치의 정의 (구현자용 — 유도식 금지)

| # | 값 | 출처 | 금지 |
|---|-----|------|------|
| ① | 원장 누계 − 수령 완료 누계 | 서버가 계산해 내려준다 | 클라이언트에서 두 필드를 빼서 만들지 않는다 |
| ② | 성공한 클레임 금액의 합 | 서버 | 원장 누계의 델타로 유도 금지(v2 Q-4) |
| ③ | `fundingSource = USER_HUB`인 ACTIVE 포지션의 원금 합 | 서버 | **클라이언트 재계산 절대 금지**(§7 R-D2) |

③을 서버에서만 받아야 하는 이유는 회귀 방지가 아니라 **정확성**이다. G-B 적용 후 그랜트
포지션은 출금 락에서 빠지는데, 현재 클라이언트 코드(`Staking.tsx:139-143`)는 ACTIVE 포지션
전부를 합산한다. 그대로 두면 화면의 "잠긴 원금"과 출금 화면의 실제 락이 어긋나고, 사용자는
출금 가능액을 실제보다 적게 인식한다.

#### 4.2.3 수령 슬롯 — 3가지 렌더

| 렌더 | 조건 | 형태 | 문구 |
|------|------|------|------|
| `UNAVAILABLE` | PS-A / 킬 스위치 OFF / 점검 | 비버튼 상태칩(회색, 눌리지 않음) | `claim.unavailable` / `claim.paused` / `claim.maintenance` |
| `DISABLED` | PS-B **and** ① = 0 | 비활성 버튼 | `claim.zero` |
| `ENABLED` | PS-B **and** ① > 0 | 활성 버튼 | `claim.actionWithAmount` |

최소 수령 금액(v2 §16 Q4, B-2b 의존)이 도입될 경우: ① > 0 이지만 최소 미만이면 `DISABLED`로
렌더하고 **문구에 임계값을 명시**한다(`claim.minimum`). 임계값은 사용자가 **누르기 전에**
보여야 한다 — 누른 뒤 400으로 알려주는 설계는 금지.

#### 4.2.4 상시 고지 (PS-C에서만)

`disclosure.noLoss`를 패널 하단에 **1줄 상시 노출**한다. 접기·툴팁·시트 안 이동 금지
(v2 §10: "접기 안에 숨기는 것 금지"). PS-A/PS-B에서는 밴드가 존재하지 않으므로 렌더하지
않는다(없는 것에 대한 고지는 소음이다).

### 4.3 B3 / B4 — 두 개의 컨트롤 바

```
B3 (실화폐)   [ 예치 ]        [ 내 포지션 · 3 ]   [ 수익 내역 ]
B4 (게임)     [ 크루 ]        [ 보급창 ]          [ 기록 ]
```

| 규칙 | 내용 |
|------|------|
| CB-1 | 두 바는 **다른 시각 계열**을 갖는다(구체 토큰은 `ui-ux-designer`). 한 줄로 합치지 않는다(L-3) |
| CB-2 | B3은 **게임 상태와 무관하게 항상 렌더**된다. `game.pref.hide`, S-5, 부팅 실패 모두 무관 |
| CB-3 | B4는 기존 `DeepCoreControlBar` 그대로. 4번째 「리그」 탭은 여전히 만들지 않는다(00 §6.5 Q4) |
| CB-4 | 「내 포지션」 배지 숫자는 **ACTIVE 포지션 수**. 만기·완료 포함 금지(과장) |
| CB-5 | 동시에 열리는 시트는 1개. 시트가 열린 상태에서 다른 탭을 누르면 교체된다 |

### 4.4 S-STAKE — 예치 시트

3단 흐름. **각 단계는 뒤로 갈 수 있고, 마지막 단계 전에는 어떤 요청도 나가지 않는다.**

```
STEP 1 상품 목록 ──▶ STEP 2 금액 입력 ──▶ STEP 3 체결 확인 ──▶ 결과
```

#### STEP 1 — 상품 목록

카드 1개 = 상품 1개. 표기 항목:

| 항목 | 비밴드 상품 | 밴드 상품 (PS-C) |
|------|-------------|------------------|
| 이율 | `일 {rate}%` 단일 | **밴드 미터**(아래) |
| 약정 | `{n}일` | 동일 |
| 최소/최대 | 있으면 표기 | **최소는 반드시 존재**(v2 L-5) |
| 잔여 용량 | `full`이면 마감 칩 | 동일 + 밴드 마감 칩 별도 |

밴드 미터 (R-U9/R-U11):

```
일 0.100 % ─────●──── 0.110 %
기준(보장)     현재     최대
              0.104 %
```

| 규칙 | 내용 |
|------|------|
| BM-1 | **기준과 최대는 동일한 자간·크기·굵기**로 표기한다. 최대만 크게 쓰는 표기 금지(R-U9) |
| BM-2 | "현재 적용" 값은 사용자의 **현재 진행도 기준**이며, 기준·최대보다 크게 표기하지 않는다 |
| BM-3 | 표기 단위는 전부 **일이율 %(총량)** 이다. 가산율(%p 또는 기준 이자 대비 %)을 단독 헤드라인으로 쓰지 않는다 — `+0.010%p`와 `+10%`와 `0.110%`가 같은 말인 상황에서 사용자가 읽는 숫자는 하나여야 한다 |
| BM-4 | 밴드가 없는 상품에 빈 미터·회색 미터를 렌더하지 않는다(L-8) |

체결 불가 상태(R-U12) — **조용히 밴드폭 0으로 체결시키지 않는다**:

| 사유 | 카드 표시 | 액션 버튼 |
|------|-----------|-----------|
| 상품 마감 / 용량 소진 | 기존 `full` 칩 | 비활성 |
| 예약 풀 소진(L-4) | `band.closed` 칩 | 비활성 |
| 사용자 노출 상한 초과(L-3) | `band.limitReached` + 현재 한도 수치 | 비활성 |

> **L-3의 단위에 대한 권고(v2 §16 Q2에 대한 답).** 사용자에게 노출하는 한도는 **밴드 포지션의
> 총 원금** 기준을 권고한다. "총 최대 가산 부채" 기준이 회계상 더 정확하지만, 그 숫자는
> 사용자가 자기 행동으로 예측할 수 없다(약정일수·이율에 따라 같은 원금이 다른 한도를
> 소비한다). 플랫폼은 내부적으로 부채 기준으로 통제하되, **거부 사유 표시는 원금 기준**으로
> 환산해 제시한다. 두 값이 어긋날 수 있으므로, 서버가 거부 시 **표시용 원금 한도값을 함께
> 반환**해야 한다(§7 R-D3).

#### STEP 2 — 금액 입력

기존 인라인 폼의 검증 규칙을 그대로 승계하되 표시를 교체한다.

| 입력 | 규칙 |
|------|------|
| 금액 | `/^\d*\.?\d*$/`, `> 0`, `≤ 사용 가능 잔고`, `≥ minAmount`, `≤ maxAmount`. 전부 클라이언트 선검증 + 서버 재검증 |
| [최대] | 사용 가능 잔고 = 허브 잔고 − **서버가 준** 잠긴 원금(§4.2.2 ③) |
| 자동 갱신 옵트인 | 기존 규칙 유지(약정 > 90일이면 **렌더 자체를 하지 않음**). **밴드 상품에서는 §6 EG-5의 결정 전까지 렌더하지 않는다** |

`earnPreview` 대체 — L-4 준수:

| 상품 | 표시 |
|------|------|
| 비밴드 | `stakeSheet.contractTerms`: "{days}일 기준 이자: {baseTotal} {coin}" |
| 밴드 | `stakeSheet.contractTermsBand`: "{days}일 기준: 기준 이자 {baseTotal} {coin}, 최대 이율 적용 시 {maxTotal} {coin}" |
| 공통 | `stakeSheet.notEstimate`: "이 수치는 계약 이율에서 계산된 값이며 예측치가 아닙니다." |

현재 MP를 곱해 중간값을 제시하지 않는다. 밴드 상품은 **양 끝점만** 제시한다.

#### STEP 3 — 체결 확인

| 요소 | 필수 여부 | 내용 |
|------|-----------|------|
| 원금·상품·약정·이율(또는 밴드) 요약 | 필수 | |
| **`disclosure.contract`** | **밴드 상품 필수** | v2 §10 신설 고지. `game.pref.hide` 사용자·S-5·부팅 실패 상태에서도 **반드시 표시**(R-U13) |
| `disclosure.rate` | 밴드 상품 필수 | 재작성본(§8.3) |
| `disclosure.prospective` | 밴드 상품 필수 | 재작성본 |
| 락 고지 | 필수 | "약정이 끝날 때까지 출금할 수 없습니다" |
| 자동 갱신 확인 문구 | 옵트인 시 | 기존 `autoRenew.confirm*` 재사용 |

고지 3종은 **접기 불가·툴팁 불가·확인 버튼 위**에 배치한다. 게임 표면이 어떤 상태든 이
다이얼로그는 DOM으로 존재하며, 이것이 "게임을 숨긴 사용자에게도 계약 조건이 공시된다"의
구현 형태다.

### 4.5 S-POS — 내 포지션 시트

행 = 포지션 1개. 접힌 상태와 펼친 상세로 나눈다.

**접힌 행**:

```
[시추정 #3]  1,000 BANA · 30일 정기          기록됨 +2.4500  정산 12/30
             일 0.100 %                       D-18  [ACTIVE]
             자동 갱신: 켜짐 · 2026-09-10 갱신                    (토글)
```

| 규칙 | 내용 |
|------|------|
| PR-1 | 표시 금액은 **원장 기록 누계**(`position.ledgeredYield`)다. 초 단위 증가 없음(R-U7) |
| PR-2 | 진행 표기는 `정산 {daysSettled}/{termDays}`. 경과일이 아니라 **정산된 일수** — S-2에서 둘이 갈라지며, 게임은 정산 쪽만 따라간다(05 §4.2) |
| PR-3 | 밴드 포지션만 `일 {base}% – {max}%` 2값 표기. 밴드폭 0은 단일 값(L-8 / EG-1) |
| PR-4 | 시추정 배지는 게임이 실제로 렌더 중인 포지션에만(기존 규칙 유지, R-U15) |
| PR-5 | 등급·별점·랭크·진행도 등 **그 외 게임화 금지**(R-U16) |
| PR-6 | 자동 갱신 토글·라벨·6행 우선순위·에러 매핑은 **기존 구현 그대로 이동**. 로직 변경 없음 |

**펼친 상세** (행 탭):

| 항목 | 내용 |
|------|------|
| 체결 스냅샷 | 체결일 / 기준 일이율 / 최대 가산율 / 약정일수 / 만기일 |
| 상품 현재 조건과의 차이 | 다를 때만 1줄 표기(R-U14). 예: "이 포지션의 기준 이율은 체결 당시 조건입니다. 현재 상품 조건은 일 {now}%입니다." **CTA 금지** |
| 비밴드 사실 표기 | `band.noBandNote` — "이 포지션은 고정 일이율이며 수익 밴드가 없습니다." **상세에서만**, 접힌 행에서는 금지 |
| 이 포지션의 일별 내역 | S-YIELD를 해당 포지션 필터로 연다 |
| 밴드 고지 | 밴드 포지션이면 `disclosure.rate` + `disclosure.cap`(재작성본) |

### 4.6 S-YIELD — 수익 내역 시트

**실화폐 영역이다. 게임 「기록」 시트와 절대 통합하지 않는다**(R-U8).

| 규칙 | 내용 |
|------|------|
| YL-1 | 일별 1행: 날짜 / 포지션 / 금액. **PS-C에서는 기준 이자분과 가산분을 분해 표기**(R-U6) |
| YL-2 | 분해 표기는 05 §3.4의 2줄 형식을 승계하되 라벨을 v2에 맞춘다: `기준 이자 +0.00123` / `가산 (진행도 {pct}%) +0.00007`. **"게임 보너스"라는 라벨을 쓰지 않는다** — v2에서 별도 지급분이 아니기 때문(§10 `disclosureSeparate` 폐기의 UI 대응) |
| YL-3 | 합계 행을 두더라도 ①②③ 세 수치와 혼합하지 않는다 |
| YL-4 | 클레임 이력은 **별도 탭**으로 둔다(일별 정산 행과 섞지 않는다): 일시 / 금액 / 상태 / 참조. 실패 행은 "확인 중"으로 표기하고 재시도 버튼 없음 |
| YL-5 | 페이지네이션은 기존 `hasMore`/`nextCursor` 사용. 잘림을 침묵하지 않는다 |

### 4.7 B5 — 인라인 통지

우선순위 순. **동시에 여러 개가 참이면 전부 렌더**하되 이 순서로 쌓는다.

| # | 통지 | 조건 | 위치 | 카피 |
|---|------|------|------|------|
| 1 | 점검 | `maintenanceMode` | **B2 위** | `notice.maintenance` |
| 2 | 정산 중지 | `stakingWorkerEnabled = false` | **B2 위** | `notice.workerPaused` |
| 3 | 만기 수령 안내 | PS-B **and** 만기 포지션 존재 **and** ① > 0 | B5 | `claim.maturityNudge` |
| 4 | 자동 갱신 결과 | 기존 S3 규칙(14일 창, 해제 가능) | B5 | 기존 `autoRenew.*` |

1·2번이 B2 위인 이유: 숫자가 왜 멈췄는지를 숫자보다 먼저 알려야 한다. 게임 HUD의
`state.reportingPaused`(캔버스 배너)와 **동시에** 렌더되며 이는 중복이 아니다 — 하나는 게임
표면의 설명, 하나는 실화폐 수치의 설명이다. 두 문구가 서로 모순되지 않도록 §8에서 문구를
맞춘다.

3번은 v2 §4.2가 범위에 넣은 "만기 시 1회성 클레임 유도". **PS-A에서는 렌더하지 않는다**
(수령할 방법이 없는데 수령을 안내하는 것은 최악이다).

---

## 5. 사용자 흐름

### UF-1 — 신규 사용자의 최초 예치 (PS-A)

```
/staking 진입 (S-0: 캔버스 미마운트, Phaser 바이트 미전송)
  → B2: 코인 행 없음, `yield.empty` 1줄
  → B3 [예치] → S-STAKE STEP1 → STEP2 금액 → STEP3 확인 → 체결
  → 성공 표시(정보 수준) → 시트 자동 닫힘 → load() 재실행
  → 게임 표면 최초 마운트 + 1회성 인트로 오버레이 (기존 구현 그대로)
  → B2에 코인 행 등장: ① 0, ② 0, ③ 원금
```

- 체결 성공에 축하 연출 없음. 게임 인트로는 **세계관·조작 소개만**, 수익률 언급 금지(05 §5.1).
- 첫 정산 전에는 ①이 0이다. 이 상태에서 `yield.recordedHelp`가 "왜 0인가"를 설명한다.

### UF-2 — 일상 복귀 (PS-A)

```
진입 → load() → 캔버스 부팅 → 인양 연출 1회(합산) → HUD 갱신
     → B2 ① 갱신 (원장 누계 반영)
```

인양 연출과 B2 갱신은 **같은 데이터(정산 행)를 본다.** 연출이 재생됐는데 ①이 안 늘거나 그
반대면 버그다(AC-V13).

### UF-3 — 클레임 (PS-B)

```
B2 [수령 12.3456 BANA] 탭
  → 확인 다이얼로그: 금액 / "지금까지 기록된 {coin} 수익 전액" / 확인·취소
  → 확인 → 버튼 in-flight (스피너, 재탭 불가)
  → 결과
     ├ 성공  → 1줄 결과 표시 + B2 ①→0, ②+=금액. 연출 없음(L-7)
     ├ 실패(명시적 사유) → 사유 문구 + 슬롯 원복 (§7 ERR 표)
     └ 모호한 실패(타임아웃/네트워크) → `claim.failedReview` 종결 표시.
        **재시도 버튼 없음**(C-4). 슬롯은 `UNAVAILABLE`로 잠기고
        새로고침해도 서버가 PROCESSING/FAILED를 유지하는 한 잠긴 채로 남는다
```

| 규칙 | 내용 |
|------|------|
| CL-1 | 확인 다이얼로그는 **필수**. 원탭 클레임 금지 — 자금 이동이고 멱등키가 걸리는 1회성 작업이다 |
| CL-2 | in-flight 중 페이지 이탈·새로고침 시, 복귀하면 서버 상태(PROCESSING)를 읽어 잠금 상태를 재현한다. 클라이언트 낙관적 갱신 금지 |
| CL-3 | 부분 성공 UI를 설계하지 않는다. v2 §13.1 Q7이 미회신이므로 **부분 성공은 존재하지 않는다고 가정하지 않고, 모호한 실패와 동일하게 "확인 중"으로 종결**한다 |
| CL-4 | 클레임 성공 후 게임 상태는 **아무것도 변하지 않는다**(C-7). XP·SV·MP 어느 것도 반응하지 않는다 |

### UF-4 — 만기 (전 티어 공통)

```
정산 워커가 만기 처리
  → 포지션 status ACTIVE→MATURED
  → ③ 잠긴 원금에서 해당 원금이 빠진다 (이체가 아니라 뺄셈의 소멸)
  → ① 기록된 수익은 그대로 남는다  ← 여기가 오해 지점
  → 자동 갱신 켜짐이면 승계 포지션 생성 (원금만, 복리 아님 — N-1)
  → B5에 갱신 결과 통지 (기존 규칙)
  → PS-B이면 만기 수령 안내(B5 #3) 추가
```

`position.maturedNote`가 이 흐름의 유일한 설명 지점이다. 반드시 두 가지를 함께 말한다:
**원금은 잠금이 풀린다 / 기록된 수익은 자동으로 옮겨지지 않는다.**

### UF-5 — 캔버스 ↔ 포지션 상호 이동

```
캔버스 시추정 클릭 → S-POS 시트 열림 → 해당 행으로 스크롤 + 2초 하이라이트
포지션 행의 시추정 배지 클릭 → S-POS 닫힘 → 캔버스에 focusWellId 전달
                              → 카메라 이동 + 하이라이트
```

시트 도입으로 기존 `scrollIntoView` 왕복이 성립하지 않으므로 이 규칙으로 대체한다(R-U15의
"상호 이동 유지"를 만족한다). `focusWellId` prop이 CH-2다.

### UF-6 — 게임을 숨긴 사용자

```
game.pref.hide = true
  → B1 자리에 기존 1줄 안내 + [표시] 버튼 (기존 구현)
  → B4 렌더 안 함
  → B2 / B3 / B5 / 모든 시트: 완전히 동일하게 동작
  → PS-C에서 체결 확인의 계약 고지(disclosure.contract)는 그대로 표시된다
  → XP·SV·가산분 적립에 영향 없음
```

숨김이 계약된 수익을 줄이면 그것은 강요다(R-U19). 이 흐름 전체가 AC-V3의 검증 대상이다.

---

## 6. 엣지 케이스 & 에러 경로

| ID | 상황 | 화면 | 금지 |
|----|------|------|------|
| **EG-1** | **밴드폭 0인 전환 포지션**(기존 계약) | **비밴드 포지션과 픽셀 단위로 동일하게** 렌더. 단일 이율, 밴드 미터 없음, 가산 관련 어떤 표기도 없음. 상세에서만 `band.noBandNote` 1줄 | "최대 +0.000%", 회색 밴드 미터, "밴드 상품으로 갈아타기" CTA. 사용자의 계약은 한 글자도 변하지 않았는데 화면이 손해 본 것처럼 보이게 하는 것 |
| **EG-2** | 그랜트 포지션(`PLATFORM_GRANT`) | 목록에는 보이되 **③ 잠긴 원금에 합산되지 않는다**(G-B). 밴드 표기 없음(G-D) | 클라이언트에서 원금을 합산해 ③을 만드는 것 |
| **EG-3** | 밴드 포지션과 비밴드 포지션 혼재 | 같은 목록에 함께. 정렬은 **체결일 역순 고정**. 밴드 포지션을 위로 올리거나 강조하지 않는다 | 밴드 포지션 우선 정렬·강조 배지(비밴드 보유자에 대한 업셀이 된다) |
| **EG-4** | 만기 후 미수령 잔액 보유 상태에서 전량 재예치 | ①은 그대로 남는다. 재예치 확인 다이얼로그에 "기록된 수익은 재예치되지 않습니다" 문구 필수(기존 `autoRenew.confirmBody2` 취지) | 수익을 원금에 포함하는 것처럼 읽히는 표현 |
| **EG-5** | **밴드 상품 + 자동 갱신** | **미결정**(v2 §16 Q6). 결정 전까지 밴드 상품에서 자동 갱신 옵트인을 **렌더하지 않는다**. 근거: 승계 포지션의 밴드가 원 스냅샷인지 갱신 시점 상품 밴드인지 정해지지 않아 **확인 문구를 진실하게 쓸 수 없다**. §8.6에 두 분기의 카피를 미리 준비해 두었으므로 결정 즉시 배선 가능 | 문구를 모호하게 써서 양쪽 다 커버하려는 시도 |
| **EG-6** | 정산 워커 중지(S-2) | ①은 마지막 정산값에서 멈춘다. `notice.workerPaused` + HUD 배너. **계산값으로 대체 금지**(R-U21) | 화면에서 계속 증가하는 것처럼 보이게 하는 것 |
| **EG-7** | 캔버스 부팅 실패 / WebGL 미지원 | 정적 폴백 + `GAME_LOAD_FAILED`. **B2/B3/시트 전부 정상**(R-U20) | 페이지 전체 에러 |
| **EG-8** | 게임 상태 API 실패(`game = null`) | B1만 미렌더. 나머지 전부 정상 | 포지션 목록까지 함께 실패시키는 것 |
| **EG-9** | 잔고 조회 실패 | S-STAKE STEP2의 [최대] 비활성 + "잔고를 불러오지 못했습니다" 1줄. 입력은 허용하되 서버 검증에 맡긴다 | 잔고 0으로 간주하고 예치를 막는 것 |
| **EG-10** | 클레임 in-flight 중 다른 탭에서 중복 시도 | 서버가 `CLAIM_IN_PROGRESS` 반환 → `claim.inFlight` 표시, 슬롯 잠금 | 클라이언트 락만으로 방어 |
| **EG-11** | ① > 0 이지만 최소 수령 금액 미만 | `DISABLED` + `claim.minimum`(임계값 명시) | 누른 뒤 400으로 알려주기 |
| **EG-12** | 예약 풀 소진 / 노출 상한 도달 | §4.4 STEP1 표 참조. 명시적 마감 표기 | 밴드폭 0으로 대체 체결 |
| **EG-13** | 세션 만료 | 시트 유지한 채 로그인 유도. 입력값 보존 | 조용한 실패 |
| **EG-14** | 포지션 이력 없음(S-0) | B1 미마운트, B2는 `yield.empty`, B3은 정상 | Phaser 바이트 전송(AC-S2 유지) |
| **EG-15** | 밴드 프로그램 중단(신규 제공 정지) | 상품 목록에 밴드 상품이 사라지고 `disclosure.programPaused` 1줄. **보유 포지션의 밴드 표기는 그대로 유지** | 보유 포지션의 밴드 미터를 회색 처리하거나 "중단됨" 표기 (계약 위반 인상을 준다) |

---

## 7. 데이터 계약 & 에러 코드

### 7.1 데이터 계약 (`web-shared-expert` / `prisma-db-expert` 인계)

| ID | 요구 |
|----|------|
| **R-D1** | 서버가 **명시 플래그**를 내려준다: `yieldRail: 'LEDGER_ONLY' \| 'CLAIM_LIVE' \| 'CLAIM_PAUSED'`, `bandProgram: 'OFF' \| 'ON'`, `maintenanceMode: boolean`. 클라이언트는 데이터 존재 여부로 티어를 추론하지 않는다 |
| **R-D2** | 코인별 집계를 서버가 계산해 내려준다: `{ coin, ledgered, claimed, unclaimed, lockedPrincipal }`. `lockedPrincipal`은 `fundingSource = USER_HUB`만 합산하며 **출금 라우트가 쓰는 값과 동일한 함수**에서 나와야 한다 |
| **R-D3** | 체결 거부 시 표시용 값을 함께 반환: `BAND_EXPOSURE_LIMIT` → `{ limitPrincipal, coin }`, `BELOW_MIN`/`ABOVE_MAX` → 해당 임계값 |
| **R-D4** | 포지션마다 `baseDailyRatePct`, `maxBonusPctOfBase`, `maxDailyRatePct`(= 표시용 밴드 상단, 서버 계산), `currentAppliedRatePct`, `ledgeredYield`, `daysSettled`, `fundingSource`를 내려준다. **클라이언트가 밴드 상단을 계산하지 않는다** — %p ↔ % 환산을 클라이언트에서 하면 언젠가 반올림이 어긋난다 |
| **R-D5** | **모든 스테이킹 라우트가 안정적 에러 `code`를 반환한다.** 현재 `POST /api/staking/stake`는 보간된 영문 메시지만 반환하고 코드가 없다(`route.ts:54-75`) — 6개 로케일 대응이 구조적으로 불가능하다. `auto-renew` 라우트의 `{ ok, error, code }` 패턴을 따른다 |
| **R-D6** | 밴드 체결 거부는 **기록 가능한 형태**여야 한다(v2 §12). 400 반환만으로 끝나면 거부율을 측정할 수 없다 |

### 7.2 에러 코드 → 표시 문구

> 서버 `code` → `staking.error.<CODE>` 키. 매핑되지 않은 코드는 `staking.error.GENERIC`으로
> 폴백하고, **서버 영문 메시지를 그대로 사용자에게 노출하지 않는다.**

| 코드 | EN | KO |
|------|-----|-----|
| `STAKE_INVALID_AMOUNT` | Enter an amount greater than 0. | 0보다 큰 금액을 입력하십시오. |
| `STAKE_PRODUCT_NOT_FOUND` | This product is no longer available. | 이 상품은 더 이상 제공되지 않습니다. |
| `STAKE_PRODUCT_CLOSED` | This product is closed to new stakes. | 이 상품은 신규 체결이 마감되었습니다. |
| `STAKE_PRODUCT_FULL` | This product is full. | 이 상품의 정원이 찼습니다. |
| `STAKE_BELOW_MIN` | The minimum for this product is {min} {coin}. | 이 상품의 최소 금액은 {min} {coin}입니다. |
| `STAKE_ABOVE_MAX` | The maximum for this product is {max} {coin}. | 이 상품의 최대 금액은 {max} {coin}입니다. |
| `STAKE_INSUFFICIENT_AVAILABLE` | Available balance is {available} {coin}. | 사용 가능한 잔고는 {available} {coin}입니다. |
| `STAKE_BAND_EXPOSURE_LIMIT` | You have reached the limit for band products. Current limit {limit} {coin}. | 밴드 상품 한도에 도달했습니다. 현재 한도 {limit} {coin}입니다. |
| `STAKE_BAND_RESERVE_EXHAUSTED` | This product is closed to new stakes right now. | 이 상품은 현재 신규 체결이 마감되었습니다. |
| `STAKE_MAINTENANCE` | Staking is under maintenance. | 스테이킹이 점검 중입니다. |
| `CLAIM_DISABLED` | Payouts are temporarily unavailable. | 지급이 일시적으로 중단되었습니다. |
| `CLAIM_MAINTENANCE` | Under maintenance. | 점검 중입니다. |
| `CLAIM_NOTHING_TO_CLAIM` | There is nothing to claim. | 수령할 금액이 없습니다. |
| `CLAIM_BELOW_MINIMUM` | The minimum claim is {min} {coin}. | 최소 수령 금액은 {min} {coin}입니다. |
| `CLAIM_IN_PROGRESS` | A claim for {coin} is already in progress. | {coin} 수령이 이미 진행 중입니다. |
| `CLAIM_FAILED_REVIEW` | This claim did not complete and is being checked. Your recorded yield is unchanged. | 이 수령은 완료되지 않았고 확인 중입니다. 기록된 수익은 변하지 않았습니다. |
| `UNAUTHENTICATED` | Your session ended. Sign in again to continue. | 세션이 만료되었습니다. 다시 로그인하십시오. |
| `GENERIC` | The request did not complete. | 요청이 완료되지 않았습니다. |

기존 `staking.autoRenew.error.*` 5종은 변경 없이 유지한다.

---

## 8. 카피 원문 (EN 소스 / KO)

> `web/messages/en.json`이 소스 로케일이다. 아래 키를 추가·수정하고 6개 로케일에 배선하는 것은
> `web-wallet-expert`. **게임 표면 카피(`staking.game.*`)는 `game-planner` 소관이며, §8.3의
> 재작성 고지 중 게임 HUD에 붙는 것은 그쪽과 문구를 맞춘다.**

톤 규칙은 05 §6.1의 T-1~T-6을 **전부 승계**하고 하나를 추가한다:

> **T-7 (신규).** 실화폐 영역에서 **완료를 함의하는 동사**를 미완료 상태에 쓰지 않는다.
> 금지: paid / 지급됨 / 받음 / 支払済み / 已发放 / đã trả / จ่ายแล้ว.
> 기록 상태에는 "recorded / 기록", 수령 가능 상태에는 "to claim / 수령 가능",
> 완료 상태에만 "claimed / 수령 완료".

### 8.1 수익 패널 (`staking.yield.*`) — Track 1 R-1 정정 포함

| 키 | EN | KO |
|----|-----|-----|
| `sectionTitle` | Yield | 수익 |
| `recordedLabel` | Recorded yield | 기록된 수익 |
| `recordedHelp` | Recorded in your staking ledger. It is not part of your wallet balance. | 스테이킹 원장에 기록된 금액입니다. 지갑 잔고에는 포함되지 않습니다. |
| `claimableLabel` | Yield to claim | 수령 가능 수익 |
| `claimableHelp` | Recorded in your staking ledger. Claim it to move it to your wallet balance. | 스테이킹 원장에 기록된 금액입니다. 수령하면 지갑 잔고로 옮겨집니다. |
| `claimedLabel` | Claimed to wallet | 지갑 수령 완료 |
| `claimedHelp` | Already moved to your wallet balance. | 지갑 잔고로 옮겨진 금액입니다. |
| `lockedLabel` | Locked principal | 잠긴 원금 |
| `lockedHelp` | Your principal stays in your wallet but cannot be withdrawn until the term ends. | 원금은 지갑에 그대로 있으며, 약정이 끝날 때까지 출금할 수 없습니다. |
| `empty` | No yield recorded yet. | 아직 기록된 수익이 없습니다. |

### 8.2 클레임 (`staking.claim.*`)

| 키 | EN | KO |
|----|-----|-----|
| `actionWithAmount` | Claim {amount} {coin} | {amount} {coin} 수령 |
| `zero` | Nothing to claim | 수령할 금액이 없습니다 |
| `unavailable` | Payout to your wallet is not available yet. | 지갑으로의 지급은 아직 제공되지 않습니다. |
| `unavailableMore` | Details | 자세히 |
| `paused` | Payouts are temporarily unavailable. | 지급이 일시적으로 중단되었습니다. |
| `maintenance` | Under maintenance. | 점검 중입니다. |
| `minimum` | Minimum claim: {min} {coin}. | 최소 수령 금액: {min} {coin}. |
| `confirmTitle` | Claim {coin} yield? | {coin} 수익을 수령합니까? |
| `confirmBody` | {amount} {coin} will be moved to your wallet balance. This is all {coin} yield recorded up to now. | {amount} {coin}이 지갑 잔고로 옮겨집니다. 지금까지 기록된 {coin} 수익 전액입니다. |
| `confirmNote` | Yield recorded after this stays in your staking ledger until you claim again. | 이후 기록되는 수익은 다시 수령할 때까지 스테이킹 원장에 남습니다. |
| `confirmYes` | Claim | 수령 |
| `confirmCancel` | Cancel | 취소 |
| `processing` | Processing your claim. | 수령을 처리하고 있습니다. |
| `succeeded` | {amount} {coin} moved to your wallet balance. | {amount} {coin}이 지갑 잔고로 옮겨졌습니다. |
| `failedReview` | This claim did not complete and is being checked. Your recorded yield is unchanged. | 이 수령은 완료되지 않았고 확인 중입니다. 기록된 수익은 변하지 않았습니다. |
| `inFlight` | A claim for {coin} is already in progress. | {coin} 수령이 이미 진행 중입니다. |
| `maturityNudge` | {amount} {coin} of yield is recorded and can be claimed. | {amount} {coin}의 수익이 기록되어 있으며 수령할 수 있습니다. |

### 8.3 고지 (`staking.disclosure.*`) — v2 §10 판정 반영

| v2 §10 판정 | 신규 키 | EN | KO |
|-------------|---------|-----|-----|
| **신설**(§10 말미) | `contract` | The daily rate for this product is {base}%. DEEP CORE progress can raise it to at most {max}%. The {base}% is guaranteed regardless of progress. | 이 상품의 일일 이율은 {base}%이며, DEEP CORE 진행도에 따라 최대 {max}%까지 적용됩니다. {base}%는 진행도와 무관하게 보장됩니다. |
| `disclosureRate` **재작성** | `rate` | The base rate and the maximum rate fixed when you stake do not change. Progress only moves the rate within that range. | 체결 시 확정된 기준 이율과 최대 이율은 변경되지 않습니다. 진행도는 그 범위 안에서만 적용됩니다. |
| `disclosureCap` **재작성** | `cap` | For this position the added amount never exceeds {maxBonusPct}% of the base interest. | 이 포지션의 가산분은 기준 이자의 {maxBonusPct}%를 넘지 않습니다. |
| `disclosureProspective` **재작성** | `prospective` | New products may stop being offered. The terms of a position you already hold stay in place until it matures. | 신규 상품의 제공은 중단될 수 있으나, 이미 체결된 포지션의 조건은 만기까지 유지됩니다. |
| `disclosureNoLoss` **유효·강조** | `noLoss` | Your contracted base interest is recorded in full and claimed on the same terms, whether or not you use DEEP CORE. | 딥 코어 이용 여부와 관계없이 계약된 기준 이자는 전액 기록되고 동일한 조건으로 수령됩니다. |
| `programPaused` **재작성** | `programPaused` | Band products are not being offered right now. Positions already opened keep their terms. | 현재 밴드 상품을 제공하지 않습니다. 이미 체결된 포지션의 조건은 유지됩니다. |
| **폐기** | `disclosureSeparate` | — | 키 삭제. 렌더 코드가 남아 있으면 거짓이 된다 |
| **폐기** | `dailyCapReached` | — | 키 삭제. 해당 상태가 존재하지 않는다 |
| 유효·변경 없음 | `game.bonus.disclosureNoValue`, `game.bonus.pendingEffect` | 기존 유지 | 기존 유지 |

`{maxBonusPct}`는 **기준 이자 대비 %**(예: 10.00), `{base}`/`{max}`는 **일이율 %**(예:
0.100 / 0.110)다. 두 단위가 한 문장에 섞이지 않도록 키를 분리했다(BM-3).

### 8.4 밴드·포지션·예치 시트

| 키 | EN | KO |
|----|-----|-----|
| `staking.band.baseLabel` | Base (guaranteed) | 기준 (보장) |
| `staking.band.maxLabel` | Maximum | 최대 |
| `staking.band.currentLabel` | Applies now | 현재 적용 |
| `staking.band.rangeDaily` | {base}% – {max}% per day | 일 {base}% – {max}% |
| `staking.band.currentValue` | {current}% per day at your current Mining Power | 현재 채굴력 기준 일 {current}% |
| `staking.band.fixedDaily` | {rate}% per day | 일 {rate}% |
| `staking.band.noBandNote` | This position has a fixed daily rate and no yield band. | 이 포지션은 고정 일이율이며 수익 밴드가 없습니다. |
| `staking.band.closed` | Closed to new stakes right now. | 현재 신규 체결이 마감되었습니다. |
| `staking.band.limitReached` | You have reached the limit for band products. Current limit {limit} {coin}. | 밴드 상품 한도에 도달했습니다. 현재 한도 {limit} {coin}입니다. |
| `staking.mp.noBandPosition` | Mining Power applies to the added rate on band positions. You do not hold a band position right now. | 채굴력은 밴드 포지션의 가산 이율에 적용됩니다. 현재 보유한 밴드 포지션이 없습니다. |
| `staking.position.recordedLabel` | Recorded | 기록됨 |
| `staking.position.settledDays` | Settled {d}/{total} days | 정산 {d}/{total}일 |
| `staking.position.snapshotDiff` | The base rate on this position is the rate fixed when you staked. The product now offers {now}% per day. | 이 포지션의 기준 이율은 체결 당시 확정된 값입니다. 현재 상품 조건은 일 {now}%입니다. |
| `staking.position.maturedNote` | When a term ends, the principal stops being locked and is available in your wallet. Recorded yield is not moved automatically. | 약정이 끝나면 원금의 잠금이 해제되어 지갑에서 사용할 수 있습니다. 기록된 수익은 자동으로 옮겨지지 않습니다. |
| `staking.stakeSheet.title` | Stake | 예치 |
| `staking.stakeSheet.contractTerms` | Base yield over {days} days: {baseTotal} {coin} | {days}일 기준 이자: {baseTotal} {coin} |
| `staking.stakeSheet.contractTermsBand` | Over {days} days: {baseTotal} {coin} at the base rate, {maxTotal} {coin} at the maximum rate. | {days}일 기준: 기준 이율 적용 시 {baseTotal} {coin}, 최대 이율 적용 시 {maxTotal} {coin}. |
| `staking.stakeSheet.notEstimate` | These figures come from the contracted rates, not from a forecast. | 이 수치는 계약 이율에서 계산된 값이며 예측치가 아닙니다. |
| `staking.stakeSheet.lockNote` | Staked funds cannot be withdrawn before the term ends. | 예치한 자금은 약정이 끝나기 전에는 출금할 수 없습니다. |
| `staking.nav.stake` | Stake | 예치 |
| `staking.nav.positions` | My positions | 내 포지션 |
| `staking.nav.yieldLog` | Yield log | 수익 내역 |

### 8.5 통지·내역

| 키 | EN | KO |
|----|-----|-----|
| `staking.notice.maintenance` | Staking is under maintenance. Amounts may not update. | 스테이킹이 점검 중입니다. 금액이 갱신되지 않을 수 있습니다. |
| `staking.notice.workerPaused` | Daily settlement is paused. Recorded amounts stop updating until it resumes. Contracted interest for the paused days is recorded when it resumes. | 일일 정산이 중지되어 있습니다. 재개될 때까지 기록 금액이 갱신되지 않습니다. 중지된 기간의 계약 이자는 재개 시 기록됩니다. |
| `staking.yieldLog.title` | Yield log | 수익 내역 |
| `staking.yieldLog.tabDaily` | Daily | 일별 |
| `staking.yieldLog.tabClaims` | Claims | 수령 |
| `staking.yieldLog.rowBase` | Base interest | 기준 이자 |
| `staking.yieldLog.rowAdded` | Added at {pct}% | 가산 ({pct}%) |
| `staking.yieldLog.empty` | No entries yet. | 아직 내역이 없습니다. |
| `staking.yieldLog.claimStatusSucceeded` | Completed | 완료 |
| `staking.yieldLog.claimStatusProcessing` | Processing | 처리 중 |
| `staking.yieldLog.claimStatusFailed` | Being checked | 확인 중 |

`rowAdded`가 "게임 보너스"가 아닌 이유: v2에서 가산분은 별도 지급분이 아니라 계약 이자의
일부다(§10 `disclosureSeparate` 폐기). 라벨에 "보너스"를 쓰면 폐기한 문구를 라벨로 되살리는
것이 된다.

### 8.6 EG-5 대기 카피 (밴드 + 자동 갱신) — **결정 전까지 배선 금지**

v2 §16 Q6이 정해지는 즉시 둘 중 하나만 배선한다.

| 분기 | 키 | EN | KO |
|------|-----|-----|-----|
| (a) 원 스냅샷 승계 | `autoRenew.bandCarriedOver` | The renewed position keeps this position's base rate and maximum rate. | 갱신된 포지션은 이 포지션의 기준 이율과 최대 이율을 그대로 승계합니다. |
| (b) 갱신 시점 재스냅샷 | `autoRenew.bandResnapshot` | The renewed position takes the base rate and maximum rate offered on the renewal date, which may differ from this position's. | 갱신된 포지션은 갱신일 기준 상품의 기준 이율과 최대 이율을 새로 적용하며, 이 포지션의 조건과 다를 수 있습니다. |

---

## 9. 다국어 (en / ko / ja / zh / vi / th)

### 9.1 용어 잠금표 — 문서 전체에서 일관되게

| 개념 | en | ko | ja | zh | vi | th |
|------|----|----|----|----|----|----|
| 원장에 기록된 수익 | recorded yield | 기록된 수익 | 記録された収益 | 已记录收益 | lợi tức đã ghi nhận | ผลตอบแทนที่บันทึกไว้ |
| 수령(클레임) | claim | 수령 | 受け取り | 领取 | nhận | รับ |
| 수령 완료 | claimed | 수령 완료 | 受取済み | 已领取 | đã nhận | รับแล้ว |
| 잠긴 원금 | locked principal | 잠긴 원금 | ロック中の元本 | 锁定本金 | vốn gốc đang khóa | เงินต้นที่ล็อกไว้ |
| 수익 밴드 | yield band | 수익 밴드 | 収益バンド | 收益区间 | biên lợi tức | ช่วงผลตอบแทน |
| 기준 이율 | base rate | 기준 이율 | 基準利率 | 基准利率 | lãi suất cơ sở | อัตราพื้นฐาน |
| 최대 이율 | maximum rate | 최대 이율 | 上限利率 | 上限利率 | lãi suất tối đa | อัตราสูงสุด |
| 가산분 | added amount | 가산분 | 加算分 | 加算部分 | phần cộng thêm | ส่วนที่เพิ่ม |
| 채굴력 | Mining Power | 채굴력 | 採掘力 | 挖掘力 | Lực khai thác | กำลังขุด |

### 9.2 로케일별 금지어 (T-7의 집행 형태)

미완료 상태(①)에 대해 아래 표현이 나타나면 **번역 오류**다.

| 로케일 | 금지 | 대체 |
|--------|------|------|
| en | paid, payout received, earned to date | recorded, to claim |
| ko | 지급됨, 지급 완료, 받음, 수령됨(미완료 상태에서) | 기록됨, 수령 가능 |
| ja | 支払済み, 受取済み(미완료 상태에서), 付与済み | 記録済み, 受け取り可能 |
| zh | 已发放, 已到账, 已支付 | 已记录, 可领取 |
| vi | đã trả, đã thanh toán, đã vào ví | đã ghi nhận, có thể nhận |
| th | จ่ายแล้ว, โอนแล้ว, เข้ากระเป๋าแล้ว | บันทึกแล้ว, พร้อมรับ |

### 9.3 번역 브리프

| # | 지침 |
|---|------|
| N-1 | **느낌표 금지**(05 T-1, 6개 로케일 전부). 전각 `！`·태국어 감탄 표현 포함 |
| N-2 | **명령·권유형 금지**(T-2). 상태 서술만. 단 오류 문구의 해결 조건 안내는 예외적으로 허용하되 감정 표현 없이(T-5) |
| N-3 | **금액·이율 수치를 로케일 포맷팅하지 않는다.** 서버가 준 decimal 문자열을 그대로 출력한다. 천 단위 구분·소수점 기호 변경·반올림 금지. 이 규칙은 번역가가 아니라 구현자를 향한 것이며, 번역문에 숫자를 하드코딩하지 않는다는 뜻이기도 하다 |
| N-4 | `{base}` `{max}` `{current}` `{amount}` `{coin}` `{limit}` `{min}` `{pct}` `{days}` 플레이스홀더는 **개수·철자 그대로** 유지. 어순은 자유 |
| N-5 | 퍼센트 기호는 각 로케일 관행을 따르되(ko/ja/zh는 붙여쓰기, en/vi는 관행대로), **같은 로케일 안에서 일관**되게 |
| N-6 | `claim`을 게임적 어휘(획득, 보상 받기, 得る, 领奖)로 번역하지 않는다. **자금 이체 어휘**를 쓴다 |
| N-7 | `yield band`의 "밴드"를 "보너스"·"이벤트"·"혜택"으로 의역하지 않는다. 계약 조건 용어다 |
| N-8 | `disclosure.*` 5종은 **법적 고지 성격**이다. 의미를 줄이거나 부드럽게 만들지 않는다. 특히 `noLoss`의 "전액"과 `prospective`의 "만기까지 유지됩니다"는 축약 금지 |
| N-9 | `claim.unavailable`에 시점·일정을 함의하는 어휘(곧, まもなく, 即将, sắp, เร็ว ๆ นี้)를 넣지 않는다 |
| N-10 | 게임 카피와 실화폐 카피는 **다른 톤 레지스터**여도 된다. 다만 두 영역이 같은 단어로 다른 것을 가리키지 않게 §9.1 잠금표를 지킨다 |

---

## 10. 수용 기준 (AC)

| ID | 기준 |
|----|------|
| **AC-V1** | 화면 어디에도 "Paid to date" / 지급 완료를 함의하는 라벨이 미완료 금액에 붙지 않는다. **6개 로케일 전부** 기계 검사 가능 |
| **AC-V2** | ① ② ③ 세 수치가 어떤 조합으로도 합산 표시되지 않는다. "총 수익"·"총 자산" 성격의 합계 UI가 없다 |
| **AC-V3** | `game.pref.hide` / `gameEnabled=false` / 캔버스 부팅 실패 / `game=null` 네 상태 각각에서 예치·수령·포지션 조회·자동갱신 토글이 전부 도달 가능하다 |
| **AC-V4** | 실화폐 금액을 표시하는 어떤 컴포넌트도 게임 시트(Crew/Depot/Ledger) 안에 렌더되지 않는다 |
| **AC-V5** | 초 단위로 증가하는 금액 카운터가 페이지 어디에도 없다. `accruedInterest` 클라이언트 재계산 호출이 0건 |
| **AC-V6** | 잠긴 원금(③)이 클라이언트에서 포지션을 순회해 계산되지 않는다(서버 값 사용). 그랜트 포지션 생성 전후로 ③이 변하지 않는다 |
| **AC-V7** | `yieldRail`이 `LEDGER_ONLY`일 때 수령 슬롯이 **비버튼 상태칩**으로 렌더되고, 클릭 가능한 클레임 요소가 DOM에 없다 |
| **AC-V8** | `yieldRail`이 `CLAIM_LIVE`이고 ①=0일 때 수령 버튼이 **비활성으로 렌더되며 숨겨지지 않는다** |
| **AC-V9** | 클레임 실패(모호) 후 재시도 버튼이 렌더되지 않으며, 새로고침해도 재시도 경로가 생기지 않는다 |
| **AC-V10** | `claim.unavailable` 및 그 주변 문구에 시점/일정을 함의하는 표현이 없다(6개 로케일, §9.2/N-9 어휘 목록으로 lint) |
| **AC-V11** | `game.mp.cosmeticOnly` / `mp.noBandPosition` / 실제 가산율 표기 **셋 중 정확히 하나만** 렌더된다 |
| **AC-V12** | `maxBonusPctOfBase = "0"`인 포지션·상품에 밴드 미터·가산 관련 표기가 렌더되지 않는다 |
| **AC-V13** | 인양 연출이 재생된 정산분이 ①에 반영되어 있다(연출과 수치가 같은 데이터를 본다) |
| **AC-V14** | 밴드 상품 체결 확인 다이얼로그에 `disclosure.contract`가 존재하며, `game.pref.hide=true`에서도 렌더된다 |
| **AC-V15** | 밴드 상품 카드에서 기준 이율과 최대 이율의 폰트 크기·굵기가 동일하다 |
| **AC-V16** | 예약 풀 소진·노출 상한 상태에서 해당 상품의 체결 버튼이 비활성이며, 밴드폭 0으로 체결되는 경로가 존재하지 않는다 |
| **AC-V17** | 클레임 성공·실패 어느 경우에도 게임 상태(XP/SV/MP/연출)가 변하지 않는다 |
| **AC-V18** | `disclosureSeparate` / `dailyCapReached` 키가 메시지 파일과 코드 양쪽에서 제거되었다 |
| **AC-V19** | 모든 스테이킹 라우트 오류가 안정적 `code`를 반환하고, 화면은 서버 영문 메시지를 직접 노출하지 않는다 |
| **AC-V20** | `stakingWorkerEnabled=false`에서 ①이 계산값으로 대체되지 않고, `notice.workerPaused`가 ①보다 위에 렌더된다 |
| **AC-V21** | 게임 파일이 `web/src/components/staking/deep-core/` 밖에 존재하지 않는다(05 AC-S8 유지) |
| **AC-V22** | 포지션 이력이 없는 사용자의 번들에 Phaser 바이트가 포함되지 않는다(05 AC-S2 유지) |
| **AC-V23** | 밴드 상품에서 자동 갱신 옵트인이 렌더되지 않는다(EG-5 결정 전까지) |
| **AC-V24** | 신규 카피 키가 6개 로케일 전부에 존재하고, 어느 로케일도 en 폴백으로 렌더되지 않는다 |
| **AC-V5′ / AC-SS-1 ~ AC-SS-4** | 요약 카드·위젯 등 `/staking` 밖의 금액 표시 표면에 대한 수용 기준. 전문은 §2.5(부칙 SS-3) |

---

## 11. 인계 · 미해결

### 11.1 담당별 인계

| 담당 | 작업 |
|------|------|
| `ui-ux-designer` | B1~B5 시각 위계, 두 컨트롤 바의 계열 분리(L-3), 밴드 미터 컴포넌트, 수령 슬롯 3종 상태 토큰, 시트 표현(바텀시트/모달) |
| `web-wallet-expert` | §2.4 삭제 인벤토리 실행 → B2/B3/B5 + S-STAKE/S-POS/S-YIELD 구현. **PS-A만 구현한다.** PS-B/PS-C 분기는 플래그로 준비하되 렌더 경로를 만들지 않는다 |
| `game-developer` | CH-1(`onOpenStake`), CH-2(`focusWellId`) |
| `game-planner` | §8.3 재작성 고지 중 게임 HUD 측 표기와의 정합, `mp.noBandPosition` 신설에 대한 확인 |
| `web-shared-expert` | §7.1 R-D1~R-D6 (특히 R-D5 에러 코드 — PS-A에서도 즉시 필요) |
| `prisma-db-expert` | R-D2/R-D4가 요구하는 필드의 존재 여부·유도 가능성 검토(마이그레이션 실행은 v2 §13 승인 후) |
| `qa-lead` | §10 AC 전부 + §6 EG-1~EG-15 시나리오화 |

### 11.2 지금 착수 가능한 범위 (v2 §13 승인 전)

**PS-A 전체가 착수 가능하다.** 기존 스키마만으로 다음이 성립한다:
① = `SUM(paidInterest)`(원장 누계, 아직 수령 개념 없음), ② = 0 상수, ③ = 서버가 계산한
`lockedPrincipalByCoin`. `yieldRail = 'LEDGER_ONLY'`, `bandProgram = 'OFF'` 하드코딩.
이것이 Track 1 R-1/R-2의 실제 배송 형태이며, **v2 승인을 기다리지 않는다**(v2 §14 순서 3).

**착수 불가**: 클레임 버튼·클레임 API 연동·밴드 미터·가산 분해 내역·계약 고지 렌더.

### 11.3 pm에게 올리는 항목

| # | 항목 |
|---|------|
| 1 | **EG-5 / v2 §16 Q6** — 밴드 + 자동 갱신 분기. 화면은 결정 전까지 옵트인을 숨기는 것으로 처리했다. §8.6에 양쪽 카피를 준비해 두었다 |
| 2 | **v2 §16 Q2에 대한 답(§4.4)** — L-3 노출 한도는 **사용자 표시를 총 원금 기준**으로 권고. 내부 통제는 부채 기준을 유지하되 거부 응답에 원금 환산 한도를 포함해야 한다(R-D3) |
| 3 | **v2 §16 Q4** — 최소 수령 금액이 도입되면 임계값이 **누르기 전에** 보여야 한다(EG-11). B-2b 회신 시 임계값 노출 방식 확정 필요 |
| 4 | **H-6 의존** — PS-A의 [자세히] → S-INFO 시트 본문. 확정 전까지 링크 자체를 렌더하지 않는다 |
| 5 | **`Staking.tsx:387,396`의 "Rewards Earned"/"Paid to date"가 i18n 키가 아니라 하드코딩 영문이다.** Track 1 R-2(6개 로케일 정정)는 현재 구조에서 달성 불가였다 — 정정과 함께 키화가 필수다 |
| 6 | **v2 §12의 거부율 측정(R-D6)** — 400 응답만으로는 L-3/L-4 거부를 측정할 수 없다. 화면은 거부 사유를 구분해 보여주므로, 서버도 사유를 구분해 기록해야 지표가 성립한다 |

---

*선행: `docs/specs/staking-yield-system-v2-prd.md` · 병행: `docs/specs/deep-core-05-screen-flow-frd.md`*
