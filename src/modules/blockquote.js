/**
 * Blockquote Tool Module
 * Toggles a <blockquote> wrapper on the current block.
 */
export const BlockquoteTool = {
  name: 'blockquote',
  ariaLabel: 'Blockquote',
  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>`,

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
    if (this.isActive()) {
      document.execCommand('formatBlock', false, '<p>');
    } else {
      document.execCommand('formatBlock', false, '<blockquote>');
    }
    editor.syncToolbarState();
    editor.emitChange();
  },

  isActive() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    let node = sel.anchorNode;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentNode;
    return !!node?.closest?.('blockquote');
  },

  updateState(btn) {
    const active = this.isActive();
    btn.classList.toggle('rte-tool-active', active);
    btn.setAttribute('aria-pressed', String(active));
  },
};
