/**
 * Highlight Tool Module
 * Renders a single toolbar button showing a highlighter icon with a small
 * color bar underneath reflecting the active/last-used highlight color.
 * Clicking it opens a tooltip popup with a row of color swatches plus a
 * "remove highlight" option — structurally identical to AlignmentTool.
 *
 * HighlightTool.applyColor(editor, color) is also exposed as a standalone
 * method so other UI (e.g. the selection tooltip) can apply a highlight
 * directly to the current selection without going through the popup.
 */

import { positionFloatingPanel } from './panel-position.js';

const HIGHLIGHT_COLORS = [
  { value: '#fef08a', label: 'Yellow' },
  { value: '#bbf7d0', label: 'Green'  },
  { value: '#bfdbfe', label: 'Blue'   },
  { value: '#fbcfe8', label: 'Pink'   },
  { value: '#fed7aa', label: 'Orange' },
];

// Sentinel value used to clear a highlight. Supported by both the
// 'hiliteColor' and 'backColor' execCommand variants across browsers.
const NO_HIGHLIGHT = 'transparent';

// Highlighter-pen trigger icon
const HIGHLIGHTER_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h3l6-6"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/><path d="M3 21h6"/></svg>`;

// "No highlight" icon used as the last swatch in the popup
const NO_HIGHLIGHT_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="5.5" y1="5.5" x2="18.5" y2="18.5"/></svg>`;

// Shared chevron-down icon appended to the trigger button
const CHEVRON_ICON = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left:2px;opacity:0.6;flex-shrink:0"><polyline points="6 9 12 15 18 9"/></svg>`;

// Use 'hiliteColor' where supported (most browsers); fall back to 'backColor'
// (older WebKit / some Safari versions) for the actual command name.
function highlightCommand() {
  try {
    if (document.queryCommandSupported && document.queryCommandSupported('hiliteColor')) {
      return 'hiliteColor';
    }
  } catch { /* ignore */ }
  return 'backColor';
}

// Normalize a CSS color string (e.g. "rgb(254, 240, 138)") to lowercase hex
// so it can be compared against the HIGHLIGHT_COLORS values above.
function toHex(color) {
  if (!color) return null;
  if (color.startsWith('#')) return color.toLowerCase();
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return null;
  const [, r, g, b] = m;
  return '#' + [r, g, b].map(n => (+n).toString(16).padStart(2, '0')).join('');
}

