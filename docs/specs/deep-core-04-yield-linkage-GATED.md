# DEEP CORE — 기획서 04: 채굴력 → 실제 스테이킹 보너스 연동 (**게이트 문서**)

> `game-planner` · 2026-08-10
> ## 상태: **설계 원칙 승인 / 구현 착수 여전히 금지** (`pm` 사인오프 2026-08-10)
>
> 이 문서가 다루는 메커닉은 **게임 결과가 실제 지급액을 증가시키는** 금전 산출물 기능이다.
>
> **2026-08-10 `pm` 판정 (`deep-core-00-overview-and-gate.md` §6):**
> - 본 문서의 **설계는 원칙 승인**되었다 — 재설계 요구 없음. 안전장치 A1~A14, 규칙 Y-1~Y-5,
>   4중 상한, AC-Y1~Y14는 전부 승인.
> - **그러나 구현 착수는 여전히 금지다.** 00 §4 Q1이 답변되었다는 사실만으로 이 문서의 게이트가
>   해제되지 않는다. **해제 조건이 00 §6.2의 G-1/G-2/G-3으로 교체되었다.**
> - **G-1(지급 레일 확정)이 최우선 미충족 조건이다.** 확인 결과 현재 스테이킹 이자에는 사용자
>   출금 가능 잔고로 이어지는 경로가 **존재하지 않는다**(00 §6.1 C1~C5). 본 문서 §10 EQ-1은
>   "미해결 엔지니어링 질문"이 아니라 **나머지 전부에 선행하는 선결 조건**이다.
> - 본 문서에 **추가로 적용되는 `pm` 수정 요구: M-2 / M-3 / M-4** (00 §6.3).
>   그리고 §6.1 `gameBonusLocales`의 관할 통제 용도는 **금지**되었다(00 §6.4).
>
> **G-1·G-2·G-3이 전부 충족되기 전에는 `game-developer`·`prisma-db-expert`·`web-shared-expert`
> 누구도 착수해서는 안 된다.** 본 문서와 00 §6이 충돌하면 **00 §6이 우선한다.**

---

## 0. 이 문서를 읽는 순서

§1 무엇을 바꾸지 **않는가** → §2 수식 → §3 적격 조건 → §4 반영 시점 → §5 4중 상한 →
§6 원장/스키마 → §7 남용 시나리오별 방어 → §8 고지 → §9 AC → §10 미해결 엔지니어링 질문.

§1을 건너뛰면 나머지가 위험해 보인다. §1이 이 설계의 안전성 대부분을 담당한다.

---

## 1. 무엇을 바꾸지 않는가 (설계의 중심축)

### 1.1 계약 이율은 절대 건드리지 않는다

`StakePosition.dailyRatePct`와 `termDays`는 체결 시점 **스냅샷**이며, 사용자가 그 조건으로 자금을
잠근 계약 조건이다. 게임이 이 값을 사후에 올리는 것은 게임 기능이 아니라 **상품 조건 변경**이다.

> **규칙 Y-1. 게임은 `dailyRatePct`, `termDays`, `principal`, `maturityAt`, `paidInterest`,
> `daysPaid`, `StakingPayout` 어느 것도 읽기 외의 방식으로 건드리지 않는다.**

보너스는 **완전히 분리된 원장(`GameBonusPayout`)** 에만 존재한다. 기존 스테이킹 화면의 모든
숫자는 게임을 껐을 때와 정확히 동일한 값을 유지한다. 게임을 영구히 삭제해도
기존 스테이킹 수치·이력·감사 기록은 한 줄도 달라지지 않는다.

### 1.2 정산 주기·만기를 바꾸지 않는다

"채굴 속도"라는 표현을 쓰지 않는 이유가 여기 있다(01 문서 §7). 정산 주기는 `stakingDayMs()`가
정하고, 만기는 `maturityAt`이 정한다. 게임이 바꾸는 것은 **하루치 지급액**뿐이며
**언제 지급되는지, 언제 끝나는지는 전혀 바꾸지 않는다.**

### 1.3 손실 방향으로 작동하지 않는다

