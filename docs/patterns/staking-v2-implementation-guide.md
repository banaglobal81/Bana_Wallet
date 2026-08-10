# 스테이킹 페이지 v2 — 구현 가이드

> 작성: `ui-ux-designer` · 2026-08-10 · 대상: `web-wallet-expert`, `game-developer`
> 
> 디자인 토큰은 `staking-v2-design-tokens.md` 참조. 이 문서는 **React 컴포넌트 구조와 TailwindCSS 클래스 작성 예시**를 제공합니다.

---

## 개요

### 스코프
- `/web/src/components/Staking.tsx` — 페이지 레이아웃 + 상태 관리 수정
- `/web/src/components/staking/StakedSummaryCard.tsx` 또는 새 컴포넌트들:
  - `YieldPanel.tsx` (B2)
  - `VaultControlBar.tsx` (B3)
  - `InlineNotices.tsx` (B5)
- `/web/src/components/staking/sheets/*` — 기존 시트들 수정 (S-STAKE, S-POS, S-YIELD)

### 변하지 않는 것
- `DeepCoreEmbed.tsx` (B1 캔버스)
- `DeepCoreControlBar.tsx` (B4 게임 탭)
- `globals.css` 기본 팔레트 (추가만 함)

---

## 1. 페이지 레이아웃 구조

### Staking.tsx 구조 (의사 코드)

```tsx
export default function Staking({ settings, onNavigate }: StakingProps) {
  const t = useTranslations('staking');
  
  // 데이터 상태 (기존 유지)
  const [rewards, setRewards] = useState<StakingRewards | null>(null);
  const [positions, setPositions] = useState<StakePosition[]>([]);
  const [gameState, setGameState] = useState<DeepCoreGameState | null>(null);
  // ...

  // 시트 상태 (신규)
  const [sheetOpen, setSheetOpen] = useState<'stake' | 'positions' | 'yield' | null>(null);

  return (
    <div className="bana-page min-h-screen flex flex-col">
      {/* Header (기존 유지) */}
      <Header />

      {/* 메인 컨텐츠 */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-4 space-y-4">
        
        {/* B1: STAGE */}
        <section className="w-full">
          <DeepCoreEmbed 
            game={gameState}
            onOpenStake={() => setSheetOpen('stake')}
            focusWellId={null}
            // ...
          />
        </section>

        {/* B2: YIELD PANEL */}
        <YieldPanel 
          rewards={rewards}
          positions={positions}
          onClaimClick={() => { /* claim flow */ }}
          onMoreInfo={() => { /* S-INFO 시트 */ }}
        />

        {/* B3: VAULT BAR */}
        <VaultControlBar
          positionCount={positions.filter(p => p.status === 'ACTIVE').length}
          onStakeClick={() => setSheetOpen('stake')}
          onPositionsClick={() => setSheetOpen('positions')}
          onYieldClick={() => setSheetOpen('yield')}
        />

        {/* B4: RIG BAR */}
        <DeepCoreControlBar game={gameState} crewState={...} />

        {/* B5: INLINE NOTICES */}
        <InlineNotices 
          maintenanceMode={false}
          workerPaused={false}
          maturityNudge={...}
          renewalResult={...}
        />
      </main>

      {/* Sheets (모달) */}
      {sheetOpen === 'stake' && (
        <StakeSheet onClose={() => setSheetOpen(null)} />
      )}
      {sheetOpen === 'positions' && (
        <PositionsSheet onClose={() => setSheetOpen(null)} />
      )}
      {sheetOpen === 'yield' && (
        <YieldSheet onClose={() => setSheetOpen(null)} />
      )}
    </div>
  );
}
```

---

## 2. B2 — YIELD PANEL 구현

### 컴포넌트 구조

