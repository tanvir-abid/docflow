/**
 * Margin Presets Tool Module
 * Renders a single toolbar button showing the active margin preset.
 * Clicking it opens a tooltip popup with four margin presets (Slim, Narrow,
 * Normal, Moderate) that update the document's page margins.
 *
 * Unlike AlignmentTool, margins aren't a per-selection execCommand — they're
 * a document-wide setting (docSettings.marginV / docSettings.marginH) that
 * lives on the host page, not inside the editor instance. To stay decoupled
 * from RichTextEditor's internals, this tool reads/writes margins through
 * two small hooks the host page (editor.html) attaches onto the `editor`
 * object right after construction:
 *
 *   editor.getMargins()            -> { marginV, marginH }   (mm)
 *   editor.setMargins(marginV, marginH)                      (mm)
 *
 * Both calls are deferred to interaction time (button click / updateState)
 * rather than button-creation time, since createButton(editor) can run
 * before the host page has had a chance to attach those hooks.
 */

import { positionFloatingPanel } from './panel-position.js';

const PRESETS = [
  { id: 'slim',     label: 'Slim',     marginV: 8,    marginH: 8     },
  { id: 'narrow',   label: 'Narrow',   marginV: 12.7, marginH: 12.7  },
  { id: 'normal',   label: 'Normal',   marginV: 25.4, marginH: 25.4  },
  { id: 'moderate', label: 'Moderate', marginV: 25.4, marginH: 19.05 },
];

// Relative bar thickness used inside the preset icon to suggest margin
// size — illustrative only, not drawn to any real scale.
const ICON_BAR = { slim: 1, narrow: 2, normal: 3, moderate: 4 };

