/**
 * Table Tool Module  —  table.js
 * ═══════════════════════════════════════════════════════════════════
 * Inserts and manages a fully customisable <table> inside the editor.
 *
 * Features
 * ─────────
 * Insertion    : grid picker to choose rows × columns (up to 8×8)
 * Header row   : toggle <thead> on / off
 * Footer row   : toggle <tfoot> on / off
 * Add row      : above / below the focused row
 * Add column   : left / right of the focused column
 * Delete row / column / whole table
 * Cell bg color : per-cell, per-row, per-column, per-selection (with clear)
 * Border style  : none / solid / dashed / double / dotted; width; colour
 *                 scope: all cells / this cell / this row / this column /
 *                        selected cells
 * Text align    : per-cell / per-selection (L / C / R)
 * Column resize : via CSS resize on colgroup widths
 * Cell selection: drag across multiple cells; entire table select
 * Edit button   : separate toolbar button, visible only when ≥1 table exists;
 *                 hidden again when all tables are deleted
 *
 * v2 changes
 * ──────────
 * • Separate "Table Edit" toolbar button (pencil icon) next to insert button
 * • Edit button visibility tracks table presence in contentArea
 * • Panel opens on edit-button click, not on cell click
 *   – Targets cursor's table, falls back to first table in editor
 * • Panel auto-retargets when user clicks a cell in a different table
 * • Close (×) button on the context panel
 * • Drag-cell-selection: mousedown→mousemove→mouseup across td/th
 * • Selection scope "Selected cells" auto-set as default when cells selected
 * • _applyBg / _applyBorderFull / _cellAlign all honour selection
 */

import { positionFloatingPanel } from './panel-position.js';

