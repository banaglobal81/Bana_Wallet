# 설계 문서 A-2 — 잔고 권위 계층(Balance Authority Layer) Prisma 스키마 설계

> 작성: `prisma-db-expert` · 2026-08-10
> **근거 문서(읽은 순서):** `staking-yield-system-v2-INDEX.md` →
> `staking-yield-system-v2-prd.md`(개정 01, 특히 §8 데이터 모델 요구) →
> `staking-yield-system-v2-prd-rev02-balance-authority.md`(개정 02, 모델 C·PoR-1) →
> `staking-yield-system-v2-prd-rev03-rebuild-and-exclusivity.md`(개정 03 §2 X-1′~X-8,
> §6.3 V2-CORE/V2-BAND, §7.2 A-2 작업 정의 — **이 문서가 답하는 항목**)
>
> **지위: 설계 문서다. 구현 지시서가 아니다.** rev03 §7.2가 명시한 3조건
> (① 이 문서의 마스터 승인 ② 모든 신규 필드 기본값 "꺼짐"/0 ③ 로컬 원장에 0이 아닌 값을
> 쓰는 코드 경로 미병합) **전부가 충족되기 전까지 어떤 마이그레이션도 실행하지 않는다.**
> `prisma migrate dev`/`deploy` 미실행. `prisma db push`는 절대 금지(CLAUDE.md 규칙 7, 항상).
> 아래 스키마 조각은 **개념 초안**이며 `web/prisma/schema.prisma`에 아직 반영되지 않았다.

---

## 0. 이 문서가 다루는 범위 (rev03 §7.2 A-2)

> *"권위 계층 설계 — `balanceAuthority` 필드, X-1′/X-2/X-3′/X-4′/X-6/X-7/X-8"*
> 담당: `prisma-db-expert`(필드·감사) + `web-shared-expert`(분기·프로브 로직)

**이 문서가 만드는 것:**
- `ManagedCoin`에 `balanceAuthority` 명시 필드 추가안
- X-3′(T1/T2 2단계 감지)를 지원하는 프로브 기록 모델
- X-4′(권위 전환 5단계 절차)를 지원하는 전환 상태기계 모델
- X-6(주기적 프로브)을 위한 `PlatformSetting` 확장안
- `web-shared-expert`가 구현할 분기·프로브·게이팅 로직의 **인터페이스 계약**

**이 문서가 만들지 않는 것 (명시적으로 다음 작업으로 미룸):**
- **A-3 (로컬 잔고 원장)** — 사용자×코인 잔고 행, 홀드, 이동 원장(double-entry). 별도 설계 문서.
  이 문서는 A-3가 걸릴 지점(예: 향후 T2 판정에 로컬 잔고를 참조할 필요가 생기면)만 인터페이스로 남겨둔다.
- **A-4 (v2 스테이킹 스키마)** — 상품·포지션·정산 원장 재설계. 별도.
- 온체인 서명/전송 관련 어떤 것도. B-7은 수동 실행으로 결정됐고(Q-M2), 이 문서는 그 실행을
  기록하는 상태기계(`WithdrawalRequest` 확장은 A-5 소관)를 설계하지 않는다.
- 코인 전수 목록(허브 83종 + BANA)의 완전한 매핑 표. G-0⁗ ①의 "완전 목록"은 운영 데이터
  입력 작업이지 스키마 작업이 아니다 — 아래 §2.1에서 이 스키마가 그 입력 없이도 안전한 이유를 설명한다.

---

## 1. 설계 원칙 (rev03 §2에서 직접 도출)

1. **명시 필드, 유도 금지 (X-1′).** 권위는 `ManagedCoin` 존재 여부나 허브 markets 응답에서
   유도하지 않는다. 저장된 컬럼 하나가 유일한 진실이다.
2. **위험은 등재가 아니라 잔고다 (X-1′/X-3′ 재정의).** "허브에 등재됨"은 정보이지 사고가
   아니다. fail-closed는 "엔드유저가 비권위 쪽에서 0이 아닌 잔고를 실제로 획득했음"에만 반응한다.
3. **한 번의 과잉 발동이 가드를 죽인다 (X-3′).** 그래서 감지는 반드시 2단계다 — 등재(경고,
   기능 유지)와 잔고(위반, 발행·체결·출금 정지). 둘을 하나의 상태로 뭉개지 않는다.
