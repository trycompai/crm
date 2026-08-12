# Editor API

This reference lists every export from `@pierre/diffs/edit` and every public
member of its classes.

## Exports

| Export                | Kind  | Purpose                                                   |
| --------------------- | ----- | --------------------------------------------------------- |
| `Editor`              | Class | Adds text editing to a `File` or `FileDiff` instance.     |
| `EditorChange`        | Type  | Describes one normalized editor change.                   |
| `EditorChangeEvent`   | Type  | Provides normalized edits and current document state.     |
| `EditorOptions`       | Type  | Configures history, state, selections, and callbacks.     |
| `TextDocument`        | Class | Stores text, positions, edits, search, and undo history.  |
| `TextDocumentChange`  | Type  | Describes the lines and characters changed by an edit.    |
| `IStateStorage`       | Type  | Defines asynchronous or synchronous editor state storage. |
| `PersistStateStorage` | Type  | Selects memory, IndexedDB, or custom state storage.       |
| `Position`            | Type  | Identifies a zero-based line and character.               |
| `Range`               | Type  | Identifies a start and end position.                      |
| `TextEdit`            | Type  | Replaces one range with new text.                         |

## `EditorOptions` fields

| Field                    | Purpose                                                  |
| ------------------------ | -------------------------------------------------------- |
| `historyMaxEntries`      | Limits the undo stack.                                   |
| `persistState`           | Keeps editor state for each file cache key.              |
| `persistStateStorage`    | Selects the state store.                                 |
| `roundedSelection`       | Controls rounded selection corners.                      |
| `matchBrackets`          | Controls matching-bracket highlights.                    |
| `autoSurround`           | Controls quote and bracket insertion around a selection. |
| `languageCommentConfig`  | Overrides comment tokens by language.                    |
| `enabledSelectionAction` | Enables the selection action surface.                    |
| `clipboard`              | Supplies a text clipboard reader.                        |
| `renderSelectionAction`  | Produces the selection action element.                   |
| `onAttach`               | Receives the editor and attached surface.                |
| `onChange`               | Receives file state, annotations, and a change event.    |
| `onFocus`                | Runs after the editor gains focus.                       |
| `onBlur`                 | Runs after the editor loses focus.                       |

## `Editor` members

| Member                              | Purpose                                                   |
| ----------------------------------- | --------------------------------------------------------- |
| `new Editor(options?)`              | Creates one editor.                                       |
| `edit(instance)`                    | Attaches to a file or diff and returns a detach function. |
| `setOptions(options)`               | Replaces editor options.                                  |
| `applyEdits(edits, updateHistory?)` | Applies programmatic text edits.                          |
| `canUndo`                           | Reports whether undo has an entry.                        |
| `canRedo`                           | Reports whether redo has an entry.                        |
| `undo()`                            | Reverts the latest edit.                                  |
| `redo()`                            | Reapplies the latest reverted edit.                       |
| `getFile()`                         | Gets the current file contents.                           |
| `getText()`                         | Gets the current text.                                    |
| `getState()`                        | Gets selections and view state.                           |
| `setState(state)`                   | Sets selections and view state.                           |
| `setSelections(selections)`         | Sets directed selection ranges.                           |
| `setMarkers(markers)`               | Sets diagnostic markers.                                  |
| `focus(options?)`                   | Focuses the editor.                                       |
| `blur()`                            | Removes editor focus.                                     |
| `cleanUp(recycle?)`                 | Releases editor resources.                                |

## `TextDocument` members

| Member                                               | Purpose                                               |
| ---------------------------------------------------- | ----------------------------------------------------- |
| `new TextDocument(uri, text, languageId?, version?)` | Creates a text document.                              |
| `uri`                                                | Gets the document identifier.                         |
| `languageId`                                         | Gets the language identifier.                         |
| `version`                                            | Gets the document version.                            |
| `lineCount`                                          | Gets the line count.                                  |
| `eol`                                                | Gets the line-ending sequence.                        |
| `canUndo`                                            | Reports whether undo has an entry.                    |
| `canRedo`                                            | Reports whether redo has an entry.                    |
| `positionAt(offset)`                                 | Converts an offset to a position.                     |
| `positionsAt(offsets)`                               | Converts several offsets to positions.                |
| `offsetAt(position)`                                 | Converts a position to an offset.                     |
| `getText(range?)`                                    | Gets all text or one range.                           |
| `getLineText(line, includeLineBreak?)`               | Gets one line.                                        |
| `normalizeEol(text)`                                 | Converts text to the document line ending.            |
| `getLineLength(line, includeLineBreak?)`             | Gets one line length.                                 |
| `charAt(offsetOrPosition)`                           | Gets one character.                                   |
| `getTextSlice(start, end)`                           | Gets text between two offsets.                        |
| `findNextNonOverlappingSubstring(needle, occupied)`  | Finds an unused substring range.                      |
| `search(params)`                                     | Finds text ranges.                                    |
| `applyEdits(edits, ...)`                             | Resolves and applies position-based edits.            |
| `resolveEdits(edits)`                                | Converts position-based edits to offset edits.        |
| `applyResolvedEdits(edits, ...)`                     | Applies offset-based edits.                           |
| `setLastUndoSelectionsAfter(selections)`             | Associates selections with the latest history entry.  |
| `setLastUndoLineAnnotations(before, after)`          | Associates annotations with the latest history entry. |
| `undo()`                                             | Reverts one document history entry.                   |
| `redo()`                                             | Reapplies one document history entry.                 |
| `normalizePosition(position)`                        | Clamps a position to the document.                    |

`IStateStorage` has `get(cacheKey)` and `set(cacheKey, state)` methods.
