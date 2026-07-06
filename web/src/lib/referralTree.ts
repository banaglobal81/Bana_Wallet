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
    )
    SELECT
      t.id, t.email, t.depth, t.line_root AS "lineRootId",
      COALESCE(
        (SELECT SUM(p.principal::numeric) FROM "StakePosition" p
         WHERE p."userId" = t.id AND p.status = 'ACTIVE'),
        0
      )::text AS "activeStake",
      COALESCE(
        (SELECT SUM(p.principal::numeric * p."dailyRatePct"::numeric / 100) FROM "StakePosition" p
         WHERE p."userId" = t.id AND p.status = 'ACTIVE'),
        0
      )::text AS "dailyInterest"
    FROM tree t
  `;
}
