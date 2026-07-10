/**
 * Bold Tool Module
 * Toggles bold formatting on selected text.
 */
export const BoldTool = {
  name: 'bold',
  label: 'Bold',
  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>`,
  shortcut: 'Ctrl+B',
  ariaLabel: 'Bold (Ctrl+B)',

  /**
   * Create and return the toolbar button element.
   * @param {Object} editor - The editor instance
   * @returns {HTMLElement}
   */
  createButton(editor) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rte-tool-btn';
    btn.dataset.tool = this.name;
    btn.setAttribute('aria-label', this.ariaLabel);
    btn.setAttribute('title', this.ariaLabel);
    btn.innerHTML = this.icon;

    btn.addEventListener('mousedown', (e) => {
      e.preventDefault(); // preserve selection
      this.execute(editor);
    });

    return btn;
  },

  /**
   * Execute the bold command.
   * @param {Object} editor - The editor instance
   */
  execute(editor) {
    editor.contentArea.focus();
    document.execCommand('bold', false, null);
    editor.syncToolbarState();
    editor.emitChange();
  },

  /**
   * Check if bold is currently active at the selection.
   * @returns {boolean}
   */
  isActive() {
    return document.queryCommandState('bold');
  },

  /**
   * Update button active state based on current selection.
   * @param {HTMLElement} btn
   */
  updateState(btn) {
    const active = this.isActive();
    btn.classList.toggle('rte-tool-active', active);
    btn.setAttribute('aria-pressed', String(active));
  },
};
