/**
 * Alignment Tool Module
 * Renders a single toolbar button showing the active alignment icon.
 * Clicking it opens a tooltip popup with all four alignment options.
 */

import { positionFloatingPanel } from './panel-position.js';

const ALIGNMENTS = [
  {
    cmd: 'justifyLeft',
    label: 'Align left',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="6" x2="3" y2="6"/><line x1="15" y1="12" x2="3" y2="12"/><line x1="17" y1="18" x2="3" y2="18"/></svg>`,
  },
  {
    cmd: 'justifyCenter',
    label: 'Align center',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="6" x2="3" y2="6"/><line x1="17" y1="12" x2="7" y2="12"/><line x1="19" y1="18" x2="5" y2="18"/></svg>`,
  },
  {
    cmd: 'justifyRight',
    label: 'Align right',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="12" x2="9" y2="12"/><line x1="21" y1="18" x2="7" y2="18"/></svg>`,
  },
  {
    cmd: 'justifyFull',
    label: 'Justify',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="12" x2="3" y2="12"/><line x1="21" y1="18" x2="3" y2="18"/></svg>`,
  },
];

// Shared chevron-down icon appended to the trigger button
const CHEVRON_ICON = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left:2px;opacity:0.6;flex-shrink:0"><polyline points="6 9 12 15 18 9"/></svg>`;

export const AlignmentTool = {
  name: 'alignment',
  ariaLabel: 'Text alignment',

  // ── Internal state ──────────────────────────────────────────────────────────
  _triggerBtn: null,
  _popup:      null,
  _buttons:    [],
  _open:       false,

  // ── createButton ────────────────────────────────────────────────────────────

  createButton(editor) {
    // Wrapper that holds the trigger and the floating popup
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;display:inline-flex;align-items:center;';

    // Trigger button — shows the currently-active alignment icon
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'rte-tool-btn';
    trigger.dataset.tool = this.name;
    trigger.setAttribute('aria-label', this.ariaLabel);
    trigger.setAttribute('title', this.ariaLabel);
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.style.cssText = 'display:inline-flex;align-items:center;gap:2px;padding-right:4px;';
    trigger.innerHTML = ALIGNMENTS[0].icon + CHEVRON_ICON;
    this._triggerBtn = trigger;

    // Floating popup
    const popup = document.createElement('div');
    popup.className = 'rte-align-popup';
    popup.setAttribute('role', 'toolbar');
    popup.setAttribute('aria-label', 'Alignment options');
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

    // Build one button per alignment inside the popup
    ALIGNMENTS.forEach(({ cmd, label, icon }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rte-tool-btn';
      btn.dataset.tool = this.name;
      btn.dataset.cmd = cmd;
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
      btn.setAttribute('aria-pressed', 'false');
      btn.innerHTML = icon;

      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        editor.contentArea.focus();
        document.execCommand(cmd, false, null);
        // Update trigger icon to reflect the chosen alignment
        trigger.innerHTML = icon + CHEVRON_ICON;
        this._closePopup();
        editor.syncToolbarState();
        editor.emitChange();
      });

      popup.appendChild(btn);
      this._buttons.push({ btn, cmd });
    });

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

    // Store editor ref for updateState
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
      // Keep active state only if an alignment is actually applied
      const anyActive = this._buttons.some(({ cmd }) => {
        try { return document.queryCommandState(cmd); } catch { return false; }
      });
      this._triggerBtn.classList.toggle('rte-tool-active', anyActive);
    }
  },

  // ── Toolbar state sync ──────────────────────────────────────────────────────

  updateState(wrapper) {
    if (!this._buttons.length) return;

    let activeCmd = null;
    this._buttons.forEach(({ btn, cmd }) => {
      let active = false;
      try { active = document.queryCommandState(cmd); } catch { /* ignore */ }
      btn.classList.toggle('rte-tool-active', active);
      btn.setAttribute('aria-pressed', String(active));
      if (active) activeCmd = cmd;
    });

    // Update the trigger button's icon to match the active alignment
    if (this._triggerBtn) {
      const activeAlignment = activeCmd
        ? ALIGNMENTS.find(a => a.cmd === activeCmd)
        : ALIGNMENTS[0]; // default to left if none active
      this._triggerBtn.innerHTML = activeAlignment.icon + CHEVRON_ICON;

      // Mark trigger active only when popup is open
      if (!this._open) {
        this._triggerBtn.classList.toggle('rte-tool-active', !!activeCmd);
      }
    }
  },

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  destroy() {
    if (this._outsideHandler) document.removeEventListener('mousedown', this._outsideHandler);
    if (this._keyHandler)     document.removeEventListener('keydown',   this._keyHandler);
  },
};