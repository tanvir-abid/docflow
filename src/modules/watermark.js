/**
 * Watermark Tool Module
 * Renders a single toolbar button. Clicking it opens a popup where the user
 * can enable a text or image watermark, rendered centered, rotated, and
 * faded behind the page content.
 *
 * NOTE ON PAGE INTEGRATION:
 * Like the header/footer tool, this assumes each simulated page is a DOM
 * element matching PAGE_SELECTOR. The watermark element is inserted as the
 * FIRST child of each page so it paints behind the editable content that
 * follows it in normal stacking order — no z-index juggling needed, as long
 * as your content area isn't itself given a negative z-index.
 */

import { positionFloatingPanel } from './panel-position.js';

const PAGE_SELECTOR = '.rte-page'; // ← adjust to match your A4 page container class

// Trigger icon: a page with a faint diagonal X (stand-in for watermark text/image)
const TRIGGER_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="2" width="18" height="20" rx="1"/><line x1="7" y1="17" x2="17" y2="7" stroke-width="2" opacity="0.55"/><line x1="7" y1="7" x2="17" y2="17" stroke-width="2" opacity="0.55"/></svg>`;

const CHEVRON_ICON = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left:2px;opacity:0.6;flex-shrink:0"><polyline points="6 9 12 15 18 9"/></svg>`;

const TYPES = [
  { value: 'text',  label: 'Text' },
  { value: 'image', label: 'Image' },
];

