# Pattern Library — prisma-db-expert

Read on demand by `prisma-db-expert` only, when the current task's scope overlaps an entry below. See `CLAUDE.md` § Agent Self-Update Protocol for edit rules.

## `prisma migrate dev` in a non-interactive shell

`prisma migrate dev` always prompts "Are you sure you want to create and apply this migration?"
when it detects a possibly-destructive change (e.g. a new `@unique` constraint), and plain
`printf 'y\n' | script -q /dev/null prisma migrate dev` does **not** satisfy that prompt reliably —
it still cancels ("Migration cancelled."). What works: drive it through `expect`, e.g.
```
expect -c '
set timeout 60
spawn npx prisma migrate dev --name <name>
expect { "Are you sure" { send "y\r"; exp_continue } eof }
'
```
Still never use `--force` env hacks or `migrate reset` to route around the prompt — read the
warning first; it is telling you something real (e.g. a unique constraint that could fail on
existing duplicate data).

## Never edit an already-applied migration's `migration.sql`

Prisma stores each migration's checksum in `_prisma_migrations` at apply time. Editing the file
afterward (even just adding a comment) makes the next `prisma migrate dev` detect "modified after
it was applied" and refuse to proceed short of `prisma migrate reset` (forbidden). If you need to
record a decision/rationale that belongs conceptually to an already-applied migration (e.g. a
backfill-vs-leave-null call), write a **new, separate no-op migration** whose `migration.sql` is
comments only — apply it the normal way so it gets its own checksum. Don't retroactively touch a
committed migration file.
