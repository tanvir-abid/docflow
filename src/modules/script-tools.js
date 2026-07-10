/**
 * Script Tool Module
 * Renders a single toolbar button showing the active script state
 * (normal / superscript / subscript). Clicking it opens a floating
 * popup with the two script options. Mirrors the AlignmentTool pattern.
 */

import { positionFloatingPanel } from './panel-position.js';

const SCRIPTS = [
  {
    cmd: 'superscript',
    label: 'Superscript',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19l8-8"/>
            <path d="M12 19L4 11"/>
            <path d="M20 12h-4c0-1.5.44-2 1.5-2.5S20 8.33 20 7.33C20 6.42 19.42 6 18.5 6c-.8 0-1.42.33-1.5 1"/>
          </svg>`,
  },
  {
    cmd: 'subscript',
    label: 'Subscript',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 5l8 8"/>
            <path d="M12 5L4 13"/>
            <path d="M20 19h-4c0-1.5.44-2 1.5-2.5S20 15.33 20 14.33C20 13.42 19.42 13 18.5 13c-.8 0-1.42.33-1.5 1"/>
          </svg>`,
  },
];

// Shown on the trigger when neither superscript nor subscript is active
const DEFAULT_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 19l8-8"/>
        <path d="M12 19L4 11"/>
        <path d="M20 7.5h-4c0-1.2.4-1.7 1.3-2.1.8-.4 1.7-.8 1.7-1.6 0-.7-.5-1.05-1.2-1.05-.7 0-1.2.3-1.3.85"/>
      </svg>`;

// Shared chevron-down icon appended to the trigger button
const CHEVRON_ICON = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left:2px;opacity:0.6;flex-shrink:0"><polyline points="6 9 12 15 18 9"/></svg>`;

export const ScriptTool = {
  name: 'script',
  ariaLabel: 'Superscript / Subscript',

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

    // Trigger button — shows the currently-active script icon (or the default)
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'rte-tool-btn';
    trigger.dataset.tool = this.name;
    trigger.setAttribute('aria-label', this.ariaLabel);
    trigger.setAttribute('title', this.ariaLabel);
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.style.cssText = 'display:inline-flex;align-items:center;gap:2px;padding-right:4px;';
    trigger.innerHTML = DEFAULT_ICON + CHEVRON_ICON;
    this._triggerBtn = trigger;

    // Floating popup
    const popup = document.createElement('div');
    popup.className = 'rte-script-popup';
    popup.setAttribute('role', 'toolbar');
    popup.setAttribute('aria-label', 'Script options');
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

    // Build one button per script option inside the popup
    SCRIPTS.forEach(({ cmd, label, icon }) => {
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

        // Mutually exclusive: turn off the other script command first
        const otherCmd = cmd === 'superscript' ? 'subscript' : 'superscript';
        if (document.queryCommandState(otherCmd)) {
          document.execCommand(otherCmd, false, null);
        }
        // execCommand toggles, so clicking an already-active option turns it off
        document.execCommand(cmd, false, null);

        // Reflect the resulting state on the trigger icon
        const isActive = document.queryCommandState(cmd);
        trigger.innerHTML = (isActive ? icon : DEFAULT_ICON) + CHEVRON_ICON;

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
      // Keep active state only if a script command is actually applied
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

    // Update the trigger button's icon to match the active script state
    if (this._triggerBtn) {
      const activeScript = activeCmd
        ? SCRIPTS.find(s => s.cmd === activeCmd)
        : null; // neither superscript nor subscript active
      this._triggerBtn.innerHTML = (activeScript ? activeScript.icon : DEFAULT_ICON) + CHEVRON_ICON;

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