> **규칙 Y-2. 보너스는 항상 ≥ 0이다. 어떤 게임 상태도 사용자의 수령액을 줄일 수 없다.**
> 낮은 레벨·낮은 장비·미접속·게임 미이용은 보너스가 **0**일 뿐 페널티가 아니다.
> 게임을 전혀 하지 않는 사용자는 계약된 이자를 100% 그대로 받는다.

이 규칙이 있어야 "게임을 안 하면 손해"라는 강요 구조가 성립하지 않는다.

---

## 2. 수식

### 2.1 보너스율

```
MP_MIN = 5            // 레벨 1, 장비 없음
MP_MAX = 500          // 레벨 60 + 전 5트랙 T10
GAME_BONUS_MAX_PCT = 10.00        // ← pm 확정: 10.00 (단 초기 운영값은 더 낮게 — 00 §6.3 M-2)

bonusPct(MP) = GAME_BONUS_MAX_PCT × (clamp(MP, MP_MIN, MP_MAX) − MP_MIN) / (MP_MAX − MP_MIN)
             = 10.00 × (MP − 5) / 495
```

- **선형이며 캡이 붙어 있다.** 곱연산 스택이 존재하지 않는다(03 문서 §4.3-a).
- 신규 사용자: `MP=5` → **0.00%**
- L30 / 3트랙 T6: `MP=222` → **4.38%**
- L60 / 장비 없음: `MP=300` → **5.96%**
- L60 / 전 트랙 T10: `MP=500` → **10.00%** (상한)

### 2.2 일일 보너스 금액

정산 실행 시각 `now`, 포지션 `p`, 일차 `dayIndex = d`에 대해:

```
base(p)      = dailyInterest(p.principal, p.dailyRatePct)     // 기존 stakingMath.ts 함수 그대로
bonusRaw     = base(p) × bonusPct(MP_effective(user)) / 100
bonus(p, d)  = min( bonusRaw, 남은_사용자_일일한도(coin), 남은_포지션_한도(p) )
```

- **`base(p)`는 이미 `runStakingSettlement`가 계산해 `StakingPayout.amount`에 쓰는 바로 그 값이다.**
  새로 계산하지 않고 **같은 함수·같은 인자**를 쓴다. 두 곳에서 따로 계산하면 언젠가 어긋난다.
- 모든 산술은 `decimal.js` (CLAUDE.md 규칙 2). `Number()`/`parseFloat` 금지.
- 반올림: 코인별 정밀도로 **내림(floor)**. 반올림 이득이 누적되는 방향을 만들지 않는다.

### 2.3 복리 없음

```
규칙 Y-3. 보너스는 원금에 합산되지 않으며, 다음 날 base 계산에 포함되지 않는다.
규칙 Y-4. 보너스는 보너스를 낳지 않는다(보너스에 다시 보너스율을 곱하지 않는다).
규칙 Y-5. 보너스는 MLM 레퍼럴 보너스(`payReferralBonuses`)의 산정 기준액에서 제외된다.
```

Y-5가 특히 중요하다. `payReferralBonuses`는 이자의 %를 상위 라인에 지급한다. 게임 보너스를
기준액에 포함시키면 **게임이 보상 플랜 발행량의 배수기**가 되고, 게임 레벨이 조직 수당을 밀어
올리는 구조가 된다. 기준액은 `StakingPayout` 합계로만 계산되어야 한다.

---

## 3. 적격 조건 (모두 만족해야 보너스가 발생)

| # | 조건 | 이유 |
|---|------|------|
| E-1 | 해당 `(positionId, dayIndex)`에 **`StakingPayout` 행이 실제로 존재**한다 | 실제 지급되지 않은 날에는 보너스도 존재할 수 없다 |
| E-2 | `position.grantedByAdminId == null` | 관리자 지급 포지션 제외 (auto-renew 자격 규칙과 동일 기준) |
| E-3 | `user.disabled == false` | 정지 계정 제외 |
| E-4 | `PlatformSetting.gameBonusEnabled == true` | 전역 킬 스위치 |
| E-5 | `position.coin ∈ GAME_BONUS_COINS` | 코인 화이트리스트 (관할·재원 통제) |
| E-6 | 사용자 관할이 허용 목록에 포함 | 관할별 킬 스위치(A12). **단 `locale` 기반 판정은 금지 — 00 §6.4** |
| E-7 | `mpEffectiveFrom <= dayKey` 로 승격된 `mpEffective` 사용 | 소급 금지(§4) |
| E-8 | 프로그램 예산 소진 상태가 아님 | §5.4 |