4. **전환은 예외가 아니라 예정된 절차다 (X-4′).** "금지"만 있고 "허가된 경로가 없는" 설계는
   실제로 전환이 필요한 날 누군가 우회로를 만들게 한다. 5단계 상태기계를 1급 모델로 둔다.
5. **증거는 판정과 분리해서 보존한다.** 프로브 결과(원시 신호)와 코인의 현재 경보 단계(파생
   상태, 빠른 조회용)를 별도 테이블/필드로 나눈다 — 하나가 다른 하나의 계산을 감추면 안 된다.
6. **신규 필드는 전부 안전한 기본값을 가진다.** `balanceAuthority` 기본값 `LOCAL`은 (a) X-8이
   명시적으로 요구하는 기본값이고 (b) 그 자체로는 어떤 자금 경로도 열지 않는다 — 실제 발행은
   여전히 A-3/A-4의 코드가 존재하고 병합되어야 발생한다.

---

## 2. 스키마 설계 (개념 초안)

### 2.1 신규 enum

```prisma
// X-1′ — 코인 레코드의 명시 필드. 유도 금지.
enum CoinBalanceAuthority {
  HUB    // Nia-Hub가 엔드유저 잔고의 진실. 오늘의 전 코인 기본 상태(암묵적).
  LOCAL  // BANA DB 로컬 원장(A-3)이 엔드유저 잔고의 진실.
}

// X-3′ 2단계 감지의 원시 신호 하나하나를 기록한다. 판정(경보 단계)이 아니라 증거다.
enum CoinAuthorityProbeResult {
  CLEAN         // T1도 T2도 안 걸림 — 정상
  UNKNOWN       // 허브 무응답/오류 — 위반이 아니다. N회 연속되면 T1로 승격(X-6)
  T1_LISTED     // LOCAL 코인이 허브 markets 응답에 등장 (경고, 기능 유지)
  T2_VIOLATION  // 같은 코인에 대해 허브가 0이 아닌 엔드유저 잔고를 반환 (fail-closed)
}

// ManagedCoin에 얹는 파생·캐시 상태 — 요청 경로에서 매번 프로브 이력을 스캔하지 않도록
// 가장 최근 판정을 빠르게 읽기 위한 필드다. 진실은 CoinAuthorityProbe 이력에 있다.
enum CoinAuthorityAlertStage {
  CLEAR        // 정상
  T1_WARNING   // 등재 감지 — 사용자 기능 유지, 관리자 승인 없는 신규 발행만 차단
  T2_HALTED    // 잔고 감지 — fail-closed. 발행·체결·출금 실행 전체 정지. 조회는 유지
}

// X-4′ 5단계 절차의 상태.
enum CoinAuthorityTransitionDirection {
  LOCAL_TO_HUB
  HUB_TO_LOCAL
}

enum CoinAuthorityTransitionStatus {
  DRAFT        // 생성됨, 아직 미착수 (1단계 정지 전)
  FROZEN       // 1단계 완료: 발행·체결·출금 실행 정지
  SNAPSHOTTED  // 2단계 완료: 전 사용자 잔고 스냅샷 확정(불변)
  FUNDS_MOVED  // 3단계 완료: 자금 실이동 기록됨 (허브 계정 ↔ 회사 지갑)
  RECONCILED   // 4단계 완료: 양쪽 합계 대사, 불일치 == "0" 확인
  COMPLETED    // 5단계 완료: balanceAuthority 전환 + 재개
  ABORTED      // 절차 중단. 코인 재개, 권위 필드는 변경되지 않음
}
```

### 2.2 `ManagedCoin` 확장

