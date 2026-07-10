/**
 * Italic Tool Module
 * Toggles italic formatting on selected text.
 */
export const ItalicTool = {
  name: 'italic',
  label: 'Italic',
  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>`,
  shortcut: 'Ctrl+I',
  ariaLabel: 'Italic (Ctrl+I)',

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
      e.preventDefault();
      this.execute(editor);
    });

    return btn;
  },

  /**
   * Execute the italic command.
   * @param {Object} editor - The editor instance
   */
  execute(editor) {
    editor.contentArea.focus();
    document.execCommand('italic', false, null);
    editor.syncToolbarState();
    editor.emitChange();
  },

  /**
   * Check if italic is currently active at the selection.
   * @returns {boolean}
   */
  isActive() {
    return document.queryCommandState('italic');
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
