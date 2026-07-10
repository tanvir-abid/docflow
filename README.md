# DocFlow

A lightweight, dependency-free rich-text editor you can drop into any page. No build step,
no framework required — a single ES module and a stylesheet.

**[Live demo →](./editor.html)**

## Features

- **Zero dependencies** — plain DOM APIs under the hood, works in any stack
- **30+ built-in tools** — text formatting, paragraph styles, tables, images, and more
- **Custom tools API** — register your own toolbar buttons at runtime
- **Single or split layout** — mount toolbar and content in one element or two
- **Light / dark / auto theming**
- **Selection toolbar** — a floating format menu appears on text selection
- **Word count status bar**
- **Keyboard shortcuts** for the most common actions

## Demo

`editor.html` in this repo is a complete example page (Bootstrap + Font Awesome for the
surrounding UI) that mounts the editor in split mode, walks through every tool group, and
includes a button to load sample content so you can try the tools without typing your own text.
Open it directly in a browser to see the editor running.

## Installation

DocFlow ships as a plain ES module — there's nothing to install or bundle.

1. Copy the `src/` folder (containing `docflow.js`, its `modules/` subfolder, and
   `editor.css`) into your project.
2. Link the stylesheet in your page's `<head>`:

   ```html
   <link rel="stylesheet" href="src/editor.css">
   ```

3. Import the editor in a `<script type="module">` block (or from your own bundler —
   Vite, Webpack, and esbuild all handle native ES modules without extra config):

   ```html
   <script type="module">
     import { DocFlowEditor } from './src/docflow.js';
   </script>
   ```

## Quick start

### Single-target mode

Point DocFlow at one element and it builds a wrapper containing the toolbar, the content
area, and (optionally) a status bar in place of it:

```html
<div id="editor"></div>

<script type="module">
  import { DocFlowEditor } from './src/docflow.js';

  const editor = new DocFlowEditor('#editor', {
    placeholder: 'Start writing…',
    onChange: (html) => console.log(html),
  });
</script>
```

### Split mode

Mount the toolbar and the content area in two different elements — useful when you want
the toolbar pinned in a header or sidebar, separate from the content:

```html
<div id="toolbar-slot"></div>
<div id="content-slot"></div>

<script type="module">
  import { DocFlowEditor } from './src/docflow.js';

  const editor = new DocFlowEditor(
    { toolbar: '#toolbar-slot', content: '#content-slot' },
    { placeholder: 'Start writing…' }
  );
</script>
```

An array works too: `new DocFlowEditor(['#toolbar-slot', '#content-slot'], config)`.

## Configuration

All options are passed as the second constructor argument and are optional.

| Option             | Type                    | Default             | Description |
|--------------------|-------------------------|----------------------|--------------|
| `tools`            | `string[] \| null`      | `null`               | Subset and order of tools to show. `null` shows every built-in tool in the default order. |
| `placeholder`      | `string`                | `'Start writing…'`   | Placeholder text shown in an empty content area. |
| `minHeight`        | `number`                | `297`                | Minimum content height, in millimeters. |
| `theme`            | `'light' \| 'dark' \| 'auto'` | `'light'`      | `'auto'` follows the OS/browser color-scheme preference. |
| `initialContent`   | `string`                | `''`                 | Initial HTML content. If omitted, whatever markup already sits inside the content target is used instead. |
| `showStatusBar`    | `boolean`               | `true`               | Show the word-count status bar beneath the content area. |
| `selectionToolbar`  | `boolean`              | `true`               | Show the floating format menu when text is selected. |
| `onChange`         | `(html: string) => void` | `null`              | Called on every content change with the current HTML. |
| `onToast`          | `(message: string) => void` | `null`          | Called when a tool (e.g. the selection toolbar) needs to show a brief notification. |

## Built-in tools

Pass an array to `tools` to show a specific subset, in a specific order. Any name not in the
list below (and not registered via `registerTool`, see below) is silently skipped.

**Utility** — `undoRedo`, `clearFormatting`, `findReplace`, `clipboard`, `dropCap`, `marginPresets`

**Text formatting** — `bold`, `italic`, `underline`, `strikethrough`, `inlineCode`, `textColor`,
`bgColor`, `highlight`, `fontSize`, `fontFamily`, `script`, `lineHeight`, `indent`, `textTransform`

**Paragraph** — `heading`, `blockquote`, `alignment`, `orderedList`, `unorderedList`, `checklist`,
`columns`

