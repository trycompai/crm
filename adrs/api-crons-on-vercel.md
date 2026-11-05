# Four of the API's crons never run on Vercel

`apps/api/vercel.json` lists five crons. On our Vercel install only one was registered:
`/internal/sync/google` every five minutes, which is exactly what
`apps/api/scripts/build-func.mjs` writes into the Build Output `config.json`. Our `crm-api`
project's Root Directory is the repo root, because `build-func.mjs` writes to
`<repo>/.vercel/output`, so `apps/api/vercel.json` is never read. Rates, tracking retention
and archive prune don't run. Telemetry rollup also runs in-process, but on a serverless
function that's only as often as it boots.

It's worth a look at the Cron Jobs tab on your own `crm-api` project. If it shows one
entry, it's the same thing.

I'd have `build-func.mjs` copy the `crons` array from `apps/api/vercel.json` into
`config.json`, so the two can't drift. On a live install that means archive prune starts
deleting archived records older than the retention setting (180 days by default), and
tracking retention starts trimming old visits. That's what they're for, but it'll be the
first time they run, so it's worth a release note.
