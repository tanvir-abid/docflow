/**
 * Grammar Check Tool — grammar-check.js
 * ════════════════════════════════════════════════════════════════════
 * Checks English grammar and spelling via the free LanguageTool API.
 * No API key required for the public endpoint (~20 req/min free tier).
 *
 * Features
 * ─────────
 * • Toolbar toggle button — ON/OFF, persists while editing
 * • Debounced check (1.5s after user stops typing)
 * • Underlines errors in the contenteditable via <mark> elements:
 *     red    → spelling / typo
 *     orange → grammar / confused words
 *     blue   → style / punctuation / typography
 * • Hover tooltip: error message + clickable suggestion chips
 * • Dismiss (✕) ignores an individual error without fixing it
 * • Error count badge on the toolbar button
 * • Status text appended to the editor's status bar
 * • destroy() cleans up all listeners and DOM nodes
 *
 * Integration (editor.js)
 * ────────────────────────
 * 1. import { GrammarCheckTool } from './modules/grammar-check.js';
 * 2. Add  grammarCheck: GrammarCheckTool  to BUILT_IN_TOOLS
 * 3. Add  'grammarCheck'  to DIVIDER_AFTER (optional)
 * 4. <link rel="stylesheet" href="modules/grammar-check.css">
 *
 * LanguageTool free public API
 * ─────────────────────────────
 * POST https://api.languagetool.org/v2/check
 * Params : text, language (e.g. "en-US")
 * Limits : ~20 req/min, 20 KB/request
 * Docs   : https://languagetool.org/http-api/
 *
 * ── Why createButton() must not touch editor.contentArea / statusBar ──
 * editor.js calls createButton() for every tool BEFORE it creates
 * contentArea and statusBar (both are created later in _buildUI()).
 * Any access to those properties inside createButton() throws
 * "Cannot read properties of undefined", which breaks the entire
 * _buildUI() loop and causes cascading errors in every subsequent
 * tool (ordered-list, table, etc.).
 * Fix: all references to contentArea / statusBar are deferred to
 * _activate() / _postInit(), which are called only after the user
 * clicks the button (by which point _buildUI() has long finished).
 */

const LT_API   = 'https://api.languagetool.org/v2/check';
const DEBOUNCE = 1500;        // ms idle before auto-check fires
const MARK_ATTR = 'data-rte-gc';  // attribute on injected <mark> elements

/* ── Category → CSS class ───────────────────────────────────────── */
const CATEGORY_CLASS = {
  TYPOS:          'rte-gc-mark-spell',
  GRAMMAR:        'rte-gc-mark-grammar',
  STYLE:          'rte-gc-mark-style',
  PUNCTUATION:    'rte-gc-mark-style',
  TYPOGRAPHY:     'rte-gc-mark-style',
  CASING:         'rte-gc-mark-grammar',
  CONFUSED_WORDS: 'rte-gc-mark-grammar',
  REDUNDANCY:     'rte-gc-mark-style',
  COLLOQUIALISMS: 'rte-gc-mark-style',
  PLAIN_ENGLISH:  'rte-gc-mark-style',
  MISC:           'rte-gc-mark-grammar',
};

const categoryClass = (id) => CATEGORY_CLASS[id] || 'rte-gc-mark-grammar';