**Insert** — `link`, `horizontalRule`, `codeBlock`, `table`, `image`, `specialChars`, `emojiPicker`

```js
// Show only a minimal writing toolbar
const editor = new DocFlowEditor('#editor', {
  tools: ['undoRedo', 'bold', 'italic', 'underline', 'link', 'heading', 'unorderedList'],
});
```

## Creating a custom tool

A tool is a plain object with a `name`, a `createButton(editor)` method that returns the
element(s) to render in the toolbar, and an `execute()` method (DocFlow calls this for you
in some flows, but most tools wire their own click handlers inside `createButton` instead).
Register it with `editor.registerTool(...)`, and include its name in `tools` (or
`DEFAULT_TOOL_ORDER` when `tools` is `null`) so it actually renders.

```js
const wordCountTool = {
  name: 'wordCountToast',

  createButton(editor) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '🔢';
    btn.title = 'Show word count';

    btn.addEventListener('mousedown', (e) => {
      e.preventDefault(); // keep focus/selection inside the editor
      const words = editor.getText().trim().split(/\s+/).filter(Boolean).length;
      alert(`${words} words`);
    });

    return btn;
  },

  execute() {},
};

editor.registerTool(wordCountTool);
```

If a tool needs to reflect selection state (e.g. showing "active" when the cursor is on
bold text), add an `updateState(btnEl)` method — DocFlow calls it on every selection
change. If it attaches document-level listeners, add a `destroy()` method to clean them up.

## Public API

| Method                  | Description |
|-------------------------|--------------|
| `editor.getHTML()`      | Returns the current content as an HTML string. |
| `editor.setHTML(html)`  | Replaces the content. Does **not** fire `onChange` — call `editor.emitChange()` afterward if you need listeners to run. |
| `editor.getText()`      | Returns the current content as plain text. |
| `editor.clear()`        | Empties the content area. |
| `editor.focus()`        | Focuses the content area. |
| `editor.setTheme(theme)`| Switches between `'light'` and `'dark'` at runtime. |
| `editor.registerTool(tool)` | Adds a custom tool to the registry and re-renders the toolbar in place. |
| `editor.emitChange()`   | Manually fires the `onChange` callback and the `rte:change` event with the current HTML. |
| `editor.destroy()`      | Tears down the editor and restores the original markup of the target element(s). |

## Events

In addition to the `onChange` config callback, DocFlow dispatches a bubbling
`rte:change` custom event on its root element:

```js
document.querySelector('#editor').addEventListener('rte:change', (e) => {
  console.log(e.detail.html);
});
```

## Theming

Set `theme: 'light' | 'dark' | 'auto'` in the config, or call `editor.setTheme(...)` at
runtime. DocFlow applies a `data-theme` attribute and the `rte-editor` class to its root
element(s), so `editor.css` can scope its styles with selectors like
`.rte-editor[data-theme="dark"] { ... }`. Content height is controlled via the
`--rte-min-height` CSS variable, set automatically from the `minHeight` config option.

## Keyboard shortcuts

| Shortcut         | Action        |
|------------------|---------------|
| `Ctrl/Cmd + B`   | Bold          |
| `Ctrl/Cmd + I`   | Italic        |
| `Ctrl/Cmd + U`   | Underline     |
| `Ctrl/Cmd + K`   | Insert link   |
| `Ctrl/Cmd + Z`   | Undo          |
| `` ` ``          | Inline code   |

## Browser support

DocFlow relies on `contenteditable` and the (still widely supported, if legacy)
`document.execCommand` API, so it targets evergreen desktop and mobile browsers. It has not
been tested against IE.

## Project structure

```
src/
├── docflow.js            # DocFlowEditor class, tool registry, config
├── editor.css             # Toolbar, content area, and theme styles
└── modules/
    ├── selection-toolbar.js
    ├── panel-position.js
    ├── bold.js, italic.js, underline.js, ...  # one file per built-in tool
    └── ...
editor.html                # Live demo page
```

## Contributing

Issues and pull requests are welcome. If you're adding a new built-in tool, follow the
existing module shape in `src/modules/` (a `name`, `createButton(editor)`, `execute()`,
and optionally `updateState`/`destroy`) and register it in `BUILT_IN_TOOLS` and
`DEFAULT_TOOL_ORDER` inside `docflow.js`.

## License

MIT
