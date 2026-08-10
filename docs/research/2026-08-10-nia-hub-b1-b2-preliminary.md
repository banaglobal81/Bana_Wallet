# Nia-Hub 운영자 크레딧 API 존재 여부 — 예비(비구속) 조사 (B-1/B-2)

> 대상 질의: `docs/specs/staking-payout-rail-prd.md` §5.1 (Nia-Hub 담당자 발송용 질의서 6개),
> `docs/specs/staking-yield-system-v2-prd.md` §4.4/§9(G-1′)에서 재확인된 동일 차단 항목.
> **본 조사는 참고용이며 권위 있는 답이 아니다.** 최종 답은 Nia-Hub 파트너사 확인으로만 확정된다.

## Summary

공개 웹 검색과 직접 접속 시도(WebSearch + WebFetch) 결과, **Nia-Hub / `niawallet.com`에 대한
공개 개발자 문서를 전혀 찾을 수 없었다.** `https://niawallet.com`과 `https://api.niawallet.com`은
DNS는 해석되지만 둘 다 **HTTP 403 Forbidden**을 반환했고(비인증 접근 자체가 차단됨),
`docs.niawallet.com` 같은 통상적인 문서 서브도메인은 존재하지 않았다(`ENOTFOUND`). 검색엔진에는
"niawallet.com"을 언급하는 결과가 단 하나도 없었다(회사 소개, 리뷰, 블로그, 포럼 언급 전무).
저장소 내 `.env.example` 주석("From the Nia-Hub Broker Dashboard after broker access is
approved")은 이 서비스가 **브로커 승인 후에만 접근 가능한 비공개 파트너 대시보드** 구조임을
시사하며, 이는 공개 문서가 애초에 존재하지 않을 가능성이 높다는 정황과 일치한다. 따라서
질문 1~6 전부 **공개 정보로는 답할 수 없음(Open Question)** 으로 확정하며, PRD가 이미 정한 대로
**사람이 파트너사에 직접 질의하는 것이 유일한 경로**라는 결론을 그대로 강화한다.

## Findings

- **F-1.** `web/src/lib/nia/config.ts:8`와 `.env.example:36`에 따르면 Nia-Hub의 API 베이스는
  `https://api.niawallet.com`이다. 이 값 자체는 저장소 코드에서 직접 확인된 사실이다(confidence:
  high, 출처: 저장소 내부 코드, 외부 링크 없음).
- **F-2.** `https://niawallet.com` 및 `https://api.niawallet.com`에 대한 비인증 GET 요청은 둘 다
  **HTTP 403 Forbidden**을 반환한다. 즉 도메인은 살아 있으나(DNS 해석 성공, 서버 응답 존재)
  익명 접근을 차단하고 있다. confidence: high(직접 확인, 2026-08-10). 다만 403이 "로그인 필요"
  때문인지 "봇/비브라우저 트래픽 차단" 때문인지, 아니면 둘 다인지는 이 조사로 구분할 수 없다.
- **F-3.** `docs.niawallet.com`은 DNS 자체가 존재하지 않는다(`ENOTFOUND`). 통상적인 개발자 문서
  서브도메인 관례(`docs.*`)로는 문서가 없다. confidence: high(직접 확인).
- **F-4.** 웹 검색("niawallet.com API documentation", `"Nia-Hub" OR "niawallet"`, `"niawallet.com"`
  단독, "Nia Wallet crypto custody B2B whitelabel API" 등 4개 쿼리)에서 **niawallet.com/Nia-Hub를
  언급하는 결과가 하나도 나오지 않았다.** 검색 결과는 전부 무관한 동명 도메인(NuaWallet, NeaWallet,
  NayaWallet 등 도메인 판매 페이지)이나 무관한 서비스(Nia AI, Niomon)였다. confidence: high(검색
  자체는 재현 가능하나, "결과 없음"이 "문서가 없다"는 것의 증명은 아니고 검색엔진 미색인의
  증명일 뿐임 — 아래 Contradictions 참고).
- **F-5.** `web/.env.example:32`의 주석: `"From the Nia-Hub Broker Dashboard after broker access
  is approved."` 이는 이 저장소 자체의 1차 자료이며, Nia-Hub가 **승인제 브로커 대시보드**를 운영함을
  시사한다. 공개 문서가 아니라 로그인 게이트 뒤에 API 키/문서가 있는 B2B 구조로 추정할 근거가
  된다(confidence: medium — 주석은 "키 발급처"를 설명할 뿐 "문서 접근 방식"을 명시하지는 않음).
- **F-6.** 저장소 코드(`web/src/app/api/nia/transfer/route.ts:29-34`)는 `POST
  /api/v1/wallets/transfer`가 `fromType`/`toType` 파라미터를 받는다는 것을 이미 구현·확인한
  상태이며, PRD §5.1 질의 2번의 각주("동일 사용자의 지갑 유형 간 이동만 지원")와 일치한다. 이는
  **공개 문서가 아니라 BANA 자체의 기존 통합 코드에서 나온 사실**이며, 새로운 발견이 아니라 PRD의
  기존 서술을 재확인한 것이다(confidence: high, 출처: 저장소 코드).
- **F-7.** `GET /api/v1/wallets?currency=BANA` 호출이 저장소에 존재한다는 것(PRD가 이미 지적)도
  재확인했으나, 이 엔드포인트가 **BANA를 실제 자산으로 취급해 잔고를 반환하는지**는 코드만으로는
  알 수 없다 — 호출 코드가 존재한다는 것은 "그렇게 가정하고 작성됐다"는 뜻일 뿐 응답 검증은
  아니다(PRD가 이미 명시한 gap, 신규 아님).

## Contradictions

- 없음. 모든 조사 경로(직접 접속, 서브도메인 추정, 검색엔진)가 **동일한 결론**(공개 문서 부재)으로
  수렴했다. 다만 "결과 없음"과 "존재하지 않음"은 논리적으로 다르다는 점은 아래 Open Questions에
  명시한다.

## Open Questions

PRD §5.1의 질의 6개는 **전부 미해소로 남는다.** 공개 정보로 답할 수 없었던 이유를 항목별로 남긴다.

1. **운영자→엔드유저 잔고 크레딧 API 존재 여부** — 공개 문서 부재로 확인 불가. 파트너사 확인만이
   경로.
2. **서명 스킴(있다면 기존 두 스킴 중 어느 쪽인지)** — 동일 이유로 확인 불가. `X-Api-Key` /
   `X-Nonce` / `X-Signature` 조합(Wallet/Settlement API 스킴)이 관례상 유력해 보이지만, 이는
   BANA가 **이미 연동한 13개 엔드포인트**에서 관찰된 패턴에서 유추한 것일 뿐, 크레딧 전용
   엔드포인트가 같은 스킴을 쓴다는 근거는 없다(추측이며 확인 아님).
3. **멱등키 지원 여부** — 확인 불가.
4. **BANA 자산 등록 여부** — 확인 불가. F-7 참고 (코드는 "등록되어 있다고 가정"하고 작성됨).
5. **트레저리 계정 개념 존재 여부** — 확인 불가.
6. **수수료/최소 단위/모호한 실패 시 조회(status) 엔드포인트** — 확인 불가.

**공개 문서 부재 자체의 확실성에 대한 메타 질문:** 검색엔진 무색인 + 403 응답은 "공개 문서가
없다"는 강한 정황이지만, 다음 두 가능성은 이 조사로 배제되지 않는다.
- (a) 문서가 **비표준 경로**(예: `partners.niawallet.com`, `broker.niawallet.com`, 별도 브랜드명)에
  있고 이번 조사에서 시도한 경로 목록에 없었을 가능성.
- (b) `niawallet.com`이 로그인 관문(gateway) 페이지만 공개 노출하고, 실제 API 레퍼런스는 승인된
  브로커 계정으로 로그인해야만 보이는 구조일 가능성(F-5와 가장 정합적인 가설).

이 두 가능성을 완전히 배제하려면 **BANA의 기존 Nia-Hub 담당자/영업 창구에게 "공개 개발자 포털
URL이 있는가"를 먼저 1문장으로 확인**하는 것이 파트너사 질의서 발송 전 가장 저비용의 다음
단계다. 그것이 "없다"로 확인되면 §5.1 질의서를 그대로 발송하면 된다.

## Sources

- `https://niawallet.com` — 직접 접속 시도, HTTP 403 Forbidden (조회일 2026-08-10)
- `https://api.niawallet.com` — 직접 접속 시도, HTTP 403 Forbidden (조회일 2026-08-10)
- `https://docs.niawallet.com` — 직접 접속 시도, DNS 미해석(ENOTFOUND) (조회일 2026-08-10)
- WebSearch: `niawallet.com API documentation` — 무관한 결과만 반환 (조회일 2026-08-10)
- WebSearch: `"Nia-Hub" OR "niawallet" wallet API developer docs` — 무관한 결과만 반환 (조회일 2026-08-10)
- WebSearch: `"niawallet.com"` — 무관한 결과만 반환 (조회일 2026-08-10)
- WebSearch: `"Nia Wallet" crypto custody B2B whitelabel API` — 무관한 결과만 반환 (조회일 2026-08-10)
- WebSearch: `"X-Api-Key" "X-Nonce" "X-Signature" wallet API HMAC crypto custody provider` — 일반적인 HMAC 패턴 설명만 반환, Nia-Hub 특정 정보 없음 (조회일 2026-08-10)
- 내부 1차 자료(외부 URL 아님, 대조용): `web/src/lib/nia/config.ts`, `web/.env.example`,
  `web/src/app/api/nia/transfer/route.ts`, `docs/architecture/nia-integration.md`,
  `docs/specs/staking-payout-rail-prd.md` §5, §5.1