```prisma
model ManagedCoin {
  id        String   @id @default(cuid())
  symbol    String   @unique
  name      String
  networks  Json
  logoKey   String?
  visible   Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // ─── 신규 (A-2) ─────────────────────────────────────────────────────
  // X-1′ — 이 코인의 엔드유저 잔고를 보유할 수 있는 venue는 정확히 하나.
  // 기본값 LOCAL은 X-8이 명시한 요구다. 이 필드 하나만으로는 어떤 자금 경로도
  // 열리지 않는다 — networks[].depositEnabled/withdrawEnabled가 여전히 별도 게이트다.
  balanceAuthority     CoinBalanceAuthority     @default(LOCAL)

  // X-3′ — 가장 최근 판정의 캐시(빠른 조회용). 진실은 authorityProbes 이력.
  authorityAlertStage  CoinAuthorityAlertStage  @default(CLEAR)
  authorityAlertSince  DateTime?                // 현재 stage로 전이된 시각
  lastProbeAt          DateTime?
  lastProbeResult      CoinAuthorityProbeResult?

  authorityProbes      CoinAuthorityProbe[]
  authorityTransitions CoinAuthorityTransition[]

  @@index([balanceAuthority])
  @@index([authorityAlertStage])
}
```

> **§2.1의 "완전 목록"을 스키마가 요구하지 않는 이유.** `ManagedCoin`에 행이 없는 코인
> (오늘의 허브 마켓 83종 대부분)은 **암묵적으로 HUB 권위**다 — 로컬 원장(A-3)이 존재할 수 있는
> 유일한 대상이 `ManagedCoin` 행이기 때문에, 행이 없으면 로컬 잔고를 가질 경로 자체가 없다.
> 이것은 "유도"가 아니다(X-1′가 금지하는 것) — **단일하고 명시된 폴백 규칙**이며, §5의
> `getCoinAuthority()` 하나의 함수로만 구현되어야 한다는 조건이 붙는다. 이 규칙 자체를 여기
> 문서화하고 §5에서 계약으로 못 박는 것으로 "코드 곳곳에 흩어진 암묵적 HUB 가정"을 방지한다.

### 2.3 신규 모델 — `CoinAuthorityProbe` (X-3′ 증거, X-6 주기 기록)

```prisma
// 주기적(worker) 또는 기회적(hub 잔고 조회 응답을 얹어 확인) 권위 위반 감지의 원시 기록.
// 하나의 판정이 아니라 하나의 관측이다 — 여러 UNKNOWN 뒤에 하나의 T1_LISTED가 오는 식의
// 시계열을 재구성할 수 있어야 X-6("N회 연속 UNKNOWN → T1 승격")이 검증 가능해진다.
model CoinAuthorityProbe {
  id               String                    @id @default(cuid())
  managedCoinId    String
  managedCoin      ManagedCoin               @relation(fields: [managedCoinId], references: [id])
  // 코인 심볼 비정규화 — 프로브 행은 코인 레코드의 현재 상태와 독립적으로 살아남아야 한다
  // (권위 전환·심볼 정정 후에도 과거 증거는 그대로 읽혀야 감사가 성립한다).
  coinSymbol       String
  // 이 프로브를 수행한 시점에 코인에 선언되어 있던 권위. 결과 해석의 기준값을 고정한다.
  authorityAtProbe CoinBalanceAuthority

  result           CoinAuthorityProbeResult
  hubListed        Boolean                   // 원시 T1 신호: 허브 markets 응답에 심볼이 있었는가
  // 원시 T2 신호 — result = T2_VIOLATION일 때만 채워진다. 증거이지 참조 무결성 대상이 아니므로
  // FK가 아니라 문자열(내부 userId)로만 남긴다 — 유저 삭제/변경이 증거 보존을 막지 않도록.
  hubBalanceUserId String?
  hubBalanceAmount String?                   // decimal string. "위반 당시 관측된 잔고"
  // X-6: 이 프로브 직전까지의 연속 UNKNOWN 횟수(에스컬레이션 판단용). 이 프로브 자체가
  // UNKNOWN이면 +1된 값을, 아니면 0으로 리셋한 값을 저장한다.
  consecutiveUnknownCount Int                @default(0)

  source           String                    // "WORKER_PERIODIC" | "WALLET_READ_OPPORTUNISTIC" | "MANUAL_ADMIN"
  probedAt         DateTime                  @default(now())

  @@index([coinSymbol, probedAt])
  @@index([managedCoinId, result, probedAt])
}
```

### 2.4 신규 모델 — `CoinAuthorityTransition` (X-4′ 5단계 절차)

