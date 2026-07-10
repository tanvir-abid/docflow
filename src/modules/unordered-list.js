/**
 * Unordered List Tool Module
 * Toggles a bullet list (<ul>) on the current selection.
 * Supports nested lists via Tab (indent) and Shift+Tab (outdent).
 *
 * The keyboard handler (_handleListKey) is defined in ordered-list.js and
 * attached once per editor via the editor._listKeyHandlerAttached guard.
 * Both tools share the same handler — whichever tool is instantiated first
 * attaches it; the second one skips it.
 */
export const UnorderedListTool = {
  name: 'unorderedList',
  ariaLabel: 'Bullet list',
  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none"/></svg>`,

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

    // contentArea doesn't exist yet when createButton() is called (it's created
    // later in the same _buildUI pass). Defer attachment to the next microtask
    // so the editor is fully constructed before we touch contentArea.
    // The guard prevents double-attachment when both list tools are loaded.
    if (!editor._listKeyHandlerAttached) {
      editor._listKeyHandlerAttached = true; // set early to block the OL tool too
      Promise.resolve().then(() => {
        editor.contentArea.addEventListener('keydown', (e) => _handleListKey(e, editor));
      });
    }

    return btn;
  },

  execute(editor) {
    editor.contentArea.focus();
    document.execCommand('insertUnorderedList', false, null);
    editor.syncToolbarState();
    editor.emitChange();
  },

  isActive() { return document.queryCommandState('insertUnorderedList'); },

  updateState(btn) {
    const active = this.isActive();
    btn.classList.toggle('rte-tool-active', active);
    btn.setAttribute('aria-pressed', String(active));
  },
};


// ─── Shared keyboard handler ──────────────────────────────────────────────────
// Duplicated here so that UnorderedListTool is fully self-contained and works
// correctly whether or not OrderedListTool is also loaded. The _listKeyHandlerAttached
// guard on the editor ensures the handler is only ever attached once regardless
// of which module registers it first.

function _handleListKey(e, editor) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;

  const li = _closestLi(sel.anchorNode, editor.contentArea);
  if (!li) return;

  // ── Tab / Shift+Tab ──────────────────────────────────────────────────────
  if (e.key === 'Tab') {
    e.preventDefault();

    if (e.shiftKey) {
      _outdentLi(li, editor);
    } else {
      _indentLi(li, editor);
    }

    editor.syncToolbarState();
    editor.emitChange();
    return;
  }

  // ── Enter on an empty list item → break out of nesting ──────────────────
  if (e.key === 'Enter' && !e.shiftKey) {
    const isEmpty = li.innerText.trim() === '';
    if (!isEmpty) return;

    const parentList = li.parentElement;
    const grandparent = parentList?.parentElement;

    if (grandparent && grandparent.tagName === 'LI') {
      e.preventDefault();
      li.remove();
      if (parentList.children.length === 0) parentList.remove();
      _placeCaretAfter(grandparent, sel);
      editor.syncToolbarState();
      editor.emitChange();
    }
  }
}

// ─── Indent / Outdent helpers ─────────────────────────────────────────────────

function _indentLi(li, editor) {
  const parentList  = li.parentElement;
  const prevSibling = li.previousElementSibling;

  if (!prevSibling) return;

  const nestedList = document.createElement(parentList.tagName);
  nestedList.appendChild(li);
  prevSibling.appendChild(nestedList);

  _restoreCaret(li, editor);
}

function _outdentLi(li, editor) {
  const parentList  = li.parentElement;
  const grandparent = parentList?.parentElement;

  if (!grandparent || grandparent.tagName !== 'LI') {
    document.execCommand('outdent', false, null);
    return;
  }

  const greatGrandparent = grandparent.parentElement;

  const trailingSiblings = [];
  let node = li.nextElementSibling;
  while (node) {
    trailingSiblings.push(node);
    node = node.nextElementSibling;
  }

  greatGrandparent.insertBefore(li, grandparent.nextSibling);

  if (parentList.children.length === 0) {
    parentList.remove();
  }

  if (trailingSiblings.length > 0) {
    const newNested = document.createElement(parentList.tagName);
    trailingSiblings.forEach(sib => newNested.appendChild(sib));
    li.appendChild(newNested);
  }

  _restoreCaret(li, editor);
}

// ─── Caret / DOM utilities ────────────────────────────────────────────────────

function _closestLi(node, root) {
  let n = node;
  while (n && n !== root) {
    if (n.nodeType === Node.ELEMENT_NODE && n.tagName === 'LI') return n;
    n = n.parentNode;
  }
  return null;
}

function _restoreCaret(li, editor) {
  const sel   = window.getSelection();
  const range = document.createRange();
  const target = _deepFirstTextNode(li) ?? li;

  if (target.nodeType === Node.TEXT_NODE) {
    range.setStart(target, target.length);
    range.collapse(true);
  } else {
    range.selectNodeContents(target);
    range.collapse(false);
  }

  sel.removeAllRanges();
  sel.addRange(range);
}

function _placeCaretAfter(li, sel) {
  const range = document.createRange();
  range.setStartAfter(li.parentElement);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function _deepFirstTextNode(el) {
  if (el.nodeType === Node.TEXT_NODE) return el;
  for (const child of el.childNodes) {
    const found = _deepFirstTextNode(child);
    if (found) return found;
  }
  return null;
}