/**
 * Copy HTML Tool Module
 * Copies the editor's full HTML content to the clipboard.
 * Shows a brief visual confirmation on the button.
 */
export const CopyHTMLTool = {
  name: 'copyHTML',
  ariaLabel: 'Copy HTML',
  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
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
    this._btn = btn;
    return btn;
  },

  async execute(editor, btn) {
    const html = editor.getHTML();
    try {
      await navigator.clipboard.writeText(html);
      this._flashDone(btn);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = html;
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
