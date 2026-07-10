/**
 * Horizontal Rule Tool Module
 * A toolbar button that opens a floating panel where the user can pick a line
 * style, weight, and color before inserting an <hr> into the editor.
 *
 * Line styles available:
 *   solid · dashed · dotted · double · groove · ridge · inset · outset
 *   plus three decorative styles rendered as inline SVG/CSS patterns:
 *   wavy · zigzag · shadow-drop
 *
 * Follows the same createButton / updateState / destroy contract as the
 * other tool modules (alignment, find-replace, clipboard, etc.).
 */

import { positionFloatingPanel } from './panel-position.js';

// ── Icons ────────────────────────────────────────────────────────────────────

const HR_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="7" x2="21" y2="7" stroke-width="1" stroke-dasharray="2 2" opacity=".4"/><line x1="3" y1="17" x2="21" y2="17" stroke-width="1" stroke-dasharray="2 2" opacity=".4"/></svg>`;
const CHEVRON_ICON = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left:2px;opacity:0.6;flex-shrink:0"><polyline points="6 9 12 15 18 9"/></svg>`;

// ── Line style definitions ────────────────────────────────────────────────────
// Each entry describes how to preview and how to build the final <hr> style.
//
// type: 'css'  → rendered with CSS border-top on a real element
// type: 'svg'  → rendered with an inline SVG (wavy / zigzag)
// type: 'shadow' → box-shadow trick for a drop-shadow rule

const LINE_STYLES = [
  {
    key: 'solid',
    label: 'Solid',
    type: 'css',
    borderStyle: 'solid',
  },
  {
    key: 'dashed',
    label: 'Dashed',
    type: 'css',
    borderStyle: 'dashed',
  },
  {
    key: 'dotted',
    label: 'Dotted',
    type: 'css',
    borderStyle: 'dotted',
  },
  {
    key: 'double',
    label: 'Double',
    type: 'css',
    borderStyle: 'double',
    minWeight: 3, // double needs at least 3px to be visible
  },
  {
    key: 'groove',
    label: 'Groove',
    type: 'css',
    borderStyle: 'groove',
    minWeight: 2,
  },
  {
    key: 'ridge',
    label: 'Ridge',
    type: 'css',
    borderStyle: 'ridge',
    minWeight: 2,
  },
  {
    key: 'wavy',
    label: 'Wavy',
    type: 'svg',
    svgPath: (w, color) => {
      const pts = [];
      const amp = 3, period = 14;
      for (let x = 0; x <= w; x += 1) {
        const y = 8 + amp * Math.sin((x / period) * Math.PI * 2);
        pts.push(`${x},${y.toFixed(2)}`);
      }
      return `<svg width="${w}" height="16" viewBox="0 0 ${w} 16" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="WEIGHT" stroke-linecap="round"/></svg>`;
    },
  },
  {
    key: 'zigzag',
    label: 'Zigzag',
    type: 'svg',
    svgPath: (w, color) => {
      const seg = 10, amp = 4;
      const pts = [];
      let up = true;
      for (let x = 0; x <= w; x += seg) {
        pts.push(`${x},${up ? 8 - amp : 8 + amp}`);
        up = !up;
      }
      return `<svg width="${w}" height="16" viewBox="0 0 ${w} 16" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="WEIGHT" stroke-linejoin="round"/></svg>`;
    },
  },
  {
    key: 'shadow',
    label: 'Shadow',
    type: 'shadow',
  },
];

// ── Default state ────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  { label: 'Black',       value: '#000000' },
  { label: 'Dark gray',   value: '#555555' },
  { label: 'Gray',        value: '#999999' },
  { label: 'Light gray',  value: '#cccccc' },
  { label: 'Red',         value: '#e74c3c' },
  { label: 'Orange',      value: '#e67e22' },
  { label: 'Yellow',      value: '#f1c40f' },
  { label: 'Green',       value: '#27ae60' },
  { label: 'Teal',        value: '#16a085' },
  { label: 'Blue',        value: '#2980b9' },
  { label: 'Indigo',      value: '#6c5ce7' },
  { label: 'Purple',      value: '#8e44ad' },
];

