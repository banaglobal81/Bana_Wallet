# BSC 자체 입금 감지 패턴 + 밴드형 스테이킹 상품 법무 쟁점 (A-9, 비구속 예비 조사)

> 요청 출처: `docs/specs/staking-yield-system-v2-prd-rev03-rebuild-and-exclusivity.md` §7.2 A-9
> 지위: **비구속.** 기술 조사는 설계 참고자료, 법무 조사는 **인간 법률 자문에게 넘길 쟁점 정리**이며
> 최종 법률 판단이 아니다. 최종 확정 숫자(확정 깊이, 최소 입금액 등)는 이 문서 + 자체 가스 실측
> 이후 별도 결정 사항이다(rev03 §11-16).

---

## ⓐ BSC 입금 감지 패턴 (기술 조사)

## Summary

사용자별 입금 주소(HD 파생)는 "감지"는 워치온리(xpub)로 개인키 없이 가능하지만, 모인 자금을 회사
지갑으로 **스윕하려면 서명키가 필요**해 실질적으로 핫월렛이 된다는 rev03의 가설은 업계 자료와
일치한다. 반대로 입금 컨트랙트(포워더/딥포짓 컨트랙트) 패턴은 토큰이 사용자 서명 없이도 회사
지갑으로 직행하도록 설계할 수 있어 스윕용 개인키가 구조적으로 불필요하다 — 단 BEP-20 토큰(BANA
포함)은 컨트랙트가 `transferFrom`으로 "당겨와야" 하므로 사용자가 `approve` + `deposit` 2개
트랜잭션을 실행해야 하는 UX 비용이 따른다(네이티브 코인 포워딩과 다름). BSC는 2026년 초 Fermi/
Osaka 하드포크로 블록타임이 0.45초까지 줄고 "Fast Finality"가 활성화되어 이론적 확정은 1~2초대에
가능하지만, Binance를 포함한 실무 거래소들은 여전히 **15 컨펌(약 45초, 구세대 3초 블록타임 기준
수치가 관성적으로 유지되는 정황)** 을 BEP-20 입금 크레딧 기준으로 쓰고 있다는 근거가 발견됐다 —
다만 이 숫자가 최신 블록타임 축소 이후 실제로 재조정됐는지는 확인하지 못했다(Open Question).
웹훅형 인덱서(Alchemy/QuickNode/Moralis)는 자체 RPC 폴링보다 재구성(reorg) 재전송·재시도 정책이
구현돼 있어 신뢰성이 높다는 벤더 비교 자료가 있으나, 벤더 자체 발행 자료라 편향 가능성이 있다.
`(chainId, txHash, logIndex)` 3튜플 멱등키는 업계 문헌에서 직접 이 조합으로 명명되진 않지만,
그 구성요소(트랜잭션 해시 + 로그 인덱스로 이벤트 고유성 보장) 원리는 결제/블록체인 API 표준
관행(Stripe·Coinbase의 idempotency key 패턴)과 정확히 같은 논리를 공유한다.

## Findings

### 1. 사용자별 주소 vs 입금 컨트랙트 vs 폴링