```prisma
// 잔고가 0이 아닌 코인의 권위 전환 절차 그 자체를 1급 상태기계로 기록한다.
// 이 테이블에 없는 경로로 balanceAuthority가 바뀌는 코드는 존재해서는 안 된다
// (단, "잔고가 0인 코인의 직접 정정"은 예외 — §5에서 별도 규약).
model CoinAuthorityTransition {
  id                 String                           @id @default(cuid())
  managedCoinId      String
  managedCoin        ManagedCoin                      @relation(fields: [managedCoinId], references: [id])
  coinSymbol         String                           // 비정규화, CoinAuthorityProbe와 동일 이유
  direction          CoinAuthorityTransitionDirection
  status             CoinAuthorityTransitionStatus    @default(DRAFT)

  // 이 전환이 X-3′ T2 위반에 대한 대응이라면 그 증거로 연결한다. 계획적 전환(예: 사업적
  // 필요에 의한 HUB_TO_LOCAL)이라면 null — 강제되지 않는다.
  triggeredByProbeId String?
  triggeredByProbe   CoinAuthorityProbe?              @relation(fields: [triggeredByProbeId], references: [id])

  initiatedByAdminId String
  initiatedByEmail   String                           // AuditLog와 동일한 비정규화 관례

  // 1단계 — 정지
  frozenAt              DateTime?
  // 2단계 — 스냅샷 (기록 후 불변. 애플리케이션이 재작성을 금지해야 한다)
  snapshotAt            DateTime?
  snapshotTotal          String?                       // decimal string: 스냅샷 시점 로컬 원장 합계(해당 방향 기준)
  snapshotRef             String?                       // 상세 사용자별 내역의 저장 위치 참조
                                                          // (A-3 원장 테이블의 특정 시점 쿼리 조건, 또는
                                                          // export 파일 경로/해시 — A-3 설계 시 확정)
  // 3단계 — 자금 실이동
  fundsMovedAt            DateTime?
  fundsMovedTxRef          String?                       // 온체인 tx hash 또는 허브 참조번호
  fundsMovedAmount          String?                       // decimal string
  // 4단계 — 대사
  reconciledAt               DateTime?
  reconciliationMismatch      String?                       // decimal string. 5단계 진행 조건: 반드시 "0"
  // 5단계 — 완료(권위 필드 전환 + 재개) / 또는 중단
  completedAt                  DateTime?
  abortedAt                     DateTime?
  abortReason                    String?

  notes                           String?                       // 운영자 자유 기록

  createdAt                        DateTime                     @default(now())
  updatedAt                         DateTime                     @updatedAt

  @@index([managedCoinId, status])
  @@index([status])
}
```

> **왜 범용 `AuditLog`로 충분하지 않은가.** `AuditLog`는 "누가·언제·무엇을·한 줄 요약"이며
> rev01 T-5("변경은 `AuditLog`에 기록된다")가 요구하는 감사 요건을 이미 만족한다. 그러나
> X-4′는 **여러 날에 걸친 재개 가능한 상태기계**(정지 → 스냅샷 → 송금 → 대사 → 전환)이고,
> 각 단계에 금액·해시·불일치값 같은 **구조화된 데이터**가 필요하다. `AuditLog.detail`(자유
> 텍스트)에 이를 담으면 "불일치가 0인지" 같은 조건을 코드가 검증할 수 없다. 따라서
> **`CoinAuthorityTransition`이 상태기계의 근거이고, 각 단계 전이마다 `AuditLog` 행도
> 함께 남긴다**(기존 `recordAudit()` 헬퍼 재사용 — 신규 스키마 불필요, §5에서 계약으로 명시).

### 2.5 `PlatformSetting` 확장 (X-6 — 주기 프로브 설정)