E-1이 가장 중요한 구조적 방어다. **보너스 행은 지급 행의 그림자로만 존재한다** — 지급 행 없이는
어떤 경로로도 보너스 행이 생길 수 없다.

---

## 4. 반영 시점 — 소급 절대 금지

### 4.1 문제

장비를 사자마자 채굴력이 오른다면, 사용자는 정산 직전에 구매해서 **이미 경과한 하루**에 대해
보너스를 받게 된다. 이는 회계상 소급 적용이며 감사에서 반드시 문제가 된다.

### 4.2 해법 — 승격 게이트가 붙은 2필드 스냅샷

```
GameProfile.mp               Int   // 라이브 채굴력 (구매·레벨업 즉시 갱신, 표시용)
GameProfile.mpEffective      Int   // 정산이 실제로 사용하는 값
GameProfile.mpEffectiveFrom  String // dayKey. 이 날부터 mp가 mpEffective로 승격
```

- **구매/레벨업 시**: `mp` 즉시 갱신, `mpEffectiveFrom = nextDayKey(now)`.
- **정산 실행 시**(dayKey = D): `if (mpEffectiveFrom <= D) mpEffective = mp` 를 **크레딧 이전에**
  수행 → 이후 크레딧은 전부 `mpEffective` 사용.
- 결과: 오늘 산 장비는 **오늘의 정산에 절대 반영되지 않고, 다음 정산일부터 반영된다.**
- UI는 항상 두 값을 모두 보여준다: `현재 적용 5.96% · 다음 정산일부터 6.34%`

### 4.3 행 단위 스냅샷

`GameBonusPayout` 행에 `mpSnapshot`, `bonusPctSnapshot`을 **문자열로 그대로 기록**한다.
사후에 밸런싱 상수가 바뀌어도 과거 행의 근거가 재현 가능해야 한다. 과거 행은 **절대 재계산하지
않는다**.

---

## 5. 4중 상한 (남용 방지의 핵심)

### 5.1 상한 1 — 비율 상한 (하드코딩된 코드 상수)

`GAME_BONUS_MAX_PCT = 10.00`. **환경변수도 관리자 설정도 아닌 코드 상수**로 둔다.
올리려면 코드 변경 → 리뷰 → 커밋 → 배포가 필요하다. 설정 화면의 숫자 하나로 플랫폼 채무가
배가되는 경로를 만들지 않는다. (기존 `AUTO_RENEW_MAX_TERM_DAYS = 90` 이 같은 방식으로 다뤄진
선례가 있다.)

추가로 코드에 **하드 어서션**을 둔다:
```
if (bonusPct > GAME_BONUS_MAX_PCT) throw  // 도달 불가여야 하는 방어 분기
if (bonus.gt(base)) throw                 // 보너스가 원 이자를 넘으면 무조건 중단
```

### 5.2 상한 2 — 포지션·일 단위 상한

`bonus(p,d) ≤ base(p) × GAME_BONUS_MAX_PCT / 100`. §2.1의 캡에서 자동으로 따라오지만,
크레딧 직전에 **독립적으로 재검증**한다(계산 경로 버그에 대한 2차 방어).

### 5.3 상한 3 — 사용자·일·코인 절대 상한

`PlatformSetting.gameBonusDailyCapPerUser`: `{ "USDT": "50", "BANA": "1000", ... }` (코인별 문자열).

