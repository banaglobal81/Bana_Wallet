# DEEP CORE — 기획서 05: 화면 흐름 / 배치 FRD

> `game-planner` · 2026-08-10 · 상위: `deep-core-00-overview-and-gate.md`
> §3.4·§4.2의 보너스 관련 요소는 **04 문서 게이트에 종속**된다. 게이트 미해제 시 해당 요소만
> 렌더하지 않으며, 나머지 화면은 그대로 성립한다(Phase 0 단독 출시 가능).

---

## 1. 최상위 원칙 — 게임은 손님이다

| # | 규칙 |
|---|------|
| R-1 | **게임이 실제 스테이킹 기능을 가로막지 않는다.** 상품 목록·스테이크 버튼·포지션 목록·자동갱신 토글은 게임 상태와 무관하게 항상 도달 가능하다. 게임을 통과해야 열리는 실제 기능이 하나도 없다 |
| R-2 | **실제 수치와 게임 수치를 시각적으로 분리한다.** 실제 코인 수량은 기존 카드 UI(모노스페이스, 에메랄드)에, 게임 수치(XP·CC·SV·MP)는 게임 HUD 영역에. 두 숫자가 같은 카드 안에서 나란히 놓이지 않는다 |
| R-3 | **자동 갱신으로 생성된 승계 포지션에 축하 연출을 붙이지 않는다.** 새 시추정이 등장하되 팡파레·"새 광구 발견!" 없이 조용히 추가된다 |
| R-4 | **모든 게임 텍스트는 DOM 오버레이.** 캔버스는 아트만 그린다 |
| R-5 | **게임 실패는 페이지 실패가 아니다.** 캔버스 부팅 실패·엔진 미지원·저사양 모두 정적 폴백으로 격하되고, 나머지 페이지는 정상 동작한다 |
| R-6 | **게임 표면은 하나의 디렉터리 트리에 격리한다.** 되돌리기가 한 번의 삭제로 끝나야 한다 |

---

## 2. `/staking` 페이지 배치

### 2.1 현재 구조 (2026-08-10 실측, `web/src/components/Staking.tsx`)

```
header (pageTitle / pageSubtitle)
├─ [게임 임베드]                      ← :389 (현재 삭제된 모듈을 참조 중, 00 문서 §3)
├─ Rewards Earned                     ← :398  실제 지급 누계
├─ Earn (상품 목록)                   ← :418  id="staking-earn-section"
└─ My Stakes (포지션 목록)            ← :513  id={`position-${p.id}`}
```

### 2.2 목표 구조

```
header
├─ 【A】 DEEP CORE 캔버스 + HUD 오버레이          ← 게임 임베드 (교체)
├─ 【B】 리그 컨트롤 바 (4탭 진입점)               ← 신규, 캔버스 바로 아래
├─ Rewards Earned  (+ 게임 보너스 누계 행)        ← 기존 유지 / 보너스 행은 게이트 종속
├─ Earn (상품 목록)                                ← 기존 유지, 변경 없음
└─ My Stakes (포지션 목록)                         ← 기존 유지 + 시추정 배지 1개만 추가
```

**섹션 순서를 바꾸지 않는다.** 게임은 기존 임베드 자리를 그대로 이어받는다.

### 2.3 캔버스 박스

| 브레이크포인트 | CSS 높이 |
|---------------|----------|
| 기본(모바일) | `h-[220px]` |
| `sm` | `h-[300px]` |
| `lg` | `h-[380px]` |

내부 렌더 해상도는 **960×540 고정, `Scale.FIT`, `CENTER_BOTH`, DPR 비의존** — 선행 패밀리에서
검증된 설정을 그대로 승계한다(`oil-drilling-staking-game-realtime-sg5-sg4a-addendum.md` §1).
브레이크포인트별로 내부 해상도를 바꾸지 않는다(디바이스 클래스 휴리스틱 금지).

### 2.4 HUD 오버레이 배치 (캔버스 위 DOM, 절대 위치)

배경 상·하단 12%는 저대비 영역으로 유지된다(01 문서 §6.2).

```
┌─────────────────────────────────────────────────────────────┐
│ 지층 3 · 현무암 붕            LV 27  [▓▓▓▓▓▓░░░░] 112/165 XP │ ← 상단 좌/우
│                                                             │
│                      (캔버스 아트 영역)                      │
│                                                             │
│ 총 가동일 412일          채굴력 222 · 보너스 4.38% ⓘ         │ ← 하단 좌/우
└─────────────────────────────────────────────────────────────┘
```

