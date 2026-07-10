/**
 * Line Height Tool — line-height.js
 * ═══════════════════════════════════════════════════════════════════
 * Toolbar dropdown for controlling typography spacing.
 *
 * Features
 * ─────────
 * Line Height    : preset values + live custom range slider
 * Space Before   : paragraph margin-top  (preset + custom slider)
 * Space After    : paragraph margin-bottom (preset + custom slider)
 * Letter Spacing : preset values + live custom range slider.
 *                  Dual-mode — see below.
 *
 * Applies to   : the block element containing the cursor (p, h1-h6,
 *                li, div, blockquote). Falls back to the whole
 *                contentArea when no specific block is found.
 *
 * Letter Spacing dual-mode
 * ─────────────────────────
 * Unlike the other three sections, Letter Spacing targets either the
 * whole block OR just the active text selection, decided once when
 * the menu opens:
 *   • Selection is non-collapsed → wraps the selected text in a
 *     `.rte-letter-spacing` span (reusing one if the selection is
 *     already inside one) and styles that span.
 *   • Selection is collapsed (just a cursor) → falls back to the
 *     block-level behaviour used by the other sections.
 * The mode is fixed for the lifetime of the open menu so repeated
 * pill/slider interaction doesn't re-wrap or jump targets.
 *
 * State reading : updateState() reads the current block's inline
 *                 style and reflects it in the toolbar button label.
 *
 * Bug-fixes vs original
 * ──────────────────────
 * • block was captured once at open time — stale after user clicks
 *   away. Now resolved live via getBlock() on every apply.
 * • Reset set style = '' but left pill highlights and slider thumb
 *   unchanged, making the UI lie about the current state.
 *   Now mkPresets and mkSlider expose setActive()/setValue() so
 *   Reset can sync the whole section in one call.
 * • mkReset used 'mousedown' but onReset closed over the stale block
 *   variable. Fixed by passing getBlock() through.
 * • Slider badge and pill highlights were not linked — moving the
 *   slider did not clear the active pill. Now it does.
 */

/* ── Constants ──────────────────────────────────────────────────── */

const LINE_HEIGHT_PRESETS = [
  { label: 'Single',  value: '1'    },
  { label: '1.15',    value: '1.15' },
  { label: '1.25',    value: '1.25' },
  { label: '1.5',     value: '1.5'  },
  { label: 'Double',  value: '2'    },
  { label: '2.5',     value: '2.5'  },
  { label: '3',       value: '3'    },
];

const SPACING_PRESETS = [
  { label: 'None',  value: '0'    },
  { label: '4px',   value: '4px'  },
  { label: '8px',   value: '8px'  },
  { label: '12px',  value: '12px' },
  { label: '16px',  value: '16px' },
  { label: '24px',  value: '24px' },
  { label: '32px',  value: '32px' },
];

const LETTER_SPACING_PRESETS = [
  { label: 'Tight',   value: '-1px'  },
  { label: 'Snug',    value: '-0.5px' },
  { label: 'Normal',  value: '0'     },
  { label: 'Relaxed', value: '0.5px' },
  { label: 'Wide',    value: '1px'   },
  { label: 'Wider',   value: '2px'   },
  { label: 'Widest',  value: '4px'   },
];

// Block-level tags the tool can target
const BLOCK_TAGS = new Set([
  'P','H1','H2','H3','H4','H5','H6',
  'LI','BLOCKQUOTE','PRE','DIV','TD','TH',
]);