- 하루에 한 사용자가 받을 수 있는 게임 보너스 총액의 절대 천장.
- 비율 상한만으로는 **대규모 예치자의 절대 금액**을 통제할 수 없다. 원금이 100배면 보너스도
  100배다. 이 상한이 그 꼬리를 자른다.
- 상한에 걸리면 **초과분은 소멸**하며(이월·적립 없음), 사용자에게 그 사실을 표시한다
  (05 문서 §6, `game.bonus.dailyCapReached`). 숨기지 않는다.
- 적용 순서는 결정적이어야 한다: **`positionId` 오름차순**으로 배분(랜덤·최적화 배분 금지 —
  재현 가능해야 한다).

### 5.4 상한 4 — 프로그램 전체 예산 (장래효 자동 정지)

`PlatformSetting.gameBonusMonthlyBudget`: 코인별 월 예산.
**실제 숫자는 미정 — `pm` G-3의 대상이며, 확정 전에는 이 기능을 켤 수 없다(00 §6.2).**

- 매 정산 실행에서 당월 누적 보너스 합계를 집계한다.
- 예산 초과 시: **`gameBonusEnabled = false`로 자동 전환 + `AuditLog` 기록 + 관리자 알림.**
- **정지는 항상 장래효다.** 이미 기록된 행은 취소·회수(clawback)하지 않는다. 초과분을 사후에
  회수하는 설계는 사용자에게 "받았다가 빼앗기는" 경험을 만들며, 그것이야말로 이 기능의
  가장 큰 평판 리스크다.
- 비례 배분(pro-rating)을 **채택하지 않은 이유**: 같은 채굴력·같은 원금인데 날마다 보너스율이
  달라지고, 그 이유를 사용자가 확인할 방법이 없다. 불투명한 변동보다 **명시적 정지 + 고지**가
  낫다.

---

## 6. 원장 스키마

```
GameBonusPayout
  id                String   @id @default(cuid())
  positionId        String
  userId            String
  coin              String
  dayIndex          Int          // StakingPayout과 동일한 일차
  dayKey            String       // floor(now / stakingDayMs())
  amount            String       // decimal 문자열
  baseAmount        String       // 근거가 된 StakingPayout.amount (감사용 복제)
  mpSnapshot        Int
  bonusPctSnapshot  String
  cappedBy          String?      // null | 'USER_DAILY' | 'POSITION' | 'BUDGET'
  paidAt            DateTime @default(now())

  @@unique([positionId, dayIndex])   // ★ 멱등 — StakingPayout과 동일 패턴
  @@index([userId, paidAt])
  @@index([dayKey])
```

`@@unique([positionId, dayIndex])`가 **재실행 안전성의 전부**다. 기존 `StakingPayout`이 이미
이 패턴으로 워커 재실행 중복 지급을 막고 있으므로, 동일 규약을 따르면 운영상 검증된 방식이 된다.

> **[`pm` 2026-08-10]** 이 스키마와 아래 `PlatformSetting` 필드는 **G-1/G-2/G-3 충족 전까지
> 마이그레이션하지 않는다.** Phase 0 마이그레이션 범위에 포함시키지 말 것(00 §6.5 Q4).

### 6.1 `PlatformSetting` 추가 필드

| 필드 | 타입 | 기본값 | 용도 |
|------|------|--------|------|
| `gameEnabled` | Boolean | `false` | 게임 표면 전체 on/off (Phase 0 포함) |
| `gameBonusEnabled` | Boolean | `false` | **보너스 지급** on/off. 기본 off — 명시적으로 켜야 작동 |
| `gameBonusCoins` | Json | `[]` | 코인 화이트리스트 |
| `gameBonusDailyCapPerUser` | Json | `{}` | 코인별 사용자 일일 절대 상한 |
| `gameBonusMonthlyBudget` | Json | `{}` | 코인별 월 예산 |
| `gameBonusLocales` | Json | `[]` | **관할 통제 용도 금지(00 §6.4).** `locale`은 사용자가 임의 변경 가능하므로 통제 수단이 아니다. 용도는 "해당 언어권 UI 노출 제어"까지 |