- 우하단 `ⓘ`는 04 문서 §8.1 고지 시트를 연다. `disclosureRate`와 `disclosureNoLoss`는
  시트를 열지 않아도 하단에 상시 1줄로 노출한다.
- 보너스 표기는 **게이트 미해제 시 렌더하지 않는다.** 그 자리에는 `채굴력 222` 만 남고,
  채굴력 옆에 `game.mp.cosmeticOnly`("채굴력은 현재 진행도 표시이며 지급액에 영향을 주지 않습니다")
  가 붙는다.

### 2.5 리그 컨트롤 바 — 4탭

캔버스 바로 아래 가로 4버튼. 각 탭은 **모달 시트**로 열린다(페이지 이동 없음 — 스테이킹 화면을
떠나게 만들지 않는다).

| 탭 | KO / EN | 내용 | 게이트 |
|----|---------|------|--------|
| 1 | 리그 / Rig | 5개 장비 트랙 현황, 각 트랙 티어와 다음 티어 비용 | 티어 구매는 P1 |
| 2 | 크루 / Crew | 크루 5인 + 드론. 챕터별 복장. 코스메틱 장착 | Phase 0 |
| 3 | 보급창 / Depot | 정비(CC) / 외장(SV) 2탭 상점 | 정비 탭은 P1 |
| 4 | 기록 / Ledger | XP·CC·SV 적립/사용 내역, 게임 보너스 지급 내역, 총 가동일 | 보너스 내역은 P1 |

**「기록」 탭은 게이트와 무관하게 필수다.** 재화가 존재하는 순간 사용자는 그 증감 이유를 볼 수
있어야 한다(03 문서 C-8).

### 2.6 My Stakes 목록에 추가되는 것 — 딱 하나

각 포지션 행에 **시추정 배지** 1개만 추가한다.

```
0.5 BTC · 90일 정기        [ 시추정 #3 · 지층 3 ]      +0.00123  D 41/90
```

- 배지 클릭 → 캔버스가 해당 시추정으로 카메라 이동 + 하이라이트.
- 캔버스에서 시추정 클릭 → 해당 포지션 행으로 스크롤 + 하이라이트
  (기존 `scrollToPosition` / `id={`position-${p.id}`}` 패턴 재사용).
- **그 외에 포지션 행을 게임화하지 않는다.** 게임 진행도, 등급, 별점, 랭크 표시 없음.

---

## 3. 캔버스 씬 구성

### 3.1 레이어

| z | 레이어 | 내용 | 갱신 |
|---|--------|------|------|
| 0 | 배경 sky | 챕터 원경 | 챕터 변경 시 |
| 1 | 배경 mid | 지층 단면·구조물 | 챕터 변경 시 |
| 2 | 시추정 필드 | 활성 포지션 수만큼의 리그(최대 6기 표시, 초과분은 "+N") | 포지션 변경 시 |
| 3 | 플레이어 리그 | 5트랙 장비가 조립된 메인 리그 | 장비/챕터 변경 시 |
| 4 | 크루 | 5인 + 드론, 상태별 루프 | 상태 변경 시 |
| 5 | 배경 fore | 근경 자재·파이프 | 챕터 변경 시 |
| 6 | 이펙트 | 파티클(먼지·증기·발광) | 상시 |

**애니메이션 예산**: 동시 애니메이션 요소 ≤ 24, 정상 상태 파티클 ≤ 21, 30fps 캡.
선행 패밀리에서 측정·합의된 예산을 그대로 승계한다.

### 3.2 시추정 렌더 규칙

- 1 활성 포지션 = 1 시추정. **크기는 원금이 아니라 약정일수(termDays)로 정한다.**
  (원금 기반은 금지 — 00 §1.2 A7. 크기 차이가 필요하면 **사용자 본인의 최장 약정 대비 상대값**)
- 만기된 포지션의 시추정은 **가동 정지 상태로 남아 있다가 24시간 후 사라진다.**
  즉시 사라지면 "잃었다"는 감각을 준다.
- 활성 포지션 0 → 필드는 비어 있고 크루는 `idle_empty`. 이 상태에서 캔버스에 표시되는 유일한
  행동 유도는 상품 목록으로 스크롤하는 버튼이며, **문구는 중립적이어야 한다**
  (`game.empty.cta` = "스테이킹 상품 보기" — "지금 시작하세요", "기회를 놓치지 마세요" 금지).

