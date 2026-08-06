@AGENTS.md


## Median Tasks

Median can use a project-local workspace binding. If this repository has
`.median/config.json`, run `mdn` commands from inside this repository so the
correct Median workspace profile is selected. The local config stores only a
profile name; API keys stay in your user config.

To bind this repository to a workspace:

```
mdn setup --local
```

Before starting work, check your assigned tasks:

```
mdn tasks --agent <your-agent-name>
```

When picking up a task:

```
mdn status <TASK-CODE> in_progress --agent <your-agent-name>
```

When completing a task:

```
mdn status <TASK-CODE> ready --agent <your-agent-name>
```

To create a new task:

```
mdn create --title "Description" --status todo --priority medium --agent <your-agent-name>
```

## Commit Messages & Pull Requests

Always include the Median task ID in commit messages and PR titles so tasks get marked automatically.

```
git commit -m "MDN-42 fix: resolve auth token expiry"
```

For pull requests, include the task ID in the title:

```
MDN-42 fix: resolve auth token expiry
```