**모든 기본값이 "꺼짐"이다.** 마이그레이션이 적용되는 순간 보너스가 흐르기 시작하는 일이
없도록 한다.

### 6.2 정산 파이프라인 내 위치

`runStakingSettlement`의 기존 순서를 바꾸지 않고 **패스를 추가**한다:

```
Pass 1  기존: StakingPayout 크레딧 + 만기/갱신 처리          ← 변경 없음
Pass 1b 신규: mpEffective 승격 (dayKey 비교)                 ← 크레딧 전
Pass 1c 신규: GameBonusPayout 크레딧 (Pass 1 결과 행에 대해서만)
Pass 1d 신규: XP/CC 적립 (02·03 문서)
Pass 2  기존: 만기 리마인더 메일                              ← 변경 없음
Pass 3  기존: 갱신 결과 메일 재시도                            ← 변경 없음
Pass 4  기존: payReferralBonuses  ← ★ StakingPayout만 읽는다. GameBonusPayout 절대 미참조 (Y-5)
```

**Pass 1c가 실패해도 Pass 1은 이미 커밋되어 있어야 한다.** 게임 보너스 계산 오류가 본 이자
지급을 막으면 안 된다 — 게임은 스테이킹의 부속물이지 그 반대가 아니다. 따라서 Pass 1c는
포지션 단위로 독립 try/catch를 두고, 실패는 로깅 후 다음 실행에서 재시도한다(멱등하므로 안전).

---

## 7. 남용 시나리오별 방어

| # | 시나리오 | 방어 |
|---|----------|------|
| AB-1 | 클라이언트에서 MP/레벨/보너스율을 위조해 전송 | 보너스 계산 경로에 **클라이언트 입력이 존재하지 않는다**. 전부 DB 상태에서만 산출 |
| AB-2 | 정산 직전 장비 구매로 당일 소급 수령 | `mpEffectiveFrom` 승격 게이트(§4.2) |
| AB-3 | 정산 워커 재실행 유도로 중복 수령 | `@@unique([positionId, dayIndex])` |
| AB-4 | 포지션을 잘게 쪼개 `cc.lift`/`xp.lift` 다중 적립 | 1 정산일당 **3포지션 상한**(02·03 문서). 4번째부터 적립 0. **`charter_open`에도 동일 상한 신설 — 00 §6.3 M-1** |
| AB-5 | 다중 계정(시빌)로 상한 우회 | 계정별 상한은 우회되지만 **각 계정이 실제 원금을 예치해야** 하고 보너스는 그 원금의 이자에 비례한다 — 시빌은 이득이 없다(비례 구조가 곧 방어). 추가로 §5.4 프로그램 예산이 전체 노출을 캡 |
| AB-6 | 레퍼럴 조직을 통한 증폭 | Y-5 (기준액 제외) + 03 문서 §2.3 (레퍼럴로 재화 획득 불가) |
| AB-7 | 관리자 지급 포지션으로 원금 없이 보너스 수령 | E-2 |
| AB-8 | 대규모 예치로 절대 금액 폭주 | §5.3 사용자 일일 절대 상한 |
| AB-9 | 상수 변경으로 상한 무력화 | §5.1 코드 상수 + 하드 어서션. `PlatformSetting`으로는 **낮출 수만** 있고 올릴 수 없게 구현 (`pm` 필수 지정 — 00 §6.3 M-2) |
| AB-10 | 시스템 시계 조작 / dayKey 위조 | `dayKey`는 서버 시각과 `stakingDayMs()`에서만 파생. 클라이언트 시각 미사용 |
| AB-11 | 만기된 포지션에 계속 보너스 | E-1 (해당 일자 `StakingPayout` 행이 없으면 보너스 없음). 만기 후에는 지급 행이 생기지 않는다 |
| AB-12 | 자동 갱신 승계 포지션을 신규로 위장해 개설 보상 반복 | `renewedFromPositionId != null` 이면 `xp/cc.charter_open` 미적립(02 §2, AC-P9) |
| AB-13 | 부동소수 오차 누적 | 전 구간 `decimal.js`, 내림 처리, `Number()` 금지 |
| AB-14 | 예산 초과 후 사후 회수 요구 | §5.4 — 회수하지 않는다. 장래효 정지만 |
| **AB-15** | **최소 예치금 없는 상품으로 먼지 포지션을 대량 개설해 `charter_open` farming** | **`pm` 신규 식별(00 §6.3 M-1).** 정산일당 1건 + 3포지션 상한 + `minAmount` null 상품 배제 |

