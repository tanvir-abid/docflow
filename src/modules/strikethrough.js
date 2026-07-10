/**
 * Strikethrough Tool Module
 * Toggles strikethrough formatting on selected text.
 */
export const StrikethroughTool = {
  name: 'strikethrough',
  ariaLabel: 'Strikethrough (Ctrl+Shift+X)',
  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" y1="12" x2="20" y2="12"/></svg>`,

  createButton(editor) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rte-tool-btn';
    btn.dataset.tool = this.name;
    btn.setAttribute('aria-label', this.ariaLabel);
    btn.setAttribute('title', this.ariaLabel);
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = this.icon;
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); this.execute(editor); });
    return btn;
  },

  execute(editor) {
    editor.contentArea.focus();
    document.execCommand('strikeThrough', false, null);
    editor.syncToolbarState();
    editor.emitChange();
  },

  isActive() { return document.queryCommandState('strikeThrough'); },

  updateState(btn) {
    const active = this.isActive();
    btn.classList.toggle('rte-tool-active', active);
    btn.setAttribute('aria-pressed', String(active));
  },
};
