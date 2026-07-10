/**
 * Header / Footer / Page Number Tool Module
 * Renders a single toolbar button. Clicking it opens a popup panel where
 * the user can toggle and edit a page header, a page footer, and a page
 * number (with its own horizontal alignment).
 *
 * NOTE ON PAGE INTEGRATION:
 * This module assumes each simulated A4 page is a DOM element matching
 * PAGE_SELECTOR and that each such element is `position:relative` with a
 * fixed page-sized box (this matches a typical A4-paper-simulation setup).
 * If your page containers use a different class/selector, just update
 * PAGE_SELECTOR below — nothing else needs to change.
 */

import { positionFloatingPanel } from './panel-position.js';

const PAGE_SELECTOR = '.rte-page'; // ← adjust to match your A4 page container class

const PAGE_NUMBER_FORMATS = [
  { value: 'Page {n} of {total}', label: 'Page 1 of 5' },
  { value: 'Page {n}',            label: 'Page 1' },
  { value: '{n} / {total}',       label: '1 / 5' },
  { value: '{n}',                 label: '1' },
];

const ALIGN_OPTIONS = [
  {
    value: 'left',
    label: 'Align left',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="1.5"/><circle cx="7.5" cy="17" r="1.4" fill="currentColor" stroke="none"/></svg>`,
  },
  {
    value: 'center',
    label: 'Align center',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="1.5"/><circle cx="12" cy="17" r="1.4" fill="currentColor" stroke="none"/></svg>`,
  },
  {
    value: 'right',
    label: 'Align right',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="1.5"/><circle cx="16.5" cy="17" r="1.4" fill="currentColor" stroke="none"/></svg>`,
  },
];

// Trigger icon: a page with bold header/footer bars
const TRIGGER_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="1.2"/><line x1="4" y1="7.2" x2="20" y2="7.2" stroke-width="2.4"/><line x1="4" y1="16.8" x2="20" y2="16.8" stroke-width="2.4"/></svg>`;

// Shared chevron-down icon appended to the trigger button
const CHEVRON_ICON = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left:2px;opacity:0.6;flex-shrink:0"><polyline points="6 9 12 15 18 9"/></svg>`;

export const HeaderFooterTool = {
  name: 'headerFooter',
  ariaLabel: 'Header, footer & page number',

  // ── Internal state ──────────────────────────────────────────────────────────
  _triggerBtn: null,
  _popup:      null,
  _open:       false,
  _editor:     null,
  _els:        {}, // references to popup form controls

  _config: {
    header:     { enabled: false, text: '' },
    footer:     { enabled: false, text: '' },
    pageNumber: { enabled: false, align: 'center', format: 'Page {n} of {total}' },
  },

  // ── createButton ────────────────────────────────────────────────────────────

  createButton(editor) {
    this._editor = editor;

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
    trigger.style.cssText = 'display:inline-flex;align-items:center;gap:2px;padding-right:4px;';
    trigger.innerHTML = TRIGGER_ICON + CHEVRON_ICON;
    this._triggerBtn = trigger;

    // Floating popup
    const popup = document.createElement('div');
    popup.className = 'rte-headerfooter-popup';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', 'Header, footer and page number settings');
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

    popup.appendChild(this._buildHeaderSection());
    popup.appendChild(this._buildDivider());
    popup.appendChild(this._buildFooterSection());
    popup.appendChild(this._buildDivider());
    popup.appendChild(this._buildPageNumberSection());
    popup.appendChild(this._buildDoneRow());

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

  // ── Popup section builders ──────────────────────────────────────────────────

  _buildDivider() {
    const hr = document.createElement('div');
    hr.style.cssText = 'border-top:1px solid var(--rte-border,rgba(0,0,0,.1));margin:2px 0;';
    return hr;
  },

  _buildHeaderSection() {
    const section = document.createElement('div');
    section.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

    const labelRow = this._buildCheckboxRow('Show header', this._config.header.enabled, (checked) => {
      this._config.header.enabled = checked;
      this._els.headerInput.disabled = !checked;
      this._applyConfig();
    });
    this._els.headerCheckbox = labelRow.querySelector('input');

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Header text';
    input.value = this._config.header.text;
    input.disabled = !this._config.header.enabled;
    input.style.cssText = this._inputStyle();
    input.addEventListener('input', () => {
      this._config.header.text = input.value;
      this._applyConfig();
    });
    this._els.headerInput = input;

    section.appendChild(labelRow);
    section.appendChild(input);
    return section;
  },

  _buildFooterSection() {
    const section = document.createElement('div');
    section.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

    const labelRow = this._buildCheckboxRow('Show footer', this._config.footer.enabled, (checked) => {
      this._config.footer.enabled = checked;
      this._els.footerInput.disabled = !checked;
      this._applyConfig();
    });
    this._els.footerCheckbox = labelRow.querySelector('input');

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Footer text';
    input.value = this._config.footer.text;
    input.disabled = !this._config.footer.enabled;
    input.style.cssText = this._inputStyle();
    input.addEventListener('input', () => {
      this._config.footer.text = input.value;
      this._applyConfig();
    });
    this._els.footerInput = input;

    section.appendChild(labelRow);
    section.appendChild(input);
    return section;
  },

  _buildPageNumberSection() {
    const section = document.createElement('div');
    section.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

    const labelRow = this._buildCheckboxRow('Show page number', this._config.pageNumber.enabled, (checked) => {
      this._config.pageNumber.enabled = checked;
      this._setPageNumberControlsEnabled(checked);
      this._applyConfig();
    });
    this._els.pageNumberCheckbox = labelRow.querySelector('input');
    section.appendChild(labelRow);

    // Alignment buttons
    const alignRow = document.createElement('div');
    alignRow.style.cssText = 'display:flex;gap:4px;';
    this._els.alignButtons = [];
    ALIGN_OPTIONS.forEach(({ value, label, icon }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rte-tool-btn';
      btn.dataset.align = value;
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
      btn.setAttribute('aria-pressed', String(this._config.pageNumber.align === value));
      btn.disabled = !this._config.pageNumber.enabled;
      btn.classList.toggle('rte-tool-active', this._config.pageNumber.align === value);
      btn.innerHTML = icon;
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this._config.pageNumber.align = value;
        this._els.alignButtons.forEach(({ btn: b, value: v }) => {
          b.classList.toggle('rte-tool-active', v === value);
          b.setAttribute('aria-pressed', String(v === value));
        });
        this._applyConfig();
      });
      alignRow.appendChild(btn);
      this._els.alignButtons.push({ btn, value });
    });
    section.appendChild(alignRow);

    // Format select
    const select = document.createElement('select');
    select.style.cssText = this._inputStyle();
    select.disabled = !this._config.pageNumber.enabled;
    PAGE_NUMBER_FORMATS.forEach(({ value, label }) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      if (value === this._config.pageNumber.format) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', () => {
      this._config.pageNumber.format = select.value;
      this._applyConfig();
    });
    this._els.formatSelect = select;
    section.appendChild(select);

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

  // ── Small UI helpers ─────────────────────────────────────────────────────────

  _buildCheckboxRow(labelText, checked, onChange) {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:500;';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = checked;
    checkbox.addEventListener('change', () => onChange(checkbox.checked));

    const span = document.createElement('span');
    span.textContent = labelText;

    row.appendChild(checkbox);
    row.appendChild(span);
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

  _setPageNumberControlsEnabled(enabled) {
    this._els.alignButtons.forEach(({ btn }) => { btn.disabled = !enabled; });
    if (this._els.formatSelect) this._els.formatSelect.disabled = !enabled;
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
      this._triggerBtn.classList.toggle('rte-tool-active', this._isAnyEnabled());
    }
  },

  // ── Applying header/footer/page-number to the document ─────────────────────

  _isAnyEnabled() {
    return this._config.header.enabled || this._config.footer.enabled || this._config.pageNumber.enabled;
  },

  _applyConfig() {
    this._renderOnPages();
    if (this._triggerBtn) {
      this._triggerBtn.classList.toggle('rte-tool-active', this._isAnyEnabled());
    }
    this._editor?.emitChange?.();
  },

  _renderOnPages() {
    const pages = document.querySelectorAll(PAGE_SELECTOR);
    const total = pages.length;
    pages.forEach((page, idx) => {
      this._renderHeader(page);
      this._renderFooter(page);
      this._renderPageNumber(page, idx + 1, total);
    });
  },

  _renderHeader(page) {
    let el = page.querySelector(':scope > .rte-page-header');
    const { enabled, text } = this._config.header;

    if (!enabled) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.className = 'rte-page-header';
      el.contentEditable = 'false';
      el.style.cssText = [
        'position:absolute',
        'top:0',
        'left:0',
        'right:0',
        'padding:8px 24px',
        'font-size:11px',
        'color:var(--rte-muted-text,#777)',
        'pointer-events:none',
        'user-select:none',
      ].join(';');
      page.style.position = page.style.position || 'relative';
      page.insertBefore(el, page.firstChild);
    }
    el.textContent = text;
  },

  _renderFooter(page) {
    let el = page.querySelector(':scope > .rte-page-footer');
    const { enabled, text } = this._config.footer;

    if (!enabled) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.className = 'rte-page-footer';
      el.contentEditable = 'false';
      el.style.cssText = [
        'position:absolute',
        'bottom:0',
        'left:0',
        'right:0',
        'padding:8px 24px',
        'font-size:11px',
        'color:var(--rte-muted-text,#777)',
        'pointer-events:none',
        'user-select:none',
      ].join(';');
      page.style.position = page.style.position || 'relative';
      page.appendChild(el);
    }
    el.textContent = text;
  },

  _renderPageNumber(page, pageNum, total) {
    let el = page.querySelector(':scope > .rte-page-number');
    const { enabled, align, format } = this._config.pageNumber;

    if (!enabled) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.className = 'rte-page-number';
      el.contentEditable = 'false';
      el.style.cssText = [
        'position:absolute',
        'bottom:4px',
        'left:0',
        'right:0',
        'padding:0 24px',
        'font-size:10px',
        'color:var(--rte-muted-text,#888)',
        'pointer-events:none',
        'user-select:none',
      ].join(';');
      page.style.position = page.style.position || 'relative';
      page.appendChild(el);
    }
    el.style.textAlign = align;
    el.textContent = format.replace('{n}', pageNum).replace('{total}', total);
  },

  // ── Toolbar state sync ──────────────────────────────────────────────────────

  updateState(wrapper) {
    if (this._triggerBtn) {
      this._triggerBtn.classList.toggle('rte-tool-active', this._isAnyEnabled());
    }
  },

  // ── Public config accessors (e.g. for save/load with the document) ─────────

  getConfig() {
    return JSON.parse(JSON.stringify(this._config));
  },

  setConfig(config) {
    this._config = {
      header:     { ...this._config.header,     ...(config?.header     || {}) },
      footer:     { ...this._config.footer,     ...(config?.footer     || {}) },
      pageNumber: { ...this._config.pageNumber, ...(config?.pageNumber || {}) },
    };

    // Sync UI controls to the new config
    if (this._els.headerCheckbox) this._els.headerCheckbox.checked = this._config.header.enabled;
    if (this._els.headerInput) {
      this._els.headerInput.value = this._config.header.text;
      this._els.headerInput.disabled = !this._config.header.enabled;
    }
    if (this._els.footerCheckbox) this._els.footerCheckbox.checked = this._config.footer.enabled;
    if (this._els.footerInput) {
      this._els.footerInput.value = this._config.footer.text;
      this._els.footerInput.disabled = !this._config.footer.enabled;
    }
    if (this._els.pageNumberCheckbox) this._els.pageNumberCheckbox.checked = this._config.pageNumber.enabled;
    if (this._els.alignButtons) {
      this._setPageNumberControlsEnabled(this._config.pageNumber.enabled);
      this._els.alignButtons.forEach(({ btn, value }) => {
        btn.classList.toggle('rte-tool-active', value === this._config.pageNumber.align);
        btn.setAttribute('aria-pressed', String(value === this._config.pageNumber.align));
      });
    }
    if (this._els.formatSelect) this._els.formatSelect.value = this._config.pageNumber.format;

    this._applyConfig();
  },

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  destroy() {
    if (this._outsideHandler) document.removeEventListener('mousedown', this._outsideHandler);
    if (this._keyHandler)     document.removeEventListener('keydown',   this._keyHandler);

    // Remove any rendered header/footer/page-number nodes from the document
    document.querySelectorAll(PAGE_SELECTOR).forEach((page) => {
      page.querySelector(':scope > .rte-page-header')?.remove();
      page.querySelector(':scope > .rte-page-footer')?.remove();
      page.querySelector(':scope > .rte-page-number')?.remove();
    });
  },
};