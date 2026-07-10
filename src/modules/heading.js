/**
 * Heading Tool Module
 * Applies heading levels (H1–H4) or paragraph to selected block.
 * Renders as a dropdown in the toolbar.
 */
export const HeadingTool = {
  name: 'heading',
  label: 'Heading',
  ariaLabel: 'Paragraph style',

  _levels: [
    { value: 'p',  label: 'Paragraph', tag: 'p' },
    { value: 'h1', label: 'Heading 1',  tag: 'h1' },
    { value: 'h2', label: 'Heading 2',  tag: 'h2' },
    { value: 'h3', label: 'Heading 3',  tag: 'h3' },
    { value: 'h4', label: 'Heading 4',  tag: 'h4' },
  ],

  /**
   * Create and return the toolbar dropdown element.
   * @param {Object} editor - The editor instance
   * @returns {HTMLElement}
   */
  createButton(editor) {
    const wrapper = document.createElement('div');
    wrapper.className = 'rte-heading-wrapper';

    const select = document.createElement('select');
    select.className = 'rte-tool-select';
    select.dataset.tool = this.name;
    select.setAttribute('aria-label', this.ariaLabel);
    select.setAttribute('title', this.ariaLabel);

    this._levels.forEach(({ value, label }) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      select.appendChild(opt);
    });

    select.addEventListener('mousedown', () => {
      // Save selection before dropdown steals focus
      this._savedRange = this._saveRange();
    });

    select.addEventListener('change', (e) => {
      e.preventDefault();
      if (this._savedRange) {
        this._restoreRange(this._savedRange);
      }
      editor.contentArea.focus();
      this.execute(editor, e.target.value);
    });

    wrapper.appendChild(select);
    this._select = select;
    return wrapper;
  },

  /**
   * Execute heading/paragraph format.
   * @param {Object} editor - The editor instance
   * @param {string} level - 'p' | 'h1' | 'h2' | 'h3' | 'h4'
   */
  execute(editor, level) {
    const tag = level === 'p' ? 'p' : level;
    document.execCommand('formatBlock', false, `<${tag}>`);
    this._stripInlineStyles(editor.contentArea);
    editor.syncToolbarState();
    editor.emitChange();
  },

  /**
   * Detect the heading level of the current block.
   * @returns {string} e.g. 'h1', 'h2', 'p'
   */
  getActiveLevel() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return 'p';
    let node = sel.anchorNode;
    while (node && node.nodeType !== Node.ELEMENT_NODE) {
      node = node.parentNode;
    }
    if (!node) return 'p';
    const tag = node.tagName ? node.tagName.toLowerCase() : 'p';
    const valid = this._levels.map(l => l.value);
    return valid.includes(tag) ? tag : 'p';
  },

  /**
   * Update dropdown selected value based on current selection.
   * @param {HTMLElement} wrapper
   */
  updateState(wrapper) {
    const select = wrapper.querySelector('.rte-tool-select');
    if (!select) return;
    const active = this.getActiveLevel();
    select.value = active;
  },

  /** Save the current selection range */
  _saveRange() {
    const sel = window.getSelection();
    return sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
  },

  /** Restore a previously saved range */
  _restoreRange(range) {
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  },

  /**
   * Strip browser-injected inline font-size and font-family from every element
   * inside the content area. execCommand('formatBlock') can leave these behind,
   * causing them to override CSS-defined heading sizes.
   * @param {HTMLElement} contentArea
   */
  _stripInlineStyles(contentArea) {
    if (!contentArea) return;
    contentArea.querySelectorAll('*').forEach((el) => {
      el.style.removeProperty('font-size');
      el.style.removeProperty('font-family');
    });
  },
};