/**
 * Ordered List Tool Module
 * Toggles an ordered list (<ol>) on the current selection.
 * Supports nested lists via Tab (indent) and Shift+Tab (outdent).
 */
export const OrderedListTool = {
  name: 'orderedList',
  ariaLabel: 'Ordered list',
  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>`,

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
      editor._listKeyHandlerAttached = true; // set early to block the UL tool too
      Promise.resolve().then(() => {
        editor.contentArea.addEventListener('keydown', (e) => _handleListKey(e, editor));
      });
    }

    return btn;
  },

  execute(editor) {
    editor.contentArea.focus();
    document.execCommand('insertOrderedList', false, null);
    editor.syncToolbarState();
    editor.emitChange();
  },

  isActive() { return document.queryCommandState('insertOrderedList'); },

  updateState(btn) {
    const active = this.isActive();
    btn.classList.toggle('rte-tool-active', active);
    btn.setAttribute('aria-pressed', String(active));
  },
};


// ─── Shared keyboard handler (used by both OL and UL tools) ──────────────────

/**
 * Handles Tab / Shift+Tab for nesting, and Enter on an empty list item
 * to break out of the current nesting level.
 *
 * Attached once to the contentArea. Both list tools guard against double-attach
 * using the editor._listKeyHandlerAttached flag.
 */
function _handleListKey(e, editor) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;

  const li = _closestLi(sel.anchorNode, editor.contentArea);
  if (!li) return; // caret is not inside a list item — do nothing

  // ── Tab / Shift+Tab ──────────────────────────────────────────────────────
  if (e.key === 'Tab') {
    e.preventDefault();

    if (e.shiftKey) {
      // Outdent — move this <li> one level up
      _outdentLi(li, editor);
    } else {
      // Indent — wrap this <li> in a new nested list of the same type
      _indentLi(li, editor);
    }

    editor.syncToolbarState();
    editor.emitChange();
    return;
  }

  // ── Enter on an empty list item → break out of nesting ──────────────────
  if (e.key === 'Enter' && !e.shiftKey) {
    const isEmpty = li.innerText.trim() === '';
    if (!isEmpty) return; // non-empty item: let browser handle it normally

    const parentList = li.parentElement; // the <ol> or <ul> directly containing this <li>
    const grandparent = parentList?.parentElement; // either another <li> or the contentArea

    // Only act when we are already nested (grandparent is an <li>)
    if (grandparent && grandparent.tagName === 'LI') {
      e.preventDefault();
      // Remove the empty <li>
      li.remove();
      // If the nested list is now empty, remove it too
      if (parentList.children.length === 0) parentList.remove();
      // Place caret after the grandparent <li>
      _placeCaretAfter(grandparent, sel);
      editor.syncToolbarState();
      editor.emitChange();
    }
    // If we're at the top level, let the browser unwrap the list as usual
  }
}

// ─── Indent / Outdent helpers ─────────────────────────────────────────────────

/**
 * Indents a single <li> by wrapping it in a new nested <ol>/<ul> appended
 * to the previous sibling <li>. If there is no previous sibling, indent is
 * a no-op (can't nest the very first item with nothing to nest under).
 */
function _indentLi(li, editor) {
  const parentList = li.parentElement; // <ol> or <ul>
  const prevSibling = li.previousElementSibling;

  if (!prevSibling) return; // nothing to nest under

  // Preserve the list type (ol/ul)
  const nestedList = document.createElement(parentList.tagName);
  nestedList.appendChild(li); // moves li out of parentList automatically
  prevSibling.appendChild(nestedList);

  _restoreCaret(li, editor);
}

/**
 * Outdents a single <li> by moving it after its grandparent <li> in the
 * grandparent's parent list. Any siblings that follow the item in the current
 * nested list are moved into a new sub-list appended to the outdented item,
 * preserving the existing hierarchy of those trailing siblings.
 *
 * If the item is already at the top level, outdent calls execCommand('outdent')
 * as a fallback, which will unwrap the list if it's the only/last item.
 */
function _outdentLi(li, editor) {
  const parentList  = li.parentElement; // nested <ol>/<ul>
  const grandparent = parentList?.parentElement; // <li> one level up

  if (!grandparent || grandparent.tagName !== 'LI') {
    // Already at the top level — let execCommand handle unwrapping
    document.execCommand('outdent', false, null);
    return;
  }

  const greatGrandparent = grandparent.parentElement; // the outer <ol>/<ul>

  // Collect any siblings that come AFTER `li` in the nested list
  const trailingSiblings = [];
  let node = li.nextElementSibling;
  while (node) {
    trailingSiblings.push(node);
    node = node.nextElementSibling;
  }

  // Move `li` to appear directly after grandparent in the outer list
  greatGrandparent.insertBefore(li, grandparent.nextSibling);

  // If the original nested list still has items, keep it as-is under grandparent.
  // If it's now empty, remove it.
  if (parentList.children.length === 0) {
    parentList.remove();
  }

  // Append any trailing siblings into a new nested list under the outdented `li`
  if (trailingSiblings.length > 0) {
    const newNested = document.createElement(parentList.tagName);
    trailingSiblings.forEach(sib => newNested.appendChild(sib));
    li.appendChild(newNested);
  }

  _restoreCaret(li, editor);
}

// ─── Caret / DOM utilities ────────────────────────────────────────────────────

/** Finds the closest ancestor <li> that is inside `root`, or null. */
function _closestLi(node, root) {
  let n = node;
  while (n && n !== root) {
    if (n.nodeType === Node.ELEMENT_NODE && n.tagName === 'LI') return n;
    n = n.parentNode;
  }
  return null;
}

/**
 * Restores caret to the end of the first text node (or the li itself)
 * after a DOM mutation that moved the <li>.
 */
function _restoreCaret(li, editor) {
  const sel   = window.getSelection();
  const range = document.createRange();

  // Find the deepest first text/element node to place caret in
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

/** Places the caret in a new paragraph/br directly after `li` in its parent list. */
function _placeCaretAfter(li, sel) {
  const range = document.createRange();
  range.setStartAfter(li.parentElement); // after the <ol>/<ul>
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Walks into the first child chain to find the first text node. */
function _deepFirstTextNode(el) {
  if (el.nodeType === Node.TEXT_NODE) return el;
  for (const child of el.childNodes) {
    const found = _deepFirstTextNode(child);
    if (found) return found;
  }
  return null;
}