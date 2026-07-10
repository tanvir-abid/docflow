/**
 * Copy Plain Text Tool Module
 * Copies the editor's plain text content (no HTML) to the clipboard.
 */
export const CopyTextTool = {
  name: 'copyText',
  ariaLabel: 'Copy plain text',
  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  iconDone: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,

  createButton(editor) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rte-tool-btn';
    btn.dataset.tool = this.name;
    btn.setAttribute('aria-label', this.ariaLabel);
    btn.setAttribute('title', this.ariaLabel);
    btn.innerHTML = this.icon;
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); this.execute(editor, btn); });
    return btn;
  },

  async execute(editor, btn) {
    const text = editor.getText();
    try {
      await navigator.clipboard.writeText(text);
      this._flashDone(btn);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      this._flashDone(btn);
    }
  },

  _flashDone(btn) {
    btn.innerHTML = this.iconDone;
    btn.classList.add('rte-tool-active');
    setTimeout(() => {
      btn.innerHTML = this.icon;
      btn.classList.remove('rte-tool-active');
    }, 1400);
  },

  updateState() {},
};