```prisma
model PlatformSetting {
  // ...기존 필드 전부 유지...

  // ─── 신규 (A-2, X-6) ─────────────────────────────────────────────
  // worker/의 권위 프로브 주기 작업 on/off. 기존 stakingWorkerEnabled와 동일 패턴.
  // 기본값 true — 이 워커는 자금을 이동시키지 않고 오직 관측·기록만 하므로, 켜져 있는 것이
  // "부채를 만드는 신규 필드"가 아니라 안전장치다(§1 원칙 6과 결이 다른 유일한 예외이며,
  // 그 이유가 바로 이것이다).
  authorityProbeWorkerEnabled            Boolean @default(true)
  // 평시 주기(분).
  authorityProbeIntervalMinutes          Int     @default(15)
  // T1_WARNING 상태로 승격된 코인에 대한 상향 주기(분) — X-3′ "T2 검사 주기를 즉시 상향".
  authorityProbeEscalatedIntervalMinutes Int     @default(2)
  // 연속 UNKNOWN이 이 값에 도달하면 T1_WARNING으로 승격한다(X-6).
  authorityProbeUnknownEscalationCount   Int     @default(3)
}
```

---

## 3. 요구사항 ↔ 스키마 매핑표 (rev03 §2 전항목 추적)

| 요구 | 내용 요지 | 이 설계에서 |
|------|-----------|-------------|
| **X-1′** | 코인당 잔고 보유 venue는 정확히 하나. 명시 필드, 유도 금지 | `ManagedCoin.balanceAuthority` (§2.2). `ManagedCoin` 부재 코인의 암묵적 HUB 폴백은 §5의 단일 함수 계약으로 통제 |
| **X-2** | 두 권위를 어떤 화면에서도 합산 금지 | 스키마 항목 아님 — §5 코드 계약(합산 코드 금지, 리뷰 체크리스트) |
| **X-3′ T1** | 등재 감지 → 경고 + 신규 발행만 차단, 사용자 기능 유지 | `CoinAuthorityProbe.result = T1_LISTED` 기록 → `ManagedCoin.authorityAlertStage = T1_WARNING` 갱신 (§2.2/§2.3) |
| **X-3′ T2** | 잔고 감지 → fail-closed, 발행·체결·출금 정지, 조회 유지, 자동 전환 금지 | `CoinAuthorityProbe.result = T2_VIOLATION` + 증거 필드(`hubBalanceUserId/Amount`) → `authorityAlertStage = T2_HALTED`. 자동 전환 금지는 스키마가 아니라 §5 코드 계약(전환은 오직 `CoinAuthorityTransition` 절차로만) |
| **X-4′** | 권위 전환 5단계 절차. 잔고 0 아닌 코인은 절차 없이 필드만 바꾸는 경로 금지 | `CoinAuthorityTransition` 상태기계 (§2.4), 5개 상태 = 5단계. 필드 직접 변경 경로는 §5에서 명시적으로 봉쇄 |
| **X-6** | 주기적 프로브 결과 기록. 검사 실패는 위반 아님, N회 연속 시 T1 승격 | `CoinAuthorityProbe.consecutiveUnknownCount` + `PlatformSetting.authorityProbeUnknownEscalationCount` (§2.3/§2.5) |
| **X-7** | 입금 주소 생성은 권위·허브 지원 여부 함께 검증. 판정 불가 시 fail-closed(주소 미발급) | 스키마 항목 아님(판정 시점 실시간 검사) — `balanceAuthority` + 현재 `networks[].depositEnabled`를 읽어 §5 계약대로 게이팅. 차단 이벤트는 기존 `AuditLog` 재사용 |
| **X-8** | `ManagedCoin` 생성 시 권위 필수 입력, 기본값 LOCAL + 입금·출금 모두 비활성 | 컬럼 기본값 `LOCAL`(§2.2). "필수 입력"은 API 라우트 검증(§5) — DB 기본값과 별개로 요청 바디에 명시를 요구한다. 입금·출금 비활성 기본값은 `networks[].depositEnabled/withdrawEnabled`(기존 필드, JSON 내부) — 신규 코인 생성 라우트가 명시 `true`가 없는 한 `false`로 강제하도록 §5에서 계약 |

---

## 4. `web-shared-expert`를 위한 인터페이스 계약 (rev03 A-2 후속 작업의 기반)

아래는 **구속력 있는 계약**으로 제안한다 — 이후 A-5(출금 큐 확장)·A-7(화면)이 이 함수들의
존재를 전제로 설계될 것이므로, 이름이 달라져도 **책임의 경계**는 유지되어야 한다.

### 4.1 권위 조회 — 단일 진입점

