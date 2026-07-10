/**
 * Inline Code Tool Module
 * Wraps selected text in a <code> element.
 * Uses execCommand insertHTML for reliability across browsers.
 */
export const InlineCodeTool = {
  name: 'inlineCode',
  ariaLabel: 'Inline code (Ctrl+`)',
  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,

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
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);

    // Check if selection is already inside a <code>
    let node = range.commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    const existingCode = node.closest?.('code');

    if (existingCode) {
      // Unwrap: replace <code> with its text content
      const parent = existingCode.parentNode;
      while (existingCode.firstChild) {
        parent.insertBefore(existingCode.firstChild, existingCode);
      }
      parent.removeChild(existingCode);
    } else {
      const selected = range.extractContents();
      const code = document.createElement('code');
      code.appendChild(selected);
      range.insertNode(code);

      // Move cursor after code element
      const newRange = document.createRange();
      newRange.setStartAfter(code);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }

    editor.syncToolbarState();
    editor.emitChange();
  },

  isActive() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    let node = sel.anchorNode;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentNode;
    return !!node?.closest?.('code');
  },

  updateState(btn) {
    const active = this.isActive();
    btn.classList.toggle('rte-tool-active', active);
    btn.setAttribute('aria-pressed', String(active));
  },
};
