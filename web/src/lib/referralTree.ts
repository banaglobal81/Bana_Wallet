import 'server-only';
import { prisma } from '@/lib/db';
import type { DownlineMember } from '@/lib/referralTreeMath';

// Referral-tree traversal (Phase B backbone). Reads the tree + active stakes from
// the DB; the pure structural math (generations, lines, 대/소실적) lives in
// referralTreeMath.ts. NO commission math here.
export type { DownlineMember } from '@/lib/referralTreeMath';
export {
  summarizeLines, bigSmallLeg, summarizeGenerations, directReferralCount,
  type LineSummary, type GenerationSummary,
} from '@/lib/referralTreeMath';

// All descendants of rootId, with generation depth, their line, and active stake.
//
// CUT-5 (PRD rev05 §6.1, P-28): reads StakePositionV2 (baseDailyRatePct), NOT the
// legacy v1 StakePosition table. The settlement engine cut over to V2 in CUT-3, so
// v1 positions never receive new rows post-cutover — reading v1 here would silently
// return 0 for every user (no error), zeroing out referral commissions.
//
// Deferred (V2-BAND, undecided): whether the band bonus (maxBonusPctOfBase /
// bonusAmount) counts toward referral volume. dailyInterest below is base-rate-only
// (principal × baseDailyRatePct / 100) — it does NOT add any band bonus. This is a
// no-op today since V2-CORE never issues a nonzero bonus, but will need revisiting
// once V2-BAND ships a real bonus.
export async function getDownline(rootId: string): Promise<DownlineMember[]> {
  return prisma.$queryRaw<DownlineMember[]>`
    WITH RECURSIVE tree AS (
      SELECT id, email, "referredById", 1 AS depth, id AS line_root
      FROM "User"
      WHERE "referredById" = ${rootId}
      UNION ALL
      SELECT u.id, u.email, u."referredById", t.depth + 1, t.line_root
      FROM "User" u
      JOIN tree t ON u."referredById" = t.id
      -- Depth cap: the tree is acyclic today (referredById is set once at signup),
      -- but this bounds recursion so a future re-parent that introduced a cycle
      -- can't spin forever and take down the settlement job.
      WHERE t.depth < 100
    )
    SELECT
      t.id, t.email, t.depth, t.line_root AS "lineRootId",
      COALESCE(
        (SELECT SUM(p.principal::numeric) FROM "StakePositionV2" p
         WHERE p."userId" = t.id AND p.status = 'ACTIVE'),
        0
      )::text AS "activeStake",
      COALESCE(
        (SELECT SUM(p.principal::numeric * p."baseDailyRatePct"::numeric / 100) FROM "StakePositionV2" p
         WHERE p."userId" = t.id AND p.status = 'ACTIVE'),
        0
      )::text AS "dailyInterest"
    FROM tree t
  `;
}