---

## 8. 고지 (테스트로 강제되는 문자열)

`docs/patterns/game-planner.md`의 규칙에 따라 **모든 고지는 DOM 오버레이 텍스트**이며,
캔버스 텍스처에 굽지 않는다. 아래 문자열은 **테스트가 존재를 검증**해야 한다
(기존 auto-renew의 `confirmLock` 문자열이 같은 방식으로 다뤄진 선례가 있다).

### 8.1 상시 고지 (보너스 표시 옆, 항상 보임)

| 키 | KO |
|----|-----|
| `game.bonus.disclosureRate` | 채굴력은 게임 내 진행도이며, 체결된 일일 이자율과 약정 기간을 변경하지 않습니다. |
| `game.bonus.disclosureSeparate` | 게임 보너스는 계약 이자와 별도로 지급되는 부가 지급분입니다. |
| `game.bonus.disclosureCap` | 게임 보너스는 해당 일자 이자의 최대 {maxPct}%로 제한되며, 일일 한도가 적용됩니다. |
| `game.bonus.disclosureProspective` | 게임 보너스 프로그램은 사전 고지 후 변경되거나 중단될 수 있습니다. 이미 지급된 보너스는 회수하지 않습니다. |
| `game.bonus.disclosureNoLoss` | 게임을 이용하지 않아도 계약된 이자는 전액 그대로 지급됩니다. |
| `game.bonus.disclosureNoValue` | 코어 크레딧·샐비지는 게임 내 재화이며, 현금 가치가 없고 구매·양도·환전할 수 없습니다. |

### 8.2 상태 고지

| 키 | KO |
|----|-----|
| `game.bonus.dailyCapReached` | 오늘 게임 보너스 한도에 도달했습니다. 초과분은 이월되지 않습니다. |
| `game.bonus.programPaused` | 게임 보너스 지급이 현재 중단되어 있습니다. 계약 이자는 정상 지급됩니다. |
| `game.bonus.notAvailableRegion` | 현재 지역에서는 게임 보너스가 제공되지 않습니다. |
| `game.bonus.pendingEffect` | 다음 정산일부터 적용됩니다 (현재 적용 {current}% → {next}%). |

**§8.1의 6개 문자열은 보너스 UI가 렌더되는 모든 화면에 전부 존재해야 한다.** 접기(accordion)
안에 숨기는 것은 허용하되, "자세히 보기"를 눌러야만 존재하는 형태는 금지한다 — 최소한
`disclosureRate`와 `disclosureNoLoss`는 항상 펼쳐진 상태여야 한다.

---

## 9. 수용 기준 (AC)

