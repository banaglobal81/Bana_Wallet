# DEEP CORE — 기획서 09: Phase 0 자산 배치 2 — P0 백로그 후속 산출물

> `game-designer` · 2026-08-10 · 상위: `deep-core-06-asset-manifest.md`, `deep-core-07-art-style-guide.md`,
> `deep-core-08-asset-manifest-phase0-batch1.md`
> **수신자: `game-developer`.** 08 문서 §6의 "후속 배치 백로그" 1·3·4순위를 이어서 진행한 배치다.
> 이번 배치로 총 자산 수는 33 → **61장**. 스타일 결정 근거는 07 문서, Phase 0 스코프 경계는
> 07 문서 §0 그대로 — 이번 배치도 CC/장비 트랙(B1·B3·B4)/MP/보너스 관련 자산은 전혀 만들지 않았다.

---

## 1. 자산 위치 (경로 추가분)

```
web/public/game/deep-core/
├─ manifest.json                     ← 61장 전체 갱신됨
├─ backgrounds/                      +12장 (챕터 3~6 패럴랙스 sky/mid/fore) — 이제 챕터 1~6 전체 완비(18/18)
├─ characters/actionsheets/          신규 디렉터리, 6장 (크루 액션 시트, P0 웨이브 조합)
└─ wells/                            +10장 (시추정 크기×챕터×상태 조합, 챕터 1~2 완비 12/12)
```

기존 33장 위치는 08 문서 §1 그대로. 새 디렉터리는 `characters/actionsheets/` 하나뿐이다.

## 2. 이번 배치 28장 목록

### 2.1 배경 — 챕터 3~6 패럴랙스 (12장)

| id | 챕터 | 컨셉 | 해상도 |
|---|---|---|---|
| `dc_bg_ch3_sky` / `_mid` / `_fore` | 3 (현무암 붕) | 흑현무암 동굴, 인공 백색 조명, 안정적 암반(붕괴 묘사 없음) | 1344×768 |
| `dc_bg_ch4_sky` / `_mid` / `_fore` | 4 (지열 심연) | 지열 동굴, 적열 글로우 + 증기 회색, 통제된 산업 설비(재해 아님) | 1344×768 |
| `dc_bg_ch5_sky` / `_mid` / `_fore` | 5 (결정 공동) | 청록 발광 결정 동굴 | 1344×768 |
| `dc_bg_ch6_sky` / `_mid` / `_fore` | 6 (코어 층) | 무채 백색광 + 딥 네이비 격벽 복도 | 1344×768 |

06 문서 C1(패럴랙스 3레이어, 18장)이 이번 배치로 **챕터 1~6 전부 완비**되었다.

### 2.2 크루 액션 시트 (6장) — 06 문서 P0 웨이브 조합

| id | 인물 | 챕터 |
|---|---|---|
| `dc_crew_boss_actionsheet_ch1` / `_ch2` | 한나 소렌 | 1, 2 |
| `dc_crew_mech_actionsheet_ch1` / `_ch2` | 딜런 아카보 | 1, 2 |
| `dc_crew_geo_actionsheet_ch2` | 메이 린 | 2 |
| `dc_crew_ops_actionsheet_ch2` | 오마르 리스 | 2 |

각 시트는 1024×1024, **3열×2행 그리드**(칸 6개, 다섯 번째까지 캐릭터, 여섯 번째는 빈 마젠타)로
`idle`/`working`/`waiting`/`idle_empty`/`chapter_up` 5개 상태를 한 장에 담았다. **§4에 상세 한계 기록.**

### 2.3 시추정 크기×챕터×상태 조합 (10장) — D1 P0 웨이브 잔여분 완성

| id | 크기 | 챕터 | 상태 |
|---|---|---|---|
| `dc_well_medium_ch1_active` | 중 | 1 | 가동 |
| `dc_well_small_ch1_stopped` / `dc_well_medium_ch1_stopped` / `dc_well_large_ch1_stopped` | 소/중/대 | 1 | 정지 |
| `dc_well_small_ch2_active` / `dc_well_medium_ch2_active` / `dc_well_large_ch2_active` | 소/중/대 | 2 | 가동 |
| `dc_well_small_ch2_stopped` / `dc_well_medium_ch2_stopped` / `dc_well_large_ch2_stopped` | 소/중/대 | 2 | 정지 |

