# Recipe: edit with React

Mount one stable `EditProvider` above the editable surfaces. The provider
supplies an editor factory. Each active surface or `CodeView` item owns a
separate editor instance, cached by `editorOptions` object identity — an edit
session restarting with the same options object reuses its editor, and
simultaneously editable surfaces need distinct options objects.

To share one editor across surfaces, pass the same `editorOptions` object to
each of them: the cache then hands every surface the same instance. Instance
state — such as `persistState` records and their default `inMemory` storage —
survives surface remounts, so per-file selections and scroll positions restore
across file switches. Share an options object only where one surface is editable
at a time; simultaneously editable surfaces need distinct options objects.

## Contents

- [Edit a standalone file or diff](#edit-a-standalone-file-or-diff)
- [Keep annotations synchronized](#keep-annotations-synchronized)
- [Edit CodeView items](#edit-codeview-items)

## Edit a standalone file or diff

Set `edit` on `File`, `FileDiff`, `MultiFileDiff`, or `PatchDiff`. Pass editor
behavior through `editOptions`.

```tsx
import type { FileContents, FileDiffOptions } from '@pierre/diffs';
import { Editor, type EditorOptions } from '@pierre/diffs/edit';
import { EditProvider, MultiFileDiff, Virtualizer } from '@pierre/diffs/react';
import { useMemo, useRef, useState } from 'react';

const oldFile: FileContents = {
  name: 'src/value.ts',
  contents: 'export const value = 1;',
};
const initialNewFile: FileContents = {
  name: 'src/value.ts',
  contents: 'export const value = 2;',
};
const diffOptions: FileDiffOptions<undefined> = {
  theme: { light: 'pierre-light', dark: 'pierre-dark' },
  diffStyle: 'split',
};

function createEditor<LAnnotation>(options: EditorOptions<LAnnotation>) {
  return new Editor(options);
}

export function EditableDiff() {
  const [edit, setEdit] = useState(false);
  const [newFile, setNewFile] = useState(initialNewFile);
  const draftRef = useRef(newFile);
  const editorRef = useRef<Editor<undefined> | null>(null);
  const editOptions = useMemo<EditorOptions<undefined>>(
    () => ({
      onAttach(editor) {
        editorRef.current = editor;
      },
      onChange(file) {
        draftRef.current = file;
        saveDraft(file);
      },
    }),
    []
  );

  function toggleEdit() {
    if (edit) setNewFile(draftRef.current);
    setEdit((value) => !value);
  }

  return (
    <EditProvider createEditor={createEditor}>
      <button type="button" onClick={toggleEdit}>
        {edit ? 'Finish edit' : 'Edit'}
      </button>
      <button
        type="button"
        disabled={!edit}
        onClick={() => editorRef.current?.undo()}
      >
        Undo
      </button>
      <Virtualizer style={{ maxHeight: 480, overflow: 'auto' }}>
        <MultiFileDiff
          oldFile={oldFile}
          newFile={newFile}
          options={diffOptions}
          edit={edit}
          editOptions={editOptions}
        />
      </Virtualizer>
    </EditProvider>
  );
}
```

Mount the provider near the application root when many surfaces use edit mode.
Keep `createEditor` and `editOptions` stable. Use `onAttach` when controls need
`undo`, `redo`, `applyEdits`, selections, markers, focus, or other editor APIs.

## Keep annotations synchronized

The `onChange` callback can supply the complete current annotation collection.
Replace the application collection when the callback supplies a different array.
Use `isFileAnnotationCollection` or `isDiffAnnotationCollection` to narrow its
type.

Publish a changed React annotation array inside `flushSync`. This keeps its
coordinates aligned with the edited contents before paint. Store annotation UI
state by a stable metadata ID instead of a line number.

## Edit `CodeView` items

Wrap `CodeView` in the same `EditProvider`. Set `edit: true` on an item and
increment its `version`. Pass shared creation options through the `CodeView`
`editOptions` prop.

Use `onItemEditChange` for live contents and annotation changes. Use
`onItemEditComplete` to commit the final `file` or rebuild the `fileDiff`. In
the same item update, set `edit: false`, assign a fresh `cacheKey`, and
increment `version`.

Use the `CodeViewHandle.getEditor(id)` method for imperative editor commands.
The item editor keeps its document and history when virtualization removes the
item from the rendered window.

When a worker pool highlights an editable surface, set
`useTokenTransformer: true` in the worker `highlighterOptions`.
