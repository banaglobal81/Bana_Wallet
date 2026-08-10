# 스테이킹 게임화(채굴 테마 방치형 2D 게임) 리서치

## Summary
채굴(mining) 테마 방치형(idle) 게임은 이미 검증된 장르로, "생산 자원(광물/골드) → 업그레이드 재투자 → 자동화 → 프레스티지 리셋"의 명확한 순환 루프와 지수형(exponential) 성장 곡선을 공유한다. 비주얼은 픽셀아트와 플랫 벡터 두 스타일이 모바일 idle 게임 시장에서 공존하며, 채굴/유전 테마는 시추기·컨베이어·헬멧 캐릭터 등 반복 사용되는 아이코노그래피가 있다. 실제 자산(스테이킹 보상)과 게임 메커니즘(채굴 속도/레벨)을 연결한 크립토 선례로는 GoMining(BTC 해시레이트를 NFT 채굴기로 시각화)과 MOBOX(NFT 해시파워 기반 스테이킹 보상)가 확인되며, 두 사례 모두 "게임 내 파워 스탯이 실제 수익률에 비례"하는 구조다. 다만 금융 서비스에 게임 요소를 접목할 때 FCA·SEC·FTC가 각각 게이미피케이션이 사용자의 리스크 감수 행동을 늘린다는 점과 NFT/루트박스류 확률형 요소가 도박 규제 대상이 될 수 있다는 점을 명시적으로 경고하고 있어, 이는 `game-planner`가 스테이킹-게임 연동 설계 시 반드시 감안해야 할 제약이다.

## Findings

### 1. 참고할 2D 방치형/채굴 테마 게임 — 핵심 루프, 성장 구조, 재화 구조

