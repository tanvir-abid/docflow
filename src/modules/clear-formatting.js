/**
 * Clear Formatting Tool Module
 * Strips all inline formatting from the selected text.
 */
export const ClearFormattingTool = {
  name: 'clearFormatting',
  ariaLabel: 'Clear formatting',
  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/><line x1="17" y1="17" x2="22" y2="22" stroke-width="2.5"/><line x1="22" y1="17" x2="17" y2="22" stroke-width="2.5"/></svg>`,

  createButton(editor) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rte-tool-btn';
    btn.dataset.tool = this.name;
    btn.setAttribute('aria-label', this.ariaLabel);
    btn.setAttribute('title', this.ariaLabel);
    btn.innerHTML = this.icon;
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); this.execute(editor); });
    return btn;
  },

  execute(editor) {
    editor.contentArea.focus();
    document.execCommand('removeFormat', false, null);
    // Also strip block-level formatting
    document.execCommand('formatBlock', false, '<p>');
    editor.syncToolbarState();
    editor.emitChange();
  },

  updateState() {},
};
