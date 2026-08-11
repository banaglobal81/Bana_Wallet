# StakedSummaryCard — R-U7/AC-V5 위반 처리 (PM 판정)

날짜: 2026-08-11 · 판정자: `pm` · 발의: `product-planner`

## Why (왜 필요한가)

`web/src/components/staking/StakedSummaryCard.tsx`는 V2 컷오버 후 **유일하게 남은**
클라이언트 측 `accruedInterest()` 재계산 표면이다(직접 grep 확인: 클라이언트 import는 이
파일 1건, 나머지는 v1 `stakingSettle.ts`·테스트·문서). 이 컴포넌트는 `Wallet.tsx:257`,
`Dashboard.tsx:654` — 즉 **최다 트래픽 두 화면**에 렌더된다.

**시급성 변경 사유:** 2026-08-11 프로덕션에서 V2 정산 워커를 켰다. 그 전까지 "Earning now"
와 "Credited"의 괴리는 이론적이었으나, 이제 실제 사용자 화면에서 발생 가능하다.

### 확인된 위반 (전부 소스 대조 완료)

| # | 사실 | 근거 |
|---|------|------|
| 1 | `accruedInterest` 클라이언트 재계산 1건 존재 | `StakedSummaryCard.tsx:8, :61` — AC-V5("호출 0건")의 문언적 위반 |
| 2 | 1초 `setInterval`이 금액 state를 구동 | `:52-55`, `:57-65` — R-U7 "초 단위로 증가하는 카운터" 금지 직격 |
| 3 | 서버가 삭제한 필드를 클라이언트가 재구성 | 응답에 `accruedInterest`는 없으나(`utils/stakingApi.ts:64`) `baseDailyRatePct`+`startAt`+`termDays`로 되살림 → **DC-8 우회** |
| 4 | 밴드 모델에서 구조적으로 틀림 | `stakingMath.ts:39-48`은 `baseDailyRatePct`만 사용 — 보너스분을 알 수 없으므로 라벨을 바꿔도 수치가 틀림 |
| 5 | 다중 코인 합산 | `:39` `act.reduce(...)` 원금 전체 합산 + `:40` `positions[0].coin` 단일 심볼 라벨, `:41-43` `totalByCoin` 전 코인 합산 → **AC-V2 위반** |
| 6 | 원금을 클라이언트에서 순회 계산 | `:39` — **AC-V6 위반**. 서버는 이미 `lockedPrincipal`을 코인별로 내려주고 있다(`api/staking/positions/route.ts:72-76`) |
| 7 | **워커 정지 시 수치가 계속 오른다** | `PlatformSetting.stakingWorkerEnabled=false`여도 이 카드는 계속 상승 → **AC-V20 위반**. 워커가 프로덕션에서 살아난 지금 실운영 리스크 |
| 8 | "Live" 배지가 이중으로 오도 | `daysElapsed`가 정수 절삭 → 실제로는 하루 단위 계단함수. 초당 리렌더 86,400회로 동일 값을 다시 그린다 |

### 왜 이 컴포넌트가 누락됐나
`staking-page-v2-screen-flow-frd.md` §2.4 삭제 인벤토리는 `Staking.tsx` 라인만 열거했고,
rev05 §5.2 표는 이 컴포넌트에 "타입·필드 추종"만 지시했다(`rev05:730`). **산술 감사 지시가
없었다.** 이것이 SS-1(L-4의 적용 범위 명문화)이 필요한 이유다.

## What (승인 범위)

- **SS-1 승인** — L-4/R-U7은 `/staking` 페이지가 아니라 **스테이킹 금액을 보여주는 모든 표면**
  (지갑 홈·대시보드·위젯·게임 HUD)에 구속된다. 서버가 지운 필드를 서버가 여전히 내려주는
  다른 필드로 재구성하는 것은 DC-8 우회로 규정한다. **AC-V20 인용을 추가할 것**(발의안 누락분).
- **SS-2 승인(수정)** — 카드 재설계. 단 **만기 카운트다운 시계는 이번 범위에서 제외**(아래 M-1).
- **SS-3 승인(보강)** — AC-V5′ / AC-SS-1·2·3 신설. **AC-SS-4(워커 정지 무반응) 추가**.
- **SS-4 승인(비차단)** — v1 `stakingSettle.ts` 폐기 티켓에 **명시적으로 귀속**시켜 부유하지 않게 한다.

### PM 수정사항
- **M-1 (범위 축소):** 만기 카운트다운 시계는 넣지 않는다. L-4가 허용하는 것은 맞으나,
  (a) 방금 제거한 `setInterval`을 즉시 다시 도입하고, (b) 포지션이 N개일 때 "어느 만기냐"가
  미정의다. 별도 설계 항목으로 분리. 이번 카드는 **금액 수치 1개(기록된 수익) + 잠긴 원금**
  으로 끝낸다. 빈 슬롯은 그대로 둔다.
- **M-2 (코인별 정합):** "Staked"는 서버 `lockedPrincipal`(코인별), "Recorded"는
  `totalByCoin`(코인별). 오늘 스테이킹 가능 코인이 BANA뿐이라도 **코인 맵을 순회하는 구조로**
  구현한다. 단일 심볼로 라벨된 합산은 어떤 경우에도 금지.
- **M-3 (거부 확인):** "estimated" 재라벨·면책 문구 추가는 발의안대로 **기각**. R-U7은 라벨이
  아니라 수치 자체를 금지한다.
- **M-4 (서버 작업 없음):** `lockedPrincipal`·`totalByCoin` 모두 이미 서버가 코인별로 제공 중.
  이 티켓은 **클라이언트 전용**이며 API/DB/워커 변경 의존이 없다.
- **M-5 (i18n):** `stakedSummary.live` / `stakedSummary.earning` 키 제거, `credited` →
  `PositionsSheet`의 `recordedLabel` 관용에 맞춰 정정. **6개 로케일 전부**(AC-V24).

## 범위 밖 (명시)
- `web/prisma/schema.prisma:446`의 v1 `StakePosition.accruedInterest` 컬럼 — v1 테이블 폐기
  시점에 `prisma-db-expert`가 판단(PRD §5.5가 이미 그렇게 위임함).
- 만기 카운트다운 시계 설계(M-1).

## Who / 순서
1. `product-planner` — 부칙을 `docs/specs/staking-page-v2-screen-flow-frd.md`에 기재
   + `staking-yield-system-v2-design-t8-stake-flow-frd.md` DC-8에 교차참조 1줄.
2. `web-wallet-expert` — 컴포넌트 변경. **사용자 별도 승인 후 착수**(라이브 UI).
3. `qa-lead` — AC-V5′ / AC-SS-1~4 검증.
