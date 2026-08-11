# T-16 관리자 크레딧 FRD — `pm` 판정 (E-1 ~ E-5)

> 작성: `pm` · 2026-08-11
> 대상: `docs/specs/staking-yield-system-v2-design-t16-admin-credit-frd.md` §13
> 구속 문서: `docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md` §4A

## 왜

`product-planner`가 T-16 FRD를 쓰면서 rev05 §4A의 문언만으로는 결정할 수 없는 5건을
`pm`으로 올렸다. 그중 **E-3은 rev05 §4A에 존재하지 않는 통제 공백**이다 —
`balanceAuthority = HUB`인 코인에 관리자 크레딧을 발행하면, 준비금 대시보드가
`HUB_COIN_HAS_LOCAL_BALANCE`로 경보하는 상태를 **관리자가 버튼 한 번으로 제조**할 수 있다.
코드 실측으로 확인했다:

- `web/src/lib/localLedger.ts` — `balanceAuthority`를 **한 번도 읽지 않는다**(grep 0건).
  `ADMIN_ADJUSTMENT_*`는 발행 게이트(Step 0~2)에서 제외돼 있으므로 권위 검사도 타지 않는다.
- `web/src/app/api/admin/solvency/route.ts:261-278` — HUB 권위 코인의
  `Σ UserCoinBalance.balance ≠ 0`이면 즉시 `HUB_COIN_HAS_LOCAL_BALANCE` 인시던트.
- `web/src/lib/coinAuthority.ts:333-398` — `changeAuthorityDirectly`는 **잔고 총합이 0일 때만**
  권위를 뒤집는다. 즉 이 인시던트가 한 번 생기면 빠른 되돌림 경로가 닫힌다(5단계 전이 절차행).

즉 E-3은 "있으면 좋은 제약"이 아니라 **비가역에 가까운 상태를 만드는 경로**를 막는 것이다.

## 무엇이 바뀌는가 (문서만)

| 파일 | 변경 |
|---|---|
| `docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md` | §4A.9 신설 — **AC-15**(코인 권위 제약) · **AC-16**(T2 사유 제한) 추가. §4A.6 **AC-10 문언 정정**(순증 부호별 문구 분리). §4A.7 **AC-13 명확화**(403 대상은 변경 라우트, 페이지 GET은 200+DISABLED). §10에 **미해결 31** 추가 |
| `docs/specs/staking-yield-system-v2-design-t16-admin-credit-frd.md` | §13에 **§13.1 `pm` 판정** 신설(E-1~E-5 전건 판정). §3.3 · §6-V7 · §7 에러표 · §10 AC 목록에 판정 반영 |

**코드 변경 0줄. 마이그레이션 0건.** 구현은 T-17(`web-shared-expert`) · T-18(`web-admin-expert`),
배포는 T-19(`wallet-security-expert`) 리뷰 통과 후(rev05 AC-14, 이 문서가 그 게이트를 풀지 않는다).

## 판정 요지

| # | 판정 | 요지 |
|---|---|---|
| **E-1** | **승인** | 메뉴는 은닉(AC-13 ⓑ 불변), 페이지는 200+`DISABLED`. 충돌 아님 — 은닉 대상은 액션 진입점, 노출 대상은 이미 발행된 금액. rev05 AC-13 ⓐ의 403은 **변경 라우트(POST)**에 걸린다는 점을 문언으로 고정 |
| **E-2** | **수정 승인** | T2에서 조정을 통째로 막지 않는다(정정 도구 = 인시던트 탈출 수단). **단 CREDIT은 `RECONCILIATION_FIX` 사유로만 허용**, DEBIT은 무제한 허용. `E2E_VERIFICATION`/`INCIDENT_COMPENSATION`/`OTHER` 크레딧은 T2 해제 후 → **AC-16** |
| **E-3** | **승인(원안 그대로)** | `balanceAuthority='LOCAL'` 코인만 조정 가능. **CREDIT·DEBIT 양방향 모두** 제한. 신규 코드 `ADMIN_CREDIT_COIN_NOT_LOCAL` 승인 → **AC-15**. LL-9 인시던트의 정정 경로는 이 화면이 아니라 권위 전이 절차(미해결 31) |
| **E-4** | **수정 승인** | 멱등키 필수화 승인. **단 "같은 키 + 다른 파라미터"를 조용히 리플레이로 처리하지 않는다** — `localLedger.ts:154-161`은 현재 파라미터를 비교하지 않고 기존 행을 반환한다. 서버가 저장된 요청과 대조해 불일치면 거부 |
| **E-5** | **승인 + 상위 문언 정정** | 음수도 "무언가를 렌더한다"에 포함되나 **문구는 달라야 한다**. rev05 AC-10의 *"≠0 → 크레딧이 포함되어 있습니다"* 문언을 4상태로 정정 |

## 하지 않는 것

- 킬 스위치를 켜지 않는다(`adminCreditEnabled = false` 유지).
- 한도 3종 초기값을 확정하지 않는다(Q-M10 마스터 미회신 — `null` = 잠김이므로 안전).
- AC-8(4-eyes) 판정을 바꾸지 않는다.
- `web/src/` 어떤 파일도 편집하지 않는다.
