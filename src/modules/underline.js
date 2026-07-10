/**
 * Underline Tool Module
 * Toggles underline formatting on selected text.
 */
export const UnderlineTool = {
  name: 'underline',
  label: 'Underline',
  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" y1="20" x2="20" y2="20"/></svg>`,
  shortcut: 'Ctrl+U',
  ariaLabel: 'Underline (Ctrl+U)',

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
   * Execute the underline command.
   * @param {Object} editor - The editor instance
   */
  execute(editor) {
    editor.contentArea.focus();
    document.execCommand('underline', false, null);
    editor.syncToolbarState();
    editor.emitChange();
  },

  /**
   * Check if underline is currently active at the selection.
   * @returns {boolean}
   */
  isActive() {
    return document.queryCommandState('underline');
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
