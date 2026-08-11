# 진행 상황

- [x] rev05 §3.2 CP-3 / §4.5 CP-7′ / §4.6 CP-10 / §5.1 / §5.2 정독
- [x] `staking-auto-renew-assumption-ruling.md` 정독 (레거시 9단 판정 사다리, M-3, R-3, A4/A5)
- [x] 코드 실측 — `lib/stakingV2.ts`(`maturePositionV2`, `sendMaturityRemindersV2`),
      `api/staking/positions/[id]/auto-renew/route.ts`, `schema.prisma:596-665`,
      `messages/en.json`(autoRenew 카피 · 이메일 카피), `api/admin/staking/products/route.ts`
- [x] 핵심 발견 3건 확정 (V-1 스펙 충돌 / V-3 CP-10 산식 파괴 / V-4 만기 리마인더 이메일 활성)
- [x] 판정문 작성 — `docs/specs/staking-v2-auto-renew-cutover-ruling.md`
- [x] 부모 에이전트 보고

## 결론
**② 연기 — 단, "요청만 받고 거부"로는 불충분.** 요구 R-AR-1~R-AR-7.
**T-7은 착수 가능** (R-AR-1/R-AR-2가 같은 배포 또는 그 이전에 들어가는 조건).
