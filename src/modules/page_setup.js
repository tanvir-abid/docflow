/**
 * Page Setup Tool Module
 * Renders a single toolbar button. Clicking it opens a popup where the user
 * sets page size, orientation, and margins for the simulated A4/Letter/etc.
 * pages. Settings are applied live to every page element on the canvas.
 *
 * NOTE ON PAGE INTEGRATION:
 * Like the header/footer tool, this assumes each simulated page is a DOM
 * element matching PAGE_SELECTOR. Update PAGE_SELECTOR if your page
 * container uses a different class.
 *
 * This tool also writes the current margins onto each page as CSS custom
 * properties (--rte-margin-top/right/bottom/left). If you want headers,
 * footers, or page numbers to sit inside the margin band rather than flush
 * against the page edge, have those tools read from those variables instead
 * of hardcoding top:0 / bottom:0.
 */

import { positionFloatingPanel } from './panel-position.js';

const PAGE_SELECTOR = '.rte-page'; // ← adjust to match your A4 page container class

const PAGE_SIZES_MM = {
  A4:     { width: 210,   height: 297   },
  Letter: { width: 215.9, height: 279.4 },
  Legal:  { width: 215.9, height: 355.6 },
  A5:     { width: 148,   height: 210   },
};

const ORIENTATIONS = [
  {
    value: 'portrait',
    label: 'Portrait',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="2" width="12" height="20" rx="1.5"/></svg>`,
  },
  {
    value: 'landscape',
    label: 'Landscape',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="1.5"/></svg>`,
  },
];

const MARGIN_FIELDS = [
  { key: 'top',    label: 'Top' },
  { key: 'right',  label: 'Right' },
  { key: 'bottom', label: 'Bottom' },
  { key: 'left',   label: 'Left' },
];

// Trigger icon: a page with a dashed inner margin box
const TRIGGER_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="2" width="18" height="20" rx="1"/><rect x="6.5" y="5.5" width="11" height="13" rx="0.5" stroke-dasharray="2.4 2.2" stroke-width="1.5"/></svg>`;

const CHEVRON_ICON = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left:2px;opacity:0.6;flex-shrink:0"><polyline points="6 9 12 15 18 9"/></svg>`;