```tsx
interface YieldPanelProps {
  rewards: StakingRewards | null;
  positions: StakePosition[];
  tier: 'PS-A' | 'PS-B' | 'PS-C';
  bandProgram: 'OFF' | 'ON';
  onClaimClick: (coin: string) => void;
  onMoreInfo?: () => void;
}

export function YieldPanel({ rewards, positions, tier, bandProgram, onClaimClick, onMoreInfo }: YieldPanelProps) {
  const t = useTranslations('staking');
  
  if (!positions.length) {
    return (
      <div className="bg-[#112643]/70 border border-[#1E3559] rounded-lg p-4 sm:p-6">
        <p className="text-sm text-[#8c90a0] text-center">
          {t('yield.empty')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-[#112643]/70 border border-[#1E3559] rounded-lg p-4 sm:p-6 space-y-4">
        
        {/* 코인별 행 */}
        {rewards?.byCoins.map((coin) => (
          <YieldCoinRow 
            key={coin.symbol}
            coin={coin}
            tier={tier}
            bandProgram={bandProgram}
            onClaimClick={onClaimClick}
            onMoreInfo={onMoreInfo}
          />
        ))}

        {/* 상시 고지 (PS-C only) */}
        {tier === 'PS-C' && bandProgram === 'ON' && (
          <div className="text-xs text-[#8c90a0] leading-relaxed border-t border-[#1E3559]/50 pt-3">
            {t('disclosure.noLoss')}
          </div>
        )}
      </div>
    </div>
  );
}
```

### 코인 행 컴포넌트

```tsx
interface YieldCoinRowProps {
  coin: StakingRewardsCoin;
  tier: 'PS-A' | 'PS-B' | 'PS-C';
  bandProgram: 'OFF' | 'ON';
  onClaimClick: (coin: string) => void;
  onMoreInfo?: () => void;
}

function YieldCoinRow({ coin, tier, bandProgram, onClaimClick, onMoreInfo }: YieldCoinRowProps) {
  const t = useTranslations('staking');
  
  // 라벨 결정 (tier별)
  const labelKey = tier === 'PS-A' ? 'yield.recordedLabel' : 'yield.claimableLabel';
  const helpKey = tier === 'PS-A' ? 'yield.recordedHelp' : 'yield.claimableHelp';

  // 수령 슬롯 상태 결정
  const claimState = determineClaimState(coin, tier);

  return (
    <div className="space-y-3 border-b border-[#1E3559]/50 pb-3 last:border-b-0">
      
      {/* 코인 헤더 */}
      <div className="flex items-center gap-2">
        <CoinAvatar coin={coin.symbol} size="sm" />
        <span className="text-sm font-500 text-white">{coin.symbol}</span>
      </div>

      {/* 수치 그리드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        
        {/* ① 기록/수령가능 수익 */}
        <div className="space-y-1">
          <label className="text-xs font-600 text-[#8c90a0] uppercase tracking-wide">
            {t(labelKey)}
          </label>
          <div className="text-base sm:text-lg font-mono text-white">
            {coin.ledgered}
          </div>
          <p className="text-xs text-[#8c90a0]/70 leading-tight">
            {t(helpKey)}
          </p>
        </div>

        {/* ② 지갑 수령 완료 */}
        <div className="space-y-1">
          <label className="text-xs font-600 text-[#8c90a0] uppercase tracking-wide">
            {t('yield.claimedLabel')} {/* "지갑 수령 완료" */}
          </label>
          <div className="text-base sm:text-lg font-mono text-white">
            {coin.claimed}
          </div>
          <p className="text-xs text-[#8c90a0]/70 leading-tight">
            {t('yield.claimedHelp')}
          </p>
        </div>

        {/* ③ 잠긴 원금 */}
        <div className="space-y-1">
          <label className="text-xs font-600 text-[#8c90a0] uppercase tracking-wide">
            {t('yield.lockedLabel')} {/* "잠긴 원금" */}
          </label>
          <div className="text-base sm:text-lg font-mono text-white">
            {coin.lockedPrincipal}
          </div>
          <p className="text-xs text-[#8c90a0]/70 leading-tight">
            {t('yield.lockedHelp')}
          </p>
        </div>
      </div>

      {/* 수령 슬롯 */}
      <ClaimSlot 
        state={claimState}
        coin={coin.symbol}
        amount={coin.ledgered}
        onClaim={onClaimClick}
        onMoreInfo={onMoreInfo}
      />
    </div>
  );
}
```