export const TableTool = {
  name: 'table',
  ariaLabel: 'Insert table',
  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="3"  y1="9"  x2="21" y2="9"/>
          <line x1="3"  y1="15" x2="21" y2="15"/>
          <line x1="9"  y1="3"  x2="9"  y2="21"/>
          <line x1="15" y1="3"  x2="15" y2="21"/>
        </svg>`,

  editIcon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
               <rect x="3" y="3" width="18" height="18" rx="2"/>
               <line x1="3"  y1="9"  x2="21" y2="9"/>
               <line x1="3"  y1="15" x2="21" y2="15"/>
               <line x1="9"  y1="3"  x2="9"  y2="21"/>
               <line x1="15" y1="3"  x2="15" y2="21"/>
               <circle cx="18" cy="18" r="5" fill="var(--rte-bg,#fff)" stroke="currentColor" stroke-width="2"/>
               <line x1="16.2" y1="18" x2="19.8" y2="18" stroke="currentColor" stroke-width="1.8"/>
               <line x1="18" y1="16.2" x2="18" y2="19.8" stroke="currentColor" stroke-width="1.8"/>
             </svg>`,

  /* ── internal state ──────────────────────────────────────────── */
  _editor        : null,
  _btnEl         : null,   // insert button
  _editBtnEl     : null,   // edit button
  _picker        : null,
  _ctxPanel      : null,
  _activeTable   : null,
  _activeCell    : null,
  _focusTimer    : null,
  _lastTable     : null,
  _tableObserver : null,   // MutationObserver to track table presence

  // drag-selection state
  _selCells      : [],     // array of selected td/th elements
  _dragStart     : null,
  _isDragging    : false,

  /* ══════════════════════════════════════════════════════════════
     PUBLIC: createButton  — returns the INSERT button
  ══════════════════════════════════════════════════════════════ */
  createButton(editor) {
    this._editor = editor;

    // ── insert button ──
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'rte-tool-btn';
    btn.dataset.tool = this.name;
    btn.setAttribute('aria-label', this.ariaLabel);
    btn.setAttribute('title',      this.ariaLabel);
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = this.icon;
    this._btnEl   = btn;

    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this._picker ? this._destroyPicker() : this._showPicker(btn);
    });

    // ── edit button ──
    const editBtn = document.createElement('button');
    editBtn.type      = 'button';
    editBtn.className = 'rte-tool-btn rte-table-edit-btn';
    editBtn.dataset.tool = 'table-edit';
    editBtn.setAttribute('aria-label', 'Edit table');
    editBtn.setAttribute('title',      'Edit table');
    editBtn.setAttribute('aria-pressed', 'false');
    editBtn.innerHTML = this.editIcon;
    editBtn.style.display = 'none';   // hidden until a table exists
    this._editBtnEl = editBtn;

    editBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this._handleEditBtnClick();
    });

    // Start observing the content area for table additions/removals
    // (deferred so editor.contentArea exists by the time this runs)
    requestAnimationFrame(() => this._startTableObserver(editor));

    // Return a fragment-like wrapper so both buttons get added side-by-side
    // Caller is expected to append `btn` normally; we smuggle editBtn alongside it.
    btn._editBtn = editBtn;   // expose so toolbar code can pick it up
    return btn;
  },

  /* ── observe contentArea for table presence ──────────────────── */
  _startTableObserver(editor) {
    if (this._tableObserver) return;
    const check = () => this._refreshEditBtnVisibility(editor);
    this._tableObserver = new MutationObserver(check);
    this._tableObserver.observe(editor.contentArea, { childList: true, subtree: true });
    check();   // initial check
  },

  _refreshEditBtnVisibility(editor) {
    const hasTables = !!editor.contentArea.querySelector('[data-rte-table]');
    if (this._editBtnEl) {
      this._editBtnEl.style.display = hasTables ? '' : 'none';
    }
    // If panel is open but there are no tables left, close it
    if (!hasTables && this._ctxPanel) {
      this._destroyCtxPanel();
      this._activeTable = null;
      this._activeCell  = null;
      this._lastTable   = null;
    }
  },

  /* ── edit button click handler ───────────────────────────────── */
  _handleEditBtnClick() {
    const editor = this._editor;

    // If panel is already open, close it (toggle)
    if (this._ctxPanel) {
      this._destroyCtxPanel();
      return;
    }

    // Find focused table: cursor inside a table? use that. else use first table.
    const target = this._getTableFromCursor(editor)
                || editor.contentArea.querySelector('[data-rte-table]');
    if (!target) return;

    this._activeTable = target;

    // Set active cell to cursor's cell, or first cell of the table
    const cursorCell = this._getCellFromCursor();
    this._activeCell = cursorCell || target.querySelector('td, th');

    this._syncCtxPanel(editor, target);
    this._lastTable = target;
  },

  /* ── helpers to read cursor position ─────────────────────────── */
  _getTableFromCursor(editor) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    let node = sel.anchorNode;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentNode;
    const t = node?.closest?.('[data-rte-table]');
    return (t && editor.contentArea.contains(t)) ? t : null;
  },

  _getCellFromCursor() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    let node = sel.anchorNode;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentNode;
    return node?.closest?.('td, th') || null;
  },

  /* ══════════════════════════════════════════════════════════════
     GRID PICKER
  ══════════════════════════════════════════════════════════════ */
  _showPicker(triggerBtn) {
    this._destroyPicker();

    const editor = this._editor;
    const panel  = document.createElement('div');
    panel.className = 'rte-table-picker';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Choose table size');

    panel.style.cssText = `position: absolute; z-index: 1100; visibility: hidden;`;

    const ROWS = 8, COLS = 8;
    let hoverR = 0, hoverC = 0;

    const label = document.createElement('div');
    label.className   = 'rte-tp-label';
    label.textContent = 'Insert table';

    const grid = document.createElement('div');
    grid.className = 'rte-tp-grid';
    grid.style.gridTemplateColumns = `repeat(${COLS}, 20px)`;

    const cells = [];
    for (let r = 1; r <= ROWS; r++) {
      for (let c = 1; c <= COLS; c++) {
        const cell = document.createElement('div');
        cell.className = 'rte-tp-cell';
        cell.dataset.r = r;
        cell.dataset.c = c;
        cell.setAttribute('aria-label', `${r} × ${c}`);

        cell.addEventListener('mouseenter', () => {
          hoverR = r; hoverC = c;
          label.textContent = `${r} × ${c} table`;
          cells.forEach(el => {
            const er = +el.dataset.r, ec = +el.dataset.c;
            el.classList.toggle('rte-tp-cell-on', er <= r && ec <= c);
          });
        });

        cell.addEventListener('click', () => {
          this._destroyPicker();
          this.execute(editor, hoverR, hoverC);
        });

        grid.appendChild(cell);
        cells.push(cell);
      }
    }

    panel.appendChild(label);
    panel.appendChild(grid);
    editor.root.appendChild(panel);
    this._picker = panel;
    positionFloatingPanel(panel, triggerBtn, editor.root);
    panel.style.visibility = '';

    setTimeout(() => {
      this._pickerOutside = (e) => {
        if (!panel.contains(e.target) && e.target !== triggerBtn)
          this._destroyPicker();
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
     PUBLIC: execute  — insert a rows×cols table
  ══════════════════════════════════════════════════════════════ */
  execute(editor, rows = 3, cols = 3) {
    editor.contentArea.focus();

    const table = this._buildTable(rows, cols);
    this._attachDragSelection(editor, table);
    // this._attachDragSelection(editor, table);
    this._attachTableClickSwitch(editor, table);

    // Auto-switch panel to newly inserted table if panel is open
    this._attachTableClickSwitch(editor, table);

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      let node = range.commonAncestorContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
      if (!node.closest?.('table')) {
        range.collapse(false);
        range.insertNode(table);
      } else {
        editor.contentArea.appendChild(table);
      }
    } else {
      editor.contentArea.appendChild(table);
    }

    const after = document.createElement('p');
    after.innerHTML = '<br>';
    table.after(after);

    const firstCell = table.querySelector('td, th');
    if (firstCell) {
      const r = document.createRange();
      r.setStart(firstCell, 0);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
      firstCell.focus?.();
    }

    editor.emitChange();
  },

  /* ── build a fresh <table> DOM node ───────────────────────── */
  _buildTable(rows, cols) {
    const table = document.createElement('table');
    table.className = 'rte-table';
    table.setAttribute('data-rte-table', '');

    const colgroup = document.createElement('colgroup');
    for (let c = 0; c < cols; c++) {
      const col = document.createElement('col');
      col.style.width = `${Math.floor(100 / cols)}%`;
      colgroup.appendChild(col);
    }
    table.appendChild(colgroup);

    const tbody = document.createElement('tbody');
    for (let r = 0; r < rows; r++) {
      tbody.appendChild(this._buildRow(cols, 'td'));
    }
    table.appendChild(tbody);

    return table;
  },

  _buildRow(cols, tag = 'td') {
    const tr = document.createElement('tr');
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement(tag);
      cell.setAttribute('contenteditable', 'true');
      cell.setAttribute('tabindex', '0');
      cell.innerHTML = '<br>';
      tr.appendChild(cell);
    }
    return tr;
  },

  /* ══════════════════════════════════════════════════════════════
     DRAG CELL SELECTION
     — mousedown on a cell starts a drag; mousemove highlights the
       rectangular range; mouseup commits the selection.
  ══════════════════════════════════════════════════════════════ */
_attachDragSelection(editor, table) {
  if (table._rteDragAttached) return;
  table._rteDragAttached = true;

  const getAllCells = () => [...table.querySelectorAll('td, th')];

  const cellCoords = (cell) => {
    const allRows = [...table.querySelectorAll('tr')];
    const row     = cell.closest('tr');
    const rowIdx  = allRows.indexOf(row);
    const colIdx  = [...row.children].indexOf(cell);
    return [rowIdx, colIdx];
  };

  const rectCells = (a, b) => {
    const [r1, c1] = cellCoords(a);
    const [r2, c2] = cellCoords(b);
    const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
    const minC = Math.min(c1, c2), maxC = Math.max(c1, c2);
    const allRows = [...table.querySelectorAll('tr')];
    const result  = [];
    allRows.forEach((row, ri) => {
      if (ri < minR || ri > maxR) return;
      [...row.children].forEach((cell, ci) => {
        if (ci >= minC && ci <= maxC) result.push(cell);
      });
    });
    return result;
  };

  const clearHighlight = () => {
    getAllCells().forEach(c => c.classList.remove('rte-cell-selected'));
  };

  const applyHighlight = (cells) => {
    clearHighlight();
    cells.forEach(c => c.classList.add('rte-cell-selected'));
  };

  // ── mousedown: record start cell, don't preventDefault ──────────
  table.addEventListener('mousedown', (e) => {
    const cell = e.target.closest('td, th');
    if (!cell || !table.contains(cell)) return;

    // Clear any previous drag selection
    this._clearSelection();
    this._dragStart  = cell;
    this._isDragging = false;

    this._activeTable = table;
    this._activeCell  = cell;

    if (this._ctxPanel && this._lastTable !== table) {
      this._syncCtxPanel(editor, table);
      this._lastTable = table;
    }
  });

  // ── mousemove: once we've moved to a different cell, lock in drag mode ──
  table.addEventListener('mousemove', (e) => {
    if (!this._dragStart || !table.contains(this._dragStart)) return;
    const cell = e.target.closest('td, th');
    if (!cell || !table.contains(cell)) return;

    // Only activate drag mode when the pointer enters a DIFFERENT cell
    if (!this._isDragging && cell === this._dragStart) return;

    if (!this._isDragging) {
      // First move into a new cell — engage drag mode
      this._isDragging = true;
      // Suppress browser text selection for the duration of the drag
      table.style.userSelect    = 'none';
      table.style.webkitUserSelect = 'none';
      // Kill whatever text selection the browser already started
      window.getSelection()?.removeAllRanges();
    }

    const cells = rectCells(this._dragStart, cell);
    applyHighlight(cells);
    this._selCells = cells;

    if (this._ctxPanel && this._lastTable === table) {
      this._updatePanelScopeForSelection();
    }
  });

  // ── mouseup: commit or discard ───────────────────────────────────
  const onMouseUp = () => {
    // Restore text selection behaviour regardless
    table.style.userSelect       = '';
    table.style.webkitUserSelect = '';

    if (this._isDragging && this._selCells.length > 1) {
      // Keep highlight — selection stays until next click
    } else {
      // Plain click, no real drag
      this._selCells = [];
      clearHighlight();
    }

    this._dragStart  = null;
    this._isDragging = false;
  };

  table.addEventListener('mouseup', onMouseUp);

  // ── clear selection when clicking outside this table ────────────
  document.addEventListener('mousedown', (e) => {
    if (!table.contains(e.target) && this._selCells.length > 0) {
      this._clearSelection();
    }
  });
},

  _clearSelection() {
    this._selCells.forEach(c => c.classList.remove('rte-cell-selected'));
    this._selCells = [];
  },

  /* ── tell the panel to switch its scope selectors to "selected cells" ── */
  _updatePanelScopeForSelection() {
    if (!this._ctxPanel) return;
    const hasSelection = this._selCells.length > 1;
    // Update all scope selects in the panel
    this._ctxPanel.querySelectorAll('select.rte-tctx-select[data-scope]').forEach(sel => {
      const opts = [...sel.options].map(o => o.value);
      if (hasSelection && opts.includes('selected cells')) {
        sel.value = 'selected cells';
      }
    });
  },

  /* ── attach click-based table switch when panel is already open ── */
  _attachTableClickSwitch(editor, table) {
    if (table._rteClickSwitchAttached) return;
    table._rteClickSwitchAttached = true;
    table.addEventListener('mousedown', () => {
      // If panel is open for a different table, re-target
      if (this._ctxPanel && this._lastTable && this._lastTable !== table) {
        this._activeTable = table;
        this._activeCell  = table.querySelector('td, th');
        this._selCells    = [];
        this._syncCtxPanel(editor, table);
        this._lastTable = table;
      }
    });
  },

  /* ══════════════════════════════════════════════════════════════
     CONTEXT PANEL  — builds the floating toolbar
  ══════════════════════════════════════════════════════════════ */
  _syncCtxPanel(editor, table) {
    this._destroyCtxPanel();

    const panel = document.createElement('div');
    panel.className = 'rte-table-ctx';
    panel.setAttribute('role', 'toolbar');
    panel.setAttribute('aria-label', 'Table options');

    // Keep focus in table when interacting with panel buttons
    panel.addEventListener('mousedown', (e) => {
      const tag = e.target.tagName;
      if (tag !== 'INPUT' && tag !== 'SELECT') e.preventDefault();
    });

    // ── close button ──
    const closeBtn = document.createElement('button');
    closeBtn.type      = 'button';
    closeBtn.className = 'rte-tctx-close';
    closeBtn.setAttribute('aria-label', 'Close table options');
    closeBtn.setAttribute('title',      'Close table options');
    closeBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6"  y1="6" x2="18" y2="18"/>
    </svg>`;
    closeBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this._destroyCtxPanel();
    });
    panel.appendChild(closeBtn);

    // ── group: structure ──
    const headToggle = this._ctxToggle(
      'Header row',
      () => this._hasHead(table),
      () => { this._toggleHead(editor, table); headToggle._refresh(); }
    );
    const footToggle = this._ctxToggle(
      'Footer row',
      () => this._hasFoot(table),
      () => { this._toggleFoot(editor, table); footToggle._refresh(); }
    );

    this._ctxGroup(panel, 'Structure', [
      this._ctxBtn('Add row above',  this._iconRowAbove, () => this._addRow(editor, table, 'above')),
      this._ctxBtn('Add row below',  this._iconRowBelow, () => this._addRow(editor, table, 'below')),
      this._ctxBtn('Add col left',   this._iconColLeft,  () => this._addCol(editor, table, 'left')),
      this._ctxBtn('Add col right',  this._iconColRight, () => this._addCol(editor, table, 'right')),
      this._ctxBtn('Delete row',     this._iconDelRow,   () => this._deleteRow(editor, table), 'danger'),
      this._ctxBtn('Delete column',  this._iconDelCol,   () => this._deleteCol(editor, table), 'danger'),
      this._ctxBtn('Delete table',   this._iconDelTable, () => this._deleteTable(editor, table), 'danger'),
    ]);

    // ── group: header / footer ──
    this._ctxGroup(panel, 'Header & Footer', [ headToggle, footToggle ]);

    // ── group: background colour ──
    const bgScopeOpts = ['this cell', 'this row', 'this column', 'selected cells', 'all cells'];
    const bgScopeSel  = this._mkSelect(bgScopeOpts, 'Apply to');
    bgScopeSel.dataset.scope = 'bg';
    bgScopeSel.value = this._selCells.length > 1 ? 'selected cells' : 'this cell';

    const bgColorWrap = this._ctxColorPicker('Background', (c) => {
      this._applyBg(editor, bgScopeSel.value || 'this cell', c);
    });

    const clearBgBtn = this._ctxBtn('Clear bg', this._iconClearBg, () => {
      this._applyBg(editor, bgScopeSel.value || 'this cell', '');
    });

    this._ctxGroup(panel, 'Background Color', [ bgScopeSel, bgColorWrap, clearBgBtn ]);

    // ── group: borders ──
    const borderGroup = document.createElement('div');
    borderGroup.className = 'rte-tctx-group';

    const borderLabel = document.createElement('span');
    borderLabel.className   = 'rte-tctx-label';
    borderLabel.textContent = 'Borders';
    borderGroup.appendChild(borderLabel);

    const borderRow1 = document.createElement('div');
    borderRow1.className = 'rte-tctx-row';

    const styleSelect = this._mkSelect(
      ['none', 'solid', 'dashed', 'double', 'dotted'],
      'Style'
    );
    const widthSelect = this._mkSelect(
      ['1px', '2px', '3px', '4px'],
      'Width'
    );

    const borderColorWrap = document.createElement('label');
    borderColorWrap.className = 'rte-tctx-color-wrap';
    borderColorWrap.title = 'Border color';
    const borderColorInp = document.createElement('input');
    borderColorInp.type  = 'color';
    borderColorInp.value = '#c8cbd8';
    const borderColorSwatch = document.createElement('span');
    borderColorSwatch.className = 'rte-tctx-swatch';
    borderColorSwatch.style.background = '#c8cbd8';
    const borderColorLbl = document.createElement('span');
    borderColorLbl.className   = 'rte-tctx-clr-lbl';
    borderColorLbl.textContent = 'Color';
    borderColorInp.addEventListener('input', e => {
      borderColorSwatch.style.background = e.target.value;
    });
    borderColorWrap.appendChild(borderColorInp);
    borderColorWrap.appendChild(borderColorSwatch);
    borderColorWrap.appendChild(borderColorLbl);

    borderRow1.appendChild(styleSelect);
    borderRow1.appendChild(widthSelect);
    borderRow1.appendChild(borderColorWrap);
    borderGroup.appendChild(borderRow1);

    const borderRow2 = document.createElement('div');
    borderRow2.className = 'rte-tctx-row';
    borderRow2.style.marginTop = '4px';

    const applyTo = this._mkSelect(
      ['all cells', 'this cell', 'this row', 'this column', 'selected cells'],
      'Apply to'
    );
    applyTo.dataset.scope = 'border';
    // Default to "selected cells" if there's a drag selection
    applyTo.value = this._selCells.length > 1 ? 'selected cells' : 'all cells';

    const applyBorderBtn = document.createElement('button');
    applyBorderBtn.type      = 'button';
    applyBorderBtn.className = 'rte-tctx-btn rte-tctx-apply';
    applyBorderBtn.textContent = 'Apply';
    applyBorderBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const style = styleSelect.value || 'solid';
      const width = widthSelect.value || '1px';
      const color = borderColorInp.value;
      const scope = applyTo.value   || 'all cells';
      this._applyBorderFull(editor, table, style, width, color, scope);
    });

    borderRow2.appendChild(applyTo);
    borderRow2.appendChild(applyBorderBtn);
    borderGroup.appendChild(borderRow2);
    panel.appendChild(borderGroup);

    // ── group: cell text-align ──
    const alignScopeOpts = ['this cell', 'this row', 'this column', 'selected cells', 'all cells'];
    const alignScopeSel  = this._mkSelect(alignScopeOpts, 'Apply to');
    alignScopeSel.dataset.scope = 'align';
    alignScopeSel.value = this._selCells.length > 1 ? 'selected cells' : 'this cell';

    this._ctxGroup(panel, 'Cell Align', [
      alignScopeSel,
      this._ctxBtn('Align left',   this._iconAlignL, () => this._cellAlign(editor, alignScopeSel.value || 'this cell', 'left')),
      this._ctxBtn('Align center', this._iconAlignC, () => this._cellAlign(editor, alignScopeSel.value || 'this cell', 'center')),
      this._ctxBtn('Align right',  this._iconAlignR, () => this._cellAlign(editor, alignScopeSel.value || 'this cell', 'right')),
    ]);

    // Append to DOM, then position
    editor.root.appendChild(panel);
    this._ctxPanel = panel;

    requestAnimationFrame(() => this._positionCtxPanel(editor, table));

    panel.addEventListener('mouseenter', () => {
      if (this._focusTimer) { clearTimeout(this._focusTimer); this._focusTimer = null; }
    });
  },

  /* Position the panel — below the table if not enough space above */
  _positionCtxPanel(editor, table) {
    const panel = this._ctxPanel;
    if (!panel || !table) return;

    const tRect = table.getBoundingClientRect();
    const eRect = editor.root.getBoundingClientRect();

    const panelH = panel.offsetHeight;
    const panelW = panel.offsetWidth;

    let top = tRect.top - eRect.top - panelH - 8;

    const toolbarH = editor.toolbar ? editor.toolbar.offsetHeight : 46;
    if (top < toolbarH + 4) {
      top = tRect.bottom - eRect.top + 8;
    }

    const eWidth = eRect.width;
    let left = tRect.left - eRect.left;
    if (left + panelW > eWidth - 8) left = Math.max(0, eWidth - panelW - 8);

    panel.style.cssText = `
      position: absolute;
      top:  ${top}px;
      left: ${left}px;
      z-index: 1050;
    `;
  },

  _destroyCtxPanel() {
    this._ctxPanel?.remove();
    this._ctxPanel = null;
  },

  /* ══════════════════════════════════════════════════════════════
     CONTEXT-PANEL HELPERS
  ══════════════════════════════════════════════════════════════ */
  _ctxGroup(panel, title, children) {
    const g = document.createElement('div');
    g.className = 'rte-tctx-group';
    const lbl = document.createElement('span');
    lbl.className   = 'rte-tctx-label';
    lbl.textContent = title;
    g.appendChild(lbl);
    const row = document.createElement('div');
    row.className = 'rte-tctx-row';
    children.forEach(c => row.appendChild(c));
    g.appendChild(row);
    panel.appendChild(g);
  },

  _ctxBtn(label, icon, action, variant = '') {
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = `rte-tctx-btn${variant ? ' rte-tctx-' + variant : ''}`;
    btn.setAttribute('title',      label);
    btn.setAttribute('aria-label', label);
    btn.innerHTML = icon;
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); action(); });
    return btn;
  },

  _ctxToggle(label, getActive, action) {
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'rte-tctx-btn rte-tctx-toggle';
    btn.setAttribute('title', label);

    const refresh = () => {
      const on = getActive();
      btn.classList.toggle('rte-tctx-on', on);
      btn.textContent = `${on ? '✓ ' : ''}${label}`;
    };
    refresh();

    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      action();
    });

    btn._refresh = refresh;
    return btn;
  },

  _ctxColorPicker(label, onChange) {
    const wrap = document.createElement('label');
    wrap.className = 'rte-tctx-color-wrap';
    wrap.title     = `${label} color`;

    const inp = document.createElement('input');
    inp.type  = 'color';
    inp.value = '#ffffff';

    const swatch = document.createElement('span');
    swatch.className = 'rte-tctx-swatch';
    swatch.style.background = '#ffffff';
    swatch.title = `${label}`;

    const lbl = document.createElement('span');
    lbl.className   = 'rte-tctx-clr-lbl';
    lbl.textContent = label;

    inp.addEventListener('input',  e => { swatch.style.background = e.target.value; });
    inp.addEventListener('change', e => onChange(e.target.value));
    inp.addEventListener('focus', () => {
      if (this._focusTimer) { clearTimeout(this._focusTimer); this._focusTimer = null; }
    });

    wrap.appendChild(inp);
    wrap.appendChild(swatch);
    wrap.appendChild(lbl);
    return wrap;
  },

  _mkSelect(options, placeholder) {
    const sel = document.createElement('select');
    sel.className = 'rte-tctx-select';
    sel.title     = placeholder;

    const ph = document.createElement('option');
    ph.value       = '';
    ph.textContent = placeholder;
    ph.disabled    = true;
    sel.appendChild(ph);

    options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = o;
      sel.appendChild(opt);
    });

    sel.addEventListener('focus', () => {
      if (this._focusTimer) { clearTimeout(this._focusTimer); this._focusTimer = null; }
    });

    return sel;
  },

  /* ══════════════════════════════════════════════════════════════
     TABLE MUTATION OPERATIONS
  ══════════════════════════════════════════════════════════════ */
  _getRowIndex(table) {
    const cell = this._activeCell;
    if (!cell) return -1;
    const row = cell.closest('tr');
    return [...table.querySelectorAll('tr')].indexOf(row);
  },

  _getColIndex() {
    const cell = this._activeCell;
    if (!cell) return -1;
    return [...cell.parentElement.children].indexOf(cell);
  },

  _colCount(table) {
    const firstRow = table.querySelector('tr');
    return firstRow ? firstRow.children.length : 0;
  },

  /* ── resolve cells to operate on, considering drag selection ── */
  _resolveCells(table, scope) {
    const cell  = this._activeCell;

    if (scope === 'selected cells') {
      return this._selCells.length > 0 ? [...this._selCells] : (cell ? [cell] : []);
    }
    if (scope === 'all cells') {
      return [...table.querySelectorAll('td, th')];
    }
    if (scope === 'this cell' || !scope) {
      return cell ? [cell] : [];
    }
    if (scope === 'this row') {
      if (!cell) return [];
      return [...cell.closest('tr').children];
    }
    if (scope === 'this column') {
      if (!cell) return [];
      const colIdx = this._getColIndex();
      const result = [];
      table.querySelectorAll('tr').forEach(row => {
        const c = row.children[colIdx];
        if (c) result.push(c);
      });
      return result;
    }
    return cell ? [cell] : [];
  },

  /* ── add / delete row ─────────────────────────────────────── */
  _addRow(editor, table, where = 'below') {
    const cell = this._activeCell;
    if (!cell) return;
    const row  = cell.closest('tr');
    const cols = this._colCount(table);
    const newRow = this._buildRow(cols, 'td');
    where === 'above' ? row.before(newRow) : row.after(newRow);
    this._attachDragSelection(editor, table);
    editor.emitChange();
  },

  _deleteRow(editor, table) {
    const cell = this._activeCell;
    if (!cell) return;
    const row = cell.closest('tr');
    if (table.querySelectorAll('tr').length <= 1) return;
    row.remove();
    this._destroyCtxPanel();
    this._activeCell  = null;
    this._lastTable   = null;
    this._clearSelection();
    editor.emitChange();
  },

  /* ── add / delete column ──────────────────────────────────── */
  _addCol(editor, table, where = 'right') {
    const colIdx = this._getColIndex();
    if (colIdx < 0) return;

    const cols     = [...table.querySelectorAll('col')];
    const newCol   = document.createElement('col');
    const colCount = cols.length + 1;
    const w        = `${Math.floor(100 / colCount)}%`;
    cols.forEach(c => c.style.width = w);
    newCol.style.width = w;

    const colgroup = table.querySelector('colgroup');
    if (where === 'left') {
      cols[colIdx] ? cols[colIdx].before(newCol) : colgroup.prepend(newCol);
    } else {
      cols[colIdx] ? cols[colIdx].after(newCol) : colgroup.appendChild(newCol);
    }

    table.querySelectorAll('tr').forEach(row => {
      const cells   = [...row.children];
      const refCell = cells[colIdx];
      const tag     = row.closest('thead') ? 'th' : 'td';
      const newCell = document.createElement(tag);
      newCell.setAttribute('contenteditable', 'true');
      newCell.setAttribute('tabindex', '0');
      newCell.innerHTML = '<br>';
      if (!refCell) { row.appendChild(newCell); return; }
      where === 'left' ? refCell.before(newCell) : refCell.after(newCell);
    });

    editor.emitChange();
  },

  _deleteCol(editor, table) {
    const colIdx = this._getColIndex();
    if (colIdx < 0) return;
    if (this._colCount(table) <= 1) return;

    const cols = [...table.querySelectorAll('col')];
    cols[colIdx]?.remove();

    const remaining = [...table.querySelectorAll('col')];
    const w = `${Math.floor(100 / remaining.length)}%`;
    remaining.forEach(c => c.style.width = w);

    table.querySelectorAll('tr').forEach(row => {
      row.children[colIdx]?.remove();
    });

    this._destroyCtxPanel();
    this._activeCell = null;
    this._lastTable  = null;
    this._clearSelection();
    editor.emitChange();
  },

  _deleteTable(editor, table) {
    this._destroyCtxPanel();
    this._activeTable = null;
    this._activeCell  = null;
    this._lastTable   = null;
    this._clearSelection();
    table.remove();
    editor.emitChange();
  },

  /* ── header / footer toggle ───────────────────────────────── */
  _hasHead(table) { return !!table.querySelector('thead'); },
  _hasFoot(table) { return !!table.querySelector('tfoot'); },

  _toggleHead(editor, table) {
    const existing = table.querySelector('thead');
    if (existing) {
      const tbody = table.querySelector('tbody') || document.createElement('tbody');
      [...existing.querySelectorAll('tr')].forEach(row => {
        [...row.querySelectorAll('th')].forEach(th => {
          const td = document.createElement('td');
          td.innerHTML     = th.innerHTML;
          td.style.cssText = th.style.cssText;
          td.setAttribute('contenteditable', 'true');
          th.setAttribute('tabindex', '0');
          th.replaceWith(td);
        });
        tbody.prepend(row);
      });
      if (!table.contains(tbody)) table.insertBefore(tbody, table.firstChild);
      existing.remove();
    } else {
      const tbody = table.querySelector('tbody');
      if (!tbody) return;
      const firstRow = tbody.querySelector('tr');
      if (!firstRow) return;
      [...firstRow.querySelectorAll('td')].forEach(td => {
        const th = document.createElement('th');
        th.innerHTML     = td.innerHTML;
        th.style.cssText = td.style.cssText;
        th.setAttribute('contenteditable', 'true');
        td.replaceWith(th);
      });
      const thead = document.createElement('thead');
      thead.appendChild(firstRow);
      table.insertBefore(thead, tbody);
    }
    editor.emitChange();
  },

  _toggleFoot(editor, table) {
    const existing = table.querySelector('tfoot');
    if (existing) {
      const tbody = table.querySelector('tbody') || document.createElement('tbody');
      [...existing.querySelectorAll('tr')].forEach(row => {
        [...row.querySelectorAll('th')].forEach(th => {
          const td = document.createElement('td');
          td.innerHTML     = th.innerHTML;
          td.style.cssText = th.style.cssText;
          td.setAttribute('contenteditable', 'true');
          th.setAttribute('tabindex', '0');
          th.replaceWith(td);
        });
        tbody.appendChild(row);
      });
      if (!table.contains(tbody)) table.appendChild(tbody);
      existing.remove();
    } else {
      const tbody = table.querySelector('tbody');
      if (!tbody) return;
      const rows   = tbody.querySelectorAll('tr');
      const lastRow = rows[rows.length - 1];
      if (!lastRow) return;
      [...lastRow.querySelectorAll('td')].forEach(td => {
        const th = document.createElement('th');
        th.innerHTML     = td.innerHTML;
        th.style.cssText = td.style.cssText;
        th.setAttribute('contenteditable', 'true');
        td.replaceWith(th);
      });
      const tfoot = document.createElement('tfoot');
      tfoot.appendChild(lastRow);
      table.appendChild(tfoot);
    }
    editor.emitChange();
  },

  /* ── background colour ────────────────────────────────────── */
  _applyBg(editor, scope, color) {
    const table = this._activeTable;
    if (!table) return;

    const cells = this._resolveCells(table, scope);
    cells.forEach(c => c.style.backgroundColor = color);
    editor.emitChange();
  },

  /* ── borders ──────────────────────────────────────────────── */
  _applyBorderFull(editor, table, style, width, color, scope) {
    const cells = this._resolveCells(table, scope);

    const setBorder = (el) => {
      if (style && style !== 'none') {
        el.style.border = `${width || '1px'} ${style} ${color}`;
      } else {
        el.style.border = 'none';
      }
    };

    cells.forEach(setBorder);
    editor.emitChange();
  },

  /* ── cell text align ──────────────────────────────────────── */
  _cellAlign(editor, scope, align) {
    const table = this._activeTable;
    if (!table) return;
    const cells = this._resolveCells(table, scope);
    cells.forEach(c => c.style.textAlign = align);
    editor.emitChange();
  },

  /* ══════════════════════════════════════════════════════════════
     PUBLIC: updateState  — called by editor on selectionchange
  ══════════════════════════════════════════════════════════════ */
  isActive() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    let node = sel.anchorNode;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentNode;
    return !!node?.closest?.('[data-rte-table]');
  },

  updateState(btnEl) {
    const active = this.isActive();
    btnEl.classList.toggle('rte-tool-active', active);
    btnEl.setAttribute('aria-pressed', String(active));
  },

  /* ══════════════════════════════════════════════════════════════
     ICON STRINGS (inline SVG, 15×15)
  ══════════════════════════════════════════════════════════════ */
  _iconRowAbove: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="1"/><line x1="12" y1="7" x2="12" y2="1"/><line x1="9"  y1="4"  x2="15" y2="4"/></svg>`,
  _iconRowBelow: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3"  width="18" height="10" rx="1"/><line x1="12" y1="17" x2="12" y2="23"/><line x1="9"  y1="20"  x2="15" y2="20"/></svg>`,
  _iconColLeft:  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="11" y="3" width="10" height="18" rx="1"/><line x1="7"  y1="12" x2="1"  y2="12"/><line x1="4"  y1="9"  x2="4"  y2="15"/></svg>`,
  _iconColRight: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3"  y="3" width="10" height="18" rx="1"/><line x1="17" y1="12" x2="23" y2="12"/><line x1="20" y1="9"  x2="20" y2="15"/></svg>`,
  _iconDelRow:   `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="1"/><line x1="8" y1="3" x2="16" y2="3"/><line x1="10" y1="12" x2="14" y2="16"/><line x1="14" y1="12" x2="10" y2="16"/></svg>`,
  _iconDelCol:   `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="3" width="13" height="18" rx="1"/><line x1="3" y1="8" x2="3" y2="16"/><line x1="1" y1="10" x2="5" y2="14"/><line x1="5" y1="10" x2="1" y2="14"/></svg>`,
  _iconDelTable: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>`,
  _iconClearBg:  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 5H9l-7 7 7 7h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>`,
  _iconAlignL:   `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="6"  x2="3"  y2="6"/><line x1="15" y1="12" x2="3"  y2="12"/><line x1="17" y1="18" x2="3"  y2="18"/></svg>`,
  _iconAlignC:   `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="6"  x2="3"  y2="6"/><line x1="17" y1="12" x2="7"  y2="12"/><line x1="19" y1="18" x2="5"  y2="18"/></svg>`,
  _iconAlignR:   `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="6"  x2="3"  y2="6"/><line x1="21" y1="12" x2="9"  y2="12"/><line x1="21" y1="18" x2="7"  y2="18"/></svg>`,
};