배치 1의 `dc_well_small_ch1_active` / `dc_well_large_ch1_active`와 합쳐 **06 문서 D1의 "3크기×Ch1~2×
가동/정지" 12장 세트가 완비**되었다. "정지" 상태는 손실/파손이 아니라 **밸브 잠금 + 램프 소등**으로만
표현(07 문서 M-7 준수).

## 3. Phase 0 스코프 준수 확인

07 문서 §0 배제 규칙 재확인 — 이번 배치에도 장비 트랙 파츠(B1)/보급창 티어(B3)/병목 오버레이(B4)/
CC·MP 아이콘은 한 장도 없다. 리그 베이스(B2)도 이번 배치에서 만들지 않았다(챕터 2~6 리그 베이스는
여전히 미제작 — §6 백로그 참조).

## 4. 알려진 이슈 및 수정 이력 — 크루 액션 시트

**신규 이슈 발견(이전 배치에 없던 실패 유형): 그리드형 다중 패널 이미지에서 모델이 자체적으로
칸 번호("1"~"6")를 이미지에 굽고, 그리드 바깥에 흰색/회색 여백 테두리를 추가**했다
(`dc_crew_boss_actionsheet_ch1` 최초 생성분). M-1(문자 금지)·마젠타 크로마키 전제 둘 다 위반.

- 1차 시도: `--edit-image`로 결함 있는 기존 이미지를 참조로 넣고 "번호 빼줘" 프롬프트로 수정 시도 →
  **실패**. 결함 이미지를 멀티모달 입력으로 넣으면 모델이 그 결함(번호·테두리)까지 그대로 재현했다.
  **교훈**: 그리드/번호 오염처럼 "형태 자체"가 잘못된 경우, `--edit-image`(기존 이미지 참조 수정)가
  아니라 **`--id` + `--manifest`만으로 완전히 새로 생성**(레퍼런스 이미지 없이)해야 결함이 끊긴다.
- 2차 시도: 레퍼런스 없이 재생성 + "no numbers/digits/labels, no outer margin, fill edge-to-edge"
  강화 → 번호·테두리는 사라졌으나 **개별 칸 내부 배경이 마젠타가 아닌 크림색으로 채워짐**(칸 사이
  여백만 마젠타). 크로마키가 칸 내부까지 못 지운다.
- 3차 시도: "every single pixel of the background in ALL six cells... must be the exact same flat
  magenta, no other background color anywhere, not even inside the character cells"로 재차 강화 →
  **성공**. 다른 5장(2차 시도 없이 1차부터 정상 생성됨)과 동일하게 칸 전체가 균일 마젠타로 나왔다.

**향후 그리드/다중 패널 프롬프트 작성 시 처음부터 포함할 것**(패턴 라이브러리에 기록):
1. "no numbers, no digits, no numerals, no labels, not even small ones in the corners"를 명시적으로.
2. "every single pixel of the background, including directly behind each subject in every cell,
   must be the same flat magenta — no card/frame color, no lighter shade, not even inside the cells"
   까지 못박을 것. "isolated on magenta background"만으로는 다중 패널 프롬프트에서 불충분했다.
3. 그리드 전체가 캔버스 가장자리까지 꽉 차야 한다는 것("no outer margin/border strip")도 명시.

## 5. 크루 액션 시트 — 구조적 한계 (인계 필수 사항)

06 문서 A1은 "1장 = 1인물 × 1챕터, 5개 상태 프레임 전부 포함"으로 정의했고, 08 문서 §6-1이 이미
"이 파이프라인은 시드 고정이 없어 프레임 간 일관성 확보가 어려우므로 `game-developer`와 프레임
수·방식을 재확인할 것"을 남겨두었다. 이번 배치로 실제 결과물을 만들어본 결과:

