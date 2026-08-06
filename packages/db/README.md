# `@crm/db`

PostgreSQL access for the monorepo: the Prisma schema, migrations, and a shared
`PrismaClient` instance.

## Usage

```ts
import { db } from "@crm/db";

const users = await db.user.findMany({ take: 10 });
```

Types and query helpers come from the same entrypoint:

```ts
import { Prisma, type User } from "@crm/db";
```

## Setup

```bash
docker compose up -d       # Postgres matching the DATABASE_URL in .env.example
cp .env.example .env       # at the repo root
bun run db:generate        # generate Prisma Client
bun run db:deploy          # apply the migrations
```

`DATABASE_URL` comes from the **repo-root `.env`**, loaded by `@crm/env` — see
[`docs/environment.md`](../../docs/environment.md). `src/client.ts` imports
`@crm/env/load` before reading it, and `prisma.config.ts` does the same so the
CLI works without any app running.

## Scripts

| Script        | Purpose                                                  |
| ------------- | -------------------------------------------------------- |
| `build`       | `prisma generate` — cached by Turborepo, runs via `^build` |
| `dev:prepare` | Apply pending local migrations, reject drift, and generate Prisma Client |
| `db:generate` | Regenerate Prisma Client                                 |
| `db:migrate`  | Create and apply a migration (development)               |
| `db:deploy`   | Apply pending migrations (CI / production)               |
| `db:push`     | Push the schema without a migration (prototyping only)   |
| `db:reset`    | Drop and recreate the database                           |
| `db:seed`     | Run `prisma/seed.ts`                                     |
| `db:studio`   | Open Prisma Studio                                       |

Each is also exposed at the repo root (`bun run db:migrate`) and routed through
`turbo run`.

The root `bun run dev` command runs `dev:prepare` before any service starts and
reruns it when the schema or migrations change. Services that hold a Prisma
client restart only after preparation finishes, so they cannot retain an older
generated model map.

## Notes

- **Prisma 7 + driver adapter.** There is no query engine binary; the client
  talks to PostgreSQL through `@prisma/adapter-pg`. See `src/client.ts`.
- **Generated code is not committed.** `prisma generate` writes to
  `src/generated/`, which is gitignored and declared as the `build` task's
  output so Turborepo caches it.
- **JIT package.** `exports` point at TypeScript sources; the consumer compiles
  them. Turbopack transpiles workspace packages automatically, so a Next.js app
  needs no `transpilePackages` entry. Non-bundler consumers need a TypeScript
  runtime — the NestJS API runs on Bun for exactly this reason.
- **Auth models are generated.** `User`, `Session`, `Account`, `Verification`
  and `RateLimit` come from `@better-auth/cli`. Do not hand-edit them — change
  the Better Auth config in `@crm/auth` and re-run `bun run auth:generate`.
  The generator is additive: it adds models and fields a plugin needs but never
  removes the ones a dropped plugin left behind, so removing a plugin means
  deleting its models from the schema by hand.