### 수령 슬롯 (3가지 상태)

```tsx
type ClaimState = 'UNAVAILABLE' | 'DISABLED' | 'ENABLED';

interface ClaimSlotProps {
  state: ClaimState;
  coin: string;
  amount: string;
  onClaim: (coin: string) => void;
  onMoreInfo?: () => void;
}

function ClaimSlot({ state, coin, amount, onClaim, onMoreInfo }: ClaimSlotProps) {
  const t = useTranslations('staking');

  if (state === 'UNAVAILABLE') {
    return (
      <div className="state-chip-unavailable inline-flex items-center gap-2 px-3 py-2 rounded-lg">
        <span className="text-sm font-500">{t('claim.unavailable')}</span>
        {onMoreInfo && (
          <button 
            onClick={onMoreInfo}
            className="text-xs text-[#8c90a0] underline hover:text-white"
          >
            {t('claim.learnMore')}
          </button>
        )}
      </div>
    );
  }

  if (state === 'DISABLED') {
    return (
      <button 
        disabled
        className="state-button-disabled px-3 py-2 rounded-lg text-sm font-600"
      >
        {t('claim.zero')}
      </button>
    );
  }

  // ENABLED
  return (
    <button 
      onClick={() => onClaim(coin)}
      className="state-button-enabled px-3 py-2 rounded-lg text-sm font-600"
    >
      {t('claim.actionWithAmount', { amount })}
    </button>
  );
}

function determineClaimState(coin: StakingRewardsCoin, tier: 'PS-A' | 'PS-B' | 'PS-C'): ClaimState {
  if (tier === 'PS-A') return 'UNAVAILABLE';
  
  // PS-B/C
  const recordedAmount = new Decimal(coin.ledgered);
  return recordedAmount.gt(0) ? 'ENABLED' : 'DISABLED';
}
```

---

## 3. B3 — VAULT CONTROL BAR 구현

```tsx
interface VaultControlBarProps {
  positionCount: number;
  onStakeClick: () => void;
  onPositionsClick: () => void;
  onYieldClick: () => void;
  disabled?: boolean;
}

export function VaultControlBar({
  positionCount,
  onStakeClick,
  onPositionsClick,
  onYieldClick,
  disabled,
}: VaultControlBarProps) {
  const t = useTranslations('staking');

  return (
    <div className="grid grid-cols-3 gap-2 w-full">
      
      {/* [예치] */}
      <button
        onClick={onStakeClick}
        disabled={disabled}
        className="control-button flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg"
      >
        <Coins className="h-4 w-4 shrink-0" />
        <span className="text-xs font-bold">{t('action.stake')}</span>
      </button>

      {/* [내 포지션 · N] */}
      <button
        onClick={onPositionsClick}
        disabled={disabled}
        className="control-button flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg"
      >
        <Lock className="h-4 w-4 shrink-0" />
        <span className="text-xs font-bold">
          {t('action.myPositions')}
          {positionCount > 0 && (
            <span className="inline-flex ml-1 bg-[#2E7DFF] text-white text-xs font-bold rounded-full w-5 h-5 items-center justify-center">
              {positionCount}
            </span>
          )}
        </span>
      </button>

      {/* [수익 내역] */}
      <button
        onClick={onYieldClick}
        disabled={disabled}
        className="control-button flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg"
      >
        <TrendingUp className="h-4 w-4 shrink-0" />
        <span className="text-xs font-bold">{t('action.yieldHistory')}</span>
      </button>
    </div>
  );
}
```

---

## 4. B5 — INLINE NOTICES 구현