```
getCoinAuthority(symbol: string): Promise<CoinBalanceAuthority>
```
- `ManagedCoin` 행이 있으면 `balanceAuthority` 그대로 반환.
- 없으면 `HUB`를 반환(§2.2의 폴백 규칙). **이 폴백을 이 함수 밖에서 재구현하지 않는다** —
  "코인이 `ManagedCoin`에 없으면 허브겠지"라는 판단이 코드베이스 여러 곳에 흩어지는 순간
  X-1′의 "유도 금지" 원칙이 사실상 깨진다.
- 잔고·출금·체결의 **모든** 코드 경로(`api/nia/withdrawals`, `api/staking/stake`,
  `api/admin/staking/positions`, `api/nia/address`, 향후 A-3/A-4 라우트 전부)가 이 함수를
  거쳐야 한다.

### 4.2 두 권위 합산 금지 (X-2)

- 어떤 화면·API 응답도 `hubBalance + localBalance`를 계산하지 않는다. 코드 리뷰 체크리스트
  항목으로 `code-compliance-checker`에 등록을 제안한다(이 문서가 그 등록을 지시하지는 않는다
  — `code-compliance-checker`의 자기 규칙에 맡긴다).

### 4.3 T1/T2 프로브 실행과 게이팅

```
runAuthorityProbe(coin: ManagedCoin, opts): Promise<CoinAuthorityProbe>
```
- `worker/`(주기, `PlatformSetting.authorityProbe*`로 스케줄) + 기회적 경로(사용자의 허브
  잔고 응답에 LOCAL 코인 심볼이 0이 아닌 값으로 나타나면 즉시 프로브 기록 — 전수 스캔보다
  저렴하고, 실사용자 트래픽에 자연히 올라탄다) **두 원천 모두 이 하나의 함수로 수렴**시킬 것을
  권고한다. 원천 선택(순수 주기 스캔 vs 기회적 우선 vs 혼합)은 **A-5에서 확정** — 이 문서는
  스키마가 어느 쪽이든 담을 수 있게 `source` 필드를 열어 두는 것까지만 한다.
- 프로브 실행은 `CoinAuthorityProbe` insert + `ManagedCoin.authorityAlertStage`/`lastProbeAt`/
  `lastProbeResult` 갱신을 **한 트랜잭션**으로 수행한다. 둘이 갈라지면 캐시(빠른 조회용
  `authorityAlertStage`)가 증거(프로브 이력)와 어긋나는 상태가 생긴다.

```
assertIssuanceAllowed(symbol): void  // throws on T2_HALTED, or on T1_WARNING without
                                      // an explicit admin-approved override
assertExecutionAllowed(symbol, kind: 'WITHDRAWAL' | 'SETTLEMENT' | 'NEW_POSITION'): void
```
- **T2_HALTED**: 무조건 차단. 사람이 §4.4 절차를 밟기 전까지 우회 경로 없음.
- **T1_WARNING**: "관리자 승인 없는 신규 발행"만 차단(rev03 원문). 관리자가 명시적으로
  승인한 예외 경로가 있다면, 그 예외는 **반드시 `AuditLog`에 별도 액션**
  (예: `AUTHORITY_T1_OVERRIDE`)으로 남는다. 이 문서는 예외 UI/절차 자체를 설계하지 않는다 —
  A-5/A-7이 필요 여부를 판단한다.
- 조회 자체(잔고 화면 등)는 T1이든 T2든 **항상 허용**(rev03 X-3′ 원문 — "조회는 유지한다").

### 4.4 입금 주소 게이팅 (X-7)

```
assertDepositAddressAllowed(symbol): void  // fail-closed
```
- `balanceAuthority = HUB` **그리고** 요청 시점에 허브 markets 응답에 실재할 때만 허브 주소
  생성 호출(`api/nia/address/route.ts`)을 진행한다.
- `balanceAuthority = LOCAL`이면 허브 주소를 **절대 요청하지 않는다**. 로컬 입금 레일(A-3
  이후 결정)이 없는 한 입금 화면에서 이 코인을 노출하지 않는다.
- 허브 markets 조회 자체가 실패하면(판정 불가) 주소를 만들지 않는다 — 캐시된 `authorityAlertStage`나
  마지막 프로브 결과에 기대지 않는다. **주소 발급은 되돌릴 수 없는 행위이므로 이 판정만은
  실시간이어야 한다**(rev03 원문 그대로).
