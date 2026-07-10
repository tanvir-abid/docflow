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
 * Cell bg color : per-cell, per-row, per-column (with clear option)
 * Border style  : none / solid / dashed / double / dotted; width; colour
 *                 scope: all cells / this cell / this row / this column
 * Text align    : per-cell (L / C / R)
 * Column resize : via CSS resize on colgroup widths
 *
 * Bug-fixes vs original
 * ──────────────────────
 * • Context panel positioned AFTER being in DOM so offsetHeight is real
 * • Panel placed below table when not enough space above (no toolbar overlap)
 * • focusout delay extended so color-picker / select clicks don't destroy panel
 * • Toggle buttons refresh correctly after header/footer mutation
 * • _syncCtxPanel only rebuilds when necessary (table changes), not every focusin
 * • Border "Apply" button reads live select values at click time
 * • _applyBg "clear" buttons properly pass empty string
 * • _getColIndex handles colspan-free tables reliably
 */

export const TableTool = {
  name: 'table',
  ariaLabel: 'Insert / edit table',
  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="3"  y1="9"  x2="21" y2="9"/>
          <line x1="3"  y1="15" x2="21" y2="15"/>
          <line x1="9"  y1="3"  x2="9"  y2="21"/>
          <line x1="15" y1="3"  x2="15" y2="21"/>
        </svg>`,

  /* ── internal state ──────────────────────────────────────────── */
  _editor      : null,
  _btnEl       : null,
  _picker      : null,
  _ctxPanel    : null,
  _activeTable : null,
  _activeCell  : null,
  _focusTimer  : null,   // debounce for focusout
  _lastTable   : null,   // track which table the panel was built for

  /* ══════════════════════════════════════════════════════════════
     PUBLIC: createButton
  ══════════════════════════════════════════════════════════════ */
  createButton(editor) {
    this._editor = editor;

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

    return btn;
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

    const bRect = triggerBtn.getBoundingClientRect();
    const eRect = editor.root.getBoundingClientRect();
    panel.style.cssText = `
      position: absolute;
      top:  ${bRect.bottom - eRect.top + 6}px;
      left: ${bRect.left  - eRect.left}px;
      z-index: 1100;
    `;

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
    console.log('[TableTool] execute called', rows, cols);
    editor.contentArea.focus();

    const table = this._buildTable(rows, cols);
    this._attachContext(editor, table);

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
     CONTEXT ATTACHMENT  — wires focus events to a table
  ══════════════════════════════════════════════════════════════ */
  _attachContext(editor, table) {
    if (table._rteContextAttached) return;
    table._rteContextAttached = true;
    console.log('[TableTool] _attachContext called', table); 
    table.addEventListener('focusin', (e) => {
      console.log('[TableTool] focusin', e.target);
      const cell = e.target.closest('td, th');
      if (!cell) return;

      // Cancel any pending hide
      if (this._focusTimer) { clearTimeout(this._focusTimer); this._focusTimer = null; }

      this._activeTable = table;
      this._activeCell  = cell;

      // Only rebuild panel if it's for a different table or doesn't exist
      if (this._lastTable !== table || !this._ctxPanel) {
        this._syncCtxPanel(editor, table);
        this._lastTable = table;
      } else {
        // Just reposition (cell changed within same table)
        this._positionCtxPanel(editor, table);
      }
    });

    table.addEventListener('focusout', () => {
      // Use a generous delay — colour pickers and selects steal focus briefly
      if (this._focusTimer) clearTimeout(this._focusTimer);
      this._focusTimer = setTimeout(() => {
        const active = document.activeElement;
        const inTable = table.contains(active);
        const inPanel = this._ctxPanel?.contains(active);
        if (!inTable && !inPanel) {
          this._destroyCtxPanel();
          this._activeTable = null;
          this._activeCell  = null;
          this._lastTable   = null;
        }
      }, 400);
    });
  },

  /* ══════════════════════════════════════════════════════════════
     CONTEXT PANEL  — builds / refreshes the floating toolbar
  ══════════════════════════════════════════════════════════════ */
  _syncCtxPanel(editor, table) {
    this._destroyCtxPanel();

    const panel = document.createElement('div');
    panel.className = 'rte-table-ctx';
    panel.setAttribute('role', 'toolbar');
    panel.setAttribute('aria-label', 'Table options');

    // Keep focus in table when interacting with panel buttons
    panel.addEventListener('mousedown', (e) => {
      // Allow clicks on inputs/selects to work, but prevent focus theft from buttons
      const tag = e.target.tagName;
      if (tag !== 'INPUT' && tag !== 'SELECT') e.preventDefault();
    });

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
    this._ctxGroup(panel, 'Background Color', [
      this._ctxColorPicker('Cell',   (c) => this._applyBg(editor, 'cell', c)),
      this._ctxColorPicker('Row',    (c) => this._applyBg(editor, 'row',  c)),
      this._ctxColorPicker('Column', (c) => this._applyBg(editor, 'col',  c)),
      this._ctxBtn('Clear cell',     this._iconClearBg,  () => this._applyBg(editor, 'cell', '')),
      this._ctxBtn('Clear row',      this._iconClearBg,  () => this._applyBg(editor, 'row',  '')),
      this._ctxBtn('Clear column',   this._iconClearBg,  () => this._applyBg(editor, 'col',  '')),
    ]);

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

    // Border colour swatch
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
      ['all cells', 'this cell', 'this row', 'this column'],
      'Apply to'
    );

    const applyBorderBtn = document.createElement('button');
    applyBorderBtn.type      = 'button';
    applyBorderBtn.className = 'rte-tctx-btn rte-tctx-apply';
    applyBorderBtn.textContent = 'Apply';
    applyBorderBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      // Read live values at click time
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
    this._ctxGroup(panel, 'Cell Align', [
      this._ctxBtn('Align left',   this._iconAlignL, () => this._cellAlign(editor, 'left')),
      this._ctxBtn('Align center', this._iconAlignC, () => this._cellAlign(editor, 'center')),
      this._ctxBtn('Align right',  this._iconAlignR, () => this._cellAlign(editor, 'right')),
    ]);

    // Append to DOM first so layout is calculated, then position
    editor.root.appendChild(panel);
    this._ctxPanel = panel;

    // Position AFTER render so offsetHeight / offsetWidth are real
    requestAnimationFrame(() => this._positionCtxPanel(editor, table));

    // Keep focus-timer cancelled when mouse enters panel
    panel.addEventListener('mouseenter', () => {
      if (this._focusTimer) { clearTimeout(this._focusTimer); this._focusTimer = null; }
    });

    console.log('[TableTool] ctx panel built for', table, 'children:', panel.children.length);
  },

  /* Position the panel — below the table if not enough space above */
  _positionCtxPanel(editor, table) {
    const panel = this._ctxPanel;
    if (!panel || !table) return;

    const tRect = table.getBoundingClientRect();
    const eRect = editor.root.getBoundingClientRect();

    const panelH = panel.offsetHeight;
    const panelW = panel.offsetWidth;

    // Preferred: above the table
    let top = tRect.top - eRect.top - panelH - 8;

    // If it would overlap the toolbar (top < toolbar height + 4), put it below instead
    const toolbarH = editor.toolbar ? editor.toolbar.offsetHeight : 46;
    if (top < toolbarH + 4) {
      top = tRect.bottom - eRect.top + 8;
    }

    // Horizontal: align to table left, clamp so it doesn't escape right edge
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
      action(); // action is responsible for calling refresh() after mutation
    });

    // Expose refresh so the caller can trigger it post-mutation
    btn._refresh = refresh;
    return btn;
  },

  _ctxColorPicker(label, onChange) {
    const wrap = document.createElement('label');
    wrap.className = 'rte-tctx-color-wrap';
    wrap.title     = `${label} background`;

    const inp = document.createElement('input');
    inp.type  = 'color';
    inp.value = '#ffffff';

    const swatch = document.createElement('span');
    swatch.className = 'rte-tctx-swatch';
    swatch.style.background = '#ffffff';
    swatch.title = `${label} bg`;

    const lbl = document.createElement('span');
    lbl.className   = 'rte-tctx-clr-lbl';
    lbl.textContent = label;

    inp.addEventListener('input',  e => { swatch.style.background = e.target.value; });
    // Use 'input' for real-time preview AND 'change' for final commit
    inp.addEventListener('change', e => onChange(e.target.value));

    // Cancel focusout timer while picker is open
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
    ph.selected    = true;
    sel.appendChild(ph);

    options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = o;
      sel.appendChild(opt);
    });

    // Cancel focusout timer while select is open
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

  /* ── add / delete row ─────────────────────────────────────── */
  _addRow(editor, table, where = 'below') {
    const cell = this._activeCell;
    if (!cell) return;
    const row  = cell.closest('tr');
    const cols = this._colCount(table);
    const newRow = this._buildRow(cols, 'td');
    where === 'above' ? row.before(newRow) : row.after(newRow);
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
    editor.emitChange();
  },

  _deleteTable(editor, table) {
    this._destroyCtxPanel();
    this._activeTable = null;
    this._activeCell  = null;
    this._lastTable   = null;
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
    const cell  = this._activeCell;
    const table = this._activeTable;
    if (!cell || !table) return;

    if (scope === 'cell') {
      cell.style.backgroundColor = color;
    } else if (scope === 'row') {
      const row = cell.closest('tr');
      [...row.children].forEach(c => c.style.backgroundColor = color);
    } else if (scope === 'col') {
      const colIdx = this._getColIndex();
      table.querySelectorAll('tr').forEach(row => {
        const c = row.children[colIdx];
        if (c) c.style.backgroundColor = color;
      });
    }
    editor.emitChange();
  },

  /* ── borders ──────────────────────────────────────────────── */
  _applyBorderFull(editor, table, style, width, color, scope) {
    const cell = this._activeCell;
    if (!cell) return;

    const setBorder = (el) => {
      if (style && style !== 'none') {
        el.style.border = `${width || '1px'} ${style} ${color}`;
      } else {
        el.style.border = 'none';
      }
    };

    switch (scope) {
      case 'this cell':
        setBorder(cell);
        break;
      case 'this row': {
        const row = cell.closest('tr');
        [...row.children].forEach(setBorder);
        break;
      }
      case 'this column': {
        const colIdx = this._getColIndex();
        table.querySelectorAll('tr').forEach(row => {
          const c = row.children[colIdx];
          if (c) setBorder(c);
        });
        break;
      }
      case 'all cells':
      default:
        table.querySelectorAll('td, th').forEach(setBorder);
        break;
    }
    editor.emitChange();
  },

  /* ── cell text align ──────────────────────────────────────── */
  _cellAlign(editor, align) {
    const cell = this._activeCell;
    if (!cell) return;
    cell.style.textAlign = align;
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