### 3.3 일일 인양 연출

정산으로 새 `StakingPayout` 행이 확인되면(폴링/새로고침 시점) 1회성 인양 연출을 재생한다.

- **연출 강도 상한**: 파티클 1회 버스트 + 수치 카운트업 1.2초. 화면 흔들림·폭죽·전체 오버레이 금지.
- 표시 문자열은 **실제 코인 수량**이다: `+0.00123 BTC`. 배럴·광석 등 가상 단위로 환산하지 않는다.
  (`docs/patterns/game-planner.md` — "단위를 지우면 리스크도 지워진다": 실제 토큰으로 표기하면
  가상 단위 ↔ 실제 자산 환산율이라는 위험 요소 자체가 사라진다)
- 여러 날이 한꺼번에 정산된 경우(워커 재가동 등) **합산해서 1회만** 재생한다.

### 3.4 보너스 표시 (게이트 종속)

보너스가 지급된 날은 인양 연출에서 **두 줄로 분리 표기**한다.

```
+0.00123 BTC   계약 이자
+0.00007 BTC   게임 보너스 (4.38%)
```

합산 숫자 하나로 보여주지 않는다. 사용자가 언제나 계약분과 부가분을 구분할 수 있어야 한다.

---

## 4. 상태 다이어그램

### 4.1 게임 표면 상태

```
                    ┌──────────────┐
                    │ S-0 미노출    │  포지션 이력이 한 번도 없음
                    │ (렌더 없음)   │  → 컴포넌트 자체를 마운트하지 않음
                    └──────┬───────┘     (Phaser 동적 import까지 차단)
                           │ 최초 스테이크 체결
                           ▼
     ┌────────────────────────────────────────┐
     │ S-1 가동 중 (정상)                      │
     │ 활성 포지션 ≥1, 워커 정상, 게임 활성    │
     └───┬─────────┬──────────┬──────────┬────┘
         │         │          │          │
         │         │          │          └── 활성 포지션 0 ─▶ S-4 유휴 리그
         │         │          └── maintenanceMode ─▶ S-3 점검
         │         └── stakingWorkerEnabled=false ─▶ S-2 보고 지연
         └── gameEnabled=false ─▶ S-5 게임 중단
```

### 4.2 상태별 화면 사양

| 상태 | 캔버스 | HUD | 크루 | 하단 배너 |
|------|--------|-----|------|-----------|
| **S-0 미노출** | 마운트 안 함 | — | — | — |
| **S-1 가동 중** | 정상 | 전체 표시 | `working` | 고지 1줄 |
| **S-2 보고 지연** | 리그는 서 있으나 파티클 정지 | XP/CC 갱신 정지, 마지막 갱신 시각 표시 | `waiting`, K-9 대기 램프 | `game.state.reportingPaused` |
| **S-3 점검** | 정적 이미지로 격하 | 최소 표시 | 정지 | 기존 점검 배너 재사용 |
| **S-4 유휴 리그** | 필드 비어 있음, 리그 정지 | 레벨·총 가동일은 유지 표시 | `idle_empty` | `game.state.noActiveWell` + 중립 CTA |
| **S-5 게임 중단** | 마운트 안 함 | — | — | `game.state.disabled` |
| **보너스만 중단** | S-1과 동일 | 보너스 % 자리 비움 | 동일 | `game.bonus.programPaused` |

**S-2가 특히 중요하다.** `PlatformSetting.stakingWorkerEnabled`로 정산을 끌 수 있고, 그때
`accruedInterest`(읽기 시 계산)와 `paidInterest`(워커 지급)가 갈라진다. 게임은 **`paidInterest`
쪽만** 따라간다. 화면상 산출이 멈춘 것을 숨기거나, 계산값으로 대체해 "계속 도는 것처럼" 보이게
하면 안 된다 — 그것은 실제로 지급되지 않은 것을 지급된 것처럼 보여주는 일이다.

### 4.3 챕터 전환 시퀀스

```
레벨업 감지 → 새 레벨이 챕터 경계(11/21/31/41/51)인가?
  ├─ 아니오 → HUD의 LV 숫자만 갱신 + XP 바 리셋. 별도 연출 없음
  └─ 예    → 배경 3레이어 크로스페이드(1.5초)
             → DOM 오버레이: 지층 제목 + 2~3줄 (문장은 game-designer)
             → 6초 후 자동 소멸 (또는 즉시 닫기)
             → 신규 언락 목록을 1회 표시 (02 문서 §4.2)
```