export const WatermarkTool = {
  name: 'watermark',
  ariaLabel: 'Watermark',

  // ── Internal state ──────────────────────────────────────────────────────────
  _triggerBtn: null,
  _popup:      null,
  _open:       false,
  _editor:     null,
  _els:        {},

  _config: {
    enabled: false,
    type: 'text',        // 'text' | 'image'
    text: 'CONFIDENTIAL',
    imageUrl: '',
    fontSize: 48,         // px
    color: '#999999',
    opacity: 15,           // 0-100
    rotation: -45,         // degrees
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
    popup.className = 'rte-watermark-popup';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', 'Watermark settings');
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

    popup.appendChild(this._buildEnableRow());
    popup.appendChild(this._buildTypeRow());
    popup.appendChild(this._buildTextSection());
    popup.appendChild(this._buildImageSection());
    popup.appendChild(this._buildOpacityRotationSection());
    popup.appendChild(this._buildDoneRow());

    this._setSectionsEnabled(this._config.enabled);
    this._setTypeSectionVisibility(this._config.type);

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

  // ── Popup section builders ──────────────────────────────────────────────────

  _buildEnableRow() {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:500;';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this._config.enabled;
    checkbox.addEventListener('change', () => {
      this._config.enabled = checkbox.checked;
      this._setSectionsEnabled(checkbox.checked);
      this._applyConfig();
    });
    this._els.enableCheckbox = checkbox;

    const span = document.createElement('span');
    span.textContent = 'Show watermark';

    row.appendChild(checkbox);
    row.appendChild(span);
    return row;
  },

  _buildTypeRow() {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:4px;';
    this._els.typeButtons = [];

    TYPES.forEach(({ value, label }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rte-tool-btn';
      btn.dataset.type = value;
      btn.textContent = label;
      btn.style.cssText = 'flex:1;padding:5px 0;font-size:12px;';
      btn.setAttribute('aria-pressed', String(this._config.type === value));
      btn.classList.toggle('rte-tool-active', this._config.type === value);
      btn.disabled = !this._config.enabled;
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this._config.type = value;
        this._els.typeButtons.forEach(({ btn: b, value: v }) => {
          b.classList.toggle('rte-tool-active', v === value);
          b.setAttribute('aria-pressed', String(v === value));
        });
        this._setTypeSectionVisibility(value);
        this._applyConfig();
      });
      row.appendChild(btn);
      this._els.typeButtons.push({ btn, value });
    });

    return row;
  },

  _buildTextSection() {
    const section = document.createElement('div');
    section.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
    this._els.textSection = section;

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.placeholder = 'Watermark text';
    textInput.value = this._config.text;
    textInput.style.cssText = this._inputStyle();
    textInput.addEventListener('input', () => {
      this._config.text = textInput.value;
      this._applyConfig();
    });
    this._els.textInput = textInput;

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;';

    const sizeField = document.createElement('label');
    sizeField.style.cssText = 'display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--rte-muted-text,#777);flex:1;';
    sizeField.innerHTML = '<span>Font size (px)</span>';
    const sizeInput = document.createElement('input');
    sizeInput.type = 'number';
    sizeInput.min = '8';
    sizeInput.value = this._config.fontSize;
    sizeInput.style.cssText = this._inputStyle();
    sizeInput.addEventListener('input', () => {
      const val = parseInt(sizeInput.value, 10);
      this._config.fontSize = Number.isFinite(val) ? val : this._config.fontSize;
      this._applyConfig();
    });
    sizeField.appendChild(sizeInput);
    this._els.fontSizeInput = sizeInput;

    const colorField = document.createElement('label');
    colorField.style.cssText = 'display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--rte-muted-text,#777);';
    colorField.innerHTML = '<span>Color</span>';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = this._config.color;
    colorInput.style.cssText = 'width:40px;height:30px;padding:2px;border-radius:4px;border:1px solid var(--rte-border,rgba(0,0,0,.15));';
    colorInput.addEventListener('input', () => {
      this._config.color = colorInput.value;
      this._applyConfig();
    });
    colorField.appendChild(colorInput);
    this._els.colorInput = colorInput;

    row.appendChild(sizeField);
    row.appendChild(colorField);

    section.appendChild(textInput);
    section.appendChild(row);
    return section;
  },

  _buildImageSection() {
    const section = document.createElement('div');
    section.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
    this._els.imageSection = section;

    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.placeholder = 'Image URL';
    urlInput.value = this._config.imageUrl;
    urlInput.style.cssText = this._inputStyle();
    urlInput.addEventListener('input', () => {
      this._config.imageUrl = urlInput.value;
      this._applyConfig();
    });
    this._els.imageUrlInput = urlInput;

    const hint = document.createElement('div');
    hint.textContent = 'Swap this for your file-upload flow if you have one.';
    hint.style.cssText = 'font-size:11px;color:var(--rte-muted-text,#888);';

    section.appendChild(urlInput);
    section.appendChild(hint);
    return section;
  },

  _buildOpacityRotationSection() {
    const section = document.createElement('div');
    section.style.cssText = 'display:flex;gap:6px;';

    const opacityField = document.createElement('label');
    opacityField.style.cssText = 'display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--rte-muted-text,#777);flex:1;';
    opacityField.innerHTML = '<span>Opacity (%)</span>';
    const opacityInput = document.createElement('input');
    opacityInput.type = 'number';
    opacityInput.min = '1';
    opacityInput.max = '100';
    opacityInput.value = this._config.opacity;
    opacityInput.style.cssText = this._inputStyle();
    opacityInput.addEventListener('input', () => {
      const val = parseInt(opacityInput.value, 10);
      this._config.opacity = Number.isFinite(val) ? Math.min(100, Math.max(1, val)) : this._config.opacity;
      this._applyConfig();
    });
    opacityField.appendChild(opacityInput);
    this._els.opacityInput = opacityInput;

    const rotationField = document.createElement('label');
    rotationField.style.cssText = 'display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--rte-muted-text,#777);flex:1;';
    rotationField.innerHTML = '<span>Rotation (°)</span>';
    const rotationInput = document.createElement('input');
    rotationInput.type = 'number';
    rotationInput.value = this._config.rotation;
    rotationInput.style.cssText = this._inputStyle();
    rotationInput.addEventListener('input', () => {
      const val = parseInt(rotationInput.value, 10);
      this._config.rotation = Number.isFinite(val) ? val : this._config.rotation;
      this._applyConfig();
    });
    rotationField.appendChild(rotationInput);
    this._els.rotationInput = rotationInput;

    section.appendChild(opacityField);
    section.appendChild(rotationField);
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

  _setSectionsEnabled(enabled) {
    if (this._els.typeButtons) this._els.typeButtons.forEach(({ btn }) => { btn.disabled = !enabled; });
    [this._els.textInput, this._els.fontSizeInput, this._els.colorInput,
     this._els.imageUrlInput, this._els.opacityInput, this._els.rotationInput]
      .forEach((el) => { if (el) el.disabled = !enabled; });
  },

  _setTypeSectionVisibility(type) {
    if (this._els.textSection)  this._els.textSection.style.display  = type === 'text'  ? 'flex' : 'none';
    if (this._els.imageSection) this._els.imageSection.style.display = type === 'image' ? 'flex' : 'none';
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
      this._triggerBtn.classList.toggle('rte-tool-active', this._config.enabled);
    }
  },

  // ── Applying the watermark to the document ───────────────────────────────────

  _applyConfig() {
    this._renderOnPages();
    if (this._triggerBtn) {
      this._triggerBtn.classList.toggle('rte-tool-active', this._config.enabled);
    }
    this._editor?.emitChange?.();
  },

  _renderOnPages() {
    document.querySelectorAll(PAGE_SELECTOR).forEach((page) => this._renderWatermark(page));
  },

  _renderWatermark(page) {
    let el = page.querySelector(':scope > .rte-watermark');
    const { enabled } = this._config;

    if (!enabled) {
      if (el) el.remove();
      return;
    }

    if (!el) {
      el = document.createElement('div');
      el.className = 'rte-watermark';
      el.contentEditable = 'false';
      el.style.cssText = [
        'position:absolute',
        'inset:0',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'overflow:hidden',
        'pointer-events:none',
        'user-select:none',
      ].join(';');
      page.style.position = page.style.position || 'relative';
      page.insertBefore(el, page.firstChild); // first child → paints behind later siblings
    }

    el.style.transform = `rotate(${this._config.rotation}deg)`;
    el.style.opacity = String(this._config.opacity / 100);

    if (this._config.type === 'image' && this._config.imageUrl) {
      el.innerHTML = '';
      const img = document.createElement('img');
      img.src = this._config.imageUrl;
      img.style.cssText = 'max-width:70%;max-height:70%;object-fit:contain;';
      el.appendChild(img);
    } else {
      el.innerHTML = '';
      const span = document.createElement('span');
      span.textContent = this._config.text;
      span.style.cssText = [
        `font-size:${this._config.fontSize}px`,
        `color:${this._config.color}`,
        'font-weight:700',
        'white-space:nowrap',
      ].join(';');
      el.appendChild(span);
    }
  },

  // ── Toolbar state sync ──────────────────────────────────────────────────────

  updateState(wrapper) {
    if (this._triggerBtn) {
      this._triggerBtn.classList.toggle('rte-tool-active', this._config.enabled);
    }
  },

  // ── Public config accessors (e.g. for save/load with the document) ─────────

  getConfig() {
    return JSON.parse(JSON.stringify(this._config));
  },

  setConfig(config) {
    this._config = { ...this._config, ...config };

    if (this._els.enableCheckbox) this._els.enableCheckbox.checked = this._config.enabled;
    this._setSectionsEnabled(this._config.enabled);
    if (this._els.typeButtons) {
      this._els.typeButtons.forEach(({ btn, value }) => {
        btn.classList.toggle('rte-tool-active', value === this._config.type);
        btn.setAttribute('aria-pressed', String(value === this._config.type));
      });
    }
    this._setTypeSectionVisibility(this._config.type);
    if (this._els.textInput)     this._els.textInput.value = this._config.text;
    if (this._els.fontSizeInput) this._els.fontSizeInput.value = this._config.fontSize;
    if (this._els.colorInput)    this._els.colorInput.value = this._config.color;
    if (this._els.imageUrlInput) this._els.imageUrlInput.value = this._config.imageUrl;
    if (this._els.opacityInput)  this._els.opacityInput.value = this._config.opacity;
    if (this._els.rotationInput) this._els.rotationInput.value = this._config.rotation;

    this._applyConfig();
  },

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  destroy() {
    if (this._outsideHandler) document.removeEventListener('mousedown', this._outsideHandler);
    if (this._keyHandler)     document.removeEventListener('keydown',   this._keyHandler);

    document.querySelectorAll(PAGE_SELECTOR).forEach((page) => {
      page.querySelector(':scope > .rte-watermark')?.remove();
    });
  },
};