export const HighlightTool = {
  name: 'highlight',
  ariaLabel: 'Highlight color',
  DEFAULT_COLOR: HIGHLIGHT_COLORS[0].value,

  // ── Internal state ──────────────────────────────────────────────────────────
  _triggerBtn: null,
  _popup:      null,
  _buttons:    [],
  _open:       false,

  // ── Public: apply a highlight color to the current selection ─────────────────
  // Reusable by both the popup buttons below and external callers (e.g. the
  // selection tooltip's one-click "Highlight" action).
  applyColor(editor, color) {
    if (!editor || !editor.contentArea) return;
    editor.contentArea.focus();
    // styleWithCSS makes execCommand write inline `background-color` styles
    // instead of legacy <font> tags — more predictable, easier to detect later.
    try { document.execCommand('styleWithCSS', false, true); } catch { /* ignore */ }
    document.execCommand(highlightCommand(), false, color);
  },

  // ── createButton ────────────────────────────────────────────────────────────

  createButton(editor) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;display:inline-flex;align-items:center;';

    // Trigger button — highlighter icon + color bar reflecting active color
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'rte-tool-btn';
    trigger.dataset.tool = this.name;
    trigger.setAttribute('aria-label', this.ariaLabel);
    trigger.setAttribute('title', this.ariaLabel);
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.style.cssText = 'display:inline-flex;align-items:center;gap:2px;padding-right:4px;';

    const iconWrap = document.createElement('span');
    iconWrap.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;gap:1px;';
    iconWrap.innerHTML = HIGHLIGHTER_ICON;

    const colorBar = document.createElement('span');
    colorBar.style.cssText = `display:block;width:14px;height:3px;border-radius:1px;background:${this.DEFAULT_COLOR};`;
    iconWrap.appendChild(colorBar);
    this._colorBar = colorBar;

    trigger.appendChild(iconWrap);
    trigger.insertAdjacentHTML('beforeend', CHEVRON_ICON);
    this._triggerBtn = trigger;

    // Floating popup
    const popup = document.createElement('div');
    popup.className = 'rte-align-popup';
    popup.setAttribute('role', 'toolbar');
    popup.setAttribute('aria-label', 'Highlight color options');
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

    // One swatch button per color
    HIGHLIGHT_COLORS.forEach(({ value, label }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rte-tool-btn';
      btn.dataset.tool = this.name;
      btn.dataset.color = value;
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
      btn.setAttribute('aria-pressed', 'false');
      btn.innerHTML = `<span style="display:block;width:16px;height:16px;border-radius:50%;background:${value};border:1px solid rgba(0,0,0,.1);"></span>`;

      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.applyColor(editor, value);
        colorBar.style.background = value;
        this._closePopup();
        editor.syncToolbarState();
        editor.emitChange();
      });

      popup.appendChild(btn);
      this._buttons.push({ btn, value });
    });

    // "Remove highlight" button
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'rte-tool-btn';
    removeBtn.dataset.tool = this.name;
    removeBtn.dataset.color = NO_HIGHLIGHT;
    removeBtn.setAttribute('aria-label', 'Remove highlight');
    removeBtn.setAttribute('title', 'Remove highlight');
    removeBtn.innerHTML = NO_HIGHLIGHT_ICON;
    removeBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.applyColor(editor, NO_HIGHLIGHT);
      colorBar.style.background = 'transparent';
      colorBar.style.border = '1px solid rgba(0,0,0,.2)';
      this._closePopup();
      editor.syncToolbarState();
      editor.emitChange();
    });
    popup.appendChild(removeBtn);
    this._buttons.push({ btn: removeBtn, value: NO_HIGHLIGHT });

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

    this._editor = editor;

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

    positionFloatingPanel(popup, trigger, popup.parentElement);
    popup.style.visibility = '';
  },

  _closePopup() {
    if (!this._popup) return;
    this._popup.style.display = 'none';
    this._open = false;
    if (this._triggerBtn) {
      this._triggerBtn.setAttribute('aria-expanded', 'false');
      const active = this._currentColor(this._editor);
      this._triggerBtn.classList.toggle('rte-tool-active', !!active && active !== NO_HIGHLIGHT);
    }
  },

  // ── Toolbar state sync ──────────────────────────────────────────────────────

  // Reads the highlight color currently applied at the caret/selection, if any.
  _currentColor(editor) {
    if (!editor || !editor.contentArea) return null;
    let raw = null;
    try { raw = document.queryCommandValue(highlightCommand()); } catch { /* ignore */ }
    const hex = toHex(raw);
    if (!hex) return null;
    if (hex === '#ffffff' && highlightCommand() === 'backColor') return null; // default/no color in some browsers
    return hex;
  },

  updateState(wrapper) {
    if (!this._editor) return;
    const activeHex = this._currentColor(this._editor);

    this._buttons.forEach(({ btn, value }) => {
      const active = activeHex && toHex(value) === activeHex;
      btn.classList.toggle('rte-tool-active', !!active);
      btn.setAttribute('aria-pressed', String(!!active));
    });

    if (this._colorBar) {
      this._colorBar.style.background = activeHex || this.DEFAULT_COLOR;
    }

    if (this._triggerBtn && !this._open) {
      this._triggerBtn.classList.toggle('rte-tool-active', !!activeHex);
    }
  },

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  destroy() {
    if (this._outsideHandler) document.removeEventListener('mousedown', this._outsideHandler);
    if (this._keyHandler)     document.removeEventListener('keydown',   this._keyHandler);
  },
};