/* ══════════════════════════════════════════════════════════════════
   Tool export
══════════════════════════════════════════════════════════════════ */
export const GrammarCheckTool = {
  name:      'grammarCheck',
  ariaLabel: 'Grammar & spell check',

  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 7V4h16v3"/>
          <path d="M9 20h6"/>
          <path d="M12 4v16"/>
          <path d="M5 13l2 2 4-4" stroke-width="2.2"/>
        </svg>`,

  /* ── instance state ─────────────────────────────────────────── */
  _editor:           null,
  _btnEl:            null,
  _badgeEl:          null,
  _statusEl:         null,
  _tooltip:          null,
  _tooltipLeaveTimer:null,
  _active:           false,
  _checking:         false,
  _debounceTimer:    null,
  _language:         'en-US',
  _errorCount:       0,
  _postInitDone:     false,   // tracks whether deferred setup ran

  // Stored so they can be removed in destroy()
  _onInput:          null,
  _onDocMousedown:   null,

  /* ══════════════════════════════════════════════════════════════
     createButton
     ─────────────────────────────────────────────────────────────
     IMPORTANT: do NOT reference editor.contentArea or
     editor.statusBar here — they don't exist yet when
     createButton() is called during _buildUI().
  ══════════════════════════════════════════════════════════════ */
  createButton(editor) {
    this._editor = editor;

    const wrap = document.createElement('span');
    wrap.className = 'rte-gc-wrap';

    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'rte-tool-btn rte-gc-btn';
    btn.dataset.tool = this.name;
    btn.setAttribute('aria-label',   this.ariaLabel);
    btn.setAttribute('title',        this.ariaLabel);
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = this.icon;
    this._btnEl   = btn;

    // Error count badge (sits inside the button, safe to create here)
    const badge = document.createElement('span');
    badge.className   = 'rte-gc-badge';
    badge.textContent = '';
    badge.hidden      = true;
    this._badgeEl     = badge;
    btn.appendChild(badge);

    wrap.appendChild(btn);

    // Toggle: activate / deactivate on click.
    // _postInit() runs once on first click to safely wire up the
    // statusBar and contentArea (which now exist by click time).
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this._postInit();   // safe to call repeatedly — no-ops after first run
      this._active ? this._deactivate() : this._activate();
    });

    return wrap;
  },

  /* ══════════════════════════════════════════════════════════════
     _postInit  — runs once on first button click
     Safely accesses editor.statusBar and editor.contentArea,
     which are guaranteed to exist by the time the user clicks.
  ══════════════════════════════════════════════════════════════ */
  _postInit() {
    if (this._postInitDone) return;
    this._postInitDone = true;

    const editor = this._editor;

    // Inject the status text element into the editor's status bar
    const statusEl = document.createElement('span');
    statusEl.className = 'rte-gc-status';
    statusEl.hidden    = true;
    this._statusEl     = statusEl;

    if (editor.statusBar) {
      editor.statusBar.appendChild(statusEl);
    }
    // If statusBar somehow still doesn't exist, the status text
    // simply won't show — non-fatal, the badge and tooltip still work.
  },

  /* ══════════════════════════════════════════════════════════════
     Activate / Deactivate
  ══════════════════════════════════════════════════════════════ */
  _activate() {
    this._active = true;
    this._btnEl.classList.add('rte-tool-active');
    this._btnEl.setAttribute('aria-pressed', 'true');
    if (this._statusEl) this._statusEl.hidden = false;

    // Debounce auto-check on every keystroke
    this._onInput = () => {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => this._runCheck(), DEBOUNCE);
    };
    this._editor.contentArea.addEventListener('input', this._onInput);

    // Close tooltip on click outside
    this._onDocMousedown = (e) => {
      if (this._tooltip && !this._tooltip.contains(e.target)) {
        this._closeTooltip();
      }
    };
    document.addEventListener('mousedown', this._onDocMousedown);

    // Immediate check on activation
    this._runCheck();
  },

  _deactivate() {
    this._active = false;
    this._btnEl.classList.remove('rte-tool-active');
    this._btnEl.setAttribute('aria-pressed', 'false');

    clearTimeout(this._debounceTimer);

    if (this._onInput) {
      this._editor.contentArea.removeEventListener('input', this._onInput);
      this._onInput = null;
    }
    if (this._onDocMousedown) {
      document.removeEventListener('mousedown', this._onDocMousedown);
      this._onDocMousedown = null;
    }

    this._clearMarks();
    this._closeTooltip();
    this._setBadge(0);
    this._setStatus('');
    if (this._statusEl) this._statusEl.hidden = true;
  },

  /* ══════════════════════════════════════════════════════════════
     API call
  ══════════════════════════════════════════════════════════════ */
  async _runCheck() {
    if (!this._active || this._checking) return;

    const text = this._editor.contentArea.innerText.trim();
    if (!text) {
      this._clearMarks();
      this._setBadge(0);
      this._setStatus('Nothing to check');
      return;
    }

    this._checking = true;
    this._setStatus('Checking…');

    try {
      const body = new URLSearchParams({ text, language: this._language });
      const res  = await fetch(LT_API, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });

      if (!res.ok) throw new Error(`LanguageTool API ${res.status}`);

      const data = await res.json();
      this._applyMatches(data.matches || []);

    } catch (err) {
      console.warn('[GrammarCheck]', err.message);
      this._setStatus('Check failed — retrying…');
      // Retry once after 4s for transient rate-limit errors
      setTimeout(() => {
        if (this._active) {
          this._checking = false;
          this._runCheck();
        }
      }, 4000);
      return;
    }

    this._checking = false;
  },

  /* ══════════════════════════════════════════════════════════════
     Apply matches — underline errors in the DOM
  ══════════════════════════════════════════════════════════════ */
  _applyMatches(matches) {
    this._clearMarks();

    if (matches.length === 0) {
      this._setBadge(0);
      this._setStatus('No issues found ✓');
      return;
    }

    const contentArea = this._editor.contentArea;
    const textNodes   = this._collectTextNodes(contentArea);
    const nodeMap     = this._buildNodeMap(textNodes);

    // Process in reverse offset order so earlier wraps don't shift
    // the offsets of later ones
    const sorted = [...matches].sort((a, b) => b.offset - a.offset);
    let marked = 0;

    for (const match of sorted) {
      try {
        this._markRange(nodeMap, match.offset, match.offset + match.length, match);
        marked++;
      } catch (_) {
        // Skip errors that span element boundaries (rare edge case)
      }
    }

    this._errorCount = marked;
    this._setBadge(marked);
    this._setStatus(`${marked} issue${marked !== 1 ? 's' : ''} found`);
    this._attachMarkListeners();
  },

  /* ── Collect text nodes, skipping existing <mark> children ─── */
  _collectTextNodes(root) {
    const nodes  = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.parentElement?.hasAttribute(MARK_ATTR)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  },

  /* ── Build flat offset → {node, start, end} map ────────────── */
  _buildNodeMap(textNodes) {
    let offset = 0;
    return textNodes.map(node => {
      const start = offset;
      offset += node.textContent.length;
      return { node, start, end: offset };
    });
  },

  /* ── Wrap [start, end) in a <mark> ─────────────────────────── */
  _markRange(nodeMap, start, end, match) {
    // Only handles ranges within a single text node (multi-node = skip)
    const entry = nodeMap.find(e => e.start <= start && e.end >= end);
    if (!entry) return;

    const range = document.createRange();
    range.setStart(entry.node, start - entry.start);
    range.setEnd(entry.node,   end   - entry.start);

    const mark = document.createElement('mark');
    mark.setAttribute(MARK_ATTR, '');
    mark.className = `rte-gc-mark ${categoryClass(match.rule?.category?.id)}`;
    mark.dataset.message      = match.message || '';
    mark.dataset.replacements = JSON.stringify(
      (match.replacements || []).slice(0, 5).map(r => r.value)
    );
    mark.dataset.category = match.rule?.category?.name || '';

    range.surroundContents(mark);
  },

  /* ── Attach hover listeners to all live <mark> elements ─────── */
  _attachMarkListeners() {
    this._editor.contentArea
      .querySelectorAll(`[${MARK_ATTR}]`)
      .forEach(mark => {
        mark.addEventListener('mouseenter', () => this._showTooltip(mark));
        mark.addEventListener('mouseleave', () => {
          this._tooltipLeaveTimer = setTimeout(() => {
            if (!this._tooltip?.matches(':hover')) this._closeTooltip();
          }, 120);
        });
      });
  },

  /* ══════════════════════════════════════════════════════════════
     Tooltip
  ══════════════════════════════════════════════════════════════ */
  _showTooltip(markEl) {
    clearTimeout(this._tooltipLeaveTimer);
    this._closeTooltip();

    const message      = markEl.dataset.message   || 'Unknown issue';
    const category     = markEl.dataset.category  || '';
    const replacements = JSON.parse(markEl.dataset.replacements || '[]');

    const tip = document.createElement('div');
    tip.className = 'rte-gc-tooltip';
    tip.setAttribute('role', 'tooltip');

    tip.addEventListener('mouseenter', () => clearTimeout(this._tooltipLeaveTimer));
    tip.addEventListener('mouseleave', () => this._closeTooltip());

    /* ── Header: category chip + dismiss ─────────────────────── */
    const header = document.createElement('div');
    header.className = 'rte-gc-tip-header';

    if (category) {
      const chip = document.createElement('span');
      chip.className   = 'rte-gc-tip-category';
      chip.textContent = category;
      header.appendChild(chip);
    }

    const dismiss = document.createElement('button');
    dismiss.type      = 'button';
    dismiss.className = 'rte-gc-tip-dismiss';
    dismiss.setAttribute('aria-label', 'Dismiss');
    dismiss.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6"  y1="6" x2="18" y2="18"/>
    </svg>`;
    dismiss.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this._unwrapMark(markEl);
      this._closeTooltip();
      this._decrementCount();
    });
    header.appendChild(dismiss);
    tip.appendChild(header);

    /* ── Message ─────────────────────────────────────────────── */
    const msg = document.createElement('p');
    msg.className   = 'rte-gc-tip-message';
    msg.textContent = message;
    tip.appendChild(msg);

    /* ── Suggestion chips ────────────────────────────────────── */
    if (replacements.length > 0) {
      const sugsLabel = document.createElement('div');
      sugsLabel.className   = 'rte-gc-tip-sugs-label';
      sugsLabel.textContent = 'Suggestions';
      tip.appendChild(sugsLabel);

      const sugsRow = document.createElement('div');
      sugsRow.className = 'rte-gc-tip-sugs';

      replacements.forEach(rep => {
        const chip = document.createElement('button');
        chip.type      = 'button';
        chip.className = 'rte-gc-tip-sug';
        chip.textContent = rep;
        chip.setAttribute('aria-label', `Replace with "${rep}"`);
        chip.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this._applyFix(markEl, rep);
          this._closeTooltip();
          this._decrementCount();
        });
        sugsRow.appendChild(chip);
      });
      tip.appendChild(sugsRow);
    }

    /* ── Position inside editor.root (position:relative) ─────── */
    const editor = this._editor;
    editor.root.appendChild(tip);
    this._tooltip = tip;

    const mRect = markEl.getBoundingClientRect();
    const eRect = editor.root.getBoundingClientRect();
    const tRect = tip.getBoundingClientRect();

    let top  = mRect.bottom - eRect.top + 6;
    let left = mRect.left   - eRect.left;

    // Flip upward if tooltip overflows the editor bottom edge
    if (top + tRect.height > eRect.height - 8) {
      top = mRect.top - eRect.top - tRect.height - 6;
    }

    // Clamp horizontally
    left = Math.min(left, eRect.width - tRect.width - 8);
    left = Math.max(left, 4);

    tip.style.top  = `${top}px`;
    tip.style.left = `${left}px`;
  },

  _closeTooltip() {
    this._tooltip?.remove();
    this._tooltip = null;
  },

  /* ══════════════════════════════════════════════════════════════
     Helpers
  ══════════════════════════════════════════════════════════════ */
  _applyFix(markEl, replacement) {
    markEl.replaceWith(document.createTextNode(replacement));
    this._editor.emitChange();
  },

  _unwrapMark(markEl) {
    const parent = markEl.parentNode;
    while (markEl.firstChild) parent.insertBefore(markEl.firstChild, markEl);
    markEl.remove();
  },

  _clearMarks() {
    this._closeTooltip();
    const marks = this._editor?.contentArea?.querySelectorAll(`[${MARK_ATTR}]`) ?? [];
    marks.forEach(m => this._unwrapMark(m));
    this._editor?.contentArea?.normalize();
  },

  _decrementCount() {
    this._errorCount = Math.max(0, this._errorCount - 1);
    this._setBadge(this._errorCount);
    this._setStatus(
      this._errorCount > 0
        ? `${this._errorCount} issue${this._errorCount !== 1 ? 's' : ''} found`
        : 'No issues found ✓'
    );
  },

  _setBadge(count) {
    if (!this._badgeEl) return;
    this._badgeEl.hidden      = count === 0;
    this._badgeEl.textContent = count > 99 ? '99+' : count || '';
  },

  _setStatus(text) {
    if (!this._statusEl) return;
    this._statusEl.textContent = text ? `✦ ${text}` : '';
  },

  /* ══════════════════════════════════════════════════════════════
     updateState — called by editor on every selectionchange
  ══════════════════════════════════════════════════════════════ */
  updateState() {
    // No toolbar state to sync for this tool
  },

  /* ══════════════════════════════════════════════════════════════
     destroy — full cleanup
  ══════════════════════════════════════════════════════════════ */
  destroy() {
    this._deactivate();
    this._statusEl?.remove();
    this._statusEl    = null;
    this._postInitDone = false;
  },
};