export const PageSetupTool = {
  name: 'pageSetup',
  ariaLabel: 'Page setup',

  // ── Internal state ──────────────────────────────────────────────────────────
  _triggerBtn: null,
  _popup:      null,
  _open:       false,
  _editor:     null,
  _els:        {},

  _config: {
    size: 'A4',
    orientation: 'portrait',
    margins: { top: 25, right: 25, bottom: 25, left: 25 }, // mm
  },

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
    popup.className = 'rte-pagesetup-popup';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', 'Page setup settings');
    popup.style.cssText = [
      'position:absolute',
      'z-index:9999',
      'display:none',
      'flex-direction:column',
      'gap:10px',
      'width:260px',
      'padding:12px',
      'border-radius:var(--rte-radius,6px)',
      'background:var(--rte-toolbar-bg,#fff)',
      'border:1px solid var(--rte-border,rgba(0,0,0,.12))',
      'box-shadow:0 4px 12px rgba(0,0,0,.12)',
      'font-size:13px',
      'color:var(--rte-text,#222)',
    ].join(';');
    this._popup = popup;

    popup.appendChild(this._buildSizeSection());
    popup.appendChild(this._buildOrientationSection());
    popup.appendChild(this._buildMarginsSection());
    popup.appendChild(this._buildDoneRow());

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

    // Apply the default config to any pages already on the canvas
    this._applyConfig();

    return wrapper;
  },

  // ── Popup section builders ──────────────────────────────────────────────────

  _buildSizeSection() {
    const section = document.createElement('div');
    section.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

    const label = document.createElement('div');
    label.textContent = 'Page size';
    label.style.cssText = 'font-weight:500;';
    section.appendChild(label);

    const select = document.createElement('select');
    select.style.cssText = this._inputStyle();
    Object.keys(PAGE_SIZES_MM).forEach((key) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = key;
      if (key === this._config.size) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', () => {
      this._config.size = select.value;
      this._applyConfig();
    });
    this._els.sizeSelect = select;
    section.appendChild(select);

    return section;
  },

  _buildOrientationSection() {
    const section = document.createElement('div');
    section.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

    const label = document.createElement('div');
    label.textContent = 'Orientation';
    label.style.cssText = 'font-weight:500;';
    section.appendChild(label);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:4px;';
    this._els.orientationButtons = [];

    ORIENTATIONS.forEach(({ value, label: lbl, icon }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rte-tool-btn';
      btn.dataset.orientation = value;
      btn.setAttribute('aria-label', lbl);
      btn.setAttribute('title', lbl);
      btn.setAttribute('aria-pressed', String(this._config.orientation === value));
      btn.classList.toggle('rte-tool-active', this._config.orientation === value);
      btn.innerHTML = icon;
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this._config.orientation = value;
        this._els.orientationButtons.forEach(({ btn: b, value: v }) => {
          b.classList.toggle('rte-tool-active', v === value);
          b.setAttribute('aria-pressed', String(v === value));
        });
        this._applyConfig();
      });
      row.appendChild(btn);
      this._els.orientationButtons.push({ btn, value });
    });

    section.appendChild(row);
    return section;
  },

  _buildMarginsSection() {
    const section = document.createElement('div');
    section.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

    const label = document.createElement('div');
    label.textContent = 'Margins (mm)';
    label.style.cssText = 'font-weight:500;';
    section.appendChild(label);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;';
    this._els.marginInputs = {};

    MARGIN_FIELDS.forEach(({ key, label: lbl }) => {
      const field = document.createElement('label');
      field.style.cssText = 'display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--rte-muted-text,#777);';

      const span = document.createElement('span');
      span.textContent = lbl;
      field.appendChild(span);

      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.step = '1';
      input.value = this._config.margins[key];
      input.style.cssText = this._inputStyle();
      input.addEventListener('input', () => {
        const val = parseFloat(input.value);
        this._config.margins[key] = Number.isFinite(val) ? val : 0;
        this._applyConfig();
      });
      field.appendChild(input);

      this._els.marginInputs[key] = input;
      grid.appendChild(field);
    });

    section.appendChild(grid);
    return section;
  },

  _buildDoneRow() {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:flex-end;margin-top:2px;';

    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'rte-tool-btn';
    done.textContent = 'Done';
    done.style.cssText = 'padding:4px 12px;font-size:13px;';
    done.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this._closePopup();
    });

    row.appendChild(done);
    return row;
  },

  _inputStyle() {
    return [
      'width:100%',
      'box-sizing:border-box',
      'padding:5px 8px',
      'border-radius:4px',
      'border:1px solid var(--rte-border,rgba(0,0,0,.15))',
      'font-size:13px',
      'font-family:inherit',
      'background:var(--rte-bg,#fff)',
      'color:inherit',
    ].join(';');
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
      this._triggerBtn.classList.remove('rte-tool-active');
    }
  },

  // ── Applying page setup to the document ─────────────────────────────────────

  _applyConfig() {
    this._renderOnPages();
    this._editor?.emitChange?.();
  },

  _renderOnPages() {
    const { width, height } = this._dimensionsForCurrentSettings();
    const { top, right, bottom, left } = this._config.margins;

    document.querySelectorAll(PAGE_SELECTOR).forEach((page) => {
      page.style.boxSizing = 'border-box';
      page.style.width = `${width}mm`;
      page.style.height = `${height}mm`;
      page.style.padding = `${top}mm ${right}mm ${bottom}mm ${left}mm`;
      page.style.position = page.style.position || 'relative';

      page.style.setProperty('--rte-margin-top', `${top}mm`);
      page.style.setProperty('--rte-margin-right', `${right}mm`);
      page.style.setProperty('--rte-margin-bottom', `${bottom}mm`);
      page.style.setProperty('--rte-margin-left', `${left}mm`);
    });
  },

  _dimensionsForCurrentSettings() {
    const base = PAGE_SIZES_MM[this._config.size] || PAGE_SIZES_MM.A4;
    return this._config.orientation === 'landscape'
      ? { width: base.height, height: base.width }
      : { width: base.width, height: base.height };
  },

  // ── Toolbar state sync ──────────────────────────────────────────────────────

  updateState(wrapper) {
    // Page setup isn't selection-dependent — nothing to sync per caret position.
  },

  // ── Public config accessors (e.g. for save/load with the document) ─────────

  getConfig() {
    return JSON.parse(JSON.stringify(this._config));
  },

  setConfig(config) {
    this._config = {
      ...this._config,
      ...config,
      margins: { ...this._config.margins, ...(config?.margins || {}) },
    };

    if (this._els.sizeSelect) this._els.sizeSelect.value = this._config.size;
    if (this._els.orientationButtons) {
      this._els.orientationButtons.forEach(({ btn, value }) => {
        btn.classList.toggle('rte-tool-active', value === this._config.orientation);
        btn.setAttribute('aria-pressed', String(value === this._config.orientation));
      });
    }
    if (this._els.marginInputs) {
      MARGIN_FIELDS.forEach(({ key }) => {
        if (this._els.marginInputs[key]) this._els.marginInputs[key].value = this._config.margins[key];
      });
    }

    this._applyConfig();
  },

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  destroy() {
    if (this._outsideHandler) document.removeEventListener('mousedown', this._outsideHandler);
    if (this._keyHandler)     document.removeEventListener('keydown',   this._keyHandler);
  },
};