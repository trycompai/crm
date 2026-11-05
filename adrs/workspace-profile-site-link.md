# The workspace profile can't open the workspace's own website

On a fresh install the workspace profile never gets written. Onboarding queues the
`workspace-profile` task, the agent runs, and it stops without calling
`write_workspace_profile`.

The session is told to read our site with `web_fetch` (`apps/agent/agent/lib/preamble.ts`).
That instruction is system-role (`instructions/task.ts`), and `webFetchAllowed` in
`lib/web-policy.ts` only accepts links that appear in user messages. The user message for
this task is the fixed text from `work("workspace-profile")` in `lib/dispatch.ts`, which has
no link in it. So every fetch is refused with "That URL is not user-linked or approved
documentation", the `web_search` tool refuses every call anyway, and the profile stays
empty. The sign-in sweep tries again after seven days and hits the same wall.

It matters because every other session opens with that profile. Without it the agent is
told not to guess what we sell.

I'd let `webFetchAllowed` accept the workspace's own website and the pages under it, using
the same `websiteUrl()` the preamble already builds. That opens one site the operator typed
in themselves, so I can't see what it breaks. Putting the full https link in the task's
message would also work, but it only covers the home page, not the pricing or product page
the preamble asks for. Happy to send the change if you'd like it.
