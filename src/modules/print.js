/**
 * Print Tool Module
 * Prints just the editor's document content — not the surrounding app UI —
 * through the browser's native print dialog.
 */
export const PrintTool = {
  name: 'print',
  label: 'Print',
  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`,
  shortcut: 'Ctrl+P',
  ariaLabel: 'Print (Ctrl+P)',

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
      e.preventDefault(); // preserve focus/selection, same as the other tools
      this.execute(editor);
    });

    return btn;
  },

  /**
   * Print the editor's content only. Writes editor.getHTML() into a
   * hidden, offscreen iframe along with a minimal print stylesheet, then
   * prints that iframe — so the app's toolbar, sidebar, chat panel, etc.
   * never end up on the printed page, just the document itself.
   * @param {Object} editor - The editor instance
   */
  execute(editor) {
    const html = editor.getHTML();

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right  = '0';
    iframe.style.bottom = '0';
    iframe.style.width  = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Print</title>
    <style>
      body { margin: initial; padding: initial;}
      img { max-width: 100%; }
      table { border-collapse: collapse; width: 100%; }
      td, th { border: 1px solid #ccc; padding: 4px 8px; }
    </style>
  </head>
  <body>${html}</body>
</html>`);
    doc.close();

    iframe.contentWindow.focus();
    iframe.contentWindow.print();

    // Clean up once the print dialog has had a chance to open.
    setTimeout(() => iframe.remove(), 1000);
  },

  /**
   * Print is a one-shot action, not a togglable format — there's no
   * "active" state at the selection to report.
   * @returns {boolean}
   */
  isActive() {
    return false;
  },

  /**
   * No-op: the print button never shows a pressed/active state.
   * @param {HTMLElement} btn
   */
  updateState(btn) {
    btn.classList.remove('rte-tool-active');
    btn.setAttribute('aria-pressed', 'false');
  },
};