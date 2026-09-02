---
description: Use when a deal closes won and the customer needs a shared Slack channel — the order the steps must run in, and what to do while you wait for a person.
---

# Onboarding a customer into Slack

A deal closed won. The customer needs one place to talk to us. That place is a
Slack channel they can reach from their own workspace, which means Slack
Connect, which means somebody on their side has to accept an invitation before
anything else can happen.

That wait is the whole shape of this job. You do not finish this work in one
turn, and you must not try.

## The order is fixed

1. `open_slack_channel` — name it after the customer, in plain words. This also
   makes the run watch the channel, so anything said in it comes back to you.
2. `invite_to_slack_channel` — the buyer, and anybody on our side who owns the
   account.
3. Stop and wait.

Step 1 is first because it is what makes steps 2 and 3 possible. A channel you
did not open with this tool is a channel this run does not watch, so nobody's
reply will ever reach you.

## Waiting is the work, not a failure

When you have sent the invitations, say what you did and end your turn. Do not
poll, do not schedule a recheck, and do not report the onboarding as finished.

The run parks. When the customer joins, or anybody writes in that channel, or
somebody mentions you there, the run wakes up with the message and you carry on
from where you stopped. You keep everything you already knew.

A person can take a day to accept a Slack Connect invitation. That is normal and
it is not a problem to solve.

## When you wake up

You are told what happened: somebody joined, or somebody said something. Read it
and decide whether it needs you.

- **Somebody joined** — greet them by name in the channel, say who we are and
  what happens next. Then stop again.
- **Somebody wrote** — answer if you can, and stop. If it needs a person on our
  side, say so in the channel and name them.
- **Nothing needs doing** — stop without posting. An agent that speaks every time
  a channel moves is an agent people mute.

## What goes wrong, and what it means

- **`open_slack_channel` gives back a channel that already exists.** Somebody ran
  this before, or the deal reopened and closed again. Use it. Do not invent a
  second name to get a fresh channel.
- **`invite_to_slack_channel` gives back a `refused` list.** Some addresses went
  and some did not. `invited` holds the ones that went; `refused` holds an entry
  per address, each with the address and a `reason`. Read every reason. "Slack is
  not connected" and "This workspace doesn't let Comp AI send that invitation"
  both need a person, and neither is fixed by trying again. Carry on with the
  people in `invited`, and say plainly who is still outside and why.
- **The same call comes back with `replayed: true`.** You already made it. A
  replay carries `result` only, so `invited` and `refused` are absent. Do not
  read them, and do not invite anybody again to find out who got in.
- **`invite_to_slack_channel` fails outright.** Nobody was invited, so the tool
  errors instead of returning. Read the error text: it holds each refusal reason
  when Slack refused, and it names a different fault — no channel yet, or a run
  that stopped — when Slack was never asked. Nobody is in the channel either way.
  Do not retry a fault a person has to clear.
- **`watching: false`.** This run already watches a different channel, so replies
  in the new one will never reach you. Say so plainly rather than waiting for a
  message that cannot arrive.
