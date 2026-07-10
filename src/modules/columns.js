import { positionFloatingPanel } from './panel-position.js';

export const ColumnsTool = {
  name     : 'columns',
  ariaLabel: 'Insert columns',
  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round">
           <rect x="3"  y="3" width="7"  height="18" rx="1"/>
           <rect x="14" y="3" width="7"  height="18" rx="1"/>
         </svg>`,

  /* ── state ───────────────────────────────────────────────────── */
  _editor     : null,
  _picker     : null,   // insert picker panel
  _colToolbar : null,   // per-block floating toolbar
  _activeBlock: null,   // currently focused .rte-cols block

  // Minimum "weight" (in text-character equivalents) given to a
  // non-text / atomic node (image, table, hr, embedded block, …) so
  // it competes fairly against paragraphs when distributing content
  // across columns instead of collapsing to near-zero weight.
  _ATOMIC_WEIGHT: 240,

  /* ══════════════════════════════════════════════════════════════
     createButton
  ══════════════════════════════════════════════════════════════ */
  createButton(editor) {
    this._editor = editor;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rte-tool-btn';
    btn.dataset.tool = this.name;
    btn.setAttribute('aria-label', this.ariaLabel);
    btn.setAttribute('title', this.ariaLabel);
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = this.icon;

    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this._picker ? this._destroyPicker() : this._showPicker(btn);
    });

    // Global click: close toolbar when clicking outside any col block
    document.addEventListener('mousedown', (e) => this._onDocMouseDown(e));

    return btn;
  },

  /* ══════════════════════════════════════════════════════════════
     PICKER (insert panel)
  ══════════════════════════════════════════════════════════════ */
  _showPicker(triggerBtn) {
    this._destroyPicker();

    const editor = this._editor;
    const panel  = document.createElement('div');
    panel.className = 'rte-cols-picker';

   panel.style.cssText = `position:absolute;z-index:1100;visibility:hidden;`;

    const title = document.createElement('div');
    title.className = 'rte-cols-picker-title';
    title.textContent = 'Insert columns';
    panel.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'rte-cols-picker-grid';

    [
      { count: 2, label: '2 Columns', icon: this._icon2Col },
      { count: 3, label: '3 Columns', icon: this._icon3Col },
    ].forEach(({ count, label, icon }) => {
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'rte-cols-picker-opt';
      opt.setAttribute('title', label);
      opt.innerHTML = `${icon}<span>${label}</span>`;
      opt.addEventListener('click', () => {
        this._destroyPicker();
        this._insertColumns(count);
      });
      grid.appendChild(opt);
    });

    panel.appendChild(grid);
    editor.root.appendChild(panel);
    this._picker = panel;
    positionFloatingPanel(panel, triggerBtn, editor.root);
    panel.style.visibility = '';

    setTimeout(() => {
      this._pickerOutside = (e) => {
        if (!panel.contains(e.target) && e.target !== triggerBtn) this._destroyPicker();
      };
      document.addEventListener('mousedown', this._pickerOutside);
    }, 10);
  },

  _destroyPicker() {
    this._picker?.remove();
    this._picker = null;
    if (this._pickerOutside) {
      document.removeEventListener('mousedown', this._pickerOutside);
      this._pickerOutside = null;
    }
  },

  /* ══════════════════════════════════════════════════════════════
     INSERT / BUILD
  ══════════════════════════════════════════════════════════════ */
  _insertColumns(count) {
    const editor = this._editor;
    editor.contentArea.focus();

    // Capture selected content and split it across columns
    const sel        = window.getSelection();
    let   colHtmlArr = null;   // will be string[] of length `count` when selection exists
    let   insertRef  = null;   // node to insert after

    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      // Only capture if selection is within contentArea
      if (editor.contentArea.contains(range.commonAncestorContainer)) {
        const frag = range.extractContents();
        // Wrap in a temp div to serialise
        const tmp = document.createElement('div');
        tmp.appendChild(frag);
        // Clean up empty text nodes at root level
        tmp.childNodes.forEach(n => {
          if (n.nodeType === Node.TEXT_NODE && !n.textContent.trim()) n.remove();
        });
        if (tmp.innerHTML.trim()) {
          colHtmlArr = this._splitHtmlIntoChunks(tmp, count);
        }

        // Find the block-level anchor to insert after
        let anchor = range.startContainer;
        if (anchor.nodeType === Node.TEXT_NODE) anchor = anchor.parentNode;
        insertRef = this._nearestBlock(anchor, editor.contentArea);
      }
    }

    const block = this._buildColBlock(count, colHtmlArr);
    this._wireBlockEvents(editor, block);
    this._wireColumnsInteractivity(editor, block);

    if (insertRef && editor.contentArea.contains(insertRef)) {
      insertRef.after(block);
      // If the anchor block is now empty (we extracted its content), remove it
      if (insertRef.innerHTML === '' || insertRef.innerHTML === '<br>') {
        insertRef.remove();
      }
    } else if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      let anchor = range.commonAncestorContainer;
      if (anchor.nodeType === Node.TEXT_NODE) anchor = anchor.parentNode;
      const block2 = this._nearestBlock(anchor, editor.contentArea);
      if (block2 && editor.contentArea.contains(block2)) {
        block2.after(block);
      } else {
        editor.contentArea.appendChild(block);
      }
    } else {
      editor.contentArea.appendChild(block);
    }

    // Ensure paragraph after
    const next = block.nextElementSibling;
    if (!next) {
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      block.after(p);
    }

    editor.emitChange();

    // Focus first column
    const firstCol = block.querySelector('.rte-col');
    if (firstCol) {
      setTimeout(() => {
        firstCol.focus();
        const r = document.createRange();
        r.selectNodeContents(firstCol);
        r.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(r);
      }, 30);
    }
  },

  _buildColBlock(count, colHtmlArr = null) {
    const block = document.createElement('div');
    block.className = `rte-cols rte-cols-${count}`;
    block.setAttribute('data-rte-cols', String(count));
    block.setAttribute('data-divided', 'false');
    block.setAttribute('contenteditable', 'true');
    block.setAttribute('data-rte-atomic', 'true');
    block.style.cssText = 'display:flex;align-items:stretch;gap:0;width:100%;margin:12px 0;';

    const widthPct = (100 / count).toFixed(4);

    for (let i = 0; i < count; i++) {
      const col = this._createColumn(colHtmlArr?.[i], widthPct);
      block.appendChild(col);
      if (i < count - 1) block.appendChild(this._createResizer(i));
    }

    return block;
  },

  /* ── column / resizer element factories ─────────────────────── */
  _createColumn(html, widthPct) {
    const col = document.createElement('div');
    col.className = 'rte-col';
    col.setAttribute('contenteditable', 'true');
    col.spellcheck = true;
    col.style.cssText =
      `flex:0 0 ${widthPct}%;min-width:60px;box-sizing:border-box;` +
      `overflow-wrap:break-word;`;
    col.innerHTML = html ?? '<p><br></p>';

    col.addEventListener('focus', () => { col.style.borderColor = '#a8c7fa'; });
    col.addEventListener('blur',  () => { col.style.borderColor = '#e0e0e0'; });

    return col;
  },

  _createResizer(leftIdx) {
    const resizer = document.createElement('div');
    resizer.className = 'rte-col-resizer';
    resizer.setAttribute('contenteditable', 'false');
    resizer.dataset.leftIdx = String(leftIdx);
    resizer.style.cssText = 'flex:0 0 12px;position:relative;cursor:col-resize;align-self:stretch;';

    const line = document.createElement('span');
    line.className = 'rte-col-resizer-line';
    line.style.cssText =
      'position:absolute;left:50%;top:4px;bottom:4px;width:2px;' +
      'transform:translateX(-50%);border-radius:2px;background:transparent;' +
      'pointer-events:none;transition:background .15s ease;';
    resizer.appendChild(line);

    resizer.addEventListener('mouseenter', () => { line.style.background = '#b7c6e8'; });
    resizer.addEventListener('mouseleave', () => {
      const block = resizer.closest('.rte-cols');
      line.style.background = (block?.getAttribute('data-divided') === 'true') ? '#94a3b8' : 'transparent';
    });

    return resizer;
  },

  /* ══════════════════════════════════════════════════════════════
     SPLIT HTML INTO CHUNKS
     Distributes selected content equally across `count` columns.

     Pipeline:
       1. Flatten the container into a list of "segments" — each
          segment is one top-level block node (e.g. <p>, <h2>,
          <ul>, <img>, <table>) paired with a "weight".
          Weight is normally its plain-text length, EXCEPT for
          atomic / non-text nodes (images, tables, hr, embeds,
          anything contenteditable="false") which get a minimum
          fixed weight — otherwise a zero-text image would always
          collapse into whichever column happens to be current,
          instead of being spread out with the rest of the content.
       2. If there is only one segment:
            - a lone <table> has its rows distributed evenly across
              the columns (header row repeated in each column);
            - a lone atomic node (image, embed, hr, …) can't be
              subdivided, so it's placed whole in column 1;
            - otherwise its plain text is split into `count`
              word-boundary chunks.
       3. For multiple segments, use a greedy bin-pack: accumulate
          segments into the current column until the running weight
          crosses the per-column target, then advance. Atomic nodes
          are never split mid-pack — they move to the next column
          whole. Text nodes that would badly overshoot a column are
          split at the nearest word boundary instead.
  ══════════════════════════════════════════════════════════════ */
  _splitHtmlIntoChunks(container, count) {
    // ── 1. Collect top-level block nodes ──────────────────────
    const nodes = [...container.childNodes].filter(
      n => !(n.nodeType === Node.TEXT_NODE && !n.textContent.trim())
    );

    if (nodes.length === 0) {
      return Array.from({ length: count }, () => '<p><br></p>');
    }

    // ── 2. Single-node shortcuts ───────────────────────────────
    if (nodes.length === 1) {
      const only = nodes[0];

      if (only.nodeType === Node.ELEMENT_NODE && only.tagName === 'TABLE') {
        return this._splitTableIntoChunks(only, count);
      }
      if (only.nodeType === Node.ELEMENT_NODE && this._isAtomic(only)) {
        // Can't meaningfully subdivide a single image/embed/etc. —
        // keep it whole in column 1, leave the rest blank.
        return [only.outerHTML, ...Array.from({ length: count - 1 }, () => '<p><br></p>')];
      }
      return this._splitNodeByWords(only, count);
    }

    // ── 3. Multi-node greedy bin-pack, weighted ────────────────
    const totalWeight = nodes.reduce((sum, n) => sum + this._nodeWeight(n), 0);
    if (totalWeight === 0) {
      return Array.from({ length: count }, () => '<p><br></p>');
    }

    const target  = totalWeight / count;
    const buckets = Array.from({ length: count }, () => []);
    let colIndex  = 0;
    let colChars  = 0;

    for (const node of nodes) {
      const len    = this._nodeWeight(node);
      const atomic = node.nodeType === Node.ELEMENT_NODE && this._isAtomic(node);

      if (colIndex < count - 1) {
        const filled     = colChars + len;
        const overshoot  = filled - target * (colIndex + 1);
        const undershoot = target * (colIndex + 1) - colChars;

        if (overshoot > 0) {
          if (atomic || overshoot >= undershoot) {
            // Better to start a new column before adding this node.
            // (Atomic nodes always move whole — never split mid-pack.)
            colIndex++;
            buckets[colIndex].push(node);
            colChars += len;
          } else {
            // Better to keep this node here, but it's big — try to
            // split it so the remainder starts the next column
            const splitChars = Math.round(target * (colIndex + 1) - colChars);
            const parts = this._splitNodeByWords(node, 2, splitChars);
            buckets[colIndex].push(parts[0]);   // HTML string
            colIndex++;
            if (parts[1] && parts[1] !== '<p><br></p>') {
              buckets[colIndex].push(parts[1]); // HTML string
              colChars = target * colIndex + (node.textContent.length - splitChars);
            } else {
              colChars = target * colIndex;
            }
          }
          continue;
        }
      }

      buckets[colIndex].push(node);
      colChars += len;
    }

    // ── 4. Serialise: buckets may hold Node objects or HTML strings
    return buckets.map(bucket => {
      if (bucket.length === 0) return '<p><br></p>';
      const tmp = document.createElement('div');
      for (const item of bucket) {
        if (typeof item === 'string') {
          const wrap = document.createElement('div');
          wrap.innerHTML = item;
          while (wrap.firstChild) tmp.appendChild(wrap.firstChild);
        } else {
          tmp.appendChild(item.cloneNode(true));
        }
      }
      return tmp.innerHTML || '<p><br></p>';
    });
  },

  /* ══════════════════════════════════════════════════════════════
     NODE WEIGHT / ATOMIC DETECTION
     "Atomic" nodes are things that can't be split at a word
     boundary — images, tables, embeds, or anything already marked
     contenteditable="false" (e.g. this editor's own wrap-blocks).
     They still need a non-trivial weight so the bin-packer spreads
     them across columns instead of always dumping them wherever the
     running text-character count happens to be low.
  ══════════════════════════════════════════════════════════════ */
  _isAtomic(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    if (['IMG', 'HR', 'VIDEO', 'IFRAME', 'TABLE', 'AUDIO'].includes(node.tagName)) return true;
    if (node.getAttribute('contenteditable') === 'false') return true;
    if (node.hasAttribute('data-rte-atomic')) return true;  
    return false;
  },

  _nodeWeight(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return node.textContent.length;
    const textLen = node.textContent.length;
    return this._isAtomic(node) ? Math.max(textLen, this._ATOMIC_WEIGHT) : textLen;
  },

  /* ══════════════════════════════════════════════════════════════
     SPLIT TABLE INTO CHUNKS
     Distributes a table's rows evenly across `count` columns. If a
     <thead> is present it's cloned into every resulting table so
     each column keeps its own header; a <colgroup>, if present, is
     preserved the same way.
  ══════════════════════════════════════════════════════════════ */
  _splitTableIntoChunks(table, count) {
    const thead   = table.querySelector(':scope > thead');
    const bodySrc = table.querySelector(':scope > tbody') || table;
    const allRows = [...bodySrc.querySelectorAll(':scope > tr')];
    const bodyRows = thead ? allRows.filter(r => !thead.contains(r)) : allRows;

    if (bodyRows.length === 0) {
      // Nothing to split (e.g. header-only table) — keep it whole.
      return [table.outerHTML, ...Array.from({ length: count - 1 }, () => '<p><br></p>')];
    }

    const perCol = Math.ceil(bodyRows.length / count);
    const chunks = [];

    for (let i = 0; i < count; i++) {
      const slice = bodyRows.slice(i * perCol, (i + 1) * perCol);
      if (slice.length === 0) {
        chunks.push('<p><br></p>');
        continue;
      }

      const newTable = document.createElement('table');
      newTable.className = table.className;
      if (table.style.cssText) newTable.style.cssText = table.style.cssText;

      const colgroup = table.querySelector(':scope > colgroup');
      if (colgroup) newTable.appendChild(colgroup.cloneNode(true));
      if (thead) newTable.appendChild(thead.cloneNode(true));

      const newBody = document.createElement('tbody');
      slice.forEach(r => newBody.appendChild(r.cloneNode(true)));
      newTable.appendChild(newBody);

      chunks.push(newTable.outerHTML);
    }

    return chunks;
  },

  /* ══════════════════════════════════════════════════════════════
     SPLIT NODE BY WORDS
     Takes a single DOM node (or raw HTML string), extracts its
     plain text, splits at the nearest word boundary to produce
     `count` roughly equal pieces, and returns an array of HTML
     strings each wrapped in <p>.

     `targetFirstChars` (optional) — if supplied, the first chunk
     aims for exactly that many characters instead of total/count.
  ══════════════════════════════════════════════════════════════ */
  _splitNodeByWords(node, count, targetFirstChars = null) {
    const text  = typeof node === 'string'
      ? ((() => { const d = document.createElement('div'); d.innerHTML = node; return d.textContent; })())
      : node.textContent;
    const words = text.trim().split(/\s+/);

    if (words.length === 0) {
      return Array.from({ length: count }, () => '<p><br></p>');
    }

    const total       = words.join(' ').length;
    const chunkTarget = targetFirstChars ?? (total / count);
    const chunks      = [];
    let   remaining   = [...words];

    for (let i = 0; i < count; i++) {
      if (i === count - 1 || remaining.length === 0) {
        chunks.push(remaining.join(' '));
        remaining = [];
        break;
      }

      // Find word-boundary closest to chunkTarget chars
      const thisTarget = targetFirstChars && i === 0
        ? targetFirstChars
        : total / count;

      let acc = 0;
      let cutAt = 1;
      for (let w = 0; w < remaining.length; w++) {
        acc += remaining[w].length + (w > 0 ? 1 : 0);
        if (acc >= thisTarget) {
          // Choose the boundary that's closer to the target
          const overBy  = acc - thisTarget;
          const underBy = thisTarget - (acc - remaining[w].length - (w > 0 ? 1 : 0));
          cutAt = (overBy <= underBy) ? w + 1 : Math.max(1, w);
          break;
        }
        cutAt = w + 1;
      }

      chunks.push(remaining.slice(0, cutAt).join(' '));
      remaining = remaining.slice(cutAt);
    }

    return chunks.map(c => c.trim() ? `<p>${c.trim()}</p>` : '<p><br></p>');
  },

  _nearestBlock(node, contentArea) {
    let el = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
    while (el && el.parentNode !== contentArea) el = el.parentNode;
    return (el && el !== contentArea) ? el : null;
  },

  /* ══════════════════════════════════════════════════════════════
     BLOCK EVENT WIRING
     Attach focus/click listeners so the toolbar appears when
     the user interacts with a col block.
  ══════════════════════════════════════════════════════════════ */
  _wireBlockEvents(editor, block) {
    if (block._rteColsWired) return;
    block._rteColsWired = true;

    // Wire the delegated listeners once per editor, not once per block
    if (!editor._rteColsDelegatedWired) {
      editor._rteColsDelegatedWired = true;

      const detectActiveBlock = () => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const node = sel.anchorNode;
        if (!node || !editor.contentArea.contains(node)) return;
        const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        const colsBlock = el?.closest('.rte-cols');

        if (colsBlock) {
          if (this._activeBlock !== colsBlock) {
            this._activeBlock = colsBlock;
            this._showColToolbar(editor, colsBlock);
          }
        }
      };

      editor.contentArea.addEventListener('focusin', detectActiveBlock);
      editor.contentArea.addEventListener('mouseup', detectActiveBlock);
      editor.contentArea.addEventListener('keyup', detectActiveBlock);
      // Add inside the same "wire once per editor" block above
      editor.contentArea.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const sel = window.getSelection();
        const node = sel?.anchorNode;
        if (!node) return;
        const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        const colsBlock = el?.closest('.rte-cols');
        if (colsBlock) {
          e.preventDefault();
          this._exitColumns(editor, colsBlock);
        }
      });
    }

    // Keep this — mouse events still target the real click point,
    // so this guard is unaffected by the contenteditable change.
    block.addEventListener('mousedown', (e) => {
      if (e.target.closest('.rte-col')) return;
      e.preventDefault();
    });
  },

  /* ══════════════════════════════════════════════════════════════
     COLUMN INTERACTIVITY WIRING
     • Escape inside any column exits the block.
     • Mousedown on a resizer starts a width-drag between the two
       columns it sits between.
     Safe to call repeatedly (e.g. after _changeColCount rebuilds
     the columns) — already-wired elements are skipped.
  ══════════════════════════════════════════════════════════════ */
  _wireColumnsInteractivity(editor, block) {
    block.querySelectorAll('.rte-col').forEach(col => {
      if (col._rteColKeyWired) return;
      col._rteColKeyWired = true;
      col.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); this._exitColumns(editor, block); return; }

        // const sel = window.getSelection();
        // if (!sel?.isCollapsed) return;
        // const atStart = /* caret at offset 0 of col's first child */ this._caretAtStart(col, sel);
        // const atEnd   = /* caret at end of col's last child */      this._caretAtEnd(col, sel);

        // if (e.key === 'Backspace' && atStart) e.preventDefault();
        // if (e.key === 'Delete' && atEnd) e.preventDefault();
      });
    });

    block.querySelectorAll('.rte-col-resizer').forEach(resizer => {
      if (resizer._rteResizerWired) return;
      resizer._rteResizerWired = true;
      resizer.addEventListener('mousedown', (e) => this._startResize(e, editor, block, resizer));
    });
  },

  /* ══════════════════════════════════════════════════════════════
     RESIZE — drag the strip between two columns to change their
     widths. The two adjacent columns' combined width is conserved;
     other columns are untouched.
  ══════════════════════════════════════════════════════════════ */
  _startResize(e, editor, block, resizer) {
    e.preventDefault();
    e.stopPropagation();

    const cols     = [...block.querySelectorAll('.rte-col')];
    const leftIdx  = parseInt(resizer.dataset.leftIdx, 10);
    const leftCol  = cols[leftIdx];
    const rightCol = cols[leftIdx + 1];
    if (!leftCol || !rightCol) return;

    const blockRect  = block.getBoundingClientRect();
    const evenShare  = 100 / cols.length;
    const startLeft  = parseFloat(leftCol.style.flexBasis)  || evenShare;
    const startRight = parseFloat(rightCol.style.flexBasis) || evenShare;
    const pairTotal  = startLeft + startRight;
    const minPct     = blockRect.width > 0 ? Math.max(6, (60 / blockRect.width) * 100) : 10;
    const startX     = e.clientX;

    document.body.style.cursor = 'col-resize';
    block.style.userSelect = 'none';

    const onMove = (ev) => {
      const deltaPct = blockRect.width > 0 ? ((ev.clientX - startX) / blockRect.width) * 100 : 0;
      let newLeft = startLeft + deltaPct;
      newLeft = Math.max(minPct, Math.min(pairTotal - minPct, newLeft));
      const newRight = pairTotal - newLeft;
      leftCol.style.flexBasis  = `${newLeft}%`;
      rightCol.style.flexBasis = `${newRight}%`;
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      block.style.userSelect = '';
      editor.emitChange();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  },

  /* ══════════════════════════════════════════════════════════════
     EXIT COLUMNS
     Moves the cursor to the paragraph immediately after the block,
     creating one first if it doesn't already exist. Triggered by
     the toolbar's Exit button or by pressing Escape in a column.
  ══════════════════════════════════════════════════════════════ */
  _exitColumns(editor, block) {
    this._destroyColToolbar();
    this._activeBlock = null;

    let next = block.nextElementSibling;
    if (!next || !editor.contentArea.contains(next)) {
      next = document.createElement('p');
      next.innerHTML = '<br>';
      block.after(next);
    }

    editor.contentArea.focus();
    const r = document.createRange();
    r.selectNodeContents(next);
    r.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);

    editor.emitChange();
  },

  /* ══════════════════════════════════════════════════════════════
     COLUMNS TOOLBAR
  ══════════════════════════════════════════════════════════════ */
  _showColToolbar(editor, block) {
    this._destroyColToolbar();

    const toolbar = document.createElement('div');
    toolbar.className = 'rte-cols-toolbar';
    toolbar.addEventListener('mousedown', (e) => e.stopPropagation());

    const currentCount = parseInt(block.dataset.rteCols, 10) || 2;

    // ── column count switcher ──
    [2, 3].forEach(n => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rte-cols-tb-btn' + (n === currentCount ? ' rte-cols-tb-active' : '');
      btn.setAttribute('title', `${n} columns`);
      btn.setAttribute('aria-label', `${n} columns`);
      btn.innerHTML = n === 2 ? this._icon2Col : this._icon3Col;
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (n !== currentCount) {
          this._changeColCount(editor, block, n);
        }
      });
      toolbar.appendChild(btn);
    });

    toolbar.appendChild(this._mkDivider());

    // ── divider line toggle ──
    const isDivided = block.getAttribute('data-divided') === 'true';
    const dividerBtn = document.createElement('button');
    dividerBtn.type = 'button';
    dividerBtn.className = 'rte-cols-tb-btn' + (isDivided ? ' rte-cols-tb-active' : '');
    dividerBtn.innerHTML = this._iconDivider;
    dividerBtn.setAttribute('title', isDivided ? 'Remove divider line' : 'Add divider line');
    dividerBtn.setAttribute('aria-label', 'Toggle divider line');
    dividerBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const nowDivided = block.getAttribute('data-divided') !== 'true';
      block.setAttribute('data-divided', String(nowDivided));
      this._setDividerVisual(block, nowDivided);
      editor.emitChange();
      this._showColToolbar(editor, block);
    });
    toolbar.appendChild(dividerBtn);

    toolbar.appendChild(this._mkDivider());

    // ── exit columns ──
    const exitBtn = document.createElement('button');
    exitBtn.type = 'button';
    exitBtn.className = 'rte-cols-tb-btn';
    exitBtn.innerHTML = this._iconExit;
    exitBtn.setAttribute('title', 'Exit columns (or press Esc)');
    exitBtn.setAttribute('aria-label', 'Exit columns');
    exitBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._exitColumns(editor, block);
    });
    toolbar.appendChild(exitBtn);

    toolbar.appendChild(this._mkDivider());

    // ── remove / unwrap ──
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'rte-cols-tb-btn rte-cols-tb-danger';
    removeBtn.innerHTML = this._iconRemove;
    removeBtn.setAttribute('title', 'Remove column layout');
    removeBtn.setAttribute('aria-label', 'Remove column layout');
    removeBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._unwrapCols(editor, block);
    });
    toolbar.appendChild(removeBtn);

    editor.root.appendChild(toolbar);
    this._colToolbar = toolbar;

    requestAnimationFrame(() => this._positionColToolbar(block));
  },

  _positionColToolbar(block) {
    const tb = this._colToolbar;
    if (!tb || !block) return;

    const bRect = block.getBoundingClientRect();
    const eRect = this._editor.root.getBoundingClientRect();
    const tbH   = tb.offsetHeight;
    const tbW   = tb.offsetWidth;

    let top = bRect.top - eRect.top - tbH - 8;
    if (top < (this._editor.toolbar?.offsetHeight || 46) + 4)
      top = bRect.bottom - eRect.top + 8;

    let left = bRect.left - eRect.left + bRect.width / 2 - tbW / 2;
    left = Math.max(4, Math.min(left, eRect.width - tbW - 4));

    tb.style.cssText = `position:absolute;top:${top}px;left:${left}px;z-index:1060;`;
  },

  _destroyColToolbar() {
    this._colToolbar?.remove();
    this._colToolbar = null;
  },

  /* ══════════════════════════════════════════════════════════════
     CHANGE COLUMN COUNT
     Content in existing columns is preserved; new columns are blank.
     Widths reset to equal shares; the divider setting is untouched
     (it lives on the outer block, which isn't recreated).
  ══════════════════════════════════════════════════════════════ */
  _changeColCount(editor, block, newCount) {
    const oldCols    = [...block.querySelectorAll('.rte-col')];
    const oldCount   = oldCols.length;
    const oldHtmlArr = oldCols.map(c => c.innerHTML);

    // Update class and dataset
    block.classList.remove(`rte-cols-${oldCount}`);
    block.classList.add(`rte-cols-${newCount}`);
    block.setAttribute('data-rte-cols', String(newCount));

    // Remove all existing columns + resizers
    block.querySelectorAll('.rte-col, .rte-col-resizer').forEach(n => n.remove());

    // Rebuild with preserved content and equal widths
    const widthPct = (100 / newCount).toFixed(4);
    for (let i = 0; i < newCount; i++) {
      const col = this._createColumn(oldHtmlArr[i] ?? '<p><br></p>', widthPct);
      block.appendChild(col);
      if (i < newCount - 1) block.appendChild(this._createResizer(i));
    }

    this._wireColumnsInteractivity(editor, block);
    this._setDividerVisual(block, block.getAttribute('data-divided') === 'true');

    editor.emitChange();

    // Rebuild toolbar with updated count
    this._showColToolbar(editor, block);
  },

  _setDividerVisual(block, divided) {
    block.querySelectorAll('.rte-col-resizer-line').forEach(line => {
      line.style.background = divided ? '#94a3b8' : 'transparent';
    });
  },

  /* ══════════════════════════════════════════════════════════════
     UNWRAP — flatten columns back into the document
  ══════════════════════════════════════════════════════════════ */
  _unwrapCols(editor, block) {
    this._destroyColToolbar();
    this._activeBlock = null;

    const cols = [...block.querySelectorAll('.rte-col')];
    const frag = document.createDocumentFragment();

    cols.forEach(col => {
      // Move each column's children directly into the fragment
      while (col.firstChild) frag.appendChild(col.firstChild);
    });

    // Ensure the last node is a paragraph so cursor has somewhere to land
    const last = frag.lastChild;
    if (!last || last.tagName !== 'P') {
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      frag.appendChild(p);
    }

    block.replaceWith(frag);
    editor.emitChange();
  },

  /* ══════════════════════════════════════════════════════════════
     GLOBAL MOUSEDOWN — hide toolbar when clicking outside
  ══════════════════════════════════════════════════════════════ */
  _onDocMouseDown(e) {
    if (!this._activeBlock) return;
    const inBlock   = this._activeBlock.contains(e.target);
    const inToolbar = this._colToolbar?.contains(e.target);
    if (!inBlock && !inToolbar) {
      this._destroyColToolbar();
      this._activeBlock = null;
    }
  },

  /* ══════════════════════════════════════════════════════════════
     updateState
  ══════════════════════════════════════════════════════════════ */
  isActive()       { return false; },
  updateState(btn) { btn.setAttribute('aria-pressed', 'false'); },

  /* ══════════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════════ */
  _mkDivider() {
    const d = document.createElement('span');
    d.className = 'rte-cols-tb-divider';
    return d;
  },

  /* ══════════════════════════════════════════════════════════════
     ICONS
  ══════════════════════════════════════════════════════════════ */
  _icon2Col: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2"  y="3" width="9" height="18" rx="1"/>
    <rect x="13" y="3" width="9" height="18" rx="1"/>
  </svg>`,

  _icon3Col: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2"  y="3" width="5.5" height="18" rx="1"/>
    <rect x="9.25" y="3" width="5.5" height="18" rx="1"/>
    <rect x="16.5" y="3" width="5.5" height="18" rx="1"/>
  </svg>`,

  _iconDivider: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="3" x2="12" y2="21"/>
  </svg>`,

  _iconExit: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>`,

  _iconRemove: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>`,
};