/**
 * Text Color Tool Module
 * Toolbar button opens a color panel with presets, last-used swatch,
 * and a native custom color input. Applies foreground color to selection.
 */
export const TextColorTool = {
  name: 'textColor',
  ariaLabel: 'Text color',
  _lastColor: '#e53e3e',
  _savedRange: null,
  _panel: null,
  _editor: null,

  _presets: [
    // Row 1 — vivid
    '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
    // Row 2 — mid tones
    '#b91c1c', '#c2410c', '#a16207', '#15803d',
    '#0e7490', '#1d4ed8', '#6d28d9', '#be185d',
    // Row 3 — neutrals
    '#ffffff', '#e5e7eb', '#9ca3af', '#6b7280',
    '#374151', '#1f2937', '#111827', '#000000',
  ],

  icon(color) {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 3L5 21"/>
      <path d="M15 3l4 18"/>
      <path d="M7 14h10"/>
      <rect x="3" y="21" width="18" height="2.5" rx="1"
            fill="${color}" stroke="none"/>
    </svg>`;
  },

  createButton(editor) {
    this._editor = editor;

    const wrapper = document.createElement('div');
    wrapper.className = 'rte-color-wrapper';
    wrapper.style.cssText = 'position:relative;display:inline-flex;';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rte-tool-btn';
    btn.dataset.tool = this.name;
    btn.setAttribute('aria-label', this.ariaLabel);
    btn.setAttribute('title', this.ariaLabel);
    btn.innerHTML = this.icon(this._lastColor);

    btn.addEventListener('mousedown', (e) => {
      e.preventDefault(); // keep editor focus
      this._savedRange = this._saveRange();
    });

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._togglePanel(wrapper);
    });

    wrapper.appendChild(btn);
    this._btn = btn;
    return wrapper;
  },

  // ── Panel ──────────────────────────────────────────────────────────────────

  _buildPanel() {
    const panel = document.createElement('div');
    panel.className = 'rte-color-panel';
    panel.style.cssText = `
      position:absolute;
      top:calc(100% + 6px);
      left:50%;
      transform:translateX(-50%);
      z-index:9999;
      background:#fff;
      border:1px solid #e2e8f0;
      border-radius:10px;
      box-shadow:0 8px 24px rgba(0,0,0,.13);
      padding:12px;
      width:184px;
      box-sizing:border-box;
      user-select:none;
    `;

    // ── Last used ────────────────────────────────────────────────────────────
    const lastRow = document.createElement('div');
    lastRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:10px;';

    const lastLabel = document.createElement('span');
    lastLabel.textContent = 'Last used';
    lastLabel.style.cssText = 'font-size:11px;color:#64748b;white-space:nowrap;flex-shrink:0;';

    const lastSwatch = document.createElement('button');
    lastSwatch.type = 'button';
    lastSwatch.title = 'Apply last used color';
    lastSwatch.style.cssText = `
      width:24px;height:24px;border-radius:5px;border:2px solid #e2e8f0;
      background:${this._lastColor};cursor:pointer;flex-shrink:0;
      outline-offset:2px;transition:border-color .15s;
    `;
    lastSwatch.addEventListener('mouseenter', () => lastSwatch.style.borderColor = '#94a3b8');
    lastSwatch.addEventListener('mouseleave', () => lastSwatch.style.borderColor = '#e2e8f0');
    lastSwatch.addEventListener('click', () => this._pick(this._lastColor));

    lastRow.appendChild(lastLabel);
    lastRow.appendChild(lastSwatch);
    panel.appendChild(lastRow);
    this._lastSwatch = lastSwatch;

    // ── Divider ──────────────────────────────────────────────────────────────
    const div1 = document.createElement('div');
    div1.style.cssText = 'border-top:1px solid #f1f5f9;margin-bottom:10px;';
    panel.appendChild(div1);

    // ── Preset grid ──────────────────────────────────────────────────────────
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(8,1fr);gap:4px;margin-bottom:10px;';

    this._presets.forEach((hex) => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.title = hex;
      sw.style.cssText = `
        width:18px;height:18px;border-radius:4px;
        background:${hex};border:1.5px solid rgba(0,0,0,.1);
        cursor:pointer;outline-offset:2px;transition:transform .1s,border-color .1s;
        ${hex === '#ffffff' ? 'border-color:#d1d5db;' : ''}
      `;
      sw.addEventListener('mouseenter', () => {
        sw.style.transform = 'scale(1.25)';
        sw.style.borderColor = '#475569';
      });
      sw.addEventListener('mouseleave', () => {
        sw.style.transform = 'scale(1)';
        sw.style.borderColor = hex === '#ffffff' ? '#d1d5db' : 'rgba(0,0,0,.1)';
      });
      sw.addEventListener('click', () => this._pick(hex));
      grid.appendChild(sw);
    });

    panel.appendChild(grid);

    // ── Divider ──────────────────────────────────────────────────────────────
    const div2 = document.createElement('div');
    div2.style.cssText = 'border-top:1px solid #f1f5f9;margin-bottom:10px;';
    panel.appendChild(div2);

    // ── Custom color row ─────────────────────────────────────────────────────
    const customRow = document.createElement('div');
    customRow.style.cssText = 'display:flex;align-items:center;gap:8px;';

    const customLabel = document.createElement('span');
    customLabel.textContent = 'Custom';
    customLabel.style.cssText = 'font-size:11px;color:#64748b;';

    const customSwatch = document.createElement('div');
    customSwatch.style.cssText = `
      position:relative;width:24px;height:24px;border-radius:5px;
      border:2px solid #e2e8f0;overflow:hidden;flex-shrink:0;cursor:pointer;
    `;

    const customPreview = document.createElement('div');
    customPreview.style.cssText = `
      width:100%;height:100%;background:${this._lastColor};pointer-events:none;
    `;

    const customInput = document.createElement('input');
    customInput.type = 'color';
    customInput.value = this._lastColor;
    customInput.style.cssText = `
      position:absolute;opacity:0;width:200%;height:200%;
      top:-50%;left:-50%;cursor:pointer;
    `;

    customInput.addEventListener('input', (e) => {
      customPreview.style.background = e.target.value;
    });

    customInput.addEventListener('change', (e) => {
      this._pick(e.target.value);
    });

    customSwatch.appendChild(customPreview);
    customSwatch.appendChild(customInput);

    // Hex text input
    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.maxLength = 7;
    hexInput.value = this._lastColor;
    hexInput.spellcheck = false;
    hexInput.style.cssText = `
      flex:1;min-width:0;font-size:12px;font-family:monospace;
      padding:4px 6px;border:1.5px solid #e2e8f0;border-radius:5px;
      outline:none;color:#1e293b;background:#f8fafc;
      transition:border-color .15s;
    `;
    hexInput.addEventListener('focus', () => hexInput.style.borderColor = '#94a3b8');
    hexInput.addEventListener('blur',  () => hexInput.style.borderColor = '#e2e8f0');
    hexInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = hexInput.value.trim();
        const full = val.startsWith('#') ? val : '#' + val;
        if (/^#[0-9a-fA-F]{6}$/.test(full)) {
          customPreview.style.background = full;
          customInput.value = full;
          this._pick(full);
        }
      }
    });

    this._hexInput     = hexInput;
    this._customPreview = customPreview;
    this._customInput   = customInput;

    customRow.appendChild(customLabel);
    customRow.appendChild(customSwatch);
    customRow.appendChild(hexInput);
    panel.appendChild(customRow);

    // ── "None" / remove color ────────────────────────────────────────────────
    const noneBtn = document.createElement('button');
    noneBtn.type = 'button';
    noneBtn.textContent = '✕  Remove color';
    noneBtn.style.cssText = `
      display:block;width:100%;margin-top:10px;padding:5px 0;
      font-size:11px;color:#64748b;background:none;
      border:1.5px solid #e2e8f0;border-radius:6px;cursor:pointer;
      transition:background .15s,color .15s;
    `;
    noneBtn.addEventListener('mouseenter', () => {
      noneBtn.style.background = '#f1f5f9';
      noneBtn.style.color = '#334155';
    });
    noneBtn.addEventListener('mouseleave', () => {
      noneBtn.style.background = 'none';
      noneBtn.style.color = '#64748b';
    });
    noneBtn.addEventListener('click', () => this._pick('inherit'));
    panel.appendChild(noneBtn);

    return panel;
  },

  _togglePanel(wrapper) {
    if (this._panel) {
      this._closePanel();
      return;
    }

    this._panel = this._buildPanel();
    wrapper.appendChild(this._panel);

    // Sync inputs to last color
    if (this._hexInput)        this._hexInput.value = this._lastColor;
    if (this._customPreview)   this._customPreview.style.background = this._lastColor;
    if (this._customInput)     this._customInput.value = this._lastColor;
    if (this._lastSwatch)      this._lastSwatch.style.background = this._lastColor;

    // Close on outside click
    setTimeout(() => {
      this._outsideHandler = (e) => {
        if (!wrapper.contains(e.target)) this._closePanel();
      };
      document.addEventListener('mousedown', this._outsideHandler);
    }, 0);
  },

  _closePanel() {
    if (this._panel) {
      this._panel.remove();
      this._panel = null;
    }
    if (this._outsideHandler) {
      document.removeEventListener('mousedown', this._outsideHandler);
      this._outsideHandler = null;
    }
  },

  // ── Color application ──────────────────────────────────────────────────────

  _pick(color) {
    this._closePanel();
    this._lastColor = color;
    if (this._btn) this._btn.innerHTML = this.icon(color);
    this._applyColor(this._editor, color);
  },

  _applyColor(editor, color) {
    if (this._savedRange) this._restoreRange(this._savedRange);

    editor.contentArea.focus();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

    const applied = document.execCommand('foreColor', false, color);
    if (!applied) this._applyViaSpan(sel, 'color', color);

    editor.syncToolbarState();
    editor.emitChange();
  },

  _applyViaSpan(sel, cssProp, value) {
    const range = sel.getRangeAt(0);
    const span  = document.createElement('span');
    span.style[cssProp] = value;
    try {
      range.surroundContents(span);
    } catch {
      span.appendChild(range.extractContents());
      range.insertNode(span);
    }
  },

  _saveRange() {
    const sel = window.getSelection();
    return sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
  },

  _restoreRange(range) {
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  },

  updateState() {},
};