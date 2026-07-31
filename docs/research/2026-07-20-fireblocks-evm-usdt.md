# Which EVM chains does Fireblocks support for USDT transfers/withdrawals, and what are their published fee or pricing tiers?

Retrieved 2026-07-20. All sources listed at the bottom with retrieval date.

## Summary

Fireblocks publishes its *chain* coverage but not its *token-per-chain* coverage: there is no public page enumerating which EVM networks USDT specifically can be transferred on. The authoritative USDT-per-chain answer lives behind the authenticated `List Supported Assets` API, which requires workspace credentials. Public evidence confirms Fireblocks supports 150+ blockchains including a broad EVM set (Ethereum, Arbitrum, Avalanche C-Chain, Base, BNB Smart Chain, Polygon, Optimism, Linea, Celo, Kava, Gnosis, Polygon zkEVM and others), and staff-confirmed USDT asset IDs exist for at least Avalanche (`USDT_AVAX`). Fireblocks *does* publish pricing, contrary to the common claim that it is sales-only: an Essentials tier at $999/month and custom tiers starting at $36,000/year. Separately, Fireblocks publishes no withdrawal fee or network-fee markup schedule — its fee documentation covers only estimation of underlying blockchain network fees.

## Findings

### Chain coverage

- **Fireblocks states support for "150+ blockchains"** and describes 46 new public blockchain integrations added during 2025. · confidence: high · [fireblocks.com/blockchain-integrations](https://www.fireblocks.com/blockchain-integrations), [fireblocks.com/blog/leader-in-public-blockchain-support-coverage](https://www.fireblocks.com/blog/leader-in-public-blockchain-support-coverage)

- **The public blockchain-integrations page does not enumerate individual EVM chains.** It exposes "EVM" as a single filter category alongside ADA, ALGO, CANTON, COSMOS, DOT, EOS, SOL, TRX and UTXO. Individual EVM networks are not named there. · confidence: high · [fireblocks.com/blockchain-integrations](https://www.fireblocks.com/blockchain-integrations)

- **The Embedded Wallet (NCW) docs enumerate an EVM chain list**: Arbitrum, Astar, Aurora, Avalanche C-Chain, Base, BNB Smart Chain, Canto, Celo, Chiliz, Ethereum, EthereumPoW, Evmos, Fantom, Gnosis Chain, HT Chain, Kava, Linea, Polygon, Moonbeam, Moonriver, Oasys, Optimism, RSK, Shimmer, SmartBCH, Songbird, TokenX, Velas, XDC, zkEVM. · confidence: medium — this documents the **Embedded Wallet product**, not necessarily the full custody platform, and the page itself warns "additional testnets and tokens we support might not appear in the list above" · [ncw-developers.fireblocks.com/docs/supported-networks](https://ncw-developers.fireblocks.com/docs/supported-networks)

- **A Fireblocks community thread lists ~38 EVM networks** including Arbitrum One, Aurora, Avalanche C-Chain, Base, BNB Smart Chain, Celo, Chiliz, Ethereum, EthereumPoW, Evmos, Fantom Opera, HT Chain, Kava, Moonbeam, Moonriver, Optimism, Polygon, Polygon zkEVM, Ronin, RSK, SmartBCH, Songbird, TokenEX, Velas, XinFin. Arbitrum Nova is explicitly confirmed **not** supported. · confidence: low for currency — the list includes Goerli, Rinkeby and Mumbai testnets, all long deprecated, dating this thread to roughly 2022–2023 · [community.fireblocks.com/t/exhastive-list-of-evm-chains/283](https://community.fireblocks.com/t/exhastive-list-of-evm-chains/283)

- **Fireblocks staff direct users to the API, not a static page, for the authoritative list.** The `List Supported Assets` / `List assets` endpoints return per-asset Fireblocks UUID, `legacyId`, symbol, contract address, standard, decimals and blockchain, and the same token appears once per chain (the docs illustrate this with `USDC` vs `USDC.e` on different chains). · confidence: high · [developers.fireblocks.com/reference/list-supported-assets](https://developers.fireblocks.com/reference/list-supported-assets)

### USDT specifically

- **No public Fireblocks page enumerates USDT's supported chains.** The token integrations page does not name USDT at all; the supported-assets data is reachable only through an authenticated workspace API call. · confidence: high · [fireblocks.com/integrations/tokens](https://www.fireblocks.com/integrations/tokens/), [developers.fireblocks.com/reference/list-supported-assets](https://developers.fireblocks.com/reference/list-supported-assets)

- **At least one USDT EVM asset ID is staff-confirmed**: `USDT_AVAX`, `"name": "Tether USD (Avalanche)"`, `"type": "ERC20"`, `contractAddress` `0xc7198437980c041c805A1EDcbA50c1Ce5db95118`. Staff also referenced the deprecated `USDT_POLYGON_TEST_MUMBAI_ZU3P` testnet ID, which implies a corresponding Polygon mainnet USDT asset. Staff instruct developers to reference the `id` field, not the native asset field, in API calls. · confidence: high for these two IDs, low as a basis for generalising to other chains · [community.fireblocks.com/t/transitioning-from-polygon-mumbai-to-avalanche-fuji-seeking-usdt-asset-id-for-integration/975](https://community.fireblocks.com/t/transitioning-from-polygon-mumbai-to-avalanche-fuji-seeking-usdt-asset-id-for-integration/975)

- **Sandbox carries testnet assets only**; mainnet USDT is available only in production workspaces. ERC-20 and TRC-20 assets are added per-workspace via console or API rather than being globally on by default. · confidence: high · [community.fireblocks.com/t/how-to-enable-usdt-trc-20-erc-20-in-fireblocks-sandbox/2309](https://community.fireblocks.com/t/how-to-enable-usdt-trc-20-erc-20-in-fireblocks-sandbox/2309)

- **Tether's own supported-protocols page lists six EVM chains where USDT is issued**: Ethereum, Avalanche, BNB Smart Chain, Kava, Celo, Kaia. The other eight listed networks (Tron, Liquid, Solana, Polkadot AssetHub, Tezos, Near, TON, Aptos) are non-EVM. This is an upper bound on natively-issued USDT, independent of what any custodian supports. · confidence: high for what the page says · [tether.to/en/supported-protocols](https://tether.to/en/supported-protocols/)

- **Tether wound down USDT on five legacy chains** — Omni, Bitcoin Cash SLP, Kusama, EOS, Algorand — effective 2025-09-01. None are EVM chains. · confidence: high · [tether.io/news/tether-to-wind-down-usdt-support-for-five-legacy-blockchains-as-part-of-strategic-infrastructure-review](https://tether.io/news/tether-to-wind-down-usdt-support-for-five-legacy-blockchains-as-part-of-strategic-infrastructure-review/)

### Published pricing

- **Fireblocks publishes a pricing page with concrete figures.** Essentials: **$999/month, up to 6 months**; $1,000,000 quarterly outbound volume; 1,000 embedded wallets; 2 workspaces; 5 users; **0.20% overage rate per transaction**; basic 8×5 support. · confidence: high · [fireblocks.com/pricing](https://www.fireblocks.com/pricing)

- **Custom tiers (Pro / Enterprise / Enterprise+) are quoted as "Starting at $36,000 per year"**, with custom outbound volume limits, API limits, workspace/user counts, embedded wallet limits, and Premium or Platinum 24/7 support. · confidence: high · [fireblocks.com/pricing](https://www.fireblocks.com/pricing)

- **Pricing is volume-banded, not per-chain.** Nothing on the pricing page differentiates cost by blockchain, by token, or by EVM vs non-EVM. The published lever is quarterly outbound volume plus the 0.20% overage. · confidence: high · [fireblocks.com/pricing](https://www.fireblocks.com/pricing)

- **Both plans include blockchains, exchanges, policy engine, full API/SDK, transaction simulation, WalletConnect, API co-signer and dApp protection.** Staking, Cold Wallet, Raw Signing, KeyLink, Off Exchange, Tokenization, DRS (CoinCover), Gas Station and Automation are **add-ons**, priced separately and not published. SSO is Custom-plan only. · confidence: high · [fireblocks.com/pricing](https://www.fireblocks.com/pricing)

- **Fireblocks publishes no withdrawal fee or network-fee markup schedule.** Its fee documentation covers only *estimation* of underlying blockchain fees — the `Estimate Network Fee` endpoint, LOW/MEDIUM/HIGH tiers, and EVM vs UTXO fee mechanics. It is silent on whether Fireblocks adds any charge on top of raw chain fees. · confidence: high that it is undocumented; the absence of a documented markup is **not** evidence there is none · [developers.fireblocks.com/docs/verify-fee-effeciency](https://developers.fireblocks.com/docs/verify-fee-effeciency)

## Contradictions

1. **Does Fireblocks publish pricing?** Aggregators including the search-result summaries and vendor-comparison sites state Fireblocks "does not publish publicly available per-transaction rates" and uses custom enterprise pricing requiring sales contact. The Fireblocks pricing page itself contradicts this, publishing $999/month Essentials with a stated 0.20% overage rate and a $36,000/year Custom floor. **Both sides are partly right**: the entry tier and the Custom floor are published; everything above Essentials, and all add-on module pricing, is genuinely quote-only. This report treats the primary page as authoritative for what it states and does not extend it to unpublished tiers.

2. **Which EVM chains carry USDT?** Tether's own page lists only six EVM chains (Ethereum, Avalanche, BNB Smart Chain, Kava, Celo, Kaia) — notably excluding Polygon, Arbitrum, Optimism and Base. Fireblocks community/staff material and general market usage reference USDT on Polygon and other L2s, and a Fireblocks staff answer cites a Polygon USDT testnet asset ID. The likely reconciliation is that Tether's page lists chains of *native issuance* while bridged/canonical USDT deployments exist on L2s and are still transferable — but **no source consulted states this explicitly**, so it is not asserted here as fact. Naming both sides: Tether's list is narrower than the chain set Fireblocks users appear to transact USDT on.

3. **Which Fireblocks EVM chain list applies?** The Embedded Wallet list and the community thread overlap but do not match (e.g. Linea, Gnosis, Astar, Oasys appear only in the Embedded Wallet list; Ronin, XinFin only in the community thread). These document different products and different points in time. Neither is confirmed as the custody platform's current list.

## Open Questions

- **Which exact EVM chains carry a transferable USDT asset ID in a Fireblocks production custody workspace — could not be established from public sources.** Fireblocks does not publish a token-by-chain matrix; the data is behind the authenticated `List Supported Assets` endpoint. **What would settle it:** an authenticated `GET /v1/supported_assets` (or `/v1/assets`) call from a production workspace, filtered for USDT, or a written confirmation from a Fireblocks customer success manager.

- **Whether Fireblocks charges any fee on withdrawals beyond the raw blockchain network fee — not published.** The fee docs address estimation only. **What would settle it:** the Fireblocks master services agreement / order form, or a direct answer from Fireblocks sales.

- **Whether the 0.20% overage rate applies to USDT withdrawal volume specifically, and how "outbound volume" is measured** (notional USD of outbound transfers, presumably) — the pricing page states the rate but not its precise measurement basis. **What would settle it:** the contractual definition of outbound volume in the Fireblocks order form.

- **Pricing for Pro / Enterprise / Enterprise+ and for every add-on module (Gas Station, Off Exchange, Cold Wallet, Raw Signing, Staking, Tokenization, DRS) is not published in any form.** Third-party sites (Vendr, Capterra, G2, Scribd) carry estimates; none is a primary source and none is reproduced here as fact. **What would settle it:** a quote from Fireblocks sales.

- **Currency of the Embedded Wallet chain list is unverified** — no revision date was visible on the page.

- **Whether USDT withdrawal is subject to per-chain policy or Travel Rule constraints inside Fireblocks** was not investigated and is out of scope of this question.

## Sources

All retrieved 2026-07-20.

- https://www.fireblocks.com/pricing
- https://www.fireblocks.com/blockchain-integrations
- https://www.fireblocks.com/blog/leader-in-public-blockchain-support-coverage
- https://www.fireblocks.com/integrations/tokens/
- https://developers.fireblocks.com/reference/list-supported-assets
- https://developers.fireblocks.com/reference/listassets
- https://developers.fireblocks.com/docs/verify-fee-effeciency
- https://ncw-developers.fireblocks.com/docs/supported-networks
- https://community.fireblocks.com/t/exhastive-list-of-evm-chains/283
- https://community.fireblocks.com/t/transitioning-from-polygon-mumbai-to-avalanche-fuji-seeking-usdt-asset-id-for-integration/975
- https://community.fireblocks.com/t/how-to-enable-usdt-trc-20-erc-20-in-fireblocks-sandbox/2309
- https://tether.to/en/supported-protocols/
- https://tether.io/news/tether-to-wind-down-usdt-support-for-five-legacy-blockchains-as-part-of-strategic-infrastructure-review/