전체화면 컷신 금지. 사용자가 스테이킹 조작 중이면 전환 연출을 **큐에 넣고 조작 종료 후 재생**한다.

---

## 5. 사용자 흐름 (주요 3개)

### 5.1 신규 사용자 — 최초 스테이크

```
/staking 진입 (S-0: 게임 없음, 페이지는 평소와 동일)
  → 상품 선택 → 금액 입력 → 체결
  → 기존 성공 표시(변경 없음)
  → 게임 표면 최초 마운트: 지층 1, 레벨 1, 시추정 1기 등장
  → 1회성 오버레이(닫기 가능): "인가서가 발급되었습니다" 수준의 3줄 소개
     · 첫 방문에만. 재표시 없음. 스킵 즉시 가능
     · 여기에 보너스·수익률 언급 금지 — 소개는 세계관과 조작법만
```

### 5.2 일상 복귀 사용자

```
/staking 진입
  → 캔버스 부팅 → 마지막 확인 이후 정산된 일수 계산
  → 인양 연출 1회(합산) → HUD 갱신 → xp.presence 적립(1일 1회)
  → 레벨업/챕터 전환이 있었다면 순차 재생
```

### 5.3 장비 구매 (P1)

```
[보급창] → [정비] → 트랙 선택 → 다음 티어 카드
  → 확인 시트: 현재 잔액 / 가격 / 구매 후 잔액 / +4 MP /
                현재 보너스율 → 구매 후 보너스율 /
                "다음 정산일부터 적용됩니다" / "환불·되팔기 불가"
  → 구매 → 성공 표시(정보 수준, 연출 없음)
  → HUD의 채굴력은 즉시 갱신, 보너스율은 "적용 예정" 표기로 이중 표시
```

---

## 6. 기능/시스템 카피 (원문) — `game-planner` 소관

> i18n 키를 `web/messages/*.json`에 넣고 6개 로케일로 번역 배선하는 것은 구현 담당 엔지니어의
> 일이다. 아래는 **원문(KO 기준, EN 병기)과 톤 규칙**이다.
> 서사·로어·마일스톤 문장은 여기 없다 — `game-designer` 소관.

### 6.1 톤 규칙

| # | 규칙 |
|---|------|
| T-1 | 느낌표 금지. 모든 시스템 문구는 평서형 종결 |
| T-2 | 2인칭 명령·권유 금지("지금 늘리세요", "놓치지 마세요"). 상태 서술만 |
| T-3 | 수익·수익률을 게임 문구에서 형용사로 꾸미지 않는다("높은", "강력한" 금지). 숫자만 |
| T-4 | 희소성·긴급성 어휘 금지("한정", "마감", "지금만") |
| T-5 | 실패·부족 문구는 원인과 해결 조건만 말하고 감정을 넣지 않는다 |
| T-6 | 게임 재화와 실제 코인을 같은 문장에서 합산하지 않는다 |

### 6.2 HUD / 리드아웃

| 키 | KO | EN |
|----|-----|-----|
| `game.hud.stratum` | 지층 {n} · {name} | Stratum {n} · {name} |
| `game.hud.level` | LV {level} | LV {level} |
| `game.hud.xpProgress` | {current}/{next} XP | {current}/{next} XP |
| `game.hud.operatingDays` | 총 가동일 {days}일 | {days} operating days |
| `game.hud.miningPower` | 채굴력 {mp} | Mining Power {mp} |
| `game.hud.bonusRate` | 보너스 {pct}% | Bonus {pct}% |
| `game.hud.wellCount` | 시추정 {active}기 가동 중 | {active} wells active |
| `game.hud.lastLift` | 최근 인양 {time} | Last lift {time} |

### 6.3 상태 / 빈 상태

| 키 | KO | EN |
|----|-----|-----|
| `game.state.reportingPaused` | 산출 보고가 일시 중지되었습니다. 마지막 갱신 {time}. 계약 이자는 재개 시 소급하여 정산됩니다. | Output reporting is paused. Last updated {time}. Contract interest settles on resume. |
| `game.state.noActiveWell` | 가동 중인 시추정이 없습니다. | No active wells. |
| `game.state.disabled` | 현재 딥 코어를 이용할 수 없습니다. | Deep Core is currently unavailable. |
| `game.state.maintenance` | 점검 중입니다. | Under maintenance. |
| `game.empty.cta` | 스테이킹 상품 보기 | View staking products |
| `game.empty.ledgerNone` | 아직 기록이 없습니다. | No entries yet. |

