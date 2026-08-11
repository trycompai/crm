---
name: diffs
description:
  Use when an app uses @pierre/diffs to render or edit code files, diffs,
  patches, merge conflicts, or CodeView review surfaces, including React,
  vanilla JavaScript, SSR, workers, annotations, selection, and custom Shiki
  languages or themes.
---

# `@pierre/diffs`

Use `@pierre/diffs` to render syntax-highlighted files and diffs. Use its
optional editor, SSR, and worker entries for those capabilities.

## Install

```bash
pnpm add @pierre/diffs
```

Install `react` and `react-dom` when the app uses the React entry.

## Select an API reference

| Surface               | Reference                              |
| --------------------- | -------------------------------------- |
| `@pierre/diffs/react` | [React API](references/api-react.md)   |
| `@pierre/diffs/edit`  | [Editor API](references/api-editor.md) |

## Select a recipe

| Task                               | Recipe                                             |
| ---------------------------------- | -------------------------------------------------- |
| Render a file or diff in React     | [Render with React](references/recipe-react.md)    |
| Build a virtualized review surface | [Use CodeView](references/recipe-code-view.md)     |
| Edit a React surface or CodeView   | [Edit with React](references/recipe-edit-react.md) |

## Not vendored here

These references were not copied into this skill. There is no local file for
them. Read the package types and the upstream documentation instead.

- Core API: root components, parsing, and file extension APIs.
- Highlighting API: languages, themes, highlighter state, and streams.
- Low-level rendering API: renderers, managers, DOM helpers, and constants.
- Shared types: data, option, render, selection, and editor types.
- SSR API for `@pierre/diffs/ssr`, and the recipe for preloading server markup.
- Worker API for `@pierre/diffs/worker`, and the recipe for a worker pool.
- Recipes for vanilla JavaScript rendering and vanilla editing.
- Recipes for line annotations and selection.
- Recipe for registering a custom Shiki language or theme.
