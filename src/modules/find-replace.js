/**
 * Find & Replace Tool Module
 * Renders a single toolbar button (magnifying glass icon). Clicking it opens
 * a floating panel with a find field, match navigation, and a replace field
 * with "Replace" / "Replace all" actions. Matches inside the editor's
 * content area are highlighted using <mark> wrappers.
 *
 * Note: the Replace / Replace all buttons use Font Awesome icons
 * (fa-solid fa-right-left), so the host page must include Font Awesome
 * (e.g. its CSS via CDN or a local build) for those icons to render.
 */

import { positionFloatingPanel } from './panel-position.js';

const SEARCH_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;

const PREV_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`;

const NEXT_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

export const FindReplaceTool = {
  name: 'findReplace',
  ariaLabel: 'Find and replace',

  // ── Internal state ──────────────────────────────────────────────────────────
  _triggerBtn:   null,
  _popup:        null,
  _findInput:    null,
  _replaceInput: null,
  _countLabel:   null,
  _caseCheckbox: null,
  _prevBtn:      null,
  _nextBtn:      null,
  _replaceBtn:   null,
  _replaceAllBtn: null,
  _editor:       null,
  _open:         false,
  _matches:      [],
  _activeIndex:  -1,

  // ── createButton ────────────────────────────────────────────────────────────

  createButton(editor) {
    this._editor = editor;
    this._matches = [];
    this._activeIndex = -1;
    this._injectStyles();

    // Wrapper that holds the trigger and the floating popup
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;display:inline-flex;align-items:center;';

    // Trigger button
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'rte-tool-btn';
    trigger.dataset.tool = this.name;
    trigger.setAttribute('aria-label', this.ariaLabel);
    trigger.setAttribute('title', this.ariaLabel);
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = SEARCH_ICON;
    this._triggerBtn = trigger;

    // Floating popup
    const popup = this._buildPopup();
    this._popup = popup;

    // Toggle popup on trigger click
    trigger.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this._open ? this._closePopup() : this._openPopup(trigger);
    });

    // Close popup when clicking outside
    this._outsideHandler = (e) => {
      if (!wrapper.contains(e.target)) this._closePopup();
    };
    document.addEventListener('mousedown', this._outsideHandler);

    // Close popup on Escape
    this._keyHandler = (e) => {
      if (e.key === 'Escape' && this._open) {
        this._closePopup();
        trigger.focus();
      }
    };
    document.addEventListener('keydown', this._keyHandler);

    wrapper.appendChild(trigger);
    wrapper.appendChild(popup);

    return wrapper;
  },

  // ── Popup construction ──────────────────────────────────────────────────────

  _buildPopup() {
    const popup = document.createElement('div');
    popup.className = 'rte-findreplace-popup';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', 'Find and replace');
    popup.style.cssText = [
      'position:absolute',
      'z-index:9999',
      'display:none',
      'flex-direction:column',
      'gap:6px',
      'padding:8px',
      'min-width:260px',
      'border-radius:var(--rte-radius,6px)',
      'background:var(--rte-toolbar-bg,#fff)',
      'border:1px solid var(--rte-border,rgba(0,0,0,.12))',
      'box-shadow:0 4px 12px rgba(0,0,0,.12)',
    ].join(';');

    const inputStyle = [
      'flex:1',
      'min-width:0',
      'padding:4px 6px',
      'font-size:13px',
      'border-radius:4px',
      'border:1px solid var(--rte-border,rgba(0,0,0,.15))',
      'outline:none',
      'color:inherit',
      'background:transparent',
    ].join(';');

    const actionBtnStyle = [
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'gap:4px',
      'padding:0 8px',
      'height:28px',
      'font-size:11px',
      'font-weight:600',
      'border-radius:4px',
      'white-space:nowrap',
    ].join(';');

    // ── Find row ──
    const findRow = document.createElement('div');
    findRow.style.cssText = 'display:flex;align-items:center;gap:4px;';

    const findInput = document.createElement('input');
    findInput.type = 'text';
    findInput.placeholder = 'Find';
    findInput.setAttribute('aria-label', 'Find');
    findInput.style.cssText = inputStyle;

    const countLabel = document.createElement('span');
    countLabel.className = 'rte-findreplace-count';
    countLabel.style.cssText = 'font-size:11px;color:var(--rte-muted,#888);min-width:36px;text-align:center;flex-shrink:0;';
    countLabel.textContent = '';

    const prevBtn = this._makeIconButton(PREV_ICON, 'Previous match', () => this._step(-1));
    const nextBtn = this._makeIconButton(NEXT_ICON, 'Next match', () => this._step(1));

    findRow.append(findInput, countLabel, prevBtn, nextBtn);

    // ── Replace row ──
    const replaceRow = document.createElement('div');
    replaceRow.style.cssText = 'display:flex;align-items:center;gap:4px;';

    const replaceInput = document.createElement('input');
    replaceInput.type = 'text';
    replaceInput.placeholder = 'Replace';
    replaceInput.setAttribute('aria-label', 'Replace');
    replaceInput.style.cssText = inputStyle;

    const replaceBtn = document.createElement('button');
    replaceBtn.type = 'button';
    replaceBtn.className = 'rte-tool-btn';
    replaceBtn.style.cssText = actionBtnStyle;
    replaceBtn.setAttribute('aria-label', 'Replace');
    replaceBtn.setAttribute('title', 'Replace');
    replaceBtn.innerHTML = '<i class="fa-solid fa-right-left" aria-hidden="true"></i>';

    const replaceAllBtn = document.createElement('button');
    replaceAllBtn.type = 'button';
    replaceAllBtn.className = 'rte-tool-btn';
    replaceAllBtn.style.cssText = actionBtnStyle;
    replaceAllBtn.setAttribute('aria-label', 'Replace all');
    replaceAllBtn.setAttribute('title', 'Replace all');
    replaceAllBtn.innerHTML = '<i class="fa-solid fa-border-all" aria-hidden="true"></i>';

    replaceRow.append(replaceInput, replaceBtn, replaceAllBtn);

    // ── Options row ──
    const optionsRow = document.createElement('div');
    optionsRow.style.cssText = 'display:flex;align-items:center;gap:8px;';

    const caseLabel = document.createElement('label');
    caseLabel.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;';
    const caseCheckbox = document.createElement('input');
    caseCheckbox.type = 'checkbox';
    caseLabel.append(caseCheckbox, document.createTextNode('Match case'));
    optionsRow.append(caseLabel);

    popup.append(findRow, replaceRow, optionsRow);

    // Store refs
    this._findInput = findInput;
    this._replaceInput = replaceInput;
    this._countLabel = countLabel;
    this._caseCheckbox = caseCheckbox;
    this._prevBtn = prevBtn;
    this._nextBtn = nextBtn;
    this._replaceBtn = replaceBtn;
    this._replaceAllBtn = replaceAllBtn;
    this._updateButtons();

    // ── Events ──
    findInput.addEventListener('input', () => this._runSearch());
    findInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.shiftKey ? this._step(-1) : this._step(1);
      }
    });

    replaceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._replaceCurrent();
      }
    });

    caseCheckbox.addEventListener('change', () => this._runSearch());

    replaceBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this._replaceCurrent();
    });

    replaceAllBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this._replaceAll();
    });

    return popup;
  },

  _makeIconButton(icon, label, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rte-tool-btn';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    btn.innerHTML = icon;
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onClick();
    });
    return btn;
  },

  _injectStyles() {
    if (document.getElementById('rte-findreplace-styles')) return;
    const style = document.createElement('style');
    style.id = 'rte-findreplace-styles';
    style.textContent = `
      .rte-find-highlight { background: rgba(255, 212, 0, .45); border-radius: 2px; }
      .rte-find-highlight-active { background: rgba(255, 150, 0, .65); }
      .rte-findreplace-popup .fa-right-left { font-size: 12px; }
      .rte-findreplace-popup button span { font-size: 11px; }
    `;
    document.head.appendChild(style);
  },

  // ── Popup open / close ──────────────────────────────────────────────────────

  _openPopup(trigger) {
    const popup = this._popup;
    popup.style.visibility = 'hidden';
    popup.style.display = 'flex';
    this._open = true;
    trigger.setAttribute('aria-expanded', 'true');
    trigger.classList.add('rte-tool-active');

    positionFloatingPanel(popup, trigger, popup.parentElement);
    popup.style.visibility = '';

    // Prefill the find field with the current selection, if any
    const selection = document.getSelection();
    if (selection && !selection.isCollapsed && !this._findInput.value) {
      const selected = selection.toString();
      if (selected && !selected.includes('\n')) {
        this._findInput.value = selected;
      }
    }

    this._findInput.focus();
    this._findInput.select();

    if (this._findInput.value) this._runSearch();
  },

  _closePopup() {
    if (!this._popup) return;
    this._popup.style.display = 'none';
    this._open = false;
    if (this._triggerBtn) {
      this._triggerBtn.setAttribute('aria-expanded', 'false');
      this._triggerBtn.classList.remove('rte-tool-active');
    }
    this._clearHighlights();
    this._matches = [];
    this._activeIndex = -1;
    this._updateCount();
    this._updateButtons();
  },

  // ── Search / highlight helpers ──────────────────────────────────────────────

  _collectTextNodes() {
    const root = this._editor.contentArea;
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (n.textContent) nodes.push(n);
    }
    return nodes;
  },

  _clearHighlights() {
    const root = this._editor.contentArea;
    const marks = root.querySelectorAll('mark.rte-find-highlight');
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
    });
  },

  // Wraps every occurrence of `needle` within a single text node in <mark>
  // elements, splitting the text node as needed. Returns the marks in
  // left-to-right order.
  _highlightInNode(node, needle, matchCase) {
    const text = node.textContent;
    const haystack = matchCase ? text : text.toLowerCase();

    const positions = [];
    let idx = 0;
    let pos;
    while ((pos = haystack.indexOf(needle, idx)) !== -1) {
      positions.push(pos);
      idx = pos + needle.length;
    }
    if (!positions.length) return [];

    const marks = [];
    let workingNode = node;
    let offset = 0;

    for (const start of positions) {
      const relStart = start - offset;
      const matchNode = workingNode.splitText(relStart);
      workingNode = matchNode.splitText(needle.length);

      const mark = document.createElement('mark');
      mark.className = 'rte-find-highlight';
      matchNode.parentNode.insertBefore(mark, workingNode);
      mark.appendChild(matchNode);

      marks.push(mark);
      offset = start + needle.length;
    }

    return marks;
  },

  _runSearch() {
    this._clearHighlights();
    this._matches = [];
    this._activeIndex = -1;

    const query = this._findInput.value;
    if (!query) {
      this._updateCount();
      this._updateButtons();
      return;
    }

    const matchCase = this._caseCheckbox.checked;
    const needle = matchCase ? query : query.toLowerCase();
    const textNodes = this._collectTextNodes();

    textNodes.forEach((node) => {
      const marks = this._highlightInNode(node, needle, matchCase);
      if (marks.length) this._matches.push(...marks);
    });

    if (this._matches.length) {
      this._activeIndex = 0;
      this._highlightActive();
    }

    this._updateCount();
    this._updateButtons();
  },

  _highlightActive() {
    this._matches.forEach((mark, i) => {
      mark.classList.toggle('rte-find-highlight-active', i === this._activeIndex);
    });
    const active = this._matches[this._activeIndex];
    if (active && active.scrollIntoView) {
      active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  },

  _step(direction) {
    if (!this._matches.length) return;
    const len = this._matches.length;
    this._activeIndex = (this._activeIndex + direction + len) % len;
    this._highlightActive();
    this._updateCount();
  },

  // ── Replace ──────────────────────────────────────────────────────────────────

  _replaceCurrent() {
    if (!this._matches.length || this._activeIndex < 0) return;

    // Pull the active mark before touching the DOM
    const mark = this._matches[this._activeIndex];
    const parent = mark.parentNode;
    if (!parent) return;

    parent.replaceChild(document.createTextNode(this._replaceInput.value), mark);
    // Do NOT normalize here — sibling marks from the same parent are still
    // live DOM nodes; normalizing would merge them into plain text and detach them.

    // Remove only the replaced mark from our tracking list
    this._matches.splice(this._activeIndex, 1);
    this._editor.emitChange();

    if (this._matches.length) {
      // Stay at the same index — it now points to the next match.
      // Wrap around if we just replaced the last one.
      if (this._activeIndex >= this._matches.length) this._activeIndex = 0;
      this._highlightActive();
    } else {
      this._activeIndex = -1;
    }

    this._updateCount();
    this._updateButtons();
  },

  _replaceAll() {
    if (!this._matches.length) return;

    // Snapshot the list first — after each replaceChild the siblings from
    // the same parent stay valid, but we normalize at the end, so iterate
    // the snapshot and guard with a parentNode check on each mark.
    const snapshot = this._matches.slice();
    const replacement = this._replaceInput.value;

    snapshot.forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return; // already detached (shouldn't happen)
      parent.replaceChild(document.createTextNode(replacement), mark);
    });

    // Safe to normalize now that every mark has been removed
    this._editor.contentArea.normalize();

    this._matches = [];
    this._activeIndex = -1;
    this._editor.emitChange();

    // Re-run so the counter resets (also catches new matches if the
    // replacement text itself contains the search term)
    this._runSearch();
  },

  // ── UI state helpers ────────────────────────────────────────────────────────

  _updateCount() {
    if (!this._countLabel) return;
    if (!this._matches.length) {
      this._countLabel.textContent = this._findInput && this._findInput.value ? '0/0' : '';
    } else {
      this._countLabel.textContent = `${this._activeIndex + 1}/${this._matches.length}`;
    }
  },

  _updateButtons() {
    const hasMatches = this._matches.length > 0;
    [this._prevBtn, this._nextBtn, this._replaceBtn, this._replaceAllBtn].forEach((btn) => {
      if (btn) btn.disabled = !hasMatches;
    });
  },

  // ── Toolbar state sync ──────────────────────────────────────────────────────

  updateState() {
    // Find & Replace has no formatting state to reflect on the trigger button.
  },

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  destroy() {
    if (this._outsideHandler) document.removeEventListener('mousedown', this._outsideHandler);
    if (this._keyHandler)     document.removeEventListener('keydown',   this._keyHandler);
    this._clearHighlights();
  },
};