- 차단 이벤트는 신규 테이블 없이 기존 `AuditLog`로 기록한다
  (`action: 'DEPOSIT_ADDRESS_BLOCKED_AUTHORITY'`, 기존 `recordAudit()` 헬퍼 그대로 재사용 —
  `src/app/api/admin/coins/route.ts`의 기존 패턴과 동일).

### 4.5 `ManagedCoin` 생성/수정 라우트 (X-8)

`src/app/api/admin/coins/route.ts`(POST) / `[id]/route.ts`(PATCH 등)에 대한 계약:
- 요청 바디에 `balanceAuthority`가 없으면 **에러로 거부**한다(DB 기본값 LOCAL에 조용히
  기대지 않는다 — "필수 입력"은 API 계약이지 컬럼 기본값이 대신할 수 없다). DB 기본값은
  이 라우트를 우회하는 다른 코드 경로(seed, 관리 스크립트)에 대한 2차 방어선으로 유지한다.
- 신규 코인 생성 시 `networks[].depositEnabled`/`withdrawEnabled`가 요청 바디에 명시되지
  않으면 각각 `false`로 강제한다(현재 `parseNetworks()`의 검증 로직에 이 강제를 추가).
- 변경(symbol의 `balanceAuthority` PATCH)은 **§4.6의 절차를 통해서만** 허용한다 — 이
  라우트에서 직접 필드를 덮어쓰는 코드를 만들지 않는다.

### 4.6 권위 전환 절차 (X-4′)

```
canChangeAuthorityDirectly(symbol): Promise<boolean>
```
- A-3(로컬 원장) 설계 완료 후: 로컬 잔고 합계 == "0" **그리고** 최근 프로브가 해당 코인에
  대해 0이 아닌 허브 잔고를 관측한 적이 없으면 `true`. 이 경우에만 `ManagedCoin.balanceAuthority`를
  **직접** 수정하는 관리자 액션을 허용하고, `AuditLog`(`COIN_AUTHORITY_DIRECT_CHANGE`)로 남긴다.
- 그 외(잔고가 0이 아니거나 A-3 완료 전) — **직접 변경 경로를 제공하지 않는다.** 반드시
  `CoinAuthorityTransition`을 `DRAFT`로 생성하고 5단계(§2.4)를 순서대로 밟는다.
- 각 단계 전이는 기존 `WithdrawalRequest`/N-30 패턴과 동일하게 **원자적 클레임**
  (`updateMany({ where: { id, status: <직전 상태> }, data: { status: <다음 상태> } })`,
  `count === 1`일 때만 진행)으로 구현한다. 동시에 두 명의 관리자가 같은 전환을 진행시키는
  경쟁을 막기 위함이다.
- `RECONCILED` 진입 조건은 `reconciliationMismatch === "0"`(문자열 비교 전 `decimal.js`로
  정규화) **하드 어서션**이다. 이 값이 "0"이 아니면 애플리케이션은 `COMPLETED`로의 전이를
  거부해야 한다 — 데이터베이스 제약이 아니라 코드가 지키는 불변식이지만, 반드시 단위
  테스트로 잠근다(`qa-lead` 소관 예정).

---

## 5. 마이그레이션 상태 — 실행하지 않음

이번 세션에서 실행한 것은 **조회뿐**이다(둘 다 `migrate status` — `migrate deploy`/`db push`
전혀 실행하지 않음):

- 로컬(`bana_wallet_dev`): 26개 마이그레이션, **up to date**.
- 프로덕션(Railway, `.env.production.local`의 공개 프록시 URL): 26개 마이그레이션, **up to date**.
- **드리프트 없음.** 로컬과 프로덕션이 정확히 동기화된 상태에서 이 설계를 시작했다.

추가로 프로덕션 `ManagedCoin` 테이블을 **읽기 전용 SELECT**로 확인했다(`psql`, `SELECT symbol,
name, visible FROM "ManagedCoin"`) — 데이터 변경 없음. 결과: **행 1개, `BANA`뿐이다.** 이는
설계에 두 가지 함의를 준다:

