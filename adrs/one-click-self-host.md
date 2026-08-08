# A one-click self-host option in the README

## What I'd like to change

Add a "Deploy on InstaPods" button to the README, near Quick start or in Deploying, next to the
existing Vercel path. One line of markdown; it links to a page that provisions the whole stack.

## Why the current options leave a gap

Quick start assumes Bun, Docker and a terminal. Deploying assumes three Vercel deployments plus a
managed Postgres. Both are reasonable, and neither helps somebody who wants to *try* the CRM before
deciding whether to run it — the agent is the interesting part, and you cannot see it work from the
README.

The thing that made us notice is in your own copy. `.env.example` says Context "is the one key that
is asked for rather than configured: it lives in a row, the onboarding asks for it, and Settings →
General changes it afterwards, because a self-hoster's admin cannot redeploy to set an environment
variable." That is exactly the friction we build for. On a pod, environment variables are an edit
box and a restart, so a self-hoster's admin *can* change one without redeploying.

## What we did already, so you can judge it rather than take our word

We packaged the CRM as a one-click app on InstaPods and it is live:

https://app.instapods.com/dashboard/pods/create?app=crm

It builds from source at a pinned commit, runs all four processes on one machine — PostgreSQL 17,
the Nest API on Bun, the Next app, and the eve agent — behind one hostname with HTTPS. The Next
catch-all routes already proxy `/api/*` and `/eve/v1/*`, so nothing needed a second domain. Each pod
generates its own `BETTER_AUTH_SECRET` and `AGENT_BRIDGE_SECRET` at first boot, `ALLOWED_SIGN_IN`
starts locked to the deploying user's own address rather than open, and the agent stays stopped
until someone supplies `AI_GATEWAY_API_KEY`, per the rule in your `AGENTS.md` that a missing key
removes a capability instead of throwing.

Two things worth saying plainly. Sign-in is Google-only, so there is a five-minute stop in the Google
Cloud console after deploying — the OAuth client has to name the pod's own callback URL, which cannot
exist before the pod does. We show that URL and walk through it rather than letting people discover
it. And we track your `main`, not a tag, since there are no releases to pin to.

## What it would break

Nothing in the codebase — it is a README line and an image. The cost is editorial: it puts a vendor's
name in your README, and if our page is wrong or our hosting is down it reflects on you. Fair
objections. If you would rather not, that is a completely reasonable answer and the app stays
available either way.

## The offer

If you do want it, we pay 20% of the recurring revenue from anyone who signs up through your link,
for as long as they stay. We would put your referral code in the URL so it is attributed to you
rather than to us. No exclusivity, and nothing changes about the licence or the code.

Either way, we would rather you told us the page is wrong than left it wrong. Contact is
vikas@instapods.com.
