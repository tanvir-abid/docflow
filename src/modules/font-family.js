/**
 * Font Family Tool Module
 * Applies a font family to selected text via a dropdown.
 */
export const FontFamilyTool = {
  name: 'fontFamily',
  ariaLabel: 'Font family',

  _fonts: [
    { label: 'System UI',     value: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' },
    { label: 'Georgia',       value: 'Georgia, "Times New Roman", serif' },
    { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
    { label: 'Arial',         value: 'Arial, Helvetica, sans-serif' },
    { label: 'Courier New',   value: '"Courier New", Courier, monospace' },
    { label: 'Trebuchet MS',  value: '"Trebuchet MS", Tahoma, sans-serif' },
    { label: 'Impact',        value: 'Impact, "Arial Black", sans-serif' },
    { label: 'Tiro Bangla', value: '"Tiro Bangla", serif' },
    { label: 'Galada Bangla', value: '"Galada", cursive' },
    { label: 'Noto Sans Bengali', value: '"Noto Sans Bengali", sans-serif' },
  ],

  _savedRange: null,
  _select:     null,
  _editor:     null,   // stored so _getFontAtCursor can reach contentArea directly

  createButton(editor) {
    this._editor = editor;
    const wrapper = document.createElement('div');
    wrapper.className = 'rte-heading-wrapper';

    const select = document.createElement('select');
    select.className = 'rte-tool-select';
    select.dataset.tool = this.name;
    select.setAttribute('aria-label', this.ariaLabel);
    select.setAttribute('title', this.ariaLabel);
    select.style.minWidth = '120px';
    this._select = select;   // store so updateState() can read/set it

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Font';
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    this._fonts.forEach(({ label, value }) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      opt.style.fontFamily = value;
      select.appendChild(opt);
    });

    select.addEventListener('mousedown', () => {
      this._savedRange = this._saveRange();
    });

    select.addEventListener('change', (e) => {
      if (this._savedRange) this._restoreRange(this._savedRange);
      editor.contentArea.focus();
      this.execute(editor, e.target.value);
      // Don't reset to '' — updateState() will reflect the real value
    });

    wrapper.appendChild(select);
    return wrapper;
  },

  execute(editor, fontFamily) {
    document.execCommand('fontName', false, fontFamily);
    editor.syncToolbarState();
    editor.emitChange();
  },

  updateState() {
    if (!this._select) return;

    const detected = this._getFontAtCursor();

    // Cursor is outside the editor entirely — don't touch the select
    if (detected === null) return;

    const primaryFont = (s) =>
      s.replace(/['"]/g, '').split(',')[0].trim().toLowerCase();

    const detectedPrimary = primaryFont(detected);

    const matchIndex = this._fonts.findIndex(
      (f) => primaryFont(f.value) === detectedPrimary
    );

    if (matchIndex !== -1) {
      // +1 because index 0 in the <select> is the placeholder option
      this._select.selectedIndex = matchIndex + 1;
    } else {
      // Font not in our list (e.g. default editor font) — show placeholder.
      // Must use selectedIndex=0, NOT select.value='' — setting value to ''
      // on a disabled option silently fails in all browsers, leaving the
      // select frozen on whatever it last showed.
      this._select.selectedIndex = 0;
    }
  },

  // Returns the font-family string at the cursor, or null if the cursor
  // is outside the editor. Returns '' (empty string) when the cursor is
  // inside the editor but on text with no explicit font set.
  _getFontAtCursor() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;

    let node = sel.getRangeAt(0).startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;

    const contentArea = this._editor?.contentArea;
    if (!contentArea || !contentArea.contains(node)) return null;

    // Walk up from the cursor looking for the nearest ancestor that has
    // an explicit inline font-family. This is exactly what execCommand
    // sets (a <span style="font-family:..."> or <font face="...">).
    // Using getComputedStyle alone always returns a value (inherited from
    // the editor body) so we can't tell "explicitly set" from "default".
    let el = node;
    while (el && el !== contentArea) {
      const inlineFont = el.style?.fontFamily;
      if (inlineFont) return inlineFont;

      // execCommand('fontName') in some browsers produces <font face="...">
      const faceAttr = el.getAttribute?.('face');
      if (faceAttr) return faceAttr;

      el = el.parentElement;
    }

    // Cursor is inside the editor but on text with no explicit font —
    // return empty string so updateState() shows the placeholder.
    return '';
  },

  _saveRange() {
    const sel = window.getSelection();
    return sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
  },

  _restoreRange(range) {
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  },
};