### 6.4 성장 / 언락

| 키 | KO | EN |
|----|-----|-----|
| `game.level.up` | 레벨 {level} | Level {level} |
| `game.level.unlocked` | 해제됨: {items} | Unlocked: {items} |
| `game.stratum.reached` | 지층 {n} 도달 | Stratum {n} reached |
| `game.coreLog.rank` | 심층 기록 {rank}단 | Core Log rank {rank} |
| `game.coreLog.noYield` | 심층 기록 보상은 외형 전용이며 지급액에 영향을 주지 않습니다. | Core Log rewards are cosmetic only and do not affect payouts. |
| `game.mp.cosmeticOnly` | 채굴력은 진행도 표시이며 지급액에 영향을 주지 않습니다. | Mining Power is a progress readout and does not affect payouts. |

*(`game.mp.cosmeticOnly`는 **게이트 미해제 시에만** 렌더된다. 게이트 해제 시에는 04 문서 §8.1의
고지 세트로 교체된다. 두 문구가 동시에 존재하면 서로 모순되므로, 상호 배타 렌더를 테스트로 잠근다.)*

### 6.5 상점 / 구매

| 키 | KO | EN |
|----|-----|-----|
| `game.depot.title` | 보급창 | Depot |
| `game.depot.tabMaintenance` | 정비 | Maintenance |
| `game.depot.tabOutfitting` | 외장 | Outfitting |
| `game.depot.balanceCC` | 코어 크레딧 {n} | {n} CC |
| `game.depot.balanceSV` | 샐비지 {n} | {n} SV |
| `game.depot.tierNext` | T{tier} · {cost} CC · 채굴력 +{mp} | T{tier} · {cost} CC · +{mp} MP |
| `game.depot.confirmTitle` | 구매 확인 | Confirm purchase |
| `game.depot.confirmCost` | {cost} {currency} 차감 · 구매 후 잔액 {after} | {cost} {currency} · balance after {after} |
| `game.depot.confirmEffect` | 채굴력 {before} → {after} | Mining Power {before} → {after} |
| `game.depot.confirmTiming` | 다음 정산일부터 적용됩니다. | Applies from the next settlement day. |
| `game.depot.confirmFinal` | 구매한 항목은 환불하거나 되팔 수 없습니다. | Purchases cannot be refunded or sold. |
| `game.depot.purchased` | 구매되었습니다. | Purchased. |
| `game.depot.owned` | 보유 중 | Owned |
| `game.depot.locked` | 레벨 {level} 필요 | Requires level {level} |

### 6.6 오류 (03 문서 §6.2 코드 매핑)

| 코드 | KO | EN |
|------|-----|-----|
| `DEPOT_INSUFFICIENT_BALANCE` | 잔액이 부족합니다. {need} {currency} 더 필요합니다. | Not enough balance. {need} {currency} short. |
| `DEPOT_LEVEL_REQUIRED` | 레벨 {level}부터 구매할 수 있습니다. | Available from level {level}. |
| `DEPOT_TIER_SEQUENCE` | 이전 티어를 먼저 보유해야 합니다. | The previous tier is required first. |
| `DEPOT_ALREADY_OWNED` | 이미 보유한 항목입니다. | Already owned. |
| `DEPOT_ITEM_UNKNOWN` | 알 수 없는 항목입니다. | Unknown item. |
| `DEPOT_DISABLED` | 현재 구매할 수 없습니다. | Purchases are unavailable. |
| `GAME_LOAD_FAILED` | 화면을 불러오지 못했습니다. 스테이킹 기능은 정상적으로 이용할 수 있습니다. | Could not load the view. Staking works normally. |

`GAME_LOAD_FAILED`의 뒷문장은 필수다(R-5).

### 6.7 설정

| 키 | KO | EN |
|----|-----|-----|
| `game.pref.title` | 딥 코어 표시 | Deep Core display |
| `game.pref.motionReduced` | 애니메이션 최소화 | Reduce motion |
| `game.pref.staticOnly` | 정적 이미지로 표시 | Static image only |
| `game.pref.hide` | 숨기기 | Hide |
| `game.pref.hideHelp` | 숨겨도 진행도와 지급에는 영향이 없습니다. | Hiding does not affect progress or payouts. |

