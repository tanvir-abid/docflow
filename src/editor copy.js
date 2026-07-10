// ─── Text Formatting ──────────────────────────────────────────────────────────
import { BoldTool }           from './modules/bold.js';
import { ItalicTool }         from './modules/italic.js';
import { UnderlineTool }      from './modules/underline.js';
import { StrikethroughTool }  from './modules/strikethrough.js';
import { InlineCodeTool }     from './modules/inline-code.js';
import { TextColorTool }      from './modules/text-color.js';
import { BgColorTool }        from './modules/bg-color.js';
import { FontSizeTool }       from './modules/font-size.js';
import { FontFamilyTool }     from './modules/font-family.js';
import { IndentTool }         from './modules/indent.js';
import { HighlightTool }        from './modules/highlight.js';
import { TextTransformTool }   from './modules/text-transform.js';

// ─── Paragraph Formatting ─────────────────────────────────────────────────────
import { HeadingTool }        from './modules/heading.js';
import { BlockquoteTool }     from './modules/blockquote.js';
import { AlignmentTool }      from './modules/alignment.js';
import { OrderedListTool }    from './modules/ordered-list.js';
import { UnorderedListTool }  from './modules/unordered-list.js';
import { ChecklistTool }      from './modules/checklist.js';
import { ColumnsTool }        from './modules/columns.js';
import { LineHeightTool }     from './modules/line-height.js';

// ─── Insert Tools ─────────────────────────────────────────────────────────────
import { LinkTool }           from './modules/link.js';
import { HorizontalRuleTool } from './modules/horizontal-rule.js';
import { CodeBlockTool }      from './modules/code-block.js';
import { TableTool }          from './modules/table.js';
import { ImageTool }          from './modules/image.js';
import {SpecialCharsTool}     from './modules/special-char.js';
import { EmojiPickerTool }    from './modules/emoji-picker.js';
import { ScriptTool }         from './modules/script-tools.js';

// ─── Utility Tools ────────────────────────────────────────────────────────────
import { UndoRedoTool }       from './modules/undo-redo.js';
import { ClearFormattingTool }from './modules/clear-formatting.js';
import { FindReplaceTool }    from './modules/find-replace.js';
import { ClipboardTool }      from './modules/clipboard.js';
import { DropCapTool }        from './modules/dropcap.js';
import { MarginPresetsTool }  from './modules/margin-presets.js';

// ─── Built-in tool registry ───────────────────────────────────────────────────
const BUILT_IN_TOOLS = {
  // Text formatting
  bold:             BoldTool,
  italic:           ItalicTool,
  underline:        UnderlineTool,
  strikethrough:    StrikethroughTool,
  inlineCode:       InlineCodeTool,
  textColor:        TextColorTool,
  bgColor:          BgColorTool,
  fontSize:         FontSizeTool,
  fontFamily:       FontFamilyTool,
  script:           ScriptTool,
  lineHeight:       LineHeightTool,
  indent:           IndentTool,
  highlight:        HighlightTool,
  textTransform:    TextTransformTool,
  // Paragraph
  heading:          HeadingTool,
  blockquote:       BlockquoteTool,
  alignment:        AlignmentTool,
  orderedList:      OrderedListTool,
  unorderedList:    UnorderedListTool,
  checklist:        ChecklistTool,
  columns:          ColumnsTool,
  // Insert
  link:             LinkTool,
  horizontalRule:   HorizontalRuleTool,
  codeBlock:        CodeBlockTool,
  table:            TableTool,
  image:            ImageTool,
  specialChars:     SpecialCharsTool,
  emojiPicker:      EmojiPickerTool,
  // Utility
  undoRedo:         UndoRedoTool,
  clearFormatting:  ClearFormattingTool,
  findReplace:      FindReplaceTool,
  clipboard:        ClipboardTool,
  dropCap:          DropCapTool,
  marginPresets:    MarginPresetsTool,
};

/**
 * Default toolbar order — edit this array to reorder, add, or remove tools
 * from the default "all tools" configuration. This is the source of truth
 * when no `tools` array is passed in config.
 *
 * To put undoRedo at the end instead, just move it to the bottom of the list.
 * Custom tools registered via registerTool() can also be added here by name.
 */