- **Idle Miner Tycoon(Kolibri Games)**: 광산(Mine Shaft) → 엘리베이터 → 창고(Warehouse) 3단 파이프라인이 자원을 생산/운반/저장하며, 각 시설을 개별적으로 레벨업. Mine Shaft는 레벨 800까지, Warehouse/Elevator는 각각 2400까지 업그레이드 가능. "매니저(Super Manager)"라는 유료/획득형 부스터가 속도·배율을 곱연산으로 증폭시키는 구조. 1~2주 주기로 테마가 다른 한정 이벤트 광산을 운영해 재방문을 유도. (신뢰도: high) — [Fundamental Gameplay, Idle Miner Tycoon Wiki](https://idleminertycoon.fandom.com/wiki/Fundamental_Gameplay), [What are the maximum levels?](https://kolibri-games.helpshift.com/hc/en/3-idle-miner-tycoon/faq/53-what-are-the-maximum-levels/), [Idle Miner Games List 2026](https://blog.mrmine.com/idle-miner-games-list/)
- **Deep Town: Mining Factory**: 채굴 + 공장 자동화를 결합. 채굴 AI 캐릭터가 지하 여러 층에서 자원을 추출하고, 원자재를 가공 건물(제련/가공/보석/온실/전력)에서 완제품으로 변환. "매니저 고용" 시 오프라인(비활성) 상태에서도 자원이 계속 생산됨 — 이는 방치형 스테이킹 UX와 개념적으로 유사(예치만 해두면 보상이 계속 쌓이는 것과 매칭 가능). 15종 이상의 자원, 다단계 크래프팅 체인. (medium) — [Deep Town: Mining Factory](https://games.lol/deep-town-mining-factory/)
- **Mr. Mine**: 100개 이상의 드릴 업그레이드, "Gold and Goblins"류 보물상자를 통한 숨겨진 업그레이드, 골드/광물을 교환하는 트레이딩 포스트로 "승급(ascend to tycoon)" 시스템 보유. (medium) — [Idle Miner Games List 2026](https://blog.mrmine.com/idle-miner-games-list/)
- **재화 구조의 공통 패턴**: idle 게임은 보통 (a) 기본 소프트 커런시(생산 자원, 예: 골드), (b) 세컨더리 리소스(신규 기능 언락용), (c) 프리미엄/하드 커런시(젬 등), (d) 리셋/프레스티지로 얻는 메타 커런시(영구 배율) — 4계층 경제를 쌓는다. `Clicker Heroes`류의 "어센션(ascension)"이 대표적 프레스티지 패턴(진행 초기화 대신 영구 배율 획득). `Antimatter Dimensions`처럼 프레스티지를 여러 겹(Infinity/Eternity/Reality) 쌓는 게임은 200~500시간 수준의 장기 리텐션을 만든다는 분석도 있음. (medium) — [Economy In Free-to-Play Mobile Games, Kolibri Games](https://www.kolibrigames.com/blog/economy-in-free-to-play-mobile-games-part-2/), [Best Incremental Games for Prestige & Automation Fans](https://pinkcrow.net/game-idea/the-best-incremental-games-for-prestige-automation-fans/)
- **진행 곡선 설계**: 성장이 너무 빠르면 지루해지고 너무 느리면 이탈하므로, 대부분 지수형 곡선을 쓰되 "초반은 쉽게, 후반은 급격히 어렵게"로 설계하고 업그레이드/신규 화폐/타임스킵으로 유도하는 패턴이 일반적. (medium) — [Idle Games Best Practices, GridInc](https://gridinc.co.za/blog/idle-games-best-practices), [The Math of Idle Games Part III](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-iii)
- **실물 자산과의 연결 여부**: 위 3개 게임(Idle Miner Tycoon, Deep Town, Mr. Mine)은 모두 게임 내 가상 재화(골드/광물)이며 실제 자산·법정화폐·크립토와 직접 연동되지 않는 순수 엔터테인먼트형 idle 게임임 — BANA가 참고할 때 "재화=실제 스테이킹 보상"으로 바꾸는 것은 이들 사례에 없는 별도 설계가 필요함을 의미. (high, 직접 확인)

### 2. 비주얼 스타일 레퍼런스

- 모바일 채굴/유전 테마 idle 게임 자산 시장에는 두 스타일이 공존: **픽셀아트(8/16비트, 32x32 스프라이트)** — 레트로 감성, 낮은 제작 비용, 클래식 idle-clicker에 흔함. **플랫 벡터** — 산업용 인프라(시추탑, 정제탑, 저장탱크, 파이프라인)를 굵은 윤곽선과 대비되는 네이비/오렌지 컬러팔레트로 표현하는 모던하고 미니멀한 스타일, 캐주얼 모바일 게임에 흔함. (medium) — [Free Mining Pixel 32x32 Icons, CraftPix](https://craftpix.net/freebies/free-mining-pixel-32x32-icons/), [Pixel art Oil Drill, Vecteezy](https://www.vecteezy.com/vector-art/49809638-pixel-art-illustration-oil-drill-pixelated-oil-well-desert-oil-drill-well-pixelated-for-the-pixel-art-game-and-icon-for-website-and-game-old-school-retro), [Mining Rig Vector Art, Vecteezy](https://www.vecteezy.com/free-vector/mining-rig), [Oil Mine Vector Art, Vecteezy](https://www.vecteezy.com/free-vector/oil-mine)
- 반복적으로 쓰이는 비주얼 요소: 곡괭이/드릴/셔블, 시추 장비, 컨베이어, 광석 더미(금/철/구리/티타늄), 헬멧 쓴 캐릭터, 엘리베이터/광산 갱도, 창고. (medium) — [Free Mining Pixel 32x32 Icons, CraftPix](https://craftpix.net/freebies/free-mining-pixel-32x32-icons/)
- idle 게임 장르 자체가 "최소한의 조작, 자동 진행 관찰"을 핵심으로 하기 때문에 캐릭터/장비의 정적 애니메이션(반복 루프) 중심 아트 파이프라인이 일반적이라는 설명도 확인됨 — 이는 BANA처럼 풀타임 게임 스튜디오가 아닌 팀이 제작 비용을 통제하는 데 참고할 수 있는 지점. (low, 리소스 사이트 설명 기반 간접 근거) — [tag idle, itch.io asset tag](https://itch.io/game-assets/newest/tag-idle?page=2)

### 3. 레벨업/성장 시스템 설계 패턴

- **경험치(XP) 곡선 유형 3종**: (1) 선형(레벨마다 동일 증가폭 — 예측 가능하나 후반 지루함), (2) 지수형(threshold[n] = threshold[n-1] × 계수 Y, 흔히 Y≈1.4 — 초반 쉽고 후반 급격히 어려워짐, JRPG 표준), (3) 피보나치형(직전 두 레벨 합에 근사 — 초반 쉬움→중반 안정→후반 도전으로 자연스러운 페이싱). 지수 계수 선택이 어려운 지점: 너무 낮으면 밋밋하고 너무 높으면 후반 도달 불가능. (medium) — [Quantitative design: How to define XP thresholds, Game Developer](https://www.gamedeveloper.com/design/quantitative-design---how-to-define-xp-thresholds-), [RPG XP Curves Explained, Jaconir](https://jaconir.online/blogs/rpg-xp-curve-balancing-guide), [GameDesign Math: RPG Level-based Progression](https://www.davideaversa.it/blog/gamedesign-math-rpg-level-based-progression/)
- **단계별 언락 패턴**: idle mining 장르에서는 시설별(광산/엘리베이터/창고) 독립 레벨 트랙을 두고, 병목이 되는 시설(예: 엘리베이터 처리량이 광산 채굴량을 못 따라가는 경우)을 먼저 올리도록 유도하는 것이 표준 튜토리얼 동선. (high, Idle Miner Tycoon 직접 확인) — [Fundamental Gameplay, Idle Miner Tycoon Wiki](https://idleminertycoon.fandom.com/wiki/Fundamental_Gameplay)
- **속도/효율 부스트 밸런싱**: "매니저"류 속도 부스트를 배율형 업그레이드 위에 얹으면 곱연산 효과로 수익률이 급격히 증가하는 예시(빠른 채굴기가 배율 적용된 창고로 흘러들어가면 복합 성장) 확인. 이는 "아이템 구매 → 채굴 속도 증가"를 곱연산 스택으로 설계할 때 후반 인플레이션이 심해질 수 있음을 시사. (medium) — [Idle Miner Games List 2026](https://blog.mrmine.com/idle-miner-games-list/)
- **프레스티지/리셋 설계**: 진행을 초기화하는 대신 영구 배율을 부여하는 방식(Clicker Heroes의 "어센션")이 장기 재방문을 만드는 대표 패턴. 다만 이는 스테이킹처럼 "원금이 실재하는" 도메인에는 그대로 적용하기 어려움 — 리셋 개념을 게임 레이어(레벨/장비)에만 한정할지, 실제 스테이킹 잔액과 분리할지는 정책 결정 사항으로 `pm`/`game-planner`가 판단할 문제. (medium, 직접 정책 제안 아님, 관찰만) — [The Best Incremental Games for Prestige & Automation Fans](https://pinkcrow.net/game-idea/the-best-incremental-games-for-prestige-automation-fans/)

### 4. 실제 스테이킹/수익률과 게임 메커니즘을 연결한 크립토 선례

- **GoMining**: 실제 BTC 채굴 해시레이트(1~5,000 TH/s)를 NFT "디지털 마이너"로 토큰화. 사용자가 GOMINING 토큰을 최대 4년 스테이킹해 수익 및 거버넌스 투표권 획득. NFT 마이너의 해시레이트/에너지 효율을 "업그레이드"해 실제 채굴 수익률을 높일 수 있음 — 게임 스탯(해시레이트 레벨)이 실제 수익과 1:1로 연동되는 구조. "Miner Wars"라는 길드형 이벤트에서 실제 비트코인 블록 발견 주기에 맞춰 플레이어들이 경쟁하는 시즌 콘텐츠도 운영. (high) — [Bitcoin Mining, Gamified: How GoMining Turns BTC Hashrate into Playable NFTs](https://www.ibtimes.com/bitcoin-mining-gamified-how-gomining-turns-btc-hashrate-playable-nfts-3777114), [Pool Mining: New Game Mechanics, GoMining Medium](https://medium.com/@GoMining/pool-mining-new-game-mechanics-83417e0ef16d)
- **MOBOX (MOMO NFT)**: NFT 캐릭터(MOMO)마다 무작위 생성된 "해시파워(Hash Power)" 스탯을 보유하며, 스테이킹 시 이 스탯이 높을수록 MBOX 거버넌스 토큰 보상 획득 확률/양이 증가. 다른 MOMO NFT를 소모해 해시파워를 업그레이드 가능. 스테이커 대상 한정판 NFT 드롭, 스킨, 얼리 액세스 등 이벤트 운영. (high) — [MOMO NFT Yield Farming, MOBOX 공식 문서](https://faqen.mobox.io/ecosystem/defi-gamified/nft-yield-farming-mbox), [What Is MOBOX (MBOX)?](https://onekey.so/blog/ecosystem/what-is-mobox-mbox-combining-gaming-nfts-and-defi-rewards/)
- 두 사례의 공통 구조는 "게임 내 파워/레벨 스탯 → 실제 수익률에 곱연산으로 반영"이며, 이는 BANA가 "채굴 속도 = 스테이킹 APY 가중치"로 설계할 경우 참고할 수 있는 실증 사례. 다만 두 프로젝트 모두 NFT 매매·2차 시장이 존재하는 P2E/GameFi 구조이며, BANA처럼 라이선스 기반 B2B 커스터디 지갑에 그대로 이식 가능한지는 별도 검토 필요(아래 개방형 질문 참고). (medium, 구조적 유사성은 확인되나 이식 가능성은 미검증)
- 그 외 **PEPENODE**(밈코인 + 게임화된 스테이킹), **NFT 스테이킹 일반**(등급별 리워드 배율) 사례도 검색되었으나 1차 소스(공식 문서) 확인이 부족해 낮은 신뢰도로만 기록. (low) — [7 Best Crypto Coins To Stake, ValueWalk](https://www.valuewalk.com/cryptocurrency/best-staking-coins/), [NFT Staking 2026, Coinearn](https://thecoinearn.com/blog/staking/what-is-nft-staking/)

### 5. 금융 서비스 게임화 규제/UX 리스크 (요약 언급)

- **FCA(영국)**: 게이미피케이션이 투자앱 이용자의 리스크 감수 행동을 늘린다는 리서치 발표. 포인트 집계, 리더보드, 배지, 축하 메시지, 잦은 푸시 알림, 높은 기본 투자 금액 등을 우려 대상으로 명시. 실증 연구에서 조사한 5개 앱 중 3개 앱 이용자의 20~25%가 "문제성 도박과 유사한 패턴"의 위험 행동을 보였고, 푸시 알림은 거래를 11%, 포인트/추첨은 거래를 12% 증가시킨다는 정량 결과도 제시됨. (high) — [FCA issues warning about trading app gamification](https://www.finextra.com/newsarticle/41350/fca-issues-warning-about-trading-app-gamification), [Trading app gamification can increase risk taking, FCA](https://www.finextra.com/newsarticle/44363/trading-app-gamification-can-increase-risk-taking---fca), [Gaming trading, FCA 공식](https://www.fca.org.uk/publications/research-articles/gaming-trading-how-trading-apps-could-be-engaging-consumers-worse)
- **미국 SEC/FINRA/FTC**: SEC는 게이미피케이션 요소가 Regulation Best Interest 하에서 "사실상의 투자 권유(de facto recommendation)"에 해당하는지 브로커-딜러가 평가하도록 요구. FTC는 "다크 패턴"(인지 편향을 악용하는 UI 설계) 관점에서 우려 표명. (medium) — [The Gamification of Investments: US vs EU, Berkeley Tech Law Journal](https://btlj.org/2025/11/the-gamification-of-investments-a-comparative-approach-between-the-us-and-eu/), [Your Trading App Looks Like a Gambling Shop, FinanceMagnates](https://www.financemagnates.com/forex/your-trading-app-looks-like-a-gambling-shop-regulators-have-noticed/)
- **확률형/루트박스 요소 관련**: 도박 규제는 통상 (1)대가 지불, (2)무작위성, (3)금전적 가치가 있는 보상 3요소로 판단하며, NFT처럼 거래 가능한 보상이 결부된 확률형 상자는 일반 가상 아이템보다 도박으로 분류될 위험이 큼. 벨기에·네덜란드는 유료 루트박스를 전면 금지(도박법 적용), 폴란드는 2025년 말 확률형 구매 요소가 있는 게임에 도박 라이선스를 요구하는 개정안을 발의. 한국은 확률형 아이템 확률 공시 의무화 법을 시행 중. 미국은 연방 차원의 루트박스 단일 법은 없으나 FTC의 다크패턴 집행 리스크는 존재. (medium) — [Loot Boxes, Regulation, and Where the Line Sits in 2026](https://programminginsider.com/loot-boxes-regulation-and-where-the-line-sits-in-2026/), [Legal risks of loot boxes, Nordia Law](https://nordialaw.com/legal-risks-of-loot-boxes/), [Loot Box Laws by Jurisdiction 2025](https://blog.promise.legal/loot-box-laws-game-developers/)
- BANA 관점 시사점(정책 제안 아님, 관찰만): (a) 스테이킹 화면에 리더보드/카운트다운/축하 애니메이션 등을 넣을 경우 FCA식 "리스크 감수 유도" 프레임에 걸릴 수 있음, (b) "아이템 구매로 채굴 속도 증가"를 확률형(랜덤 박스)으로 설계하면 루트박스/도박 규제 이슈가 커짐 — 확정형 구매(가격 대비 확정 효과)로 설계하면 이 리스크는 낮아짐, (c) BANA는 en/ko/ja/zh/vi/th 다국어·다국가 서비스이므로 한국(확률 공시 의무), 벨기에/네덜란드(전면 금지)식 관할별 규제 편차를 게임 요소 확정 전 법무 검토가 필요함. 이 판단은 `pm`/법무 영역이며 본 리서치는 근거만 제공.

## Contradictions
- "게이미피케이션이 반드시 위험 행동을 유발한다"는 FCA의 정량적 경고(거래 11~12% 증가)와, GoMining/MOBOX처럼 게임화가 이미 상용화되어 있고 별다른 규제 제재 없이 운영 중인 크립토 업계 사례 사이에는 온도차가 있음 — 즉 "전통 증권 브로커리지 규제"와 "크립토 스테이킹/NFT 게임화"에 적용되는 규제 강도가 다르다는 점은 확인되나, BANA처럼 라이선스 기반 커스터디 지갑이 어느 규제 프레임(증권형 트레이딩 앱 규제 vs. 크립토 GameFi 규제)에 더 가깝게 취급될지는 소스들이 명시하지 않음.
- 아트 스타일 관련해서 "픽셀아트가 레트로/저비용"이라는 설명과 "플랫 벡터가 모던/미니멀 대세"라는 설명이 동시에 등장했으나, 어느 쪽이 idle-mining 장르에서 실제로 더 높은 리텐션/전환율을 내는지에 대한 정량 비교 데이터는 검색 결과에 없었음 — 두 스타일 모두 시장에 공존한다는 사실만 확인됨.

## Open Questions
- GoMining/MOBOX식 "게임 스탯 = 실제 수익률" 연동이 BANA 같은 B2B 라이선스 커스터디 지갑(자체 발행 토큰이나 NFT가 없는 구조)에 이식 가능한지: 두 사례 모두 자체 토큰/NFT 발행이 전제된 P2E 생태계였고, BANA는 Nia-Hub의 실제 스테이킹 상품을 게임 UI로 감싸는 형태이므로 구조가 다름. 어떻게 "채굴 속도"를 실제 APY/보상 계산에 연결할지(가산 보너스? 단순 시각화만?)는 `pm`/`game-planner`가 결정할 정책 문제이며, 본 리서치는 선례의 구조만 제공.
- BANA가 서비스하는 시장(한국, 일본, 중국, 베트남, 태국 등) 각각의 "확률형 아이템/게이미피케이션" 관련 금융/게임 규제가 구체적으로 어떻게 적용되는지는 확인하지 못함 — 관할별 1차 법령 조사가 필요하며, 고위험 판단이 필요하므로 `/deep-research` 워크플로우 실행을 권장.
- idle-mining 장르에서 실제 사용자 리텐션/전환 지표(DAU, D7 리텐션, ARPU 등)에 대한 1차 소스 데이터는 확보하지 못함 — 이는 `growth-pm` 영역의 정량 벤치마크 리서치로 별도 진행 필요.
- BANA의 "아이템 구매"가 실제 화폐(원화/코인)로 이루어질지, 게임 내 소프트 커런시로만 이루어질지에 따라 적용되는 규제 프레임이 크게 달라짐 — 이 설계가 확정되기 전까지 규제 리스크 평가는 잠정적임.

## Sources
(모두 2026-08-10 접속 확인)
- [Idle Miner Games List 2026: Best Incremental Mining Games, Mr. Mine Blog](https://blog.mrmine.com/idle-miner-games-list/)
- [Fundamental Gameplay, Idle Miner Tycoon Wiki (Fandom)](https://idleminertycoon.fandom.com/wiki/Fundamental_Gameplay)
- [What are the maximum levels? — Idle Miner Tycoon Help Center](https://kolibri-games.helpshift.com/hc/en/3-idle-miner-tycoon/faq/53-what-are-the-maximum-levels/)
- [Economy In Free-to-Play Mobile Games, Part 2 — Kolibri Games](https://www.kolibrigames.com/blog/economy-in-free-to-play-mobile-games-part-2/)
- [Idle Games Best Practices: Design and Strategy — GridInc Blog](https://gridinc.co.za/blog/idle-games-best-practices)
- [The Math of Idle Games, Part III — Game Developer](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-iii)
- [The Best Incremental Games for Prestige & Automation Fans — PinkCrow](https://pinkcrow.net/game-idea/the-best-incremental-games-for-prestige-automation-fans/)
- [Deep Town: Mining Factory — games.lol](https://games.lol/deep-town-mining-factory/)
- [Deep Town: Idle Mining Tycoon — AppBrain](https://www.appbrain.com/app/deep-town-idle-mining-tycoon/com.rockbite.deeptown)
- [Free Mining Pixel 32x32 Icons — CraftPix](https://craftpix.net/freebies/free-mining-pixel-32x32-icons/)
- [Pixel art illustration Oil Drill — Vecteezy](https://www.vecteezy.com/vector-art/49809638-pixel-art-illustration-oil-drill-pixelated-oil-well-desert-oil-drill-well-pixelated-for-the-pixel-art-game-and-icon-for-website-and-game-old-school-retro)
- [Mining Rig Vector Art, Icons, and Graphics — Vecteezy](https://www.vecteezy.com/free-vector/mining-rig)
- [Oil Mine Vector Art, Icons, and Graphics — Vecteezy](https://www.vecteezy.com/free-vector/oil-mine)
- [tag idle — itch.io game assets](https://itch.io/game-assets/newest/tag-idle?page=2)
- [Quantitative design: How to define XP thresholds? — Game Developer](https://www.gamedeveloper.com/design/quantitative-design---how-to-define-xp-thresholds-)
- [GameDesign Math: RPG Level-based Progression — Davide Aversa](https://www.davideaversa.it/blog/gamedesign-math-rpg-level-based-progression/)
- [RPG XP Curves Explained: Balance Leveling Speed — Jaconir Blog](https://jaconir.online/blogs/rpg-xp-curve-balancing-guide)
- [Bitcoin Mining, Gamified: How GoMining Turns BTC Hashrate into Playable NFTs — IBTimes](https://www.ibtimes.com/bitcoin-mining-gamified-how-gomining-turns-btc-hashrate-playable-nfts-3777114)
- [Pool Mining: New Game Mechanics — GoMining (Medium)](https://medium.com/@GoMining/pool-mining-new-game-mechanics-83417e0ef16d)
- [MOMO NFT Yield Farming (MBOX) — MOBOX 공식 문서](https://faqen.mobox.io/ecosystem/defi-gamified/nft-yield-farming-mbox)
- [Staking — MOBOX 공식 문서](https://faqen.mobox.io/ecosystem/defi-gamified/crates)
- [NFT On-Chain Attributes — MOBOX 공식 문서](https://faqen.mobox.io/ecosystem/defi-gamified/nft-on-chain-attributes)
- [What Is MOBOX (MBOX)? — OneKey](https://onekey.so/blog/ecosystem/what-is-mobox-mbox-combining-gaming-nfts-and-defi-rewards/)
- [7 Best Crypto Coins To Stake And Earn Today in 2026 — ValueWalk](https://www.valuewalk.com/cryptocurrency/best-staking-coins/)
- [NFT Staking 2026: Earn Passive Income and Rewards — thecoinearn.com](https://thecoinearn.com/blog/staking/what-is-nft-staking/)
- [FCA issues warning about trading app gamification — Finextra](https://www.finextra.com/newsarticle/41350/fca-issues-warning-about-trading-app-gamification)
- [Trading app gamification can increase risk taking - FCA — Finextra](https://www.finextra.com/newsarticle/44363/trading-app-gamification-can-increase-risk-taking---fca)
- [Gaming trading: how trading apps could be engaging consumers for the worse — FCA 공식](https://www.fca.org.uk/publications/research-articles/gaming-trading-how-trading-apps-could-be-engaging-consumers-worse)
- [The Gamification of Investments: A Comparative Approach Between the US and EU — Berkeley Technology Law Journal](https://btlj.org/2025/11/the-gamification-of-investments-a-comparative-approach-between-the-us-and-eu/)
- [Your Trading App Looks Like a Gambling Shop. Regulators Have Noticed. — FinanceMagnates](https://www.financemagnates.com/forex/your-trading-app-looks-like-a-gambling-shop-regulators-have-noticed/)
- [Loot Boxes, Regulation, and Where the Line Sits in 2026 — Programming Insider](https://programminginsider.com/loot-boxes-regulation-and-where-the-line-sits-in-2026/)
- [Legal risks of loot boxes – part II — Nordia Law](https://nordialaw.com/legal-risks-of-loot-boxes/)
- [Loot Box Laws by Jurisdiction: What Game Studios Must Know in 2025 — Promise Legal](https://blog.promise.legal/loot-box-laws-game-developers/)