- **동일 시트 내 5개 포즈 간 캐릭터 일관성은 예상보다 양호했다** — 같은 한 번의 생성 호출 안에서는
  얼굴·헤어·의상 색이 프레임마다 거의 동일하게 유지됨(시트 간, 즉 챕터 1 vs 챕터 2처럼 별도 호출
  간에는 여전히 일관성 보장 없음 — 07 문서 §7 표 그대로).
- **칸 경계가 픽셀 단위로 정확하지 않다** — 그리드는 육안상 3×2로 고르게 나뉘지만, 실제 분할선
  좌표가 정수배로 딱 떨어진다는 보장이 없다. `game-developer`가 최종 스프라이트 프레임으로 잘라
  쓰려면 **수작업 크롭 좌표 확인이 필요**하다(자동 등분할 슬라이싱은 어긋날 수 있음).
- 따라서 이 6장은 "완성된 스프라이트시트"가 아니라 **레퍼런스/원본 소재**로 인계한다. 실제 인게임
  프레임 추출은 `game-developer`가 자르기/리깅 방식을 정할 것.

## 6. 매팅(투명 PNG) 관련 한계 — 08 문서 §5 재확인

이번 배치도 동일한 자체 제작 크로마키 스크립트(코너 픽셀 자동 샘플링 + 거리 임계값 + 페더)를
사용했다. 액션 시트의 칸 분할선 가장자리에 옅은 마젠타 헤일로가 남아있는 경우가 있다(육안 검수
결과 경미, 프로덕션 마무리 전 수동 정리 또는 `rembg` 재적용 권장 — 08 문서와 동일 권고).

## 7. 후속 배치 백로그 (갱신)

| 항목 | 06 문서 목표 | 완료 | 잔여 |
|---|---|---|---|
| C1 패럴랙스 3레이어 | 18 | **18 (완료)** | 0 |
| D1 시추정 크기×챕터×상태 | 36 | 12 (챕터 1~2) | 24 (챕터 3~6) |
| A1 크루 액션 시트 | 26 | 6 (P0 웨이브 조합) | 20 (보스·정비공·지질학자·운용·K-9의 챕터 3~6 조합) |
| A2 크루 초상 | 26 | 5 (배치1) | 21 |
| B2 리그 베이스 | 6 | 1 (챕터1만) | 5 (챕터 2~6 — 06 문서 P0 웨이브는 챕터1~2 2장을 요구했으나 배치1이 1장만 만들어 미완) |
| D2 필드 프롭 | 48 | 2 (배치1) | 46 |

우선순위 제안(다음 배치): ① B2 리그 베이스 챕터 2 1장(P0 웨이브 완결), ② D1 챕터 3~6 시추정
24장, ③ A2 크루 초상 잔여, ④ A1 액션 시트 잔여 20장(§5의 한계를 `game-developer`와 먼저 확인
후 진행 권장), ⑤ D2 필드 프롭. 나머지는 06 문서 §4 P1/P2 파도 순서를 따른다.

## 8. `game-developer` 인계 메모

- 챕터 3~6 배경으로 패럴랙스 3레이어가 챕터 1~6 전부 갖춰졌으므로, 스테이징 빌드에서 전 챕터
  배경 전환을 시각적으로 검증할 수 있다.
- 시추정은 챕터 1~2 한정으로 3크기×2상태 조합이 완비되어, 재화(SV) 상태 UI 프로토타입에 바로
  쓸 수 있다.
- 크루 액션 시트 6장은 §5·§6에 적힌 대로 **원본 소재**로 취급할 것 — 슬라이싱 좌표를 직접 확인
  후 아틀라스에 편입할 것.
- `manifest.json`은 33 + 28 = 61장으로 갱신됨. `transparent: true`인 액션 시트/시추정은 마젠타
  크로마키 매팅 처리됨(08 문서 §5의 한계와 동일).

---

*상위: `docs/specs/deep-core-00-overview-and-gate.md`. 같은 계열: `deep-core-07-art-style-guide.md`,
`deep-core-08-asset-manifest-phase0-batch1.md`.*