function presetIcon(id) {
  const bar = ICON_BAR[id] ?? 2;
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
    <rect x="2" y="2" width="20" height="20" rx="1.5" stroke-opacity="0.9"/>
    <rect x="${2 + bar}" y="${2 + bar}" width="${20 - bar * 2}" height="${20 - bar * 2}" stroke-dasharray="2 2" stroke-opacity="0.55"/>
  </svg>`;
}

// Shared chevron-down icon appended to the trigger button
const CHEVRON_ICON = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left:2px;opacity:0.6;flex-shrink:0"><polyline points="6 9 12 15 18 9"/></svg>`;

function sameMargins(a, b, epsilon = 0.05) {
  return Math.abs(a.marginV - b.marginV) < epsilon && Math.abs(a.marginH - b.marginH) < epsilon;
}

function formatMm(v) {
  // 25.4 -> "25.4mm", 8 -> "8mm" (no trailing .0)
  return `${Math.round(v * 10) / 10}mm`;
}

export const MarginPresetsTool = {
  name: 'margins',
  ariaLabel: 'Page margins',

  // ── Internal state ──────────────────────────────────────────────────────────
  _triggerBtn: null,
  _popup:      null,
  _buttons:    [],
  _open:       false,
  _editor:     null,

  // ── createButton ────────────────────────────────────────────────────────────

  createButton(editor) {
    this._editor = editor;

    // Wrapper that holds the trigger and the floating popup
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;display:inline-flex;align-items:center;';

    // Trigger button — shows an icon for the currently-active preset
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'rte-tool-btn';
    trigger.dataset.tool = this.name;
    trigger.setAttribute('aria-label', this.ariaLabel);
    trigger.setAttribute('title', this.ariaLabel);
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.style.cssText = 'display:inline-flex;align-items:center;gap:2px;padding-right:4px;';
    trigger.innerHTML = presetIcon('normal') + CHEVRON_ICON;
    this._triggerBtn = trigger;

    // Floating popup
    const popup = document.createElement('div');
    popup.className = 'rte-margins-popup';
    popup.setAttribute('role', 'toolbar');
    popup.setAttribute('aria-label', 'Margin presets');
    popup.style.cssText = [
      'position:absolute',
      'z-index:9999',
      'display:none',
      'flex-direction:column',
      'gap:1px',
      'padding:4px',
      'min-width:172px',
      'border-radius:var(--rte-radius,6px)',
      'background:var(--rte-toolbar-bg,#fff)',
      'border:1px solid var(--rte-border,rgba(0,0,0,.12))',
      'box-shadow:0 4px 12px rgba(0,0,0,.12)',
    ].join(';');
    this._popup = popup;
    this._buttons = [];

    // Build one button per margin preset inside the popup
    PRESETS.forEach((preset) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rte-tool-btn rte-margins-option';
      btn.dataset.tool = this.name;
      btn.dataset.preset = preset.id;
      btn.setAttribute('aria-label', `${preset.label} margins, ${formatMm(preset.marginV)} top and bottom, ${formatMm(preset.marginH)} left and right`);
      btn.setAttribute('aria-pressed', 'false');
      btn.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;text-align:left;border-radius:4px;';
      btn.innerHTML = `
        ${presetIcon(preset.id)}
        <span style="flex:1;font-size:.8rem;font-weight:500;">${preset.label}</span>
        <span style="font-size:.7rem;opacity:.55;white-space:nowrap;">${formatMm(preset.marginV)} · ${formatMm(preset.marginH)}</span>
      `;

      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (editor.contentArea) editor.contentArea.focus();

        if (typeof editor.setMargins === 'function') {
          editor.setMargins(preset.marginV, preset.marginH);
        }

        // Optimistic icon update — updateState() (triggered via
        // syncToolbarState below) confirms/corrects it from the real
        // docSettings values once the host page has applied them.
        trigger.innerHTML = presetIcon(preset.id) + CHEVRON_ICON;
        trigger.setAttribute('title', `${this.ariaLabel}: ${preset.label}`);

        this._closePopup();
        if (typeof editor.syncToolbarState === 'function') editor.syncToolbarState();
      });

      popup.appendChild(btn);
      this._buttons.push({ btn, preset });
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

    // Refresh which preset is checked every time the popup opens, in case
    // margins were changed elsewhere (e.g. the Settings dropdown's manual
    // mm inputs) since the last sync.
    this._syncFromEditor();

    positionFloatingPanel(popup, trigger, popup.parentElement);
    popup.style.visibility = '';
  },

  _closePopup() {
    if (!this._popup) return;
    this._popup.style.display = 'none';
    this._open = false;
    if (this._triggerBtn) {
      this._triggerBtn.setAttribute('aria-expanded', 'false');
      this._triggerBtn.classList.remove('rte-tool-active');
    }
  },

  // ── Toolbar state sync ──────────────────────────────────────────────────────
  // Called by the editor the same way it calls every other tool's
  // updateState (selection change, click, etc.). Margins have no DOM
  // command/state to query like alignment does, so this is also the safe
  // point to read current values back from the host page via
  // editor.getMargins() — it isn't guaranteed to exist yet when
  // createButton() first runs.

  updateState() {
    this._syncFromEditor();
  },

  _syncFromEditor() {
    if (!this._buttons.length || !this._editor || typeof this._editor.getMargins !== 'function') return;

    const current = this._editor.getMargins();
    if (!current) return;

    let activePreset = null;
    this._buttons.forEach(({ btn, preset }) => {
      const active = sameMargins(current, preset);
      btn.classList.toggle('rte-tool-active', active);
      btn.setAttribute('aria-pressed', String(active));
      if (active) activePreset = preset;
    });

    if (this._triggerBtn) {
      const icon = activePreset ? presetIcon(activePreset.id) : presetIcon('normal');
      this._triggerBtn.innerHTML = icon + CHEVRON_ICON;
      this._triggerBtn.setAttribute(
        'title',
        activePreset ? `${this.ariaLabel}: ${activePreset.label}` : `${this.ariaLabel} (custom)`
      );
    }
  },

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  destroy() {
    if (this._outsideHandler) document.removeEventListener('mousedown', this._outsideHandler);
    if (this._keyHandler)     document.removeEventListener('keydown',   this._keyHandler);
  },
};