1. **백필이 사실상 트리비얼하다.** `balanceAuthority` 컬럼이 실제로 추가될 때, 유일한 기존
   행(BANA)에 대해 명시적으로 `LOCAL`을 채우면 된다(스키마 기본값과 결과가 같지만, "기본값에
   기댐"과 "결정을 데이터로 기록함"은 다르다 — 이 백필 자체를 별도 마이그레이션 데이터
   조치로 명시하고 `AuditLog`에도 남길 것을 제안한다. 실행 시점에 `prisma-db-expert`가
   판단한다).
2. **다른 코인에 대한 마이그레이션 리스크가 없다.** BANA 외 커스텀 코인이 없으므로,
   `balanceAuthority` 컬럼 추가가 예상치 못한 코인을 잘못된 권위로 분류할 위험이 오늘은
   존재하지 않는다.

**이 조회는 §7.2의 3조건 중 어느 것도 충족시키지 않는다.** 3조건은 여전히:
① 이 문서(A-2)의 마스터 승인, ② 모든 신규 필드 기본값 "꺼짐"/0(위 설계는 이를 만족하도록
작성됐다 — `LOCAL`/`CLEAR`/`DRAFT`/`true`(프로브 워커만, §1 원칙 6 예외 사유 명시)/숫자
기본값 전부 안전), ③ 로컬 원장에 0이 아닌 값을 쓰는 코드 경로 미병합(A-3/A-4 미착수 상태이므로
현재 자동 충족). **셋 다 확인되기 전까지 `prisma migrate dev`를 실행하지 않는다.**

---

## 6. 남는 설계 질문 (다음 단계로 명시적으로 넘김)

1. **T2 감지 전략의 확정.** 전수 스캔 vs 기회적(사용자 잔고 조회에 편승) vs 혼합 — 이 문서는
   `CoinAuthorityProbe.source`로 셋 다 담을 수 있게만 해 뒀다. 비용·지연·커버리지 트레이드오프
   판단은 **A-5에서 `web-shared-expert`가 확정**.
2. **T1_WARNING 상태에서의 관리자 예외 승인 UX.** 필요한지 여부부터가 미정 — **A-7
   (`product-planner`)에서 화면 설계와 함께 결정**.
3. **`CoinAuthorityTransition.snapshotRef`의 정확한 형태.** A-3(로컬 원장 스키마)이 확정돼야
   "특정 시점 쿼리 조건"인지 "익스포트 파일 참조"인지 결정 가능 — **A-3 설계 시 이 필드의
   실제 계약을 확정**.
4. **`ManagedCoin` 삭제 경로가 생길 경우의 참조 무결성.** 현재 삭제 API가 없어 당장 문제는
   아니나, 향후 생기면 `CoinAuthorityProbe`/`CoinAuthorityTransition`의 `managedCoinId` FK를
   `Restrict`로 둘지, 아니면 관계를 끊고 `coinSymbol` 비정규화 필드만으로 감사 이력을
   보존할지 그때 결정한다(현재 초안은 관계 유지 + 비정규화 병행).

---

## 7. 이 문서가 승인하지 않는 것 (명시)

- **마이그레이션 실행 승인이 아니다.** `prisma migrate dev`/`deploy` 어느 것도 이 세션에서
  실행하지 않았고, §5의 3조건이 전부 충족되기 전까지 실행하지 않는다.
- **`web-shared-expert`의 게이팅·프로브 로직 구현 착수 승인이 아니다.** §4의 인터페이스는
  제안이며, 구현은 별도 착수 승인(rev03 §7.2가 이미 A-2를 "지금 착수 가능"으로 분류했으므로
  설계 검토까지는 가능하나, 실제 코드 작성은 `web-shared-expert` 자신의 스코프 판단과 필요
  시 추가 확인을 거친다).
- **A-3(로컬 원장)·A-4(v2 스테이킹 스키마)의 설계가 아니다.** 이 문서가 남긴 인터페이스
  지점(§6-3 등)을 전제로 별도 설계한다.
- **코인 전수 매핑(G-0⁗ ①)의 완료가 아니다.** 그것은 운영 데이터 입력이며, 이 스키마는
  그 입력이 완료되지 않아도 안전하게 동작하도록(암묵적 HUB 폴백) 설계됐을 뿐이다.