**`game.pref.hide`(완전 숨김)는 필수 기능이다.** 게임을 원치 않는 사용자가 스테이킹 화면을
게임 없이 쓸 수 있어야 한다. 숨겨도 XP·CC·보너스는 그대로 적립된다(숨김이 손해가 되면 그것은
강제와 같다).

---

## 7. 기술 제약 (`game-developer` 인계 사항)

| # | 제약 |
|---|------|
| G-1 | 내부 해상도 960×540 고정, `Scale.FIT`, `CENTER_BOTH`, `transparent: true`, `fps.target: 30`, `banner: false`. 브레이크포인트별 해상도 분기 금지 |
| G-2 | Phaser는 **동적 import**. S-0(포지션 이력 없음) 사용자에게는 엔진 바이트가 전송되지 않아야 한다 |
| G-3 | 게임 코드는 `web/src/components/staking/deep-core/` 한 트리에 격리. 이 트리 밖에 두는 파일이 생기면 문서에 명시(선행 패밀리는 `lib/oilfield*.ts` 2개가 트리 밖에 남아 되돌리기 함정이 되었다) |
| G-4 | `prefers-reduced-motion` 존중 + 사용자 설정(§6.7) 존중. 둘 중 하나라도 켜지면 파티클·전환 애니메이션 정지 |
| G-5 | 캔버스 부팅 실패·WebGL 미지원 → 정적 폴백 이미지 + `GAME_LOAD_FAILED`. 페이지 나머지는 정상 |
| G-6 | 디바이스 클래스 휴리스틱(`window.innerWidth`, `matchMedia`로 성능 분기) 금지. 성능 조정은 빌드 타임 스코프 결정 또는 사용자 설정으로만 |
| G-7 | 게임은 **자체 폴링을 추가하지 않는다.** 기존 `Staking.tsx`의 `load()` 및 1초 틱을 구독한다. 새 API 라운드트립을 늘리지 않는다 |
| G-8 | 자산은 챕터 단위 아틀라스로 묶어 **현재 챕터 ±1만 로드**한다(06 문서 §5) |
| G-9 | 이미지에 텍스트를 굽지 않는다(R-4, i18n·테스트 가능성) |
| G-10 | `Staking.tsx`에 추가되는 표면은 **import 1줄 + JSX 1블록 + 배지 1개**로 제한. 되돌리기가 한눈에 보여야 한다 |

---

## 8. 수용 기준 (AC)

| ID | 기준 |
|----|------|
| AC-S1 | 게임이 어떤 상태여도 상품 목록·스테이크 버튼·포지션 목록·자동갱신 토글에 도달 가능하다 |
| AC-S2 | 포지션 이력이 없는 사용자의 번들에 Phaser 바이트가 포함되지 않는다 |
| AC-S3 | `game.pref.hide` 활성 시 캔버스가 마운트되지 않으며, 그 상태로 정산이 돌아도 XP·CC·보너스가 정상 적립된다 |
| AC-S4 | `stakingWorkerEnabled=false`에서 S-2가 렌더되고, 산출 수치가 계산값으로 대체되지 않는다 |
| AC-S5 | 자동 갱신 승계 포지션 생성 시 축하 연출이 재생되지 않는다 |
| AC-S6 | 캔버스 텍스처에 구워진 문자열이 없다(자산 검수) |
| AC-S7 | `game.mp.cosmeticOnly`와 04 문서 §8.1 고지 세트가 동시에 렌더되지 않는다 |
| AC-S8 | 게임 관련 파일이 `web/src/components/staking/deep-core/` 밖에 존재하지 않는다(예외는 문서화) |
| AC-S9 | 리더보드·타 사용자 비교·랭킹을 렌더하는 컴포넌트가 없다 |
| AC-S10 | 게임 문구에 느낌표가 하나도 없다(6개 로케일 전부, lint 가능) |
| AC-S11 | 인양 연출이 표시하는 수량이 실제 코인 단위이며 가상 단위 환산이 없다 |
| AC-S12 | 원금(`principal`)을 읽어 시추정 크기·등급을 정하는 코드가 없다 |

---

*다음: `docs/specs/deep-core-06-asset-manifest.md`*