| ID | 기준 |
|----|------|
| AC-Y1 | 게임 관련 코드가 `StakePosition.dailyRatePct`/`termDays`/`principal`/`paidInterest`/`daysPaid`에 write 하는 경로가 존재하지 않는다 |
| AC-Y2 | `StakingPayout` 행이 없는 `(positionId, dayIndex)`에 `GameBonusPayout` 행이 만들어지지 않는다 |
| AC-Y3 | 정산 워커를 3회 연속 재실행해도 `GameBonusPayout` 총액이 변하지 않는다 |
| AC-Y4 | 장비를 구매한 당일의 정산에서 구매 전 `mpEffective`가 사용된다 |
| AC-Y5 | `bonusPct`가 어떤 입력으로도 `GAME_BONUS_MAX_PCT`를 초과하지 않는다(퍼즈 테스트) |
| AC-Y6 | 사용자 일일 상한 초과 시 잘리며, 잘린 사실이 `cappedBy`에 기록되고 UI에 표시된다 |
| AC-Y7 | `payReferralBonuses`의 산정 기준액에 `GameBonusPayout`이 포함되지 않는다 |
| AC-Y8 | `gameBonusEnabled = false`에서 정산을 돌리면 보너스 행이 0건이고 `StakingPayout`은 정상 생성된다 |
| AC-Y9 | Pass 1c에서 예외가 발생해도 `StakingPayout` 크레딧이 롤백되지 않는다 |
| AC-Y10 | 보너스 계산 경로 전체에서 `Number(`/`parseFloat(`/단항 `+` 를 통한 금액 변환이 없다 |
| AC-Y11 | §8.1의 6개 고지 문자열이 6개 로케일 전부에 존재하고 보너스 UI에서 렌더된다 |
| AC-Y12 | `grantedByAdminId != null` 포지션에 보너스 행이 생기지 않는다 |
| AC-Y13 | 월 예산 초과 시 `gameBonusEnabled`가 자동 false가 되고 `AuditLog`가 남으며, 기존 행은 변경되지 않는다 |
| AC-Y14 | 보너스 금액이 해당 일자 base 이자를 초과하는 행이 0건이다 (DB 레벨 검증 쿼리) |
| **AC-Y15** | **게임 보너스 금액이 `/api/staking/rewards`의 `totalByCoin` 어느 값에도 합산되지 않으며, UI에서 계약 이자와 별개 행으로 표시된다** (00 §6.3 M-3) |
| **AC-Y16** | **`gameBonusEnabled = false`로 전환하면 스테이킹 화면의 모든 기존 숫자가 게임 도입 이전과 동일해진다 — 보너스 지급만 멈추고 게임 표면 전체가 사라지지는 않는다** (00 §6.3 M-4) |

---

## 10. 미해결 엔지니어링 질문 (`pm` → 담당 에이전트로 전개 필요)

| # | 질문 | 담당 | `pm` 판정(2026-08-10) |
|---|------|------|------------------------|
| EQ-1 | **보너스의 실제 정산 경로.** `StakingPayout`은 BANA DB의 원장 행이다. 게임 보너스도 동일 레일로 사용자 잔고에 반영되는지, 아니면 Nia-Hub 측 별도 처리(별도 지급 코드/항목)가 필요한지 미확인. **이것이 확정되지 않으면 §6의 스키마만으로는 실제 지급이 완결되지 않는다** | `web-shared-expert` + `pm` | **승격 → 게이트 해제 조건 G-1.** 확인 결과 기본 이자조차 출금 가능 잔고로 가는 경로가 없다(00 §6.1). 최우선 |
| EQ-2 | 보너스 재원(플랫폼 예산 계정)의 회계 처리 및 월 예산 규모 | `pm` | **→ G-3** |
| EQ-3 | 관할 판별 기준. 현재 `User`에 `locale`은 있으나 거주국 필드가 없다 → `gameBonusLocales`를 locale로 판별하는 것은 근사치일 뿐 | `pm` + 법무 | **판정 완료(00 §6.4): `locale` 사용 금지.** 근사치가 아니라 사용자가 스스로 해제 가능한 잠금장치. 현재 집행 가능한 통제는 전역 킬 스위치뿐 → **G-2** |
| EQ-4 | 6개 관할에서 "인게임 재화로 산 확정형 아이템이 실제 수익률을 높이는 구조"의 규제 취급 (00 문서 Q3) | `researcher` 1차 → 인간 법률 자문 | **착수 지시. 단 초점 재지정(00 §6.5 Q3):** 확률형이 아니라 (i) 수익 증분이 상품의 규제상 성격을 바꾸는가, (ii) 판촉·유인 규제 |
| EQ-5 | 보너스 지급 내역이 세무·거래내역 리포트에 어떻게 표기되어야 하는지 | `pm` + 법무 | G-1 확정 이후로 유예 |
| EQ-6 | 게임 보너스 중단 시 사전 고지 기간(일)의 정책값 | `pm` | P1 착수 전까지 유예 |

---

*다음: `docs/specs/deep-core-05-screen-flow-frd.md`*
