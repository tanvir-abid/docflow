/**
 * Font Size Tool Module
 *
 * Renders: [decrease] [size input+dropdown] [increase]
 *
 * - Cursor position: reflects the font size under the cursor in the input (number only, no "px").
 * - The input is a number field; clicking/focusing it opens a dropdown of preset sizes.
 *   The user can pick a preset OR type any number and press Enter (or blur) to apply.
 * - The +/- buttons step the selection using a ratio-preserving strategy (see `step()`).
 * - Stepping and direct DOM mutation preserve block structure — no `insertHTML` for step
 *   operations, so two <p> tags never get merged into one.
 * - `execute()` (called by the dropdown/Enter) still uses `insertHTML` for the whole-
 *   selection uniform-size case, which is fine because the user is intentionally
 *   flattening to one size.
 * - Step mutations use direct DOM surgery per text-node run so block elements are never
 *   touched.
 */
export const FontSizeTool = {
  name: 'fontSize',
  ariaLabel: 'Font size',

  _sizes: [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48],

  _savedRange: null,
  _editor: null,
  _decBtn: null,
  _incBtn: null,
  _input: null,
  _dropdown: null,
  _dropdownOpen: false,

  createButton(editor) {
    this._editor = editor;

    const wrapper = document.createElement('div');
    wrapper.className = 'rte-heading-wrapper rte-fontsize-wrapper';
    wrapper.style.cssText = 'display:inline-flex;align-items:center;gap:1px;position:relative;';

    // --- Decrease button ---
    const decBtn = document.createElement('button');
    decBtn.type = 'button';
    decBtn.className = 'rte-tool-btn';
    decBtn.dataset.tool = 'fontSizeDecrease';
    decBtn.setAttribute('aria-label', 'Decrease font size');
    decBtn.setAttribute('title', 'Decrease font size');
    decBtn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>';

    // --- Custom input + dropdown container ---
    const inputWrap = document.createElement('div');
    inputWrap.style.cssText = 'position:relative;display:inline-flex;align-items:center;';

    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.pattern = '[0-9]*';
    input.className = 'rte-fontsize-input';
    input.setAttribute('aria-label', this.ariaLabel);
    input.setAttribute('title', this.ariaLabel);
    input.setAttribute('placeholder', '—');
    // Match rte-tool-btn exactly: same height, padding, font, border-radius.
    // No border of its own — the subtle background on hover/focus does the job.
    input.style.cssText = `
      width: 36px;
      height: 26px;
      padding: 0 2px;
      box-sizing: border-box;
      border: 1px solid transparent;
      border-radius: 4px;
      background: transparent;
      color: var(--rte-text, inherit);
      font-size: 12px;
      font-family: inherit;
      font-weight: 500;
      line-height: 1;
      text-align: center;
      cursor: pointer;
      outline: none;
      transition: background 0.12s, border-color 0.12s;
    `;

    // Hover / focus visual feedback matching toolbar buttons
    input.addEventListener('mouseenter', () => {
      if (document.activeElement !== input) {
        input.style.background = 'var(--rte-hover, #f3f4f6)';
        input.style.borderColor = 'var(--rte-border, #e5e7eb)';
      }
    });
    input.addEventListener('mouseleave', () => {
      if (document.activeElement !== input) {
        input.style.background = 'transparent';
        input.style.borderColor = 'transparent';
      }
    });
    input.addEventListener('focus', () => {
      input.style.background = 'var(--rte-hover, #f3f4f6)';
      input.style.borderColor = 'var(--rte-border, #d1d5db)';
      input.select();
    });
    input.addEventListener('blur', () => {
      input.style.background = 'transparent';
      input.style.borderColor = 'transparent';
    });

    // Dropdown panel — compact, matches toolbar shadow/radius language
    const dropdown = document.createElement('div');
    dropdown.className = 'rte-fontsize-dropdown';
    dropdown.style.cssText = `
      display: none;
      position: absolute;
      top: calc(100% + 3px);
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      background: var(--rte-bg, #ffffff);
      border: 1px solid var(--rte-border, #e5e7eb);
      border-radius: 6px;
      box-shadow: 0 4px 14px rgba(0,0,0,.10), 0 1px 3px rgba(0,0,0,.06);
      min-width: 56px;
      max-height: 200px;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 3px 0;
      scrollbar-width: thin;
    `;

    this._sizes.forEach((size) => {
      const item = document.createElement('div');
      item.className = 'rte-fontsize-option';
      item.textContent = size;
      item.dataset.size = size;
      item.style.cssText = `
        padding: 4px 10px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        line-height: 1.5;
        text-align: center;
        white-space: nowrap;
        color: var(--rte-text, #374151);
        border-radius: 3px;
        margin: 0 3px;
        transition: background 0.08s;
      `;
      item.addEventListener('mouseenter', () => {
        if (!item.dataset.active) item.style.background = 'var(--rte-hover, #f3f4f6)';
      });
      item.addEventListener('mouseleave', () => {
        if (!item.dataset.active) item.style.background = '';
      });
      // mousedown so we act before the input loses focus
      item.addEventListener('mousedown', (e) => {
        e.preventDefault(); // don't steal focus from editor via blur chain
        this._closeDropdown();
        if (this._savedRange) this._restoreRange(this._savedRange);
        this._savedRange = null;
        editor.contentArea.focus();
        this.execute(editor, `${size}px`);
        input.value = String(size);
      });
      dropdown.appendChild(item);
    });

    // Save the selection on mousedown — fires BEFORE the browser moves
    // focus to the input and clears the editor's selection.
    input.addEventListener('mousedown', () => {
      this._savedRange = this._saveRange();
    });

    // Open dropdown on focus (follows mousedown) or keyboard Tab-in.
    input.addEventListener('focus', () => {
      // Fallback for Tab navigation: mousedown won't have fired.
      if (!this._savedRange) this._savedRange = this._saveRange();
      this._openDropdown();
    });
    input.addEventListener('click', () => {
      if (!this._dropdownOpen) this._openDropdown();
    });

    // Apply on Enter or blur
    const applyInput = () => {
      const raw = parseInt(input.value, 10);
      if (!isNaN(raw) && raw >= 1 && raw <= 999) {
        if (this._savedRange) this._restoreRange(this._savedRange);
        this._savedRange = null;
        editor.contentArea.focus();
        this.execute(editor, `${raw}px`);
      }
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._closeDropdown();
        applyInput();
      }
      if (e.key === 'Escape') {
        this._closeDropdown();
        editor.contentArea.focus();
      }
    });
    input.addEventListener('blur', () => {
      // Small delay so a dropdown mousedown fires before blur hides it
      setTimeout(() => {
        this._closeDropdown();
      }, 150);
    });

    // Only allow numeric input
    input.addEventListener('input', () => {
      input.value = input.value.replace(/[^0-9]/g, '');
      // Highlight matching option in dropdown
      this._highlightDropdownOption(input.value);
    });

    inputWrap.appendChild(input);
    inputWrap.appendChild(dropdown);

    // Close dropdown when clicking outside
    document.addEventListener('mousedown', (e) => {
      if (!inputWrap.contains(e.target)) {
        this._closeDropdown();
      }
    });

    // --- Increase button ---
    const incBtn = document.createElement('button');
    incBtn.type = 'button';
    incBtn.className = 'rte-tool-btn';
    incBtn.dataset.tool = 'fontSizeIncrease';
    incBtn.setAttribute('aria-label', 'Increase font size');
    incBtn.setAttribute('title', 'Increase font size');
    incBtn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/><line x1="12" y1="5" x2="12" y2="19"/></svg>';

    const stepHandler = (direction) => (e) => {
      e.preventDefault();
      const savedRange = this._saveRange();
      editor.contentArea.focus();
      if (savedRange) this._restoreRange(savedRange);
      this.step(editor, direction);
    };

    decBtn.addEventListener('mousedown', stepHandler(-1));
    incBtn.addEventListener('mousedown', stepHandler(1));

    wrapper.appendChild(decBtn);
    wrapper.appendChild(inputWrap);
    wrapper.appendChild(incBtn);

    this._decBtn = decBtn;
    this._incBtn = incBtn;
    this._input = input;
    this._dropdown = dropdown;

    return wrapper;
  },

  _openDropdown() {
    if (!this._dropdown) return;
    this._dropdown.style.display = 'block';
    this._dropdownOpen = true;
    this._highlightDropdownOption(this._input.value);
    // Scroll highlighted item into view
    const active = this._dropdown.querySelector('[data-active="1"]');
    if (active) active.scrollIntoView({ block: 'nearest' });
  },

  _closeDropdown() {
    if (!this._dropdown) return;
    this._dropdown.style.display = 'none';
    this._dropdownOpen = false;
  },

  _highlightDropdownOption(value) {
    if (!this._dropdown) return;
    const num = parseInt(value, 10);
    [...this._dropdown.children].forEach((item) => {
      const match = parseInt(item.dataset.size, 10) === num;
      item.dataset.active = match ? '1' : '';
      item.style.background = match ? 'var(--rte-active, #e8eaed)' : '';
      item.style.fontWeight = match ? '600' : '';
      item.style.color = match ? 'var(--rte-text, #111827)' : 'var(--rte-text, #374151)';
    });
  },

  /**
   * Set the ENTIRE current selection to one explicit size.
   * Strips existing font-size spans first to prevent nesting.
   * Uses execCommand('insertHTML') — intentional flattening of structure
   * is expected here (user picked one explicit size for the whole selection).
   */
  execute(editor, size) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;

    const holder = document.createElement('div');
    holder.appendChild(range.cloneContents());
    this._stripFontSizes(holder);

    const markerId = this._newMarkerId();
    const html = `<span data-rte-temp="${markerId}" style="font-size:${size}">${holder.innerHTML}</span>`;

    document.execCommand('insertHTML', false, html);

    const marked = editor.contentArea.querySelectorAll(`[data-rte-temp="${markerId}"]`);
    marked.forEach((el) => this._flattenNestedFontSpans(el));

    this._reselectMarked(editor, markerId);

    editor.syncToolbarState();
    editor.emitChange();
  },

  /**
   * Step every run in the selection up/down by exactly 1px.
   *
   * Each run is stepped independently — a heading at 32px and a paragraph at
   * 16px both move by 1px so their difference is preserved (32→33, 16→17).
   *
   * Uses direct DOM surgery (never insertHTML) so block elements like <p> and
   * <h1> are never touched and can't be merged.
   */
  step(editor, direction) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;

    const runs = this._getSizeRuns(range);
    if (!runs.length) return;

    // Bail if every run is already at the boundary in this direction.
    const anyCanMove = runs.some((run) => {
      const px = parseFloat(run.size);
      return direction > 0 ? px < 999 : px > 1;
    });
    if (!anyCanMove) return;

    // Process in reverse DOM order so splitText offsets on earlier nodes
    // aren't invalidated by mutations to later nodes.
    const reversedRuns = [...runs].reverse();
    const allSpans = [];

    reversedRuns.forEach((run) => {
      const newSize = this._stepSize(run.size, direction);
      const spans = this._applyFontSizeToRun(run, newSize);
      allSpans.push(...spans);
    });

    if (!allSpans.length) return;

    // Reselect from the first to the last touched span (in document order).
    // Because we processed in reverse, allSpans is also in reverse — sort by position.
    allSpans.sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    const newRange = document.createRange();
    newRange.setStartBefore(allSpans[0]);
    newRange.setEndAfter(allSpans[allSpans.length - 1]);
    sel.removeAllRanges();
    sel.addRange(newRange);

    editor.syncToolbarState();
    editor.emitChange();
  },

  /**
   * Apply `newSize` to a single run without using insertHTML.
   *
   * Strategy per run:
   * - If the run's text node is the *entire* content of an existing font-size
   *   <span>, just update that span's font-size in place — zero DOM restructuring.
   * - Otherwise, surgically split the text node at the run boundaries and wrap
   *   the selected portion in a new <span style="font-size:Xpx">.
   *   Any pre-existing font-size ancestor span has its font-size cleared so we
   *   don't nest conflicting sizes.
   *
   * Returns an array of the span elements that now carry the new font size.
   */
  _applyFontSizeToRun(run, newSize) {
    const { startNode, startOffset, endNode, endOffset } = run;
    const createdSpans = [];

    // Fast path: single text node, entire content, parent is a font-size span.
    if (
      startNode === endNode &&
      startOffset === 0 &&
      endOffset === startNode.textContent.length
    ) {
      const parent = startNode.parentElement;
      if (parent && parent.style && parent.style.fontSize) {
        parent.style.fontSize = newSize;
        createdSpans.push(parent);
        return createdSpans;
      }
    }

    // General path: collect all text nodes in the run.
    // For a same-node run (most common), it's just one node.
    // For a cross-node run, we need to walk them.
    const textNodes = this._collectRunTextNodes(run);

    textNodes.forEach((info) => {
      const { node, start, end } = info;

      // Split off a tail if needed
      if (end < node.textContent.length) {
        node.splitText(end);
      }
      // Split off a head if needed
      let targetNode = node;
      if (start > 0) {
        targetNode = node.splitText(start);
      }

      // Check if the target node's parent is already *solely* a font-size span
      // with no other content — if so, update in place.
      const parent = targetNode.parentElement;
      if (
        parent &&
        parent.tagName === 'SPAN' &&
        parent.style.fontSize &&
        parent.childNodes.length === 1
      ) {
        parent.style.fontSize = newSize;
        if (parent.getAttribute('style') === `font-size: ${newSize}` ||
            parent.style.cssText.trim() === `font-size: ${newSize};` ||
            parent.style.cssText.trim() === `font-size:${newSize};`) {
          // already clean — just flag it
        }
        createdSpans.push(parent);
        return;
      }

      // Wrap in a new span.
      // First, strip any inherited font-size from an ancestor span so we don't nest.
      this._clearAncestorFontSize(targetNode);

      const span = document.createElement('span');
      span.style.fontSize = newSize;
      targetNode.parentNode.insertBefore(span, targetNode);
      span.appendChild(targetNode);
      createdSpans.push(span);
    });

    return createdSpans;
  },

  /**
   * Collect text nodes for a run along with their [start, end] offsets
   * relative to each individual text node (not the run's global offsets).
   */
  _collectRunTextNodes(run) {
    const { startNode, startOffset, endNode, endOffset } = run;

    if (startNode === endNode) {
      return [{ node: startNode, start: startOffset, end: endOffset }];
    }

    // Multiple text nodes: walk between startNode and endNode.
    const result = [];
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);

    const ancestor = range.commonAncestorContainer;
    const root = ancestor.nodeType === Node.TEXT_NODE ? ancestor.parentNode : ancestor;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);

    let node;
    let inside = false;
    while ((node = walker.nextNode())) {
      if (node === startNode) inside = true;
      if (!inside) continue;

      const s = node === startNode ? startOffset : 0;
      const e = node === endNode ? endOffset : node.textContent.length;
      if (s < e) result.push({ node, start: s, end: e });

      if (node === endNode) break;
    }
    return result;
  },

  /**
   * Walk up from `textNode` and clear font-size from the nearest ancestor span
   * that carries one, so wrapping with a new span doesn't produce nested sizes.
   * Stops at the editor content area root.
   */
  _clearAncestorFontSize(textNode) {
    let el = textNode.parentElement;
    while (el && !el.isContentEditable) {
      if (el.style && el.style.fontSize) {
        el.style.removeProperty('font-size');
        if (el.getAttribute('style') === '') el.removeAttribute('style');
        return; // only clear the nearest one
      }
      el = el.parentElement;
    }
  },

  /**
   * updateState — called by the toolbar after every selection change.
   * Collapsed cursor: show size at cursor in the input.
   * Range: enable/disable +/- and show size only when all runs match.
   */
  updateState() {
    if (!this._editor) return;

    const sel = window.getSelection();
    const inEditor =
      sel && sel.rangeCount > 0 && this._editor.contentArea.contains(sel.anchorNode);

    if (!inEditor) {
      this._setBtnEnabled(this._decBtn, false);
      this._setBtnEnabled(this._incBtn, false);
      if (this._input && document.activeElement !== this._input) this._input.value = '';
      return;
    }

    const range = sel.getRangeAt(0);

    if (range.collapsed) {
      this._setBtnEnabled(this._decBtn, false);
      this._setBtnEnabled(this._incBtn, false);
      const node = sel.anchorNode;
      const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      const cursorSize = el ? window.getComputedStyle(el).fontSize : '';
      this._reflectSizeInInput(cursorSize);
      return;
    }

    const runs = this._getSizeRuns(range);
    const canDecrease = runs.some((run) => parseFloat(run.size) > 1);
    const canIncrease = runs.some((run) => parseFloat(run.size) < 999);

    this._setBtnEnabled(this._decBtn, canDecrease);
    this._setBtnEnabled(this._incBtn, canIncrease);

    const uniqueSizes = [...new Set(runs.map((r) => r.size))];
    this._reflectSizeInInput(uniqueSizes.length === 1 ? uniqueSizes[0] : '');
  },

  // --- internal helpers ---------------------------------------------------

  /** Show the numeric part of a pixel value in the input (e.g. "18px" → "18"). */
  _reflectSizeInInput(sizePx) {
    if (!this._input || document.activeElement === this._input) return;
    if (!sizePx) {
      this._input.value = '';
      return;
    }
    const num = parseFloat(sizePx);
    this._input.value = isNaN(num) ? '' : String(Math.round(num));
  },

  _setBtnEnabled(btn, enabled) {
    if (!btn) return;
    btn.disabled = !enabled;
    btn.style.opacity = enabled ? '1' : '0.38';
  },

  _stripFontSizes(root) {
    if (root.nodeType === Node.ELEMENT_NODE) {
      root.style.removeProperty('font-size');
      if (root.getAttribute('style') === '') root.removeAttribute('style');
    }
    root.querySelectorAll('[style]').forEach((el) => {
      el.style.removeProperty('font-size');
      if (el.getAttribute('style') === '') el.removeAttribute('style');
    });
  },

  _flattenNestedFontSpans(root) {
    const spans = [...root.querySelectorAll('span[style*="font-size"]')].reverse();
    spans.forEach((span) => {
      let ancestor = span.parentElement;
      while (ancestor && ancestor !== root) {
        if (ancestor.style && ancestor.style.fontSize) {
          span.style.removeProperty('font-size');
          if (span.getAttribute('style') === '') span.removeAttribute('style');
          if (!span.hasAttributes()) {
            const parent = span.parentNode;
            while (span.firstChild) parent.insertBefore(span.firstChild, span);
            parent.removeChild(span);
          }
          break;
        }
        ancestor = ancestor.parentElement;
      }
    });
  },

  _getSizeRuns(range) {
    const ancestor = range.commonAncestorContainer;
    const root = ancestor.nodeType === Node.TEXT_NODE ? ancestor.parentNode : ancestor;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);

    const runs = [];
    let current = null;
    let node;

    while ((node = walker.nextNode())) {
      if (!node.textContent || !this._nodeIntersectsRange(node, range)) continue;

      let startOffset = 0;
      let endOffset = node.textContent.length;
      if (node === range.startContainer) startOffset = range.startOffset;
      if (node === range.endContainer) endOffset = range.endOffset;
      if (startOffset >= endOffset) continue;

      const parentEl = node.parentElement;
      const size = parentEl ? window.getComputedStyle(parentEl).fontSize : '16px';

      if (current && current.size === size) {
        current.endNode = node;
        current.endOffset = endOffset;
      } else {
        if (current) runs.push(current);
        current = { startNode: node, startOffset, endNode: node, endOffset, size };
      }
    }
    if (current) runs.push(current);

    return runs;
  },

  _nodeIntersectsRange(node, range) {
    if (typeof range.intersectsNode === 'function') {
      try { return range.intersectsNode(node); } catch (e) { /* fall through */ }
    }
    const nodeRange = document.createRange();
    nodeRange.selectNodeContents(node);
    return (
      range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 &&
      range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0
    );
  },

  _stepSize(currentPx, direction) {
    const current = parseFloat(currentPx);
    if (isNaN(current)) return currentPx;
    const next = Math.min(999, Math.max(1, Math.round(current) + direction));
    return `${next}px`;
  },

  _snapToScale(px) {
    const target = typeof px === 'string' ? parseFloat(px) : px;
    if (isNaN(target)) return `${this._sizes[Math.floor(this._sizes.length / 2)]}px`;
    return `${this._sizes[this._closestIndex(target)]}px`;
  },

  _closestIndex(px) {
    const target = typeof px === 'string' ? parseFloat(px) : px;
    if (isNaN(target)) return Math.floor(this._sizes.length / 2);
    let bestIdx = 0;
    let bestDiff = Infinity;
    this._sizes.forEach((size, i) => {
      const diff = Math.abs(size - target);
      if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
    });
    return bestIdx;
  },

  _newMarkerId() {
    return `rte-fs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  },

  _reselectMarked(editor, markerId) {
    const els = editor.contentArea.querySelectorAll(`[data-rte-temp="${markerId}"]`);
    if (!els.length) return;
    const range = document.createRange();
    range.setStartBefore(els[0]);
    range.setEndAfter(els[els.length - 1]);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    els.forEach((el) => el.removeAttribute('data-rte-temp'));
  },

  _saveRange() {
    const sel = window.getSelection();
    return sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
  },

  _restoreRange(range) {
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  },
};