```tsx
interface InlineNoticesProps {
  maintenanceMode?: boolean;
  workerPaused?: boolean;
  maturityNudge?: {
    count: number;
  };
  renewalResult?: {
    type: 'success' | 'error';
    message: string;
    positionId: string;
  };
}

export function InlineNotices({
  maintenanceMode,
  workerPaused,
  maturityNudge,
  renewalResult,
}: InlineNoticesProps) {
  const t = useTranslations('staking');

  return (
    <div className="space-y-3">
      
      {/* #1, #2: B2 위에 렌더 (점검/정산중지) — 이것은 별도 배치 필요 */}
      {/* (YieldPanel 컴포넌트 위에 조건부 렌더) */}

      {/* #3: 만기 수령 안내 */}
      {maturityNudge && maturityNudge.count > 0 && (
        <div className="notice-info rounded-lg p-3 sm:p-4 border text-sm leading-relaxed">
          <Clock className="h-4 w-4 inline mr-2" />
          {t('claim.maturityNudge', { count: maturityNudge.count })}
        </div>
      )}

      {/* #4: 자동 갱신 결과 */}
      {renewalResult && (
        <div className={`rounded-lg p-3 sm:p-4 border text-sm leading-relaxed ${
          renewalResult.type === 'success' ? 'notice-success' : 'notice-error'
        }`}>
          {renewalResult.type === 'success' ? (
            <>
              <Check className="h-4 w-4 inline mr-2" />
              {renewalResult.message}
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4 inline mr-2" />
              {renewalResult.message}
              <button 
                onClick={() => { /* 닫기 */ }}
                className="float-right text-inherit hover:opacity-75"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

### #1/#2 배치 (B2 위)

```tsx
// YieldPanel 상단에 조건부 렌더
{(maintenanceMode || workerPaused) && (
  <div className="space-y-2 mb-2">
    {maintenanceMode && (
      <div className="notice-critical rounded-lg p-3 sm:p-4 border text-sm">
        <Info className="h-4 w-4 inline mr-2" />
        {t('notice.maintenance')}
      </div>
    )}
    {workerPaused && (
      <div className="notice-critical rounded-lg p-3 sm:p-4 border text-sm">
        <Info className="h-4 w-4 inline mr-2" />
        {t('notice.workerPaused')}
      </div>
    )}
  </div>
)}
<YieldPanel {...} />
```

---

## 5. 시트 (모달) 구현 개요

### S-STAKE (예치 시트)

**현재 위치**: `web/src/components/staking/sheets/StakeSheet.tsx` (신규 또는 기존 리팩터링)

**3단 구조**:

```tsx
interface StakeSheetProps {
  onClose: () => void;
}