- **claim:** 다수 사용자별 입금 주소 모델은 각 입금 귀속이 명확하지만, 모인 자금을 하나의 회사
  지갑(콜드/핫)으로 정리(sweep)하려면 각 주소의 개인키로 서명한 아웃바운드 트랜잭션이 필요하다.
  이는 "감지"와 "자금 이동"을 분리하지 못하면 사실상 대량의 핫월렛을 운영하는 것과 같다.
  confidence: high — source: [Sweeping User Balances to Admin Wallets in Centralized Exchanges (CREATE2 + Minimal Proxy)](https://medium.com/@kspoyraz7/part-2-sweeping-user-balances-to-admin-wallets-in-centralized-exchanges-the-power-of-web3-84-2e806fe86b8c), [ERC-2876: Deposit contract and address standard](https://eips.ethereum.org/EIPS/eip-2876)
- **claim:** 워치온리(xpub 기반) 감지 자체는 개인키 없이 가능하다 — 이는 "잔고 확인"까지는
  non-custodial 관측이 성립함을 뜻한다. 그러나 rev03이 지적한 대로 **자금을 실제로 옮기는 순간부터는
  서명이 필요**하므로, "개인키 불필요"라는 표현은 감지 단계에 한정된다.
  confidence: medium — 직접적 1차 소스(거래소 공식 아키텍처 문서)는 찾지 못했고, 업계 통념 수준의
  2차 자료(블로그·미디엄)에 근거함 — source: 위와 동일
- **claim:** 입금 컨트랙트(포워더/딥포짓 컨트랙트) 패턴은 사용자가 컨트랙트의 `deposit()`을
  호출하면 자금이 컨트랙트 로직에 의해 곧바로(또는 이벤트 기반 자동 포워딩으로) 회사 지갑으로
  전달되도록 설계할 수 있어, 회사 측이 스윕을 위한 별도 서명 키를 보유할 필요가 구조적으로 없다.
  CREATE2/미니멀 프록시 패턴을 쓰면 사용자별 주소를 결정론적으로 미리 계산하면서도 스윕 비용을
  줄일 수 있다는 절충안도 존재한다(다만 이 절충안은 "컨트랙트 배포 후 스윕"이 필요해 순수 D-B2와는
  다른 하이브리드다).
  confidence: medium — source: [ERC-2876](https://eips.ethereum.org/EIPS/eip-2876), [CREATE2 sweep 비용 절감 사례](https://medium.com/@kspoyraz7/part-2-sweeping-user-balances-to-admin-wallets-in-centralized-exchanges-the-power-of-web3-84-2e806fe86b8c)
- **claim:** ERC-2876(딥포짓 컨트랙트/주소 표준)은 네이티브 코인(ETH류) 포워딩 기준으로
  설계되어, 2개의 일반 전송(약 42,000 gas)보다 단순 포워딩 컨트랙트(약 30,000 gas)가 저렴하다고
  명시한다. 그러나 **ERC-20/BEP-20 토큰은 컨트랙트가 사용자 잔고에서 직접 끌어올 수 없고
  `transferFrom`을 쓰려면 사전에 `approve` 트랜잭션이 필요**하다 — 즉 BANA(BEP-20)에 D-B2를 적용하면
  rev03이 이미 지적한 "approve + deposit 2트랜잭션 UX"가 표준 자체의 구조적 한계로 재확인된다.
  confidence: high (표준 문서 자체가 1차 소스) — source: [ERC-2876](https://eips.ethereum.org/EIPS/eip-2876), [Fellowship of Ethereum Magicians 토론](https://ethereum-magicians.org/t/eip-2876-deposit-contract-and-address-standard/4504)
- **claim:** "사용자별 주소는 실질 핫월렛, 입금 컨트랙트는 회사 지갑 직행이라 키 불필요"라는
  rev03의 가설은 **위 근거들과 방향이 일치**한다. 다만 "핫월렛"이라는 표현은 정도의 문제다 — 스윕
  주기를 짧게 하고 미스윕 잔액 상한을 낮게 유지하면 노출 익스포저를 줄일 수 있으나, 근본적으로
  서명키가 시스템 어딘가에 존재해야 한다는 점 자체는 사라지지 않는다.
  confidence: medium — 종합 판단, 단일 출처 없음

### 2. BSC 확정 깊이 / reorg 실무

- **claim:** BSC는 2023년 "Fast Finality"(BEP-126, Plato/Luban 계열) 도입 이후 검증자 2/3 이상의
  투표가 정상적으로 모이면 **약 2~2.5블록**(당시 3초 블록타임 기준 약 7.5초)만에 "명시적(explicit)
  확정"에 도달한다고 공식 발표됐다. 투표가 부족하면 **확률적(probabilistic) 확정**으로 폴백하며,
  화이트페이퍼는 더 강한 경제적 확정을 위해 2/3*N+1개 이상의 서로 다른 검증자 확인을 권고한다
  (N=21 기준 예시로 약 75초).
  confidence: high — source: [What Is Finality in Blockchain? — BNB Chain Blog](https://www.bnbchain.org/en/blog/what-is-finality-in-blockchain), [The Coming Fast Finality On BSC — BNB Chain Blog](https://www.bnbchain.org/en/blog/the-coming-fastfinality-on-bsc)
- **claim:** BSC 블록타임은 이후 여러 차례 단축됐다 — Maxwell 하드포크(2025-06-30 메인넷)로
  1.5초→0.75초, Fermi 하드포크(2026-01-14 메인넷)로 0.75초→0.45초. 2026-04-28에는 Osaka/Mendel
  하드포크로 실시간 투표 집계(BEP-648)가 도입돼 "대부분의 경우 2블록 내 확정", 일부 자료는
  "0.65초 확정"을 보고한다.
  confidence: high (여러 독립 기사 상호 확인) — source: [BNB Chain Maxwell Hardfork — BNB Chain Blog](https://www.bnbchain.org/en/blog/bnb-chain-announces-maxwell-hardfork-bsc-moves-to-0-75-second-block-times), [Fermi Hard Fork — BNB Chain Blog](https://www.bnbchain.org/en/blog/fermi-hard-fork-accelerates-bsc-to-0-45-second-block-times), [BNB Smart Chain Activates Osaka/Mendel Hard Fork](https://www.banklesstimes.com/articles/2026/04/28/bnb-smart-chain-activates-osaka-mendel-hard-fork-to-boost-finality/), [BNB Smart Chain Achieves 0.65-Second Transaction Finality](https://www.cointrust.com/market-news/bnb-smart-chain-achieves-0-65-second-transaction-finality)
- **claim:** 그럼에도 불구하고 **거래소 실무는 여전히 "15 컨펌"을 BEP-20 입금 크레딧 기준으로
  쓰는 사례가 관측된다**(예: Binance). 이는 3초 블록타임 시절(=약 45초) 정착된 관성적 숫자로 보이며,
  블록타임이 0.45초로 줄어든 지금도 "15 컨펌"을 그대로 적용한다면 실질 대기 시간은 약 6.75초로
  단축되는 셈이지만, **이 숫자가 실제로 재조정됐는지는 확인하지 못했다.**
  confidence: low(현재 시점 정확한 재조정 여부) / medium(과거·현재까지의 "15" 관행 자체) —
  source: [Binance Reduces the Number of Confirmations Required for Deposits & Withdrawals on BTC and ETH Networks](https://www.binance.com/en/support/announcement/binance-reduces-the-number-of-confirmations-required-for-deposits-withdrawals-on-btc-and-eth-networks-360030775291), [USDT Confirmation Time by Network 2026 — Eco](https://eco.com/support/en/articles/15247703-usdt-confirmation-time-by-network-2026)
- **claim:** BSC 자체에서 발생한 **문서화된 대형 reorg 사고 사례는 이번 조사에서 찾지 못했다.**
  일반적인 reorg 사례(이더리움 비콘체인 2022-05 7블록 reorg, 모네로 18블록 reorg 등)는 존재하나
  BSC 고유 사고 기록은 확인되지 않았다. BNB Chain 공식 자료는 Fast Finality 도입 이후 "확정된
  블록은 되돌릴 수 없다"고 주장하나, 이는 검증자 카르텔/네트워크 파티션 등 극단 상황을 전제로 한
  이론적 주장이며 실증 사례로 뒷받침되지는 않았다.
  confidence: low — source: [Blockchain attacks and reorgs — CoinGeek](https://coingeek.com/blockchain-attacks-and-reorgs-experiences-from-the-past/), [What is Chain Reorganization? — Cube Exchange](https://www.cube.exchange/what-is/chain-reorganization)

### 3. 입금 이벤트 감지 방법 비교 (웹훅 vs 자체 RPC 폴링 vs 인덱서)

- **claim:** 소규모/중간 규모 팀은 관리형 웹훅 서비스(Alchemy, QuickNode 등)를 쓰고, 대형
  기관은 자체 노드 + 커스텀 코드를 운영하는 경향이 있다는 것이 업계 일반론이다.
  confidence: medium — source: [Comparing the Industry's Leading Web3 API Providers — Moralis](https://moralis.com/comparing-the-industrys-leading-web3-api-providers-moralis-vs-alchemy-vs-quicknode/)
- **claim:** 웹훅 서비스별로 reorg 처리·재시도 정책이 다르다 — QuickNode Streams는 "exactly-once"
  전달 + reorg 시 영향받은 블록 재전송을 표방하고, Alchemy Notify도 성숙한 reorg 파이프라인을
  갖췄다고 주장한다. Helius(비교 대상, Solana 특화)는 3회 재시도 실패 시 이벤트가 영구 소실된다고
  명시한다. Moralis는 7회 재시도(1분~24시간 지수 백오프)를 쓰지만 스트림 성공률이 70% 밑으로
  떨어지면 자동 종료된다.
  confidence: medium (벤더 자체 발행 자료이므로 마케팅 편향 가능성 있음, 독립 벤치마크 아님) —
  source: [Crypto Webhook and Notification Providers Compared — Spark](https://www.spark.money/tools/crypto-webhook-notification-comparison), [Alchemy vs. Moralis](https://www.alchemy.com/overviews/alchemy-vs-moralis), [Alchemy vs. Quicknode](https://www.alchemy.com/overviews/alchemy-vs-quicknode)
- **claim:** 데이터 정확성/가동률 벤치마크로 Alchemy가 "0 inconsistent blocks", "99.995% 업타임"을
  자체 주장하는 반면 동일 벤치마크에서 Moralis가 "819 inconsistent blocks"로 최저 점수를 받았다는
  비교 결과가 있다. 이 벤치마크의 방법론·독립성은 확인하지 못했다(Alchemy 비교 페이지에 게재된
  자료라 이해관계가 있는 발행처다).
  confidence: low — source: [Alchemy vs. Moralis](https://www.alchemy.com/overviews/alchemy-vs-moralis)
- **claim:** 신뢰성·비용·구현 난이도의 일반적 트레이드오프는 이렇게 정리된다 — **자체 RPC 폴링**은
  구현이 상대적으로 단순하고 외부 의존이 적지만, reorg 처리·재연결·백필 로직을 전부 직접 구현해야
  하고 노드 인프라 운영 비용·지연이 있다. **웹훅형 서비스**는 reorg 처리와 재시도가 내장돼
  구현 난이도가 낮지만 벤더 종속과 구독 비용이 발생하고, 웹훅 자체의 유실 가능성(위 재시도 정책
  차이)에 대한 백업 폴링이 여전히 권장된다. **인덱서(자체 또는 서브그래프류)** 는 중간 지점으로,
  이벤트 히스토리 재구성·백필에 강하지만 초기 구축·유지보수 비용이 크다.
  confidence: medium — 종합 판단(위 개별 소스들의 조합), 단일 출처 없음

### 4. 멱등키 `(chainId, txHash, logIndex)` 패턴

- **claim:** 결제/블록체인 API 업계에서 "idempotency key"는 표준 개념이며(Stripe, Coinbase CDP,
  Square 등이 자체 API에 명시적 idempotency key 헤더/필드를 제공), 반복 요청이 동일 결과를
  내도록 보장하는 것이 목적이다. 크립토 입금 맥락에서는 "트랜잭션을 두 번 이상 전송/크레딧하지
  않는 것"이 핵심 사용 사례로 언급된다.
  confidence: high — source: [Idempotent requests — Stripe API Reference](https://docs.stripe.com/api/idempotent_requests), [Idempotency — Coinbase Developer Documentation](https://docs.cdp.coinbase.com/api-reference/v2/idempotency), [Prevent duplicate blockchain transactions with Engine — thirdweb](https://blog.thirdweb.com/changelog/idempotency-keys-for/)
- **claim:** `(chainId, txHash, logIndex)`라는 정확히 이 3튜플을 멱등키로 명명한 1차 문서(공식
  거래소/인프라 문서)는 이번 조사에서 찾지 못했다. 다만 구성 원리는 원자적이다 — `txHash`만으로는
  같은 트랜잭션 안에 같은 자산에 대한 복수 `Transfer` 이벤트(예: 배치 전송, 프록시 경유)가 있을 때
  구분이 불가능하므로 `logIndex`를 더해 로그(이벤트) 단위로 유일성을 보장하고, `chainId`는
  멀티체인 확장 시 동일 해시가 다른 체인에 우연히 존재하는 상황(사실상 발생 확률은 극히 낮지만
  방어적 설계로는 표준적)을 방지한다. 이는 업계 문헌이 설명하는 "고유 식별자 저장 후 처리 전
  존재 여부 확인" 패턴과 원리적으로 동일하다.
  confidence: medium (원리 자체는 well-established, 정확한 3튜플 네이밍의 1차 소스는 미확인) —
  source: [What Is an Idempotency Key? — Token Metrics](https://www.tokenmetrics.com/blog/idempotency-keys-order-placement), [Idempotency Keys, How to Prevent Duplicate Request and API Chaos](https://medium.com/@wahyubagus1910/idempotency-keys-how-to-prevent-duplicate-request-and-api-chaos-3ad6b1cdfe30)
- **claim:** 흔한 실수 사례로 문헌이 지적하는 것: ① 키 생성 규칙이 허술하거나 재사용되는 경우
  보호가 실패한다, ② "같은 요청"의 정의가 불분명해 페이로드가 살짝 다른데 같은 키를 재사용하는
  경우 처리 방식이 애매해진다, ③ 키 보관 기간(TTL)이 너무 짧으면 재시도 윈도우 밖에서 중복이
  발생한다. rev03 DP-1이 명시한 "사용자 제출·워커 감지·관리자 수동 입력 세 경로가 같은 키를
  공유해야 한다"는 요구는 이 문헌들이 지적하는 "여러 진입점이 있으면 반드시 통합된 유일성 제약이
  필요하다"는 원칙과 정확히 부합한다.
  confidence: medium — source: [Understanding the Idempotency Key in Bitcoin and Fintech — Lightspark](https://www.lightspark.com/glossary/idempotency-key), [What Is Idempotency in Crypto?](https://cryptoprocessing.com/glossary/what-is-idempotency-crypto)

## Contradictions (ⓐ)

- **BSC 이론적 확정 속도 vs 거래소 실무 확정 속도.** BNB Chain 공식 자료는 "Fast Finality"로
  1~2초, 최신 하드포크 이후 0.65초대 확정을 주장하지만, 동시대 실무 참고 자료(Eco)는 Binance가
  여전히 15 컨펌(≈수십 초급)을 요구한다고 기술한다. 두 진술 모두 출처가 존재하며 모순이라기보다는
  **"이론적 프로토콜 확정"과 "거래소의 보수적 운영 정책" 사이의 간극**으로 보이나, 후자 숫자가
  최신 블록타임 기준으로 갱신됐는지 확인할 1차 소스(Binance 공식 최신 공지)는 찾지 못했다.
- **웹훅 서비스 신뢰성 벤치마크의 출처 편향.** Alchemy가 자사 비교 페이지에서 Alchemy를 최우수로
  평가한 벤치마크를 인용하고 있어 독립적 검증이 필요하다. QuickNode·Moralis 자료도 마찬가지로
  각 벤더 발행 콘텐츠일 가능성이 높다.

## Open Questions (ⓐ)

1. 2026-08 현재 Binance 등 주요 거래소가 BEP-20 입금 컨펌 요구치를 블록타임 단축(0.45초)에 맞춰
   실제로 하향 조정했는지 — 확인하려면 Binance/기타 거래소의 **최신 공식 지원 문서**를 직접 조회.
2. `(chainId, txHash, logIndex)` 정확히 이 3튜플 명명을 쓰는 1차 업계 문서(거래소 엔지니어링
   블로그 등)가 존재하는지 — 발견되면 rev03 DP-1의 업계 정합성 근거가 더 강해진다.
3. BSC 자체의 실제 reorg 사고 이력(있다면 깊이·원인·영향받은 서비스) — BscScan 또는 BNB Chain
   깃허브 이슈 트래커를 직접 조회해야 확인 가능. 이번 조사에서는 찾지 못했다.
4. Alchemy/QuickNode/Moralis의 독립적(비벤더) 신뢰성 벤치마크 존재 여부.
5. EIP-2876 표준이 실제로 프로덕션에서 채택된 사례(거래소·지갑)가 있는지 — 표준 자체는 2020년
   제안됐고 이번 조사에서는 "채택 여부"를 확인할 자료를 찾지 못했다(Draft/Stagnant 상태 가능성).

---

## ⓑ H-3 법무 쟁점 정리 (비구속, 쟁점만 — 법률 자문 아님)

> **명시:** 이 섹션은 인간 법률 자문에게 넘길 **쟁점 목록**이며, 어떤 법역에도 특정하지 않고
> 자주 제기되는 일반적 패턴만 정리한다. **최종 법률 판단이 아니다.** 고위험·법적 구속력이 있는
> 결정이 필요하면 `/deep-research` 워크플로 실행을 권고하며, 궁극적으로는 인간 법률 자문의
> 검토가 필요하다.

## Summary

"게임 진행도가 계약 수익률의 일부를 결정하는" 상품(V2-BAND의 밴드형 가산율)은 두 개의 서로 다른
규제 렌즈에 동시에 걸릴 수 있는 쟁점이 자주 제기된다 — ① 투자계약/증권성 판단(수익 기대가 발행자의
"관리 노력"에서 나오는지 여부를 따지는 Howey류 프레임워크), ② 게이미피케이션/다크패턴 소비자보호
규제(사용자의 행동을 유도해 위험 감수를 부추기는 UX 설계에 대한 규제 관심 증가). 밴드 상단(최대
가산율) 표기는 소비자금융 광고 규제에서 반복적으로 등장하는 패턴 — "대표 이율(representative
rate)"·"51% 원칙" 같은 장치나 "up to X%" 표현에 대한 규제 당국의 misleading-advertising 이슈 —
와 구조적으로 유사한 문제를 안고 있다. 크립토 수익률 마케팅 자체에 대한 최근 실제 집행 사례
(뉴욕주 검찰총장 대 Uphold, 2026-05)도 존재해, "밴드 상단을 헤드라인으로 내세우는 마케팅"이
추상적 우려가 아니라 실제 집행 대상이 될 수 있음을 시사한다.

## Findings

### 1. 규제 프레임 쟁점 (증권성 / 게이미피케이션 / 소비자보호)

- **claim:** "제3자(발행자)의 관리·기술적 노력에서 나오는 수익 기대"가 있는 스테이킹형 상품은
  일부 법역에서 투자계약/증권으로 판단된 실제 집행 사례가 있다 — 대표적으로 미국 SEC 대 Kraken
  (2023년 3천만 달러 화해), SEC 대 Coinbase(스테이킹 프로그램 관련 소송에서 법원이 "토큰이
  이전·풀링되어 발행자의 관리·기술 능력에 대한 수익 기대와 함께 스테이킹된다"는 논리로 증권성을
  인정)가 있다. 반대로 Coinbase 측은 "보상은 프로토콜이 정하고 서비스 제공자는 검증 작업만
  수행할 뿐 관리 노력이 아니다"라는 반론을 공식적으로 제기하고 있어, **동일한 스테이킹 구조에
  대해서도 결론이 갈릴 수 있음**을 보여준다.
  confidence: high (구체적 판례·집행 사례 존재) — source: [Kraken Crypto Staking Program... Manatt](https://www.manatt.com/insights/newsletters/client-alert/kraken-crypto-staking-program-for-us-investors-sh), [Federal Courts Weigh in on Crypto-Asset Securities Under Howey Test in Coinbase and Kraken Cases](https://uk.practicallaw.thomsonreuters.com/w-044-7787), [Coinbase's staking services are not securities. And here's why. (Coinbase 공식 반론)](https://www.coinbase.com/blog/coinbases-staking-services-are-not-securities-and-heres-why)
- **claim:** **밴드형 상품(V2-BAND)은 위 스테이킹 판례군보다 증권성 논거가 한 단계 더 강해질 수
  있는 쟁점**이다 — "게임 진행도"라는, 발행자가 설계·운영하는 별도 메커니즘이 수익률의 일부를
  직접 결정하기 때문에, "수익이 순수하게 프로토콜/시장에서 나온다"는 반론(Coinbase류 논거)을
  쓰기가 더 어려워진다. **이는 이번 조사에서 확인된 사실이 아니라 위 판례 논리를 유추한 쟁점
  제기이며, 실제 법적 결론은 법역·상품 구조의 구체적 사실관계에 좌우된다.**
  confidence: low(유추 판단, 밴드형 상품에 대한 직접 판례는 발견하지 못함) — source: 위와 동일 소스의 논리 연장
- **claim:** 게이미피케이션 자체에 대한 소비자보호 규제 관심이 별도 트랙으로 존재한다. 미국
  FTC는 "다크패턴"(사용자를 속이거나 가두는 UX 설계) 집행 정책성명(2021)을 발표했고, 게이미피케이션이
  다크패턴/플랫폼 중독과 결부되어 언급된다. 증권 규제 학계 문헌은 게이미피케이션이 "투자자
  보호 기능을 약화시키면서 브로커-딜러의 이익을 위해 과도한 거래를 유도하는" 관행으로 문제
  삼아질 수 있다고 지적하며, 실제로 미국 매사추세츠 증권국이 2024년 1월 Robinhood를 게이미피케이션
  기법을 이유로 증권법 위반 혐의로 제소한 사례가 있다.
  confidence: medium (핀테크/증권 브로커리지 맥락 사례이며 크립토 스테이킹에 직접 적용된 사례는
  아님 — 유추 적용) — source: [FTC Dark Patterns Crackdown](https://performline.com/blog-post/ftc-dark-patterns-enforcement-policy/), [Gamification and securities regulation — James Fallows Tierney](https://am.aals.org/wp-content/uploads/sites/4/2022/02/Tierney-Securities-Regulation.pdf), [The Gamification of Investments: US/EU Comparative — Berkeley Tech Law Journal](https://btlj.org/2025/11/the-gamification-of-investments-a-comparative-approach-between-the-us-and-eu/)
- **claim:** 미국·EU는 게이미피케이션 규제 철학이 다르다는 학술 비교가 있다 — 미국은 시장 자유를
  강조하고 사후 구제(집행)에 의존하는 반면, EU는 사전 조화(harmonization)와 소비자보호를 더
  중시하는 경향이 있다는 비교 분석. **이는 법역별 접근 차이가 실재함을 보여주는 근거이지,
  BANA가 어느 법역에 속하는지에 대한 판단은 아니다**(요청에 따라 법역 특정 안 함).
  confidence: medium (학술 비교 논문, 2025-11 발행) — source: [The Gamification of Investments: A Comparative Approach Between the US and EU — Berkeley Technology Law Journal](https://btlj.org/2025/11/the-gamification-of-investments-a-comparative-approach-between-the-us-and-eu/)

### 2. 밴드 상단(최대 가산율) 표기의 광고/마케팅 규제 쟁점

- **claim:** 소비자금융 광고 규제에서 "최고 이율"만 헤드라인으로 강조하고 그 이율이 실제로 대다수
  이용자에게 적용되지 않는 경우를 오인 유도로 다루는 것은 **반복적으로 등장하는 규제 패턴**이다.
  대표 사례가 영국 소비자신용 광고 규제의 "대표 이율(Representative APR)" 제도 — 광고주가
  합리적으로 예상하기에 **광고로 성사되는 계약의 최소 51%가 그 이율 이하로 제공될 것**이라는
  기준을 충족해야 그 이율을 대표값으로 광고에 쓸 수 있다. 이는 "최대치만 크게 보여주고 실제
  분포는 감추는" 마케팅에 대한 정면 대응 장치다.
  confidence: high (구체적 법제 존재, 소비자신용 맥락) — source: [Representative APR — Wikipedia](https://en.wikipedia.org/wiki/Representative_APR), [The Consumer Credit (Advertisements) Regulations 2010](https://www.legislation.gov.uk/uksi/2010/1012/regulation/1/made/data.xht?wrap=true)
- **claim:** 미국 저축상품(예금성) 광고 규제(Regulation DD / 12 CFR 1030.8)도 유사한 원리를 갖는다
  — 계층형(tiered-rate) 계좌의 APY를 광고할 때는 해당 APY가 적용되는 **하한 금액**을 함께 표기해야
  하고, 정기예금은 그 APY를 받기 위한 **필요 기간**을 표기해야 한다. 신용상품 광고 규제(Reg Z류)도
  "실제로 제공되지 않을 낮은 금리를 광고하는 것"을 금지한다. 두 규제 모두 **"조건부 최댓값/최솟값을
  조건 설명 없이 헤드라인으로 쓰는 것"을 직접 규율 대상으로 삼는다**는 공통 원리를 보여준다.
  confidence: high (연방 규정 1차 소스) — source: [§ 1030.8 Advertising — CFPB](https://www.consumerfinance.gov/rules-policy/regulations/1030/8/), [Comment for 1030.8 — Advertising — CFPB](https://www.consumerfinance.gov/rules-policy/regulations/1030/interp-8/)
- **claim:** 크립토 수익률 마케팅에 대한 실제 집행 사례가 존재한다 — 뉴욕주 검찰총장이 Uphold를
  상대로, 제3자(Cred)의 고위험 크립토 대출 상품(CredEarn)을 "안전한 저축형 상품"처럼 마케팅한
  것에 대해 500만 달러 화해를 이끌어낸 사례(2026-05 보도). 이는 "밴드 상단"과 직접 같은 사실관계는
  아니지만, **크립토 수익률 상품의 마케팅 문구가 실제 리스크·조건과 괴리되면 규제 집행의 실제
  대상이 된다**는 것을 보여주는 최근 사례다.
  confidence: medium (원문 기사 자체는 접근 실패(403)했으나, 검색 스니펫에서 날짜·당사자·금액이
  구체적으로 확인됨 — 원문 직접 대조는 못함) — source: [Crypto Company Settles With New York AG Over Allegedly Misleading Crypto Yield Promotions — Regulatory Oversight](https://www.regulatoryoversight.com/2026/05/crypto-company-settles-with-new-york-ag-over-allegedly-misleading-crypto-yield-promotions/)
- **claim:** 위 패턴들을 종합하면, "밴드 상단(최대 가산율)"을 두드러지게 표기하는 마케팅에 자주
  제기되는 쟁점은 다음 세 갈래로 요약할 수 있다 — (1) **대표성 문제**: 최대치가 실제로 대다수
  사용자에게 도달 가능한 값인지(rev03 A7·DC-3이 이미 "게임 진행도가 원금 비례가 아니라 약정일수
  기준"이라는 제약을 두고 있으므로, 이 쟁점은 "밴드 상단 도달 비율"을 실측·공개할 수 있는지의
  문제로 좁혀질 수 있다). (2) **조건 누락 문제**: 최대치를 얻기 위한 조건(게임 진행 요건)이
  헤드라인과 같은 시야에 명확히 표기되는지. (3) **보장성 오인 문제**: "최대 X%"라는 표현이
  "보장 수익률"처럼 읽히지 않도록 하는 표기 설계(다수 규제가 "guaranteed"류 단어 자체를 금지하는
  경향과 맞닿아 있다).
  confidence: medium (개별 근거들의 종합 판단, 밴드형 상품에 직접 적용된 선례는 아님) — source: 위 세 항목 종합

## Contradictions (ⓑ)

- 발견되지 않음. 다만 **Coinbase의 공식 반론**(증권성 부인)과 **SEC/법원의 판단**(Coinbase
  케이스에서 증권성 인정 방향으로 진행 중)은 같은 사실관계에 대한 정반대 입장이며, 이 대립 자체가
  "스테이킹형 수익 상품의 증권성"이 법적으로 확정되지 않고 진행 중인 쟁점임을 보여준다 — 어느
  쪽이 맞는지 이 조사에서 판정하지 않는다.

## Open Questions (ⓑ)

1. V2-BAND처럼 "게임 진행도가 수익률의 일부를 결정"하는 구조에 대한 **직접적인 판례·규제
   가이던스**가 존재하는지 — 이번 조사에서는 발견하지 못했다. 스테이킹 증권성 판례와 게이미피케이션
   소비자보호 판례를 유추 결합했을 뿐이다.
2. 뉴욕주 검찰총장 대 Uphold 건의 1차 소스(보도자료·화해 합의서 원문)는 접근이 차단(403)되어
   직접 대조하지 못했다 — 원문 확인이 필요하다.
3. 밴드 상단 표기에 대한 크립토 산업 특정 광고 규제(증권법이 아닌 순수 광고/마케팅법 차원)의
   구체적 판례는 확인하지 못했다 — 소비자신용/예금 광고 규제에서의 유추일 뿐이다.
4. **이 조사는 어떤 법역도 특정하지 않았다.** BANA의 실제 대상 시장·법인 소재지가 정해지면
   그 법역의 증권법·전자금융/가상자산업법·광고표시법을 인간 법률 자문이 별도로 검토해야 한다.

---

## 종합 권고 (비구속)

- ⓐ 기술 조사는 rev03의 D-B2(입금 컨트랙트) 우선 방향과 DP-1~DP-7 요구사항이 업계 일반 패턴과
  정합적임을 뒷받침한다. 단 **확정 깊이(DP-2)의 정확한 숫자는 이번 조사만으로 확정하지 말 것** —
  거래소 실무치(15 컨펌)와 프로토콜 이론치(2블록 내외) 사이에 상당한 간극이 있고, 그 간극이
  최신 블록타임 축소를 반영한 최신 정책 차이인지 관성적 보수치인지 확인되지 않았다. `researcher`가
  Open Question 1을 추가 조사하거나, 자체 가스/블록 실측으로 보완하는 것을 권고한다.
- ⓑ 법무 쟁점은 인간 법률 자문에게 그대로 넘길 수 있는 수준으로 정리됐다. **고위험 판단**(V2-BAND
  첫 상품 개설 여부, H-3 최종 판정)은 이 문서로 결정하지 말고, 필요시 `/deep-research`로 대상
  법역을 특정한 뒤 적대적 검증을 거친 심층 조사를 추가로 수행할 것을 권고한다.

## Sources

전체 URL 목록 (모두 2026-08-10 조회):

- https://eips.ethereum.org/EIPS/eip-2876
- https://ethereum-magicians.org/t/eip-2876-deposit-contract-and-address-standard/4504
- https://medium.com/@kspoyraz7/part-2-sweeping-user-balances-to-admin-wallets-in-centralized-exchanges-the-power-of-web3-84-2e806fe86b8c
- https://www.bnbchain.org/en/blog/what-is-finality-in-blockchain
- https://www.bnbchain.org/en/blog/the-coming-fastfinality-on-bsc
- https://www.bnbchain.org/en/blog/bnb-chain-announces-maxwell-hardfork-bsc-moves-to-0-75-second-block-times
- https://www.bnbchain.org/en/blog/fermi-hard-fork-accelerates-bsc-to-0-45-second-block-times
- https://www.banklesstimes.com/articles/2026/04/28/bnb-smart-chain-activates-osaka-mendel-hard-fork-to-boost-finality/
- https://www.cointrust.com/market-news/bnb-smart-chain-achieves-0-65-second-transaction-finality
- https://www.binance.com/en/support/announcement/binance-reduces-the-number-of-confirmations-required-for-deposits-withdrawals-on-btc-and-eth-networks-360030775291
- https://eco.com/support/en/articles/15247703-usdt-confirmation-time-by-network-2026
- https://coingeek.com/blockchain-attacks-and-reorgs-experiences-from-the-past/
- https://www.cube.exchange/what-is/chain-reorganization
- https://moralis.com/comparing-the-industrys-leading-web3-api-providers-moralis-vs-alchemy-vs-quicknode/
- https://www.spark.money/tools/crypto-webhook-notification-comparison
- https://www.alchemy.com/overviews/alchemy-vs-moralis
- https://www.alchemy.com/overviews/alchemy-vs-quicknode
- https://docs.stripe.com/api/idempotent_requests
- https://docs.cdp.coinbase.com/api-reference/v2/idempotency
- https://blog.thirdweb.com/changelog/idempotency-keys-for/
- https://www.tokenmetrics.com/blog/idempotency-keys-order-placement
- https://medium.com/@wahyubagus1910/idempotency-keys-how-to-prevent-duplicate-request-and-api-chaos-3ad6b1cdfe30
- https://www.lightspark.com/glossary/idempotency-key
- https://cryptoprocessing.com/glossary/what-is-idempotency-crypto
- https://www.manatt.com/insights/newsletters/client-alert/kraken-crypto-staking-program-for-us-investors-sh
- https://uk.practicallaw.thomsonreuters.com/w-044-7787
- https://www.coinbase.com/blog/coinbases-staking-services-are-not-securities-and-heres-why
- https://performline.com/blog-post/ftc-dark-patterns-enforcement-policy/
- https://am.aals.org/wp-content/uploads/sites/4/2022/02/Tierney-Securities-Regulation.pdf
- https://btlj.org/2025/11/the-gamification-of-investments-a-comparative-approach-between-the-us-and-eu/
- https://en.wikipedia.org/wiki/Representative_APR
- https://www.legislation.gov.uk/uksi/2010/1012/regulation/1/made/data.xht?wrap=true
- https://www.consumerfinance.gov/rules-policy/regulations/1030/8/
- https://www.consumerfinance.gov/rules-policy/regulations/1030/interp-8/
- https://www.regulatoryoversight.com/2026/05/crypto-company-settles-with-new-york-ag-over-allegedly-misleading-crypto-yield-promotions/ (원문 접근 403 — 검색 스니펫으로만 확인)