/* ══════════════════════════════════════════════════════════════════
   Tool export
══════════════════════════════════════════════════════════════════ */
export const LineHeightTool = {
  name: 'lineHeight',
  ariaLabel: 'Line height, spacing & letter spacing',

  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
          <path d="M21 3l-3 3 3 3"/>
          <path d="M21 21l-3-3 3-3"/>
        </svg>`,

  /* ── internal state ─────────────────────────────────────────── */
  _editor:   null,
  _btnEl:    null,
  _labelEl:  null,   // the small "1.5×" text inside the button
  _menu:     null,

  /* ══════════════════════════════════════════════════════════════
     createButton
  ══════════════════════════════════════════════════════════════ */
  createButton(editor) {
    this._editor = editor;

    const wrap = document.createElement('span');
    wrap.className = 'rte-lh-wrap';

    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'rte-tool-btn rte-lh-btn';
    btn.dataset.tool = this.name;
    btn.setAttribute('aria-label',    this.ariaLabel);
    btn.setAttribute('title',         this.ariaLabel);
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');

    // Icon + live label + chevron
    const labelEl = document.createElement('span');
    labelEl.className   = 'rte-lh-label';
    labelEl.textContent = '—';
    this._labelEl = labelEl;

    btn.innerHTML = this.icon;
    btn.appendChild(labelEl);
    btn.insertAdjacentHTML('beforeend', `
      <svg class="rte-lh-chevron" width="9" height="9" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="3"
           stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"/>
      </svg>`);

    this._btnEl = btn;
    wrap.appendChild(btn);

    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this._menu ? this._closeMenu() : this._openMenu(btn);
    });

    // Close on outside click
    document.addEventListener('mousedown', (e) => {
      if (this._menu && !this._menu.contains(e.target) && e.target !== btn) {
        this._closeMenu();
      }
    });

    return wrap;
  },

  /* ══════════════════════════════════════════════════════════════
     Menu
  ══════════════════════════════════════════════════════════════ */
  _openMenu(triggerBtn) {
    this._closeMenu();

    // BUG FIX: resolve block live on every apply, not once at open-time.
    // If the user clicks the toolbar button while the cursor is in a block,
    // then moves focus inside the menu, getBlock() still returns the correct
    // element because the editor's selection hasn't changed.
    const getBlock = () => this._getBlock() || this._editor.contentArea;

    // BUG FIX: a selection spanning several blocks (e.g. "select all" across
    // multiple paragraphs/headings/list items) used to only ever update the
    // single block returned by getBlock() — the one containing the *start*
    // of the selection — leaving every other block in the selection
    // untouched. All apply/reset calls below now go through getBlocks()
    // instead, which resolves to every block-level element the current
    // selection actually intersects (still just [getBlock()] when the
    // selection is a plain cursor, so single-block behaviour is unchanged).
    const getBlocks = () => this._getSelectedBlocks();

    const block    = getBlock();            // snapshot for initial values only
    const computed = window.getComputedStyle(block);

    const curLH = block.style.lineHeight   || '';
    const curMT = block.style.marginTop    || '';
    const curMB = block.style.marginBottom || '';

    // Letter Spacing: snapshot the selection now, before any menu
    // interaction can disturb it. A non-collapsed selection inside the
    // content area locks this section into "selection mode" for the
    // lifetime of the open menu; otherwise it behaves like the other
    // sections and falls back to "block mode".
    const lsSelRange     = this._getActiveTextRange();
    const lsExistingSpan = lsSelRange ? this._findLetterSpacingSpan(lsSelRange) : null;
    const curLS = lsSelRange
      ? (lsExistingSpan ? lsExistingSpan.style.letterSpacing : '')
      : (block.style.letterSpacing || '');

    const menu = document.createElement('div');
    menu.className = 'rte-lh-menu';
    menu.setAttribute('role',       'dialog');
    menu.setAttribute('aria-label', 'Line height, paragraph spacing and letter spacing');

    /* ── Section builder ────────────────────────────────────── */
    const mkSection = (title) => {
      const sec = document.createElement('div');
      sec.className = 'rte-lh-section';
      const hd = document.createElement('div');
      hd.className   = 'rte-lh-section-title';
      hd.textContent = title;
      sec.appendChild(hd);
      return sec;
    };

    /* ── Preset pill row ────────────────────────────────────── */
    // Returns { el, setActive(value) }
    // setActive('') clears all highlights (used by Reset).
    const mkPresets = (presets, currentVal, onApply) => {
      const row = document.createElement('div');
      row.className = 'rte-lh-presets';

      const normalise = (v) => parseFloat(v) || 0;
      const pills = [];

      presets.forEach(({ label, value }) => {
        const pill = document.createElement('button');
        pill.type      = 'button';
        pill.className = 'rte-lh-pill';
        pill.textContent = label;
        pill.setAttribute('title', value);

        // Initial active highlight
        if (normalise(currentVal) === normalise(value) && normalise(value) !== 0) {
          pill.classList.add('rte-lh-pill-active');
        }

        pill.addEventListener('mousedown', (e) => {
          e.preventDefault();
          onApply(value);
          setActive(value);
        });

        row.appendChild(pill);
        pills.push({ pill, value });
      });

      // Exposed so Reset and slider can clear/set highlights from outside
      const setActive = (val) => {
        const n = normalise(val);
        pills.forEach(({ pill, value }) => {
          pill.classList.toggle(
            'rte-lh-pill-active',
            n !== 0 && normalise(value) === n
          );
        });
      };

      return { el: row, setActive };
    };

    /* ── Custom slider row ──────────────────────────────────── */
    // Returns { el, setValue(numericRaw) }
    // setValue moves the thumb + badge without firing onChange (used by Reset).
    const mkSlider = ({ min, max, step, unit, currentVal, onChange, onPresetsClear }) => {
      const wrap = document.createElement('div');
      wrap.className = 'rte-lh-slider-row';

      const slider = document.createElement('input');
      slider.type      = 'range';
      slider.className = 'rte-lh-slider';
      slider.min       = min;
      slider.max       = max;
      slider.step      = step;

      const parsedInit = parseFloat(currentVal);
      const numVal  = Number.isNaN(parsedInit) ? parseFloat(min) : parsedInit;
      slider.value  = numVal;

      const fmt = (v) => `${v}${unit === 'px' ? 'px' : '×'}`;

      const badge = document.createElement('span');
      badge.className   = 'rte-lh-slider-badge';
      badge.textContent = fmt(numVal);

      slider.addEventListener('input', () => {
        badge.textContent = fmt(slider.value);
        onChange(slider.value + (unit === 'px' ? 'px' : ''));
        // Moving the slider means "custom" — clear preset highlights
        onPresetsClear();
      });

      const labelEl = document.createElement('span');
      labelEl.className   = 'rte-lh-slider-label';
      labelEl.textContent = 'Custom';

      wrap.appendChild(labelEl);
      wrap.appendChild(slider);
      wrap.appendChild(badge);

      // Exposed: move thumb + badge without triggering onChange
      const setValue = (raw) => {
        const parsed = parseFloat(raw);
        const n = Number.isNaN(parsed) ? parseFloat(min) : parsed;
        slider.value  = n;
        badge.textContent = fmt(n);
      };

      return { el: wrap, setValue };
    };

    /* ── Reset button ───────────────────────────────────────── */
    // onReset is fully responsible for DOM mutation + UI sync.
    const mkReset = (onReset) => {
      const btn = document.createElement('button');
      btn.type      = 'button';
      btn.className = 'rte-lh-reset';
      btn.innerHTML = '&#8635; Reset to default';
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        onReset();
      });
      return btn;
    };

    /* ── 1. Line Height section ─────────────────────────────── */
    const secLH  = mkSection('Line Height');
    const lhPre  = mkPresets(
      LINE_HEIGHT_PRESETS, curLH,
      (v) => this._apply('lineHeight', v, getBlocks())
    );
    const lhSlid = mkSlider({
      min: 1, max: 4, step: 0.05, unit: 'ratio',
      currentVal: curLH
        || (parseFloat(computed.lineHeight) / parseFloat(computed.fontSize)).toFixed(2)
        || 1.5,
      onChange:       (v)  => this._apply('lineHeight', v, getBlocks()),
      onPresetsClear: ()   => lhPre.setActive(''),
    });

    secLH.appendChild(lhPre.el);
    secLH.appendChild(lhSlid.el);
    secLH.appendChild(mkReset(() => {
      this._apply('lineHeight', '', getBlocks()); // remove inline style
      lhPre.setActive('');                       // clear all pill highlights
      lhSlid.setValue(1.5);                      // thumb → sensible default
    }));
    menu.appendChild(secLH);

    menu.insertAdjacentHTML('beforeend', '<div class="rte-lh-divider"></div>');

    /* ── 2. Space Before section ────────────────────────────── */
    const secMT  = mkSection('Space Before Paragraph');
    const mtPre  = mkPresets(
      SPACING_PRESETS, curMT,
      (v) => this._apply('marginTop', v, getBlocks())
    );
    const mtSlid = mkSlider({
      min: 0, max: 64, step: 1, unit: 'px',
      currentVal: curMT || parseFloat(computed.marginTop) || 0,
      onChange:       (v)  => this._apply('marginTop', v, getBlocks()),
      onPresetsClear: ()   => mtPre.setActive(''),
    });

    secMT.appendChild(mtPre.el);
    secMT.appendChild(mtSlid.el);
    secMT.appendChild(mkReset(() => {
      this._apply('marginTop', '', getBlocks());
      mtPre.setActive('');
      mtSlid.setValue(0);
    }));
    menu.appendChild(secMT);

    menu.insertAdjacentHTML('beforeend', '<div class="rte-lh-divider"></div>');

    /* ── 3. Space After section ─────────────────────────────── */
    const secMB  = mkSection('Space After Paragraph');
    const mbPre  = mkPresets(
      SPACING_PRESETS, curMB,
      (v) => this._apply('marginBottom', v, getBlocks())
    );
    const mbSlid = mkSlider({
      min: 0, max: 64, step: 1, unit: 'px',
      currentVal: curMB || parseFloat(computed.marginBottom) || 0,
      onChange:       (v)  => this._apply('marginBottom', v, getBlocks()),
      onPresetsClear: ()   => mbPre.setActive(''),
    });

    secMB.appendChild(mbPre.el);
    secMB.appendChild(mbSlid.el);
    secMB.appendChild(mkReset(() => {
      this._apply('marginBottom', '', getBlocks());
      mbPre.setActive('');
      mbSlid.setValue(0);
    }));
    menu.appendChild(secMB);

    menu.insertAdjacentHTML('beforeend', '<div class="rte-lh-divider"></div>');

    /* ── 4. Letter Spacing section ──────────────────────────── */
    // Dual-mode: if text was selected when the menu opened, this wraps
    // that selection in a `.rte-letter-spacing` span and styles only
    // it. Otherwise it falls back to styling the whole block, same as
    // the three sections above. `lsTargetSpan` is created lazily on
    // first interaction so just opening the menu never touches the DOM.
    let lsTargetSpan = lsExistingSpan; // reuse span if already inside one

    const applyLS = (value) => {
      if (lsSelRange) {
        if (!lsTargetSpan) {
          lsTargetSpan = this._wrapRangeInSpan(lsSelRange);
        }
        lsTargetSpan.style.letterSpacing = value;
        this._editor.emitChange();
        this._updateLabel();
      } else {
        this._apply('letterSpacing', value, getBlock());
      }
    };

    const secLS = mkSection(
      lsSelRange ? 'Letter Spacing (selected text)' : 'Letter Spacing'
    );
    const lsPre  = mkPresets(LETTER_SPACING_PRESETS, curLS, applyLS);
    const lsSlid = mkSlider({
      min: -2, max: 10, step: 0.5, unit: 'px',
      currentVal: curLS || (lsSelRange ? 0 : (parseFloat(computed.letterSpacing) || 0)),
      onChange:       (v) => applyLS(v),
      onPresetsClear: () => lsPre.setActive(''),
    });

    secLS.appendChild(lsPre.el);
    secLS.appendChild(lsSlid.el);
    secLS.appendChild(mkReset(() => {
      if (lsSelRange) {
        if (lsTargetSpan) lsTargetSpan.style.letterSpacing = '';
      } else {
        this._apply('letterSpacing', '', getBlock());
      }
      lsPre.setActive('');
      lsSlid.setValue(0);
      this._editor.emitChange();
      this._updateLabel();
    }));
    menu.appendChild(secLS);

    /* ── Position & mount ───────────────────────────────────── */
    const eRect = this._editor.root.getBoundingClientRect();
    const bRect = triggerBtn.getBoundingClientRect();
    menu.style.top  = `${bRect.bottom - eRect.top + 6}px`;
    menu.style.left = `${bRect.left   - eRect.left}px`;

    this._editor.root.appendChild(menu);

    // Flip left if menu overflows the right edge
    const mRect = menu.getBoundingClientRect();
    if (mRect.right > eRect.right - 8) {
      menu.style.left = `${eRect.right - eRect.left - mRect.width - 8}px`;
    }

    this._menu = menu;
    this._btnEl.setAttribute('aria-expanded', 'true');
  },

  _closeMenu() {
    this._menu?.remove();
    this._menu = null;
    this._btnEl?.setAttribute('aria-expanded', 'false');
  },

  /* ══════════════════════════════════════════════════════════════
     Apply a CSS property to the target block(s).
     `target` is either a single element (collapsed-selection / legacy
     callers) or an array of elements (multi-block selection) — either
     way every matching element gets the same value.
  ══════════════════════════════════════════════════════════════ */
  _apply(prop, value, target) {
    const blocks = Array.isArray(target) ? target : [target];
    blocks.forEach((block) => { if (block) block.style[prop] = value; });
    this._editor.emitChange();
    this._updateLabel();
  },

  /* ══════════════════════════════════════════════════════════════
     Find the deepest block ancestor of the cursor
  ══════════════════════════════════════════════════════════════ */
  _getBlock() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    let node = sel.getRangeAt(0).startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    while (node && node !== this._editor.contentArea) {
      if (BLOCK_TAGS.has(node.tagName)) return node;
      node = node.parentElement;
    }
    return null;
  },

  /* ══════════════════════════════════════════════════════════════
     Find every block-level element touched by the current selection.
     • Collapsed selection (just a cursor), or no selection at all →
       same single-block lookup _getBlock() always used, so behaviour
       for the common "cursor in a paragraph" case is unchanged.
     • Non-collapsed selection → every BLOCK_TAGS element inside
       contentArea that the selection range actually intersects, so a
       selection spanning several paragraphs/headings/list items gets
       the style applied to all of them, not just the one containing
       the start of the selection.
  ══════════════════════════════════════════════════════════════ */
  _getSelectedBlocks() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      return [this._getBlock() || this._editor.contentArea];
    }

    const range = sel.getRangeAt(0);
    if (range.collapsed || !this._editor.contentArea.contains(range.commonAncestorContainer)) {
      return [this._getBlock() || this._editor.contentArea];
    }

    const selector  = [...BLOCK_TAGS].map((t) => t.toLowerCase()).join(',');
    const candidates = this._editor.contentArea.querySelectorAll(selector);
    const blocks = [...candidates].filter((el) => range.intersectsNode(el));

    // Selection didn't land inside any recognised block tag at all (e.g.
    // bare text typed directly into contentArea) — fall back to the whole
    // content area, same as the single-block lookup already did.
    return blocks.length ? blocks : [this._editor.contentArea];
  },

  /* ══════════════════════════════════════════════════════════════
     Letter Spacing helpers
  ══════════════════════════════════════════════════════════════ */

  // Returns a cloned, non-collapsed Range if the user has text selected
  // inside the editor, otherwise null. Cloning means later DOM
  // mutations (or the user clicking into the menu) can't invalidate it.
  _getActiveTextRange() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return null;
    if (!this._editor.contentArea.contains(range.commonAncestorContainer)) return null;
    return range.cloneRange();
  },

  // Walks up from the range's common ancestor looking for an existing
  // `.rte-letter-spacing` wrapper, so re-opening the menu on
  // already-spaced text edits it in place instead of nesting a new span.
  _findLetterSpacingSpan(range) {
    let node = range.commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    while (node && node !== this._editor.contentArea) {
      if (node.classList && node.classList.contains('rte-letter-spacing')) return node;
      node = node.parentElement;
    }
    return null;
  },

  // Wraps the contents of `range` in a fresh `.rte-letter-spacing` span
  // and re-selects the wrapped text so the change is visible and typing
  // can continue naturally afterwards.
  _wrapRangeInSpan(range) {
    const span = document.createElement('span');
    span.className = 'rte-letter-spacing';
    span.appendChild(range.extractContents());
    range.insertNode(span);

    const sel = window.getSelection();
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    sel.removeAllRanges();
    sel.addRange(newRange);

    return span;
  },

  /* ══════════════════════════════════════════════════════════════
     Reflect current line-height in the toolbar button label
  ══════════════════════════════════════════════════════════════ */
  _updateLabel() {
    if (!this._labelEl) return;
    const block = this._getBlock();
    if (!block) { this._labelEl.textContent = '—'; return; }

    const lh = block.style.lineHeight;
    if (lh) {
      const n = parseFloat(lh);
      this._labelEl.textContent = lh.endsWith('px') ? `${n}px` : `${n}×`;
    } else {
      this._labelEl.textContent = '—';
    }
  },

  /* ══════════════════════════════════════════════════════════════
     updateState — called by editor on every selectionchange
  ══════════════════════════════════════════════════════════════ */
  updateState() {
    this._updateLabel();
  },
};