const DEFAULT_TOOL_ORDER = [
  // Utility first
  'undoRedo',
  // Text formatting
  'bold', 'italic', 'underline', 'strikethrough', 'inlineCode',
  'textColor', 'bgColor', 'highlight', 'fontSize', 'fontFamily', 'script', 'lineHeight', 'indent', 'textTransform',
  // Paragraph
  'heading', 'blockquote', 'alignment',
  'orderedList', 'unorderedList', 'checklist', 'columns',
  // Insert
  'link', 'horizontalRule', 'codeBlock', 'table', 'image', 'specialChars', 'emojiPicker',
  // Utility (rest)
  'clearFormatting', 'findReplace', 'clipboard', 'dropCap', 'marginPresets',
];

/**
 * Tools that get a divider injected AFTER them in the toolbar.
 * These mark logical group boundaries.
 */
const DIVIDER_AFTER = new Set([
  'undoRedo', 'fontFamily', 'highlight', 'heading', 'columns', 'checklist', 'codeBlock', 'table', 'image',
]);

// ─── Default configuration ────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  tools: null,          // null = all built-in tools in DEFAULT_TOOL_ORDER; array = specific subset in given order
  placeholder: 'Start writing…',
  minHeight: 297,
  onChange: null,       // callback(html: string)
  initialContent: '',
  theme: 'light',       // 'light' | 'dark' | 'auto'
  showStatusBar: true,  // set false to omit the word-count status bar
};



// ─── DocFlowEditor class ─────────────────────────────────────────────────────

export class DocFlowEditor {
  /**
   * @param {string|HTMLElement} target  - CSS selector or DOM element to replace
   * @param {Object}             config  - Editor configuration
   */
  constructor(target, config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this._toolInstances = [];
    this._customTools   = {};

    this._resolveTarget(target);
    this._buildTools();
    this._buildUI();
    this._attachKeyboardShortcuts();
    this._attachSelectionListener();

    if (this.config.initialContent) {
      this.setHTML(this.config.initialContent);
    }
  }

  // ── Target resolution ──────────────────────────────────────────────────────

  /**
   * Resolves the constructor's `target` argument into:
   *   - this.toolbarContainer  — element that will host the toolbar
   *   - this.contentContainer  — element that will host the content area
   *   - this._isSplit          — true when the two are different elements
   *
   * Accepted shapes for `target`:
   *   '#id' | element                          → single target (current behaviour)
   *   ['#toolbarId', '#contentId']             → split, via array
   *   [el]                                      → single target (1-item array)
   *   { toolbar: '#a', content: '#b' }         → split, via object
   */
  _resolveTarget(target) {
    const resolveEl = (t) => {
      if (t instanceof HTMLElement) return t;
      if (typeof t === 'string') return document.querySelector(t);
      return null;
    };

    let toolbarSpec;
    let contentSpec;

    if (Array.isArray(target)) {
      toolbarSpec = target[0];
      contentSpec = target.length > 1 ? target[1] : target[0];
    } else if (target && typeof target === 'object' && !(target instanceof HTMLElement) &&
               ('toolbar' in target || 'content' in target)) {
      toolbarSpec = target.toolbar ?? target.content;
      contentSpec = target.content ?? target.toolbar;
    } else {
      toolbarSpec = target;
      contentSpec = target;
    }

    this.toolbarContainer = resolveEl(toolbarSpec);
    this.contentContainer = resolveEl(contentSpec);

    if (!this.toolbarContainer) {
      throw new Error(`[DocFlowEditor] Toolbar target not found: ${toolbarSpec}`);
    }
    if (!this.contentContainer) {
      throw new Error(`[DocFlowEditor] Content target not found: ${contentSpec}`);
    }

    this._isSplit = this.toolbarContainer !== this.contentContainer;

    // Backward-compat alias used by destroy() in single-target mode.
    this.originalElement = this.toolbarContainer;

    // Initial content comes from whatever was already inside the content target.
    if (!this.config.initialContent) {
      const src = this.contentContainer;
      this.config.initialContent = src.tagName === 'TEXTAREA'
        ? src.value
        : src.innerHTML;
    }

    if (this._isSplit) {
      // Preserve original markup of both containers so destroy() can restore them.
      this._originalToolbarHTML = this.toolbarContainer.innerHTML;
      this._originalContentHTML = this.contentContainer.innerHTML;
    }
  }

  // ── Tool resolution ────────────────────────────────────────────────────────

