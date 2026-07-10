/**
 * Indent / Outdent Tool Module
 * Increases or decreases the left indentation of the current block
 * (paragraph, heading, blockquote, etc.) via toolbar buttons or Tab / Shift+Tab.
 *
 * Inside list items, Tab/Shift+Tab is left to the list tools' nesting logic
 * (ordered-list.js / unordered-list.js) — this module only acts when the
 * caret is NOT inside an <li>, so both behaviours coexist cleanly.
 *
 * The keyboard handler is shared between IndentTool and OutdentTool and is
 * attached once per editor via the editor._indentKeyHandlerAttached guard,
 * same convention as editor._listKeyHandlerAttached.
 */

const INDENT_STEP = 40;                 // px per indent level
const MAX_LEVEL   = 8;                  // max indent levels (8 * 40px = 320px)
const BLOCK_TAGS  = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'DIV', 'LI']);

export const IndentTool = {
  name: 'indent',
  ariaLabel: 'Increase indent',
  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="11" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/><polyline points="3 9 8 12 3 15"/></svg>`,

  createButton(editor) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rte-tool-btn';
    btn.dataset.tool = this.name;
    btn.setAttribute('aria-label', this.ariaLabel);
    btn.setAttribute('title', this.ariaLabel + ' (Tab)');
    btn.innerHTML = this.icon;
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); this.execute(editor); });

    _attachIndentKeyHandler(editor);

    return btn;
  },

  execute(editor) {
    editor.contentArea.focus();
    _changeIndent(editor, +1);
    editor.syncToolbarState();
    editor.emitChange();
  },

  isActive() { return false; },

  updateState(btn) {
    btn.classList.remove('rte-tool-active');
  },
};

export const OutdentTool = {
  name: 'outdent',
  ariaLabel: 'Decrease indent',
  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="11" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/><polyline points="8 9 3 12 8 15"/></svg>`,

  createButton(editor) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rte-tool-btn';
    btn.dataset.tool = this.name;
    btn.setAttribute('aria-label', this.ariaLabel);
    btn.setAttribute('title', this.ariaLabel + ' (Shift+Tab)');
    btn.innerHTML = this.icon;
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); this.execute(editor); });
    btn._editor = editor; // stash for updateState, which only receives btn

    _attachIndentKeyHandler(editor);

    return btn;
  },

  execute(editor) {
    editor.contentArea.focus();
    _changeIndent(editor, -1);
    editor.syncToolbarState();
    editor.emitChange();
  },

  isActive() { return false; },

  updateState(btn) {
    const editor = btn._editor;
    const block  = editor ? _closestBlock(window.getSelection()?.anchorNode, editor.contentArea) : null;
    const level  = _getIndentLevel(block);
    // Disable when current block has no indentation to remove
    btn.disabled = level <= 0;
    btn.classList.remove('rte-tool-active');
  },
};


// ─── Shared keyboard handler ──────────────────────────────────────────────

function _attachIndentKeyHandler(editor) {
  if (editor._indentKeyHandlerAttached) return;
  editor._indentKeyHandlerAttached = true;

  // contentArea doesn't exist yet when createButton() runs — defer like the
  // list tools do.
  Promise.resolve().then(() => {
    editor.contentArea?.addEventListener('keydown', (e) => _handleIndentKey(e, editor));
  });
}

function _handleIndentKey(e, editor) {
  if (e.key !== 'Tab') return;

  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;

  // Inside a list item — let the list tools' nesting handler own Tab.
  if (_closestLi(sel.anchorNode, editor.contentArea)) return;

  e.preventDefault();
  _changeIndent(editor, e.shiftKey ? -1 : +1);
  editor.syncToolbarState();
  editor.emitChange();
}


// ─── Indent logic ───────────────────────────────────────────────────────────

/**
 * Adjusts margin-left on every block intersecting the current selection
 * (or just the current block, if the selection is collapsed).
 * direction: +1 to indent, -1 to outdent. Clamped to [0, MAX_LEVEL].
 */
function _changeIndent(editor, direction) {
  const blocks = _selectedBlocks(editor);

  blocks.forEach(block => {
    const current = _getIndentLevel(block);
    const next = Math.min(Math.max(current + direction, 0), MAX_LEVEL);

    if (next === 0) {
      block.style.removeProperty('margin-left');
      if (block.getAttribute('style') === '') block.removeAttribute('style');
    } else {
      block.style.marginLeft = `${next * INDENT_STEP}px`;
    }
  });
}

function _getIndentLevel(block) {
  if (!block) return 0;
  const ml = parseInt(block.style.marginLeft, 10) || 0;
  return Math.round(ml / INDENT_STEP);
}

/** Finds the closest ancestor block-level element inside `root`. */
function _closestBlock(node, root) {
  let n = node;
  while (n && n !== root) {
    if (n.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(n.tagName)) return n;
    n = n.parentNode;
  }
  return root?.firstElementChild ?? null;
}

/**
 * Returns every top-level block element that intersects the current
 * selection. Falls back to the single block containing the caret for
 * collapsed selections.
 */
function _selectedBlocks(editor) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return [];

  const range = sel.getRangeAt(0);

  if (range.collapsed) {
    const block = _closestBlock(sel.anchorNode, editor.contentArea);
    return block ? [block] : [];
  }

  const blocks = [];
  const walker = document.createTreeWalker(editor.contentArea, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      if (!BLOCK_TAGS.has(node.tagName)) return NodeFilter.FILTER_SKIP;
      return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }
  });

  let n;
  while ((n = walker.nextNode())) {
    // Skip blocks already covered by an ancestor we've collected (e.g. <li>
    // inside a <div> wrapper) to avoid double-indenting.
    if (!blocks.some(b => b.contains(n))) blocks.push(n);
  }

  if (blocks.length) return blocks;

  const fallback = _closestBlock(sel.anchorNode, editor.contentArea);
  return fallback ? [fallback] : [];
}

/** Finds the closest ancestor <li> that is inside `root`, or null. */
function _closestLi(node, root) {
  let n = node;
  while (n && n !== root) {
    if (n.nodeType === Node.ELEMENT_NODE && n.tagName === 'LI') return n;
    n = n.parentNode;
  }
  return null;
}