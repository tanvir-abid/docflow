/**
 * Code Block Tool Module
 * Inserts/toggles a <pre><code> block at the current position.
 */
export const CodeBlockTool = {
  name: 'codeBlock',
  ariaLabel: 'Code block',
  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 10l-3 3 3 3"/><path d="M16 10l3 3-3 3"/><line x1="12" y1="7" x2="12" y2="17" opacity=".4"/></svg>`,

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

    let node = sel.anchorNode;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentNode;
    const existingBlock = node?.closest?.('pre');

    if (existingBlock) {
      // Unwrap: replace pre with paragraph
      const p = document.createElement('p');
      p.textContent = existingBlock.textContent;
      existingBlock.replaceWith(p);
      const range = document.createRange();
      range.selectNodeContents(p);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      const range = sel.getRangeAt(0);
      const selected = range.toString() || '// code here';

      const pre = document.createElement('pre');
      pre.className = 'rte-code-block';
      const code = document.createElement('code');
      code.setAttribute('contenteditable', 'true');
      code.setAttribute('spellcheck', 'false');
      code.textContent = selected;
      pre.appendChild(code);

      // Handle tab inside code block
      code.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          document.execCommand('insertText', false, '  ');
        }
      });

      range.deleteContents();
      range.insertNode(pre);

      // Insert a paragraph after so cursor can escape
      const after = document.createElement('p');
      after.innerHTML = '<br>';
      pre.after(after);

      const newRange = document.createRange();
      newRange.selectNodeContents(code);
      newRange.collapse(false);
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
    return !!node?.closest?.('pre');
  },

  updateState(btn) {
    const active = this.isActive();
    btn.classList.toggle('rte-tool-active', active);
    btn.setAttribute('aria-pressed', String(active));
  },
};
