/**
 * Undo / Redo Tool Module
 * Renders two buttons: undo (Ctrl+Z) and redo (Ctrl+Y / Ctrl+Shift+Z).
 * Returns a wrapper containing both buttons.
 */
export const UndoRedoTool = {
  name: 'undoRedo',
  ariaLabel: 'Undo / Redo',

  createButton(editor) {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'contents';

    // Undo
    const undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.className = 'rte-tool-btn';
    undoBtn.dataset.tool = 'undo';
    undoBtn.setAttribute('aria-label', 'Undo (Ctrl+Z)');
    undoBtn.setAttribute('title', 'Undo (Ctrl+Z)');
    undoBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`;
    undoBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      editor.contentArea.focus();
      document.execCommand('undo', false, null);
      editor.syncToolbarState();
      editor.emitChange();
    });

    // Redo
    const redoBtn = document.createElement('button');
    redoBtn.type = 'button';
    redoBtn.className = 'rte-tool-btn';
    redoBtn.dataset.tool = 'redo';
    redoBtn.setAttribute('aria-label', 'Redo (Ctrl+Y)');
    redoBtn.setAttribute('title', 'Redo (Ctrl+Y)');
    redoBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>`;
    redoBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      editor.contentArea.focus();
      document.execCommand('redo', false, null);
      editor.syncToolbarState();
      editor.emitChange();
    });

    wrapper.appendChild(undoBtn);
    wrapper.appendChild(redoBtn);

    this._undoBtn = undoBtn;
    this._redoBtn = redoBtn;

    return wrapper;
  },

  updateState(wrapper) {
    if (this._undoBtn) {
      const canUndo = document.queryCommandEnabled('undo');
      this._undoBtn.disabled = !canUndo;
      this._undoBtn.style.opacity = canUndo ? '1' : '0.38';
    }
    if (this._redoBtn) {
      const canRedo = document.queryCommandEnabled('redo');
      this._redoBtn.disabled = !canRedo;
      this._redoBtn.style.opacity = canRedo ? '1' : '0.38';
    }
  },
};
