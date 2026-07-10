/**
 * Drop Cap Tool Module
 * Renders a single toolbar button showing a drop-cap icon. Clicking it opens
 * a popup letting the user apply (or remove) a drop cap on the paragraph the
 * caret is currently in, with a choice of how many lines it should span.
 */

import { positionFloatingPanel } from './panel-position.js';

const BLOCK_TAGS = ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'];

const DROPCAP_SIZES = [
  { value: 0, label: 'None' },
  { value: 2, label: '2 lines' },
  { value: 3, label: '3 lines' },
  { value: 4, label: '4 lines' },
];

// Font-size multiplier (em, relative to the paragraph's own font-size) per line count
const SIZE_EM = { 2: 2.6, 3: 3.8, 4: 5.0 };

// Trigger icon: a large dropped letter shape next to lines of text
const TRIGGER_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V8a3 3 0 0 1 3-3h1a3 3 0 0 1 3 3v11" stroke-width="2.4"/><line x1="4" y1="14" x2="11" y2="14" stroke-width="2.4"/><line x1="14" y1="7" x2="21" y2="7"/><line x1="14" y1="11" x2="21" y2="11"/><line x1="14" y1="15" x2="21" y2="15"/><line x1="14" y1="19" x2="19" y2="19"/></svg>`;

// Shared chevron-down icon appended to the trigger button
const CHEVRON_ICON = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left:2px;opacity:0.6;flex-shrink:0"><polyline points="6 9 12 15 18 9"/></svg>`;

export const DropCapTool = {
  name: 'dropCap',
  ariaLabel: 'Drop cap',

  // ── Internal state ──────────────────────────────────────────────────────────
  _triggerBtn: null,
  _popup:      null,
  _buttons:    [],
  _open:       false,
  _editor:     null,

  // ── createButton ────────────────────────────────────────────────────────────

  createButton(editor) {
    this._editor = editor;

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;display:inline-flex;align-items:center;';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'rte-tool-btn';
    trigger.dataset.tool = this.name;
    trigger.setAttribute('aria-label', this.ariaLabel);
    trigger.setAttribute('title', this.ariaLabel);
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.style.cssText = 'display:inline-flex;align-items:center;gap:2px;padding-right:4px;';
    trigger.innerHTML = TRIGGER_ICON + CHEVRON_ICON;
    this._triggerBtn = trigger;

    const popup = document.createElement('div');
    popup.className = 'rte-dropcap-popup';
    popup.setAttribute('role', 'toolbar');
    popup.setAttribute('aria-label', 'Drop cap size');
    popup.style.cssText = [
      'position:absolute',
      'z-index:9999',
      'display:none',
      'flex-direction:row',
      'gap:2px',
      'padding:4px',
      'border-radius:var(--rte-radius,6px)',
      'background:var(--rte-toolbar-bg,#fff)',
      'border:1px solid var(--rte-border,rgba(0,0,0,.12))',
      'box-shadow:0 4px 12px rgba(0,0,0,.12)',
      'white-space:nowrap',
    ].join(';');
    this._popup = popup;
    this._buttons = [];

    DROPCAP_SIZES.forEach(({ value, label }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rte-tool-btn';
      btn.dataset.tool = this.name;
      btn.dataset.lines = String(value);
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
      btn.setAttribute('aria-pressed', 'false');
      btn.style.cssText = 'padding:4px 9px;font-size:12px;';
      btn.textContent = label;

      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this._editor.contentArea.focus();
        this._applyToCurrentBlock(value);
        this._syncButtons(value);
        this._closePopup();
        this._editor.syncToolbarState?.();
        this._editor.emitChange?.();
      });

      popup.appendChild(btn);
      this._buttons.push({ btn, value });
    });

    trigger.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this._open ? this._closePopup() : this._openPopup(trigger);
    });

    this._outsideHandler = (e) => {
      if (!wrapper.contains(e.target)) this._closePopup();
    };
    document.addEventListener('mousedown', this._outsideHandler);

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

  // ── Popup open / close ──────────────────────────────────────────────────────

  _openPopup(trigger) {
    const popup = this._popup;
    popup.style.visibility = 'hidden';
    popup.style.display = 'flex';
    this._open = true;
    trigger.setAttribute('aria-expanded', 'true');
    trigger.classList.add('rte-tool-active');

    // Reflect the current block's drop-cap state in the popup
    this._syncButtons(this._getCurrentLines());

    positionFloatingPanel(popup, trigger, popup.parentElement);
    popup.style.visibility = '';
  },

  _closePopup() {
    if (!this._popup) return;
    this._popup.style.display = 'none';
    this._open = false;
    if (this._triggerBtn) {
      this._triggerBtn.setAttribute('aria-expanded', 'false');
      this._triggerBtn.classList.toggle('rte-tool-active', !!this._getCurrentLines());
    }
  },

  _syncButtons(activeLines) {
    this._buttons.forEach(({ btn, value }) => {
      const active = value === activeLines;
      btn.classList.toggle('rte-tool-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  },

  // ── Locating the current block ──────────────────────────────────────────────

  _getCurrentBlock() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !this._editor?.contentArea) return null;

    let node = sel.getRangeAt(0).startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;

    while (node && node !== this._editor.contentArea) {
      if (BLOCK_TAGS.includes(node.tagName)) return node;
      node = node.parentNode;
    }
    return null;
  },

  _getCurrentLines() {
    const block = this._getCurrentBlock();
    const span = block?.querySelector('.rte-dropcap');
    return span ? Number(span.dataset.lines) : 0;
  },

  // ── Applying / removing the drop cap ─────────────────────────────────────────

  _applyToCurrentBlock(lines) {
    const block = this._getCurrentBlock();
    if (!block) return;

    // Always strip any existing drop cap first
    const existing = block.querySelector('.rte-dropcap');
    if (existing) this._unwrap(existing);

    if (!lines) return; // "None" — just removed above

    // Find the first non-empty text node in the block
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.textContent.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
    });
    const firstTextNode = walker.nextNode();
    if (!firstTextNode) return;

    const match = firstTextNode.textContent.match(/^(\s*)(\S)/);
    if (!match) return;
    const [fullMatch, leadingWs, firstChar] = match;
    const rest = firstTextNode.textContent.slice(fullMatch.length);

    const span = document.createElement('span');
    span.className = 'rte-dropcap';
    span.dataset.lines = String(lines);
    span.style.cssText = [
      'float:left',
      `font-size:${SIZE_EM[lines] || 2.6}em`,
      'line-height:0.85',
      'font-weight:700',
      'padding-right:6px',
      'padding-top:2px',
    ].join(';');
    span.textContent = firstChar;

    const parent = firstTextNode.parentNode;
    const restNode = document.createTextNode(leadingWs + rest);
    parent.replaceChild(restNode, firstTextNode);
    parent.insertBefore(span, restNode);
  },

  _unwrap(span) {
    const parent = span.parentNode;
    const textNode = document.createTextNode(span.textContent);
    parent.replaceChild(textNode, span);
    parent.normalize();
  },

  // ── Toolbar state sync ──────────────────────────────────────────────────────

  updateState(wrapper) {
    const lines = this._getCurrentLines();
    if (this._triggerBtn) {
      this._triggerBtn.classList.toggle('rte-tool-active', !!lines);
    }
    if (this._open) this._syncButtons(lines);
  },

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  destroy() {
    if (this._outsideHandler) document.removeEventListener('mousedown', this._outsideHandler);
    if (this._keyHandler)     document.removeEventListener('keydown',   this._keyHandler);
  },
};