  /**
   * Resolves the active tool list in order.
   *
   * - config.tools = null  → uses DEFAULT_TOOL_ORDER (all built-ins + any
   *                          registered custom tools already in the list)
   * - config.tools = [...] → uses that array exactly, preserving its order;
   *                          unknown keys are silently skipped
   *
   * In both cases the registry is checked so custom tools registered via
   * registerTool() are resolved correctly as long as their name appears in
   * the tools array (or DEFAULT_TOOL_ORDER).
   */
  _buildTools() {
    const allRegistry = { ...BUILT_IN_TOOLS, ...this._customTools };
    const keys = this.config.tools ?? DEFAULT_TOOL_ORDER;
    this._activeTools = keys.filter(k => allRegistry[k]).map(k => allRegistry[k]);
  }

  /**
   * Register an external tool module at runtime.
   * Call this before the editor is initialised, or call _buildTools() +
   * _buildUI() again to rebuild the toolbar.
   * @param {Object} toolModule
   */
  registerTool(toolModule) {
    if (!toolModule?.name) {
      console.warn('[DocFlowEditor] registerTool: module must have a .name');
      return;
    }
    this._customTools[toolModule.name] = toolModule;
  }

  // ── UI construction ────────────────────────────────────────────────────────

  _buildUI() {
    // Toolbar
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'rte-toolbar';
    this.toolbar.setAttribute('role', 'toolbar');
    this.toolbar.setAttribute('aria-label', 'Formatting toolbar');

    this._activeTools.forEach((tool, i) => {
      const btnEl = tool.createButton(this);
      this._toolInstances.push({ tool, btnEl });
      this.toolbar.appendChild(btnEl);

      // TABLE v2: append the companion edit button right after the insert button
      if (btnEl._editBtn) {
        this.toolbar.appendChild(btnEl._editBtn);
      }

      const isLast = i === this._activeTools.length - 1;
      if (!isLast && DIVIDER_AFTER.has(tool.name)) {
        const div = document.createElement('div');
        div.className = 'rte-toolbar-divider';
        div.setAttribute('aria-hidden', 'true');
        this.toolbar.appendChild(div);
      }
    });

    // Content area
    this.contentArea = document.createElement('div');
    this.contentArea.className = 'rte-content rte-content-area';
    this.contentArea.id = 'rte-content-area-id'
    this.contentArea.setAttribute('contenteditable', 'true');
    this.contentArea.setAttribute('role', 'textbox');
    this.contentArea.setAttribute('aria-multiline', 'true');
    this.contentArea.setAttribute('aria-label', 'Editor content area');
    this.contentArea.dataset.placeholder = this.config.placeholder;
    this.contentArea.spellcheck = true;

    // Status bar
    this.statusBar = document.createElement('div');
    this.statusBar.className = 'rte-statusbar';
    this.statusBar.setAttribute('aria-live', 'polite');
    this._wordCountEl = document.createElement('span');
    this._wordCountEl.setAttribute('aria-label', 'Word count');
    this._wordCountEl.textContent = '0 words';
    this.statusBar.appendChild(this._wordCountEl);

    if (this._isSplit) {
      // Split mode: mount the toolbar and content area into their own
      // targets, in place (no wrapping element to insert/replace).
      this.root = this.toolbarContainer;

      this.toolbarContainer.innerHTML = '';
      this.toolbarContainer.setAttribute('role', 'application');
      this.toolbarContainer.setAttribute('aria-label', 'Rich Text Editor toolbar');
      this.toolbarContainer.appendChild(this.toolbar);

      this.contentContainer.innerHTML = '';
      this.contentContainer.appendChild(this.contentArea);
      if (this.config.showStatusBar) {
        this.contentContainer.appendChild(this.statusBar);
      }
    } else {
      // Single-target mode (default): build one wrapper and replace the target.
      this.root = document.createElement('div');
      this.root.setAttribute('role', 'application');
      this.root.setAttribute('aria-label', 'Rich Text Editor');

      this.root.appendChild(this.toolbar);
      this.root.appendChild(this.contentArea);
      if (this.config.showStatusBar) {
        this.root.appendChild(this.statusBar);
      }

      this.toolbarContainer.replaceWith(this.root);
    }

    this._applyThemeAttributes(this._resolveTheme());

    this.contentArea.addEventListener('input', () => {
      this._updateWordCount();
      this.emitChange();
    });
    this._rewireExistingTables();
  }

  /**
   * Applies the `rte-editor` class, `data-theme`, and the
   * `--rte-min-height` CSS variable to whichever element(s) need them so
   * theme- and size-scoped CSS rules (e.g. `.rte-editor[data-theme="dark"] ...`)
   * keep working in both single and split target modes.
   */
  _applyThemeAttributes(theme) {
    const targets = this._isSplit
      ? [this.toolbarContainer, this.contentContainer]
      : [this.root];

    this._themeTargets = [...new Set(targets)];
    this._themeTargets.forEach(el => {
      el.classList.add('rte-editor');
      el.dataset.theme = theme;
      el.style.setProperty('--rte-min-height', `${this.config.minHeight}mm`);
    });
  }