export function StakeSheet({ onClose }: StakeSheetProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedProduct, setSelectedProduct] = useState<StakingProduct | null>(null);
  const [amount, setAmount] = useState('');

  return (
    <Modal isOpen onClose={onClose} maxWidth="max-w-2xl">
      <div className="bg-[#112643] border border-[#1E3559] rounded-lg p-4 sm:p-6 space-y-4">
        
        {/* 헤더 */}
        <div className="flex justify-between items-center">
          <h3 className="text-lg sm:text-xl font-bold text-white">
            {step === 1 && t('staking:sheet.stakeTitle')}
            {step === 2 && t('staking:sheet.amountTitle')}
            {step === 3 && t('staking:sheet.confirmTitle')}
          </h3>
          <span className="text-xs font-600 text-[#8c90a0]">
            {t('staking:sheet.step', { current: step, total: 3 })}
          </span>
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <StakeStep1 
            onSelect={(product) => {
              setSelectedProduct(product);
              setStep(2);
            }}
          />
        )}

        {/* STEP 2 */}
        {step === 2 && selectedProduct && (
          <StakeStep2 
            product={selectedProduct}
            amount={amount}
            onAmountChange={setAmount}
            onBack={() => setStep(1)}
            onConfirm={() => setStep(3)}
          />
        )}

        {/* STEP 3 */}
        {step === 3 && selectedProduct && (
          <StakeStep3 
            product={selectedProduct}
            amount={amount}
            onBack={() => setStep(2)}
            onConfirm={() => { /* stake() */ onClose(); }}
          />
        )}
      </div>
    </Modal>
  );
}
```

**STEP 1 상품 카드**:

```tsx
function StakeStep1({ onSelect }: { onSelect: (p: StakingProduct) => void }) {
  const [products, setProducts] = useState<StakingProduct[]>([]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {products.map((product) => (
        <button
          key={product.id}
          onClick={() => onSelect(product)}
          className="bg-[#1E3559]/40 border border-[#1E3559] rounded-lg p-3 hover:border-[#2E7DFF] hover:bg-[#1E3559]/60 transition-colors text-left space-y-2"
        >
          <div className="text-sm font-600 text-white">
            {product.name}
          </div>
          
          {/* 비밴드: 단일 이율 */}
          {!product.maxBonusPctOfBase || product.maxBonusPctOfBase === 0 ? (
            <div className="text-base font-mono text-[#2E7DFF]">
              {t('staking:product.dailyRate', { rate: product.baseDailyRate })}
            </div>
          ) : (
            /* 밴드: 밴드 미터 */
            <BandMeterCard product={product} />
          )}

          <div className="text-xs text-[#8c90a0]">
            {product.minAmount && `Min: ${product.minAmount} `}
            {product.maxAmount && `Max: ${product.maxAmount}`}
          </div>

          {/* 마감 칩 */}
          {product.capacityRemaining === 0 && (
            <span className="inline-block text-xs font-600 text-rose-400 bg-rose-500/10 px-2 py-1 rounded">
              {t('staking:product.full')}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
```

**밴드 미터** (BM-1~BM-4):

```tsx
function BandMeterCard({ product }: { product: StakingProduct }) {
  const t = useTranslations('staking');

  if (!product.maxBonusPctOfBase || product.maxBonusPctOfBase === 0) return null;

  const baseRate = new Decimal(product.baseDailyRate);
  const maxBonus = new Decimal(product.maxBonusPctOfBase);
  const maxRate = baseRate.plus(maxBonus);
  const currentRate = new Decimal(product.currentAppliedRate || product.baseDailyRate);

  const minPercent = 0;
  const maxPercent = 100;
  const currentPercent = currentRate.minus(baseRate).dividedBy(maxBonus).times(100).toNumber();

  return (
    <div className="space-y-2">
      {/* 레이블 */}
      <div className="flex justify-between text-xs font-600 text-white">
        <span>{t('staking:band.base')} {baseRate.toString()}%</span>
        <span>{t('staking:band.max')} {maxRate.toString()}%</span>
      </div>

      {/* 진행도 바 */}
      <div className="w-full h-2 bg-[#1E3559]/40 rounded-full overflow-hidden">
        <div 
          className="h-full bg-[#2E7DFF]"
          style={{ width: `${Math.max(5, currentPercent)}%` }}
        />
      </div>

      {/* 현재값 */}
      <div className="text-xs text-center text-[#afc6ff]">
        {t('staking:band.current')} {currentRate.toString()}%
      </div>
    </div>
  );
}
```

### S-POS (내 포지션 시트)

**접힌 행**과 **펼친 상세**:

```tsx
function PositionRow({ position, onExpand }: { 
  position: StakePosition; 
  onExpand?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const t = useTranslations('staking');

  const daysSettled = Math.floor(position.settledDays);
  const termDays = position.termDays;

  return (
    <div className="border-b border-[#1E3559]/50 py-3 last:border-b-0 space-y-2">
      
      {/* 접힌 상태 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left space-y-1"
      >
        {/* 첫 줄: ID / 금액 / 약정 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <WellBadge wellId={position.wellId} />
            <span className="text-sm font-600 text-white">
              {position.amount} {position.coin} · {position.termDays}{t('unit.days')}
            </span>
          </div>
          <span className="text-xs text-[#8c90a0]">
            {t('position.progress', { 
              settled: daysSettled, 
              term: termDays 
            })}
          </span>
        </div>

        {/* 둘째 줄: 이율 (PR-3: 밴드폭 0은 단일값만) */}
        <div className="text-xs font-mono text-[#2E7DFF]">
          {position.maxBonusPctOfBase && position.maxBonusPctOfBase > 0 ? (
            `${t('staking:position.dailyRate', { 
              base: position.baseDailyRate, 
              max: position.maxDailyRate 
            })}`
          ) : (
            `${t('staking:position.dailyRate', { 
              rate: position.baseDailyRate 
            })}`
          )}
        </div>

        {/* 셋째 줄: 상태 + 수익 */}
        <div className="flex justify-between text-xs text-[#8c90a0]">
          <span>{t('position.status')} {position.status}</span>
          <span className="font-mono text-white">
            {t('position.yielded')} +{position.ledgeredYield}
          </span>
        </div>

        {/* 자동 갱신 */}
        {position.autoRenew && (
          <div className="text-xs text-[#8c90a0]">
            {t('position.autoRenew')} {position.autoRenewDate}
          </div>
        )}
      </button>

      {/* 펼친 상세 */}
      {expanded && (
        <div className="bg-[#1E3559]/40 border-t border-[#1E3559] p-3 mt-2 space-y-3">
          <div className="text-xs space-y-2">
            <div>{t('position.startDate')}: {position.startDate}</div>
            <div>{t('position.maturityDate')}: {position.maturityDate}</div>
            {/* 현재 상품 조건과 다를 때만 */}
            {position.rateChanged && (
              <div className="text-[#8c90a0]">
                {t('position.rateChanged')}
              </div>
            )}
          </div>
          
          {/* 비밴드 사실 표기 (상세에서만) */}
          {!position.hasBand && (
            <div className="text-xs text-[#8c90a0] italic">
              {t('band.noBandNote')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### S-YIELD (수익 내역 시트)

**탭 + 행 렌더**:

```tsx
function YieldSheet() {
  const [tab, setTab] = useState<'daily' | 'claims'>('daily');

  return (
    <div className="space-y-4">
      {/* 탭 */}
      <div className="flex gap-2 border-b border-[#1E3559]">
        <button
          onClick={() => setTab('daily')}
          className={`py-2 px-3 text-sm font-600 border-b-2 transition-colors ${
            tab === 'daily'
              ? 'text-white border-[#2E7DFF]'
              : 'text-[#8c90a0] border-transparent'
          }`}
        >
          {t('yield.dailyTitle')}
        </button>
        <button
          onClick={() => setTab('claims')}
          className={`py-2 px-3 text-sm font-600 border-b-2 transition-colors ${
            tab === 'claims'
              ? 'text-white border-[#2E7DFF]'
              : 'text-[#8c90a0] border-transparent'
          }`}
        >
          {t('yield.claimsTitle')}
        </button>
      </div>

      {/* 일별 내역 */}
      {tab === 'daily' && (
        <div className="space-y-1">
          {yieldRecords.map((record) => (
            <div 
              key={record.id}
              className="border-b border-[#1E3559]/50 py-3 last:border-b-0 grid grid-cols-[1fr_1fr_1fr] gap-3 text-sm"
            >
              <div className="text-[#8c90a0]">{record.date}</div>
              <div className="text-white font-500">{record.positionId}</div>
              <div className="text-white font-mono text-right">
                {record.amount}
                {/* PS-C 분해 (2줄) */}
                {isTierC && (
                  <div className="text-xs text-[#8c90a0]">
                    <div>{t('yield.base')} +{record.baseAmount}</div>
                    <div>{t('yield.bonus')} +{record.bonusAmount}</div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 클레임 이력 */}
      {tab === 'claims' && (
        <div className="space-y-1">
          {claimRecords.map((claim) => (
            <div 
              key={claim.id}
              className="border-b border-[#1E3559]/50 py-3 last:border-b-0"
            >
              <div className="flex justify-between text-sm">
                <span className="text-white">{claim.date}</span>
                <span className="text-white font-mono">{claim.amount}</span>
              </div>
              <div className="text-xs text-[#8c90a0]">
                {claim.status === 'success' && t('claim.success')}
                {claim.status === 'pending' && t('claim.pending')}
                {claim.status === 'failed' && t('claim.failed')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## 6. 다크/라이트 모드 처리

### 패턴

모든 배경/텍스트 색상은 이미 `globals.css`의 `.light` override에 의해 자동 처리됨.

신규 클래스를 추가할 때:

```css
/* globals.css에 추가 */

.my-new-style {
  background-color: #112643;
  color: #afc6ff;
}

.light .my-new-style {
  background-color: #ffffff;
  color: #39435a;
}
```

TailwindCSS arbitrary values 사용 시에도 동일:

```tsx
// 다크 모드
className="bg-[#112643] text-[#afc6ff]"

// → globals.css의 .light 오버라이드가 자동 적용됨
```

---

## 7. 모바일 반응형 체크리스트

- [ ] B1 캔버스: `h-[220px] sm:h-[300px] lg:h-[380px]`
- [ ] B2 수치 그리드: `grid-cols-1 sm:grid-cols-3`
- [ ] B3/B4 버튼: `grid-cols-3` (항상 고정)
- [ ] 패딩: `px-4 sm:px-6` 등으로 반응형 조정
- [ ] 시트: 모바일에서는 바텀시트, `lg:` 이상에서는 중앙 모달

---

## 8. i18n 카피 키 매핑

FRD §8 참조. 주요 키들:

### Yield Panel
- `staking:yield.recordedLabel` / `yield.claimableLabel`
- `staking:yield.recordedHelp` / `yield.claimableHelp`
- `staking:yield.claimedLabel` / `yield.lockedLabel`
- `staking:claim.unavailable` / `claim.zero` / `claim.actionWithAmount`
- `staking:disclosure.noLoss` (PS-C)

### Notices
- `staking:notice.maintenance`
- `staking:notice.workerPaused`
- `staking:claim.maturityNudge`
- `staking:autoRenew.success` / `autoRenew.error.*`

### Sheets
- `staking:sheet.stakeTitle` / `sheet.amountTitle` / `sheet.confirmTitle`
- `staking:sheet.step`
- `staking:product.dailyRate` / `band.base` / `band.max` / `band.current`
- `staking:stakeSheet.contractTerms` / `contractTermsBand` / `notEstimate`
- `staking:disclosure.contract` / `disclosure.rate` / `disclosure.prospective` (밴드)

---

## 9. 상태 규칙 체크리스트

### 밴드폭 0 포지션 (EG-1)
- [ ] 비밴드 포지션과 동일 렌더
- [ ] 밴드 미터 렌더 금지
- [ ] "최대 +0.000%" 금지
- [ ] 상세에서만 `band.noBandNote` 표기

### 게임 숨김 사용자 (UF-6)
- [ ] B1: 안내 + [표시] 버튼
- [ ] B4 미렌더
- [ ] B2/B3/시트: 완전 동일

### PS-A → PS-B/C 전환
- [ ] 라벨 변경: "기록된" → "수령 가능"
- [ ] 슬롯 상태: UNAVAILABLE → DISABLED/ENABLED
- [ ] HUD 채굴력: `cosmeticOnly` → `noBandPosition` (밴드 보유 0) 또는 실제 가산율

---

## 10. 삭제 항목 (Staking.tsx)

**다음 코드를 제거하세요:**

1. "Rewards Earned" 섹션 (`:385-402`)
2. Earn 상품 목록 (`:405-497`)
3. 인라인 예치 폼 (`:443-485`)
4. My Stakes 목록 (`:500-591`)
5. `accruedInterest` 실시간 계산 (`:14`, `:546`, `:574-575`)
6. 클라이언트 `lockedByCoin` 재계산 (`:139-145`)
7. `#staking-earn-section` 스크롤 타깃 (`:405`)

**유지하세요:**

- DeepCoreEmbed
- 자동 갱신 토글/테이블
- 갱신 결과 통지 로직

---

## 참고

- **FRD**: `docs/specs/staking-page-v2-screen-flow-frd.md`
- **디자인 토큰**: `docs/patterns/staking-v2-design-tokens.md`
- **Tailwind v4**: `web/src/app/globals.css`
- **예제 시트**: `web/src/components/staking/sheets/*`
