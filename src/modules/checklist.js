/**
 * Checklist Tool Module
 * Inserts/toggles a checklist. Each checklist item is a <div> with a
 * data-checklist attribute containing a real <input type="checkbox">.
 */
export const ChecklistTool = {
  name: 'checklist',
  ariaLabel: 'Checklist',
  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,

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

    // Find if we're inside a checklist item already
    let node = sel.anchorNode;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentNode;
    const existingItem = node?.closest?.('[data-checklist-item]');

    if (existingItem) {
      // Unwrap: replace with a paragraph containing the text
      const p = document.createElement('p');
      p.textContent = existingItem.querySelector('.rte-checklist-label')?.textContent || '';
      existingItem.replaceWith(p);
      const range = document.createRange();
      range.selectNodeContents(p);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      // Get selected text or current block text
      const range = sel.getRangeAt(0);
      const text = range.toString() || 'List item';
      this._insertCheckItem(editor, range, text);
    }

    editor.syncToolbarState();
    editor.emitChange();
  },

  _insertCheckItem(editor, range, text) {
    const item = this._createItem(text);

    // Delete selected content and insert
    range.deleteContents();
    range.insertNode(item);

    // Place cursor in label
    const label = item.querySelector('.rte-checklist-label');
    const newRange = document.createRange();
    newRange.selectNodeContents(label);
    newRange.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(newRange);

    // Handle Enter key inside checklist labels (add new item)
    this._attachItemKeyHandler(editor, item);
  },

  _createItem(text = '') {
    const item = document.createElement('div');
    item.className = 'rte-checklist-item';
    item.setAttribute('data-checklist-item', '');
    item.contentEditable = 'false';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'rte-checklist-checkbox';
    checkbox.setAttribute('aria-label', 'Mark as done');
    checkbox.addEventListener('change', () => {
      label.classList.toggle('rte-checklist-done', checkbox.checked);
    });

    const label = document.createElement('span');
    label.className = 'rte-checklist-label';
    label.contentEditable = 'true';
    label.textContent = text;

    item.appendChild(checkbox);
    item.appendChild(label);
    return item;
  },

  _attachItemKeyHandler(editor, item) {
    const label = item.querySelector('.rte-checklist-label');
    label.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // Insert new checklist item after this one
        const newItem = this._createItem('');
        item.after(newItem);
        this._attachItemKeyHandler(editor, newItem);
        const newLabel = newItem.querySelector('.rte-checklist-label');
        const range = document.createRange();
        range.selectNodeContents(newLabel);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        newLabel.focus();
        editor.emitChange();
      }
      if (e.key === 'Backspace') {
        const text = label.textContent;
        if (text === '') {
          e.preventDefault();
          const prev = item.previousElementSibling;
          item.remove();
          if (prev) {
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(prev);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }
          editor.emitChange();
        }
      }
    });
  },

  isActive() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    let node = sel.anchorNode;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentNode;
    return !!node?.closest?.('[data-checklist-item]');
  },

  updateState(btn) {
    const active = this.isActive();
    btn.classList.toggle('rte-tool-active', active);
    btn.setAttribute('aria-pressed', String(active));
  },
};