const WEIGHT_OPTIONS = [1, 2, 3, 4, 6, 8];

// ── Module ───────────────────────────────────────────────────────────────────

export const HorizontalRuleTool = {
  name: 'horizontalRule',
  ariaLabel: 'Insert horizontal rule',

  // ── Internal state ──────────────────────────────────────────────────────────
  _triggerBtn:     null,
  _popup:          null,
  _editor:         null,
  _open:           false,
  _selectedStyle:  'solid',
  _selectedColor:  '#000000',
  _selectedWeight: 2,
  _previewEls:     {},   // key → preview DOM element
  _insertMarker:   null, // an actual DOM node (a Comment) dropped at the cursor position the instant the popup opens

  // ── createButton ────────────────────────────────────────────────────────────

  createButton(editor) {
    this._editor = editor;
    this._injectStyles();

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
    trigger.innerHTML = HR_ICON + CHEVRON_ICON;
    this._triggerBtn = trigger;

    const popup = this._buildPopup();
    this._popup = popup;

    // BUG FIX (round 4): Selection/Range tracking — whether captured once
    // on click, or tracked continuously via selectionchange — turned out
    // to still be unreliable here, because something about how the popup
    // interacts with focus (the surrounding toolbar/dialog chrome, the
    // native <input type="color"> picker, or just normal browser focus
    // churn while clicking through several controls) could invalidate it
    // before _insertHR ever got to use it.
    //
    // So: stop tracking *state* and track a *DOM node* instead. The
    // instant the popup opens, drop an invisible marker (a Comment node)
    // directly into the document at the live cursor position — see
    // _captureInsertionPoint. A real node sitting in the DOM tree can't
    // be lost to a focus change, a selectionchange event, or a dialog
    // stealing the window; it just stays exactly where it was put until
    // we explicitly remove it in _insertHR.
    trigger.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (!this._open) this._captureInsertionPoint();
      this._open ? this._closePopup() : this._openPopup(trigger);
    });

    // Stop all mousedowns inside the popup from bubbling to the document-level
    // outside handler — otherwise selecting a style/weight/color closes the panel.
    // We let the popup's own children handle their events normally.
    this._popupMousedownHandler = (e) => e.stopPropagation();

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

    popup.addEventListener('mousedown', this._popupMousedownHandler);

    wrapper.appendChild(trigger);
    wrapper.appendChild(popup);
    return wrapper;
  },

  // ── Popup construction ───────────────────────────────────────────────────────

  _buildPopup() {
    const popup = document.createElement('div');
    popup.className = 'rte-hr-popup';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', 'Horizontal rule options');
    popup.style.cssText = [
      'position:absolute',
      'z-index:9999',
      'display:none',
      'flex-direction:column',
      'gap:10px',
      'padding:10px',
      'width:220px',
      'border-radius:var(--rte-radius,6px)',
      'background:var(--rte-toolbar-bg,#fff)',
      'border:1px solid var(--rte-border,rgba(0,0,0,.12))',
      'box-shadow:0 4px 14px rgba(0,0,0,.13)',
    ].join(';');

    popup.appendChild(this._buildSectionLabel('Style'));
    popup.appendChild(this._buildStyleGrid());
    popup.appendChild(this._buildSectionLabel('Weight'));
    popup.appendChild(this._buildWeightRow());
    popup.appendChild(this._buildSectionLabel('Color'));
    popup.appendChild(this._buildColorGrid());
    popup.appendChild(this._buildInsertBtn());

    return popup;
  },

  _buildSectionLabel(text) {
    const el = document.createElement('div');
    el.style.cssText = 'font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;opacity:.5;margin-bottom:-4px;';
    el.textContent = text;
    return el;
  },

  // ── Style grid ───────────────────────────────────────────────────────────────

  _buildStyleGrid() {
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:4px;';

    LINE_STYLES.forEach(({ key, label }) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'rte-hr-style-cell';
      cell.dataset.styleKey = key;
      cell.setAttribute('aria-label', label);
      cell.setAttribute('title', label);
      cell.setAttribute('aria-pressed', String(key === this._selectedStyle));
      if (key === this._selectedStyle) cell.classList.add('rte-hr-selected');

      cell.style.cssText = [
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'height:28px',
        'border-radius:4px',
        'border:1.5px solid var(--rte-border,rgba(0,0,0,.12))',
        'background:transparent',
        'cursor:pointer',
        'padding:0 6px',
        'overflow:hidden',
      ].join(';');

      // Preview element inside the cell
      const preview = document.createElement('div');
      preview.style.cssText = 'width:100%;pointer-events:none;';
      this._previewEls[key] = preview;
      this._renderPreview(preview, key);

      cell.appendChild(preview);

      cell.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this._selectStyle(key);
      });

      grid.appendChild(cell);
    });

    return grid;
  },

  _selectStyle(key) {
    this._selectedStyle = key;
    // Update aria-pressed / selected class on all cells
    this._popup.querySelectorAll('.rte-hr-style-cell').forEach((cell) => {
      const active = cell.dataset.styleKey === key;
      cell.setAttribute('aria-pressed', String(active));
      cell.classList.toggle('rte-hr-selected', active);
    });
    // Refresh all previews so weight/color changes also propagate
    this._refreshAllPreviews();
  },

  // ── Weight row ───────────────────────────────────────────────────────────────

  _buildWeightRow() {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:4px;align-items:center;';

    WEIGHT_OPTIONS.forEach((w) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rte-hr-weight-btn';
      btn.setAttribute('aria-label', `${w}px`);
      btn.setAttribute('title', `${w}px`);
      btn.setAttribute('aria-pressed', String(w === this._selectedWeight));
      if (w === this._selectedWeight) btn.classList.add('rte-hr-selected');

      btn.style.cssText = [
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'height:24px',
        'padding:0 7px',
        'border-radius:4px',
        'border:1.5px solid var(--rte-border,rgba(0,0,0,.12))',
        'background:transparent',
        'cursor:pointer',
        'font-size:11px',
        'font-weight:600',
      ].join(';');

      btn.textContent = `${w}`;

      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this._selectedWeight = w;
        row.querySelectorAll('.rte-hr-weight-btn').forEach((b) => {
          const active = Number(b.textContent) === w;
          b.setAttribute('aria-pressed', String(active));
          b.classList.toggle('rte-hr-selected', active);
        });
        this._refreshAllPreviews();
      });

      row.appendChild(btn);
    });

    return row;
  },

  // ── Color grid ───────────────────────────────────────────────────────────────

  _buildColorGrid() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

    const swatches = document.createElement('div');
    swatches.style.cssText = 'display:grid;grid-template-columns:repeat(6,1fr);gap:4px;';

    PRESET_COLORS.forEach(({ label, value }) => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'rte-hr-swatch';
      swatch.setAttribute('aria-label', label);
      swatch.setAttribute('title', label);
      swatch.setAttribute('aria-pressed', String(value === this._selectedColor));
      if (value === this._selectedColor) swatch.classList.add('rte-hr-selected');

      swatch.style.cssText = [
        `background:${value}`,
        'width:20px',
        'height:20px',
        'border-radius:50%',
        'border:2px solid transparent',
        'cursor:pointer',
        'flex-shrink:0',
        'box-sizing:border-box',
      ].join(';');

      swatch.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this._selectedColor = value;
        this._customColorInput.value = value;
        swatches.querySelectorAll('.rte-hr-swatch').forEach((s) => {
          const active = s.getAttribute('title') === label;
          s.setAttribute('aria-pressed', String(active));
          s.classList.toggle('rte-hr-selected', active);
        });
        this._refreshAllPreviews();
      });

      swatches.appendChild(swatch);
    });

    // Custom color picker row
    const customRow = document.createElement('div');
    customRow.style.cssText = 'display:flex;align-items:center;gap:6px;';

    const customLabel = document.createElement('label');
    customLabel.style.cssText = 'font-size:11px;opacity:.6;white-space:nowrap;';
    customLabel.textContent = 'Custom:';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = this._selectedColor;
    colorInput.style.cssText = 'width:28px;height:22px;padding:1px;border-radius:4px;border:1px solid var(--rte-border,rgba(0,0,0,.15));cursor:pointer;';
    colorInput.addEventListener('input', () => {
      this._selectedColor = colorInput.value;
      // Deselect all swatches
      swatches.querySelectorAll('.rte-hr-swatch').forEach((s) => {
        s.setAttribute('aria-pressed', 'false');
        s.classList.remove('rte-hr-selected');
      });
      this._refreshAllPreviews();
    });
    this._customColorInput = colorInput;

    const hexLabel = document.createElement('span');
    hexLabel.style.cssText = 'font-size:11px;opacity:.5;font-family:monospace;';
    colorInput.addEventListener('input', () => { hexLabel.textContent = colorInput.value; });
    hexLabel.textContent = this._selectedColor;

    customRow.append(customLabel, colorInput, hexLabel);
    wrap.append(swatches, customRow);
    return wrap;
  },

  // ── Insert button ─────────────────────────────────────────────────────────────

  _buildInsertBtn() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rte-tool-btn rte-hr-insert-btn';
    btn.style.cssText = [
      'width:100%',
      'padding:6px 0',
      'border-radius:5px',
      'font-size:12px',
      'font-weight:600',
      'justify-content:center',
      'display:flex',
      'align-items:center',
      'gap:5px',
    ].join(';');
    btn.innerHTML = `<i class="fa-solid fa-minus" aria-hidden="true"></i> Insert Line`;

    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this._insertHR();
    });

    return btn;
  },

  // ── Preview rendering ─────────────────────────────────────────────────────────

  _renderPreview(el, key) {
    const def = LINE_STYLES.find(s => s.key === key);
    if (!def) return;

    const color  = this._selectedColor;
    const weight = this._selectedWeight;
    const w      = 60; // preview width in px

    if (def.type === 'css') {
      const effectiveWeight = Math.max(weight, def.minWeight ?? 1);
      el.style.cssText = [
        `border:none`,
        `border-top:${effectiveWeight}px ${def.borderStyle} ${color}`,
        'width:100%',
        'height:1px',
        'margin:0',
      ].join(';');
      el.innerHTML = '';
    } else if (def.type === 'svg') {
      let svg = def.svgPath(w, color).replace(/WEIGHT/g, weight);
      el.style.cssText = 'width:100%;display:flex;align-items:center;justify-content:center;';
      el.innerHTML = svg;
    } else if (def.type === 'shadow') {
      el.style.cssText = [
        'width:100%',
        'height:1px',
        `background:${color}`,
        `box-shadow:0 ${Math.max(2, weight)}px ${weight * 2}px ${color}66`,
        'margin:0',
      ].join(';');
      el.innerHTML = '';
    }
  },

  _refreshAllPreviews() {
    LINE_STYLES.forEach(({ key }) => {
      const el = this._previewEls[key];
      if (el) this._renderPreview(el, key);
    });
  },

  // ── Insertion-point capture ─────────────────────────────────────────────────
  // Converts "where the cursor currently is" into an actual DOM node the
  // instant the popup opens, while we know for certain the live selection
  // is still exactly where the user left it (nothing has had a chance to
  // touch focus yet at this point). From here on, the marker's position in
  // the DOM tree is what matters — not selection state, not focus — so
  // nothing the popup does afterward can disturb it.

  _captureInsertionPoint() {
    this._clearInsertMarker();
    const area = this._editor && this._editor.contentArea;
    if (!area) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const liveRange = sel.getRangeAt(0);
    if (!area.contains(liveRange.startContainer)) return;
    try {
      const range = liveRange.cloneRange();
      range.collapse(true); // insertion point = selection start
      const marker = document.createComment('rte-hr-marker');
      range.insertNode(marker);
      this._insertMarker = marker;
    } catch (err) {
      this._insertMarker = null;
    }
  },

  _clearInsertMarker() {
    if (this._insertMarker && this._insertMarker.parentNode) {
      this._insertMarker.parentNode.removeChild(this._insertMarker);
    }
    this._insertMarker = null;
  },

  // ── HR insertion ──────────────────────────────────────────────────────────────

  _insertHR() {
    const def    = LINE_STYLES.find(s => s.key === this._selectedStyle);
    const color  = this._selectedColor;
    const weight = this._selectedWeight;
    const area   = this._editor.contentArea;

    // Build the rule element
    let ruleEl;

    if (def.type === 'svg') {
      const svgTemplate = def.svgPath(800, color).replace(/WEIGHT/g, weight);
      ruleEl = document.createElement('div');
      ruleEl.contentEditable = 'false';
      ruleEl.className = 'rte-hr-svg';
      ruleEl.style.cssText = 'line-height:0;margin:8px 0;opacity:1;';
      ruleEl.innerHTML = `<svg viewBox="0 0 800 16" width="100%" height="16" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">${svgTemplate.replace(/^<svg[^>]*>/, '').replace('</svg>', '')}</svg>`;
    } else {
      ruleEl = document.createElement('hr');
      if (def.type === 'css') {
        const effectiveWeight = Math.max(weight, def.minWeight ?? 1);
        ruleEl.style.cssText = [
          'border:none',
          `border-top:${effectiveWeight}px ${def.borderStyle} ${color}`,
          'margin:8px 0',
          // BUG FIX: Bootstrap's reboot.css ships a blanket `hr { opacity: .25 }`,
          // which silently washed out every inserted rule no matter which
          // color/weight/style was picked above. Force full opacity so the
          // inline style (which wins over that plain-element selector)
          // overrides it.
          'opacity:1',
        ].join(';');
      } else if (def.type === 'shadow') {
        ruleEl.style.cssText = [
          'border:none',
          `height:${weight}px`,
          `background:${color}`,
          `box-shadow:0 ${Math.max(2, weight)}px ${weight * 2}px ${color}66`,
          'margin:8px 0',
          'opacity:1',
        ].join(';');
      }
    }

    // Insert the rule at the captured marker so we know exactly where it
    // lands in the DOM.
    //
    // BUG FIX (round 4): previous attempts all tried to resolve "where
    // the cursor is" from window.getSelection()/Range state at insert
    // time (or shortly before), and that state kept turning out to be
    // unreliable by the time "Insert Line" was actually clicked. The
    // marker sidesteps that problem completely — it's a real Comment
    // node that was dropped into the document back when the popup first
    // opened (see _captureInsertionPoint), so its position is just a
    // fact about the DOM tree, immune to whatever focus/selection
    // shuffling happened in between.
    const marker = this._insertMarker;
    this._insertMarker = null;

    if (marker && marker.parentNode && area.contains(marker)) {
      let anchor = marker.parentNode;

      if (anchor === area) {
        // BUG FIX: the marker landed directly inside contentArea itself —
        // e.g. bare/unwrapped text with no <p> around it, or a click in
        // the empty space below the last block — rather than inside a
        // recognised block element. Insert the rule right where the
        // marker sits.
        area.insertBefore(ruleEl, marker);
      } else {
        // Marker is inside some inline/text context — climb to the
        // nearest block-level ancestor that is a direct child of
        // contentArea, so the rule lands at block level (not mid-paragraph).
        while (anchor.parentNode && anchor.parentNode !== area) {
          anchor = anchor.parentNode;
        }
        area.insertBefore(ruleEl, anchor.nextSibling);
      }
      marker.remove();
    } else {
      // No captured position (or it's gone) — just append
      area.appendChild(ruleEl);
    }

    // Guarantee a writable paragraph exists immediately after the rule.
    // Re-use an existing empty <p> if one is already there; otherwise create one.
    let after = ruleEl.nextSibling;
    if (!after || after.nodeName !== 'P' || (after.textContent.trim() !== '' && after !== ruleEl.nextSibling)) {
      const p = document.createElement('p');
      p.appendChild(document.createElement('br')); // keeps the paragraph focusable
      area.insertBefore(p, ruleEl.nextSibling);
      after = p;
    }

    // Place the caret at the start of that paragraph. Focus belongs to
    // the editor again from this point on.
    area.focus();
    const newRange = document.createRange();
    newRange.setStart(after, 0);
    newRange.collapse(true);
    const s = window.getSelection();
    if (s) { s.removeAllRanges(); s.addRange(newRange); }

    this._editor.syncToolbarState();
    this._editor.emitChange();
    this._closePopup();
  },

  // ── Popup open / close ───────────────────────────────────────────────────────

  _openPopup(trigger) {
    const popup = this._popup;
    popup.style.visibility = 'hidden';
    popup.style.display = 'flex';
    this._open = true;
    trigger.setAttribute('aria-expanded', 'true');
    trigger.classList.add('rte-tool-active');
    this._refreshAllPreviews();

    positionFloatingPanel(popup, trigger, popup.parentElement);
    popup.style.visibility = '';
  },

  _closePopup() {
    if (!this._popup) return;
    this._popup.style.display = 'none';
    this._open = false;
    // If the popup is closing without an insert having happened (e.g. the
    // user clicked outside, or hit Escape), the marker is still sitting
    // in the document — clean it up. _insertHR already nulls it out
    // before this runs in the successful-insert path, so this is a no-op
    // then.
    this._clearInsertMarker();
    if (this._triggerBtn) {
      this._triggerBtn.setAttribute('aria-expanded', 'false');
      this._triggerBtn.classList.remove('rte-tool-active');
    }
  },

  // ── Styles ───────────────────────────────────────────────────────────────────

  _injectStyles() {
    if (document.getElementById('rte-hr-styles')) return;
    const style = document.createElement('style');
    style.id = 'rte-hr-styles';
    style.textContent = `
      .rte-hr-style-cell.rte-hr-selected,
      .rte-hr-weight-btn.rte-hr-selected {
        border-color: var(--rte-accent, #2563eb) !important;
        background: var(--rte-accent-bg, rgba(37,99,235,.08)) !important;
      }
      .rte-hr-swatch.rte-hr-selected {
        outline: 2.5px solid var(--rte-accent, #2563eb);
        outline-offset: 2px;
      }
      .rte-hr-style-cell:hover,
      .rte-hr-weight-btn:hover {
        background: var(--rte-hover-bg, rgba(0,0,0,.05)) !important;
      }
      .rte-hr-insert-btn {
        background: var(--rte-accent, #2563eb) !important;
        color: #fff !important;
        border: none !important;
      }
      .rte-hr-insert-btn:hover {
        opacity: .88;
      }
    `;
    document.head.appendChild(style);
  },

  // ── Toolbar state sync ───────────────────────────────────────────────────────

  updateState() {},

  // ── Cleanup ──────────────────────────────────────────────────────────────────

  destroy() {
    if (this._outsideHandler) document.removeEventListener('mousedown', this._outsideHandler);
    if (this._keyHandler)     document.removeEventListener('keydown',   this._keyHandler);
    if (this._popup && this._popupMousedownHandler)
      this._popup.removeEventListener('mousedown', this._popupMousedownHandler);
    this._clearInsertMarker();
  },
};