  _resolveTheme() {
    if (this.config.theme === 'auto') {
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return this.config.theme;
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  _attachKeyboardShortcuts() {
    this.contentArea.addEventListener('keydown', (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      const shortcutMap = {
        b: 'bold',
        i: 'italic',
        u: 'underline',
        k: 'link',
        z: 'undoRedo',  // handled by undo/redo tool natively
      };

      const key = e.key.toLowerCase();
      if (key === 'b' || key === 'i' || key === 'u') {
        const match = this._toolInstances.find(t => t.tool.name === shortcutMap[key]);
        if (match) { e.preventDefault(); match.tool.execute(this); }
      }

      if (key === 'k') {
        const match = this._toolInstances.find(t => t.tool.name === 'link');
        if (match) {
          e.preventDefault();
          match.tool.execute(this, match.btnEl);
        }
      }

      // Backtick → inline code
      if (e.key === '`') {
        const match = this._toolInstances.find(t => t.tool.name === 'inlineCode');
        if (match) { e.preventDefault(); match.tool.execute(this); }
      }
    });
  }

  // ── Selection state sync ───────────────────────────────────────────────────

  _attachSelectionListener() {
    document.addEventListener('selectionchange', () => {
      const sel = window.getSelection();
      if (sel && this.contentArea.contains(sel.anchorNode)) {
        this.syncToolbarState();
      }
    });
    this.contentArea.addEventListener('keyup', () => this.syncToolbarState());
    this.contentArea.addEventListener('mouseup', () => this.syncToolbarState());
  }

  syncToolbarState() {
    this._toolInstances.forEach(({ tool, btnEl }) => {
      if (typeof tool.updateState === 'function') tool.updateState(btnEl);
    });
  }

  // ── Word count ─────────────────────────────────────────────────────────────

  _updateWordCount() {
    const text = this.contentArea.innerText || '';
    const count = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    this._wordCountEl.textContent = `${count} word${count !== 1 ? 's' : ''}`;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** @returns {string} Current HTML content */
  getHTML()  { return this.contentArea.innerHTML; }

  /** @param {string} html */
  setHTML(html) { this.contentArea.innerHTML = html; this._updateWordCount(); this._rewireExistingTables(); }

  _rewireExistingTables() {
    const tableTool = this._toolInstances.find(t => t.tool.name === 'table')?.tool;
    if (!tableTool) return;
    this.contentArea.querySelectorAll('table[data-rte-table]').forEach(table => {
      if (!table._rteDragAttached) {
        tableTool._attachDragSelection(this, table);
      }
      if (!table._rteClickSwitchAttached) {
        tableTool._attachTableClickSwitch(this, table);
      }
    });
  }

  /** @returns {string} Plain text content */
  getText()  { return this.contentArea.innerText; }

  clear()    { this.contentArea.innerHTML = ''; this._updateWordCount(); }
  focus()    { this.contentArea.focus(); }
  destroy() {
    if (this._isSplit) {
      this.toolbarContainer.innerHTML = this._originalToolbarHTML;
      this.toolbarContainer.classList.remove('rte-editor');
      delete this.toolbarContainer.dataset.theme;
      this.toolbarContainer.style.removeProperty('--rte-min-height');
      this.toolbarContainer.removeAttribute('role');
      this.toolbarContainer.removeAttribute('aria-label');

      this.contentContainer.innerHTML = this._originalContentHTML;
      this.contentContainer.classList.remove('rte-editor');
      delete this.contentContainer.dataset.theme;
      this.contentContainer.style.removeProperty('--rte-min-height');
    } else {
      this.root.replaceWith(this.originalElement);
    }
  }

  /** @param {'light'|'dark'} theme */
  setTheme(theme) {
    this.config.theme = theme;
    (this._themeTargets || []).forEach(el => { el.dataset.theme = theme; });
  }

  emitChange() {
    const html = this.getHTML();
    if (typeof this.config.onChange === 'function') this.config.onChange(html);
    this.root.dispatchEvent(new CustomEvent('rte:change', { bubbles: true, detail: { html } }));
  }
}

if (typeof window !== 'undefined') window.DocFlowEditor = DocFlowEditor;