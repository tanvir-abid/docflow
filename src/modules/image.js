/**
 * Image Tool Module  —  image.js  (v4)
 * ═══════════════════════════════════════════════════════════════════
 *
 * v4 changes
 * ───────────
 * • Images are draggable anywhere in the editor content area.
 * • Dropping an image INSIDE a paragraph wraps the text around it
 *   using CSS float — this is true native text-wrap, not a side-by-side
 *   flex layout. The image lives inline inside the paragraph.
 * • Dropping between block-level elements inserts the image as a
 *   block figure (same as before).
 * • The layout toolbar still lets you switch between float-left,
 *   float-right, and block alignments at any time after insertion.
 * • The previous contenteditable=false wrap-block (wrap-left/wrap-right)
 *   is removed. Float is the correct CSS primitive for text wrapping.
 *
 * Float DOM structure
 * ────────────────────
 *   <p>
 *     <img class="rte-img rte-img-float-left" data-rte-image style="width:…">
 *     Text flows around the image…
 *   </p>
 *   <p style="clear:both">…</p>   ← auto-injected clearfix paragraph
 *
 * Block DOM structure (no float)
 * ────────────────────────────────
 *   <figure class="rte-img-figure rte-img-align-center"
 *           data-rte-image contenteditable="false">
 *     <img class="rte-img">
 *   </figure>
 *
 * Drag-and-drop
 * ─────────────
 * mousedown on img → starts a custom drag (not HTML5 drag, which
 * doesn't work well inside contenteditable). We:
 *   1. Create a ghost clone that follows the cursor.
 *   2. On mousemove, find the drop target: the text node / element
 *      under the cursor (excluding the ghost).
 *   3. On mouseup, insert the image at the determined position.
 */

import { positionFloatingPanel } from './panel-position.js';

export const ImageTool = {
  name     : 'image',
  ariaLabel: 'Insert image',
  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round">
           <rect x="3" y="3" width="18" height="18" rx="2"/>
           <circle cx="8.5" cy="8.5" r="1.5"/>
           <polyline points="21 15 16 10 5 21"/>
         </svg>`,

  /* ── state ───────────────────────────────────────────────────── */
  _editor      : null,
  _imgToolbar  : null,
  _activeImg   : null,
  _resizeHandle: null,
  _resizing    : false,
  _resizeStartX: 0,
  _resizeStartW: 0,
  _dialog      : null,

  // drag state
  _dragging    : false,
  _dragImg     : null,   // the img being dragged
  _dragGhost   : null,   // visual ghost
  _dropIndicator: null,  // line showing drop position
  _dropInfo    : null,   // { type:'inline'|'block', ref, position }

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
    this._btnEl = btn;

    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this._dialog ? this._destroyDialog() : this._showDialog(btn);
    });

    document.addEventListener('mousedown', (e) => this._onDocMouseDown(e));
    document.addEventListener('mousemove', (e) => this._onDocMouseMove(e));
    document.addEventListener('mouseup',   (e) => this._onDocMouseUp(e));

    return btn;
  },

  /* ══════════════════════════════════════════════════════════════
     INSERT DIALOG
  ══════════════════════════════════════════════════════════════ */
  _showDialog(triggerBtn) {
    this._destroyDialog();
    const editor = this._editor;
    const panel  = document.createElement('div');
    panel.className = 'rte-img-dialog';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Insert image');

    panel.style.cssText = `position:absolute;z-index:1100;visibility:hidden;`;

    const title = document.createElement('div');
    title.className = 'rte-img-dialog-title';
    title.textContent = 'Insert Image';
    panel.appendChild(title);

    panel.appendChild(this._dialogRow('Image URL','rte-img-dialog-url',
      i=>{ i.type='text'; i.placeholder='https://example.com/image.png'; }));
    const urlInput = panel.querySelector('.rte-img-dialog-url');

    panel.appendChild(this._dialogRow('Alt text (optional)','rte-img-dialog-alt',
      i=>{ i.type='text'; i.placeholder='Describe the image…'; }));
    const altInput = panel.querySelector('.rte-img-dialog-alt');

    // layout picker
    const layoutSection = document.createElement('div');
    layoutSection.className = 'rte-img-dialog-row';
    const layoutLabel = document.createElement('label');
    layoutLabel.className = 'rte-img-dialog-label';
    layoutLabel.textContent = 'Layout';
    layoutSection.appendChild(layoutLabel);

    const picker = document.createElement('div');
    picker.className = 'rte-img-layout-picker';
    let selectedLayout = 'block-center';

    [
      { key:'block-left',   label:'Block — left',       icon:this._iconLayoutBlockL },
      { key:'block-center', label:'Block — center',     icon:this._iconLayoutBlockC },
      { key:'block-right',  label:'Block — right',      icon:this._iconLayoutBlockR },
      { key:'float-left',   label:'Float left (wrap)',  icon:this._iconLayoutWrapL  },
      { key:'float-right',  label:'Float right (wrap)', icon:this._iconLayoutWrapR  },
    ].forEach(({ key, label, icon }) => {
      const lb = document.createElement('button');
      lb.type = 'button';
      lb.className = 'rte-img-layout-btn'+(key===selectedLayout?' rte-img-layout-active':'');
      lb.setAttribute('title', label);
      lb.setAttribute('aria-label', label);
      lb.innerHTML = icon;
      lb.addEventListener('click', () => {
        selectedLayout = key;
        picker.querySelectorAll('.rte-img-layout-btn').forEach(b=>b.classList.remove('rte-img-layout-active'));
        lb.classList.add('rte-img-layout-active');
      });
      picker.appendChild(lb);
    });
    layoutSection.appendChild(picker);
    panel.appendChild(layoutSection);

    const btnRow = document.createElement('div');
    btnRow.className = 'rte-img-dialog-btnrow';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button'; cancelBtn.className = 'rte-img-dialog-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => this._destroyDialog());

    const insertBtn = document.createElement('button');
    insertBtn.type = 'button'; insertBtn.className = 'rte-img-dialog-btn rte-img-dialog-btn-primary';
    insertBtn.textContent = 'Insert';
    insertBtn.addEventListener('click', () => {
      const url = urlInput.value.trim();
      if (!url) { urlInput.focus(); return; }
      this._destroyDialog();
      this._insertImage(url, altInput.value.trim(), selectedLayout);
    });

    btnRow.appendChild(cancelBtn); btnRow.appendChild(insertBtn);
    panel.appendChild(btnRow);

    panel.addEventListener('keydown', (e) => {
      if (e.key==='Enter') { e.preventDefault(); insertBtn.click(); }
      if (e.key==='Escape') this._destroyDialog();
    });

    editor.root.appendChild(panel);
    this._dialog = panel;
    positionFloatingPanel(panel, triggerBtn, editor.root);
    panel.style.visibility = '';

    setTimeout(() => {
      this._dialogOutside = (ev) => {
        if (!panel.contains(ev.target) && ev.target!==triggerBtn) this._destroyDialog();
      };
      document.addEventListener('mousedown', this._dialogOutside);
    }, 10);

    urlInput.focus();
  },

  _dialogRow(labelText, inputClass, configure) {
    const row = document.createElement('div');
    row.className = 'rte-img-dialog-row';
    const lbl = document.createElement('label');
    lbl.className = 'rte-img-dialog-label'; lbl.textContent = labelText;
    const inp = document.createElement('input');
    inp.className = `rte-img-dialog-input ${inputClass}`;
    inp.setAttribute('aria-label', labelText);
    configure(inp);
    row.appendChild(lbl); row.appendChild(inp);
    return row;
  },

  _destroyDialog() {
    this._dialog?.remove(); this._dialog = null;
    if (this._dialogOutside) {
      document.removeEventListener('mousedown', this._dialogOutside);
      this._dialogOutside = null;
    }
  },

  /* ══════════════════════════════════════════════════════════════
     INSERTION
  ══════════════════════════════════════════════════════════════ */
  _insertImage(url, alt='', layout='block-center') {
    const editor = this._editor;
    editor.contentArea.focus();

    const isFloat = layout.startsWith('float-');
    const img     = this._buildImg(url, alt, layout);

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range  = sel.getRangeAt(0);
      let   anchor = range.commonAncestorContainer;
      if (anchor.nodeType === Node.TEXT_NODE) anchor = anchor.parentNode;

      if (isFloat) {
        // Insert inline at cursor position — float CSS does the wrapping
        range.collapse(false);
        range.insertNode(img);
        this._ensureClearfix(img);
      } else {
        // Block insert: place after the nearest top-level block
        if (anchor.closest?.('table')) {
          editor.contentArea.appendChild(img);
        } else {
          const block = this._nearestBlock(anchor, editor.contentArea);
          if (block && block !== editor.contentArea) block.after(img);
          else { range.collapse(false); range.insertNode(img); }
        }
        this._ensureAfterParagraph(img);
      }
    } else {
      editor.contentArea.appendChild(img);
      if (!isFloat) this._ensureAfterParagraph(img);
    }

    this._wireImgEvents(img);
    editor.emitChange();
    setTimeout(() => this._selectImage(img), 30);
  },

  /* ── build the img / figure node ─────────────────────────────── */
  _buildImg(url, alt, layout) {
    if (layout.startsWith('block-')) {
      const alignKey = layout.replace('block-','');
      const figure = document.createElement('figure');
      figure.className = `rte-img-figure rte-img-align-${alignKey}`;
      figure.setAttribute('data-rte-image','');
      figure.setAttribute('contenteditable','false');
      const img = document.createElement('img');
      img.src=url; img.alt=alt; img.className='rte-img'; img.draggable=false;
      figure.appendChild(img);
      return figure;
    } else {
      // float — img lives directly in the paragraph flow
      const img = document.createElement('img');
      img.src=url; img.alt=alt;
      img.className = `rte-img ${layout==='float-left'?'rte-img-float-left':'rte-img-float-right'}`;
      img.setAttribute('data-rte-image','');
      img.setAttribute('contenteditable','false');
      img.draggable = false;
      return img;
    }
  },

  // For float images: ensure a clearing element follows the paragraph
  _ensureClearfix(img) {
    const para = img.closest('p, div, li');
    if (!para) return;
    const next = para.nextElementSibling;
    if (!next || next.style.clear !== 'both') {
      const clear = document.createElement('p');
      clear.style.clear = 'both';
      clear.innerHTML   = '<br>';
      para.after(clear);
    }
  },

  _ensureAfterParagraph(node) {
    const next = node.nextElementSibling;
    if (!next || next.hasAttribute('data-rte-image')) {
      const p = document.createElement('p'); p.innerHTML='<br>';
      node.after(p);
    }
  },

  _nearestBlock(node, contentArea) {
    let el = node.nodeType===Node.TEXT_NODE ? node.parentNode : node;
    while (el && el.parentNode !== contentArea) el = el.parentNode;
    return (el && el!==contentArea) ? el : null;
  },

  /* ══════════════════════════════════════════════════════════════
     DRAG-AND-DROP
     Custom drag (not HTML5 drag API) so it works inside
     contenteditable reliably across all browsers.
  ══════════════════════════════════════════════════════════════ */
  _wireImgEvents(imgOrFigure) {
    // For figures, wire the inner img; for float imgs, wire directly
    const img = imgOrFigure.tagName === 'IMG' ? imgOrFigure : imgOrFigure.querySelector('img');
    if (!img) return;

    img.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      // Left button only
      if (e.button !== 0) return;
      // Select on plain click
      this._selectImage(imgOrFigure);
      // Start drag after a small movement threshold (handled in mousemove)
      this._dragImg     = imgOrFigure;
      this._dragStartX  = e.clientX;
      this._dragStartY  = e.clientY;
      this._dragging    = false;    // not yet confirmed drag
    });
  },

  _startDrag(e) {
    this._dragging = true;
    const src = this._dragImg;

    // Ghost element
    const ghost = document.createElement('div');
    ghost.className = 'rte-img-drag-ghost';
    const srcImg = src.tagName==='IMG' ? src : src.querySelector('img');
    const ghostImg = document.createElement('img');
    ghostImg.src = srcImg.src;
    ghostImg.style.cssText = `width:${srcImg.getBoundingClientRect().width}px;height:auto;display:block;`;
    ghost.appendChild(ghostImg);
    document.body.appendChild(ghost);
    this._dragGhost = ghost;
    this._movGhost(e);

    // Drop indicator line
    const indicator = document.createElement('div');
    indicator.className = 'rte-img-drop-indicator';
    this._editor.root.appendChild(indicator);
    this._dropIndicator = indicator;

    // Hide original while dragging
    src.style.opacity = '0.25';
  },

  _movGhost(e) {
    if (!this._dragGhost) return;
    this._dragGhost.style.cssText = `
      position:fixed;
      top:${e.clientY+12}px;
      left:${e.clientX+12}px;
      z-index:9999;
      pointer-events:none;
      opacity:.85;
    `;
    const img = this._dragGhost.querySelector('img');
    if (img) img.style.cssText = 'width:120px;height:auto;display:block;border-radius:4px;box-shadow:0 4px 16px rgba(0,0,0,.2);';
  },

  _findDropTarget(e) {
    // Temporarily hide ghost so elementFromPoint works
    if (this._dragGhost) this._dragGhost.style.display='none';
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (this._dragGhost) this._dragGhost.style.display='';
    if (!el) return null;

    const editor = this._editor;
    // Must be within contentArea
    if (!editor.contentArea.contains(el) && el !== editor.contentArea) return null;

    return el;
  },

  _computeDropInfo(e) {
    const el = this._findDropTarget(e);
    if (!el) { this._dropInfo = null; return; }

    const editor = this._editor;
    const contentArea = editor.contentArea;

    // Walk up to find the direct child of contentArea
    let topBlock = el;
    while (topBlock && topBlock.parentNode !== contentArea) topBlock = topBlock.parentNode;

    if (!topBlock || topBlock === contentArea) { this._dropInfo = null; return; }

    // Is the element inside a text paragraph (not a figure/table/cols block)?
    const inParagraph = el.closest('p, li') &&
                        !el.closest('[data-rte-image]') &&
                        !el.closest('table') &&
                        !el.closest('[data-rte-cols]');

    if (inParagraph) {
      const para = el.closest('p, li');
      const rect = para.getBoundingClientRect();
      const eRect = editor.root.getBoundingClientRect();
      // Determine float side by horizontal cursor position within paragraph
      const midX  = rect.left + rect.width / 2;
      const side  = e.clientX < midX ? 'float-left' : 'float-right';

      this._dropInfo = { type:'inline', para, side };

      // Show indicator inside the paragraph
      const ind = this._dropIndicator;
      if (ind) {
        ind.style.cssText = `
          position:absolute;
          top:${rect.top - eRect.top}px;
          left:${side==='float-left' ? rect.left-eRect.left : rect.right-eRect.left-3}px;
          width:3px;
          height:${rect.height}px;
          background:var(--rte-accent,#4a90e2);
          border-radius:2px;
          z-index:1200;
          pointer-events:none;
        `;
      }
    } else {
      // Block drop: between top-level siblings
      const rect  = topBlock.getBoundingClientRect();
      const eRect = editor.root.getBoundingClientRect();
      const midY  = rect.top + rect.height / 2;
      const pos   = e.clientY < midY ? 'before' : 'after';

      this._dropInfo = { type:'block', ref:topBlock, position:pos };

      const ind = this._dropIndicator;
      if (ind) {
        const lineY = pos==='before'
          ? rect.top  - eRect.top - 2
          : rect.bottom - eRect.top + 2;
        ind.style.cssText = `
          position:absolute;
          top:${lineY}px;
          left:${rect.left - eRect.left}px;
          width:${rect.width}px;
          height:3px;
          background:var(--rte-accent,#4a90e2);
          border-radius:2px;
          z-index:1200;
          pointer-events:none;
        `;
      }
    }
  },

  _commitDrop() {
    const info = this._dropInfo;
    const src  = this._dragImg;
    if (!info || !src) return;

    const editor = this._editor;
    // Restore opacity
    src.style.opacity = '';

    // Extract the original image element/figure from the DOM
    src.remove();

    if (info.type === 'inline') {
      // Convert to float if it was a block figure, or switch float side
      const srcImg = src.tagName==='IMG' ? src : src.querySelector('img');
      const url    = srcImg.src;
      const alt    = srcImg.alt;
      const width  = srcImg.style.width || '';
      const layout = info.side;   // 'float-left' | 'float-right'

      const img = document.createElement('img');
      img.src   = url; img.alt=alt;
      img.className = `rte-img ${layout==='float-left'?'rte-img-float-left':'rte-img-float-right'}`;
      img.setAttribute('data-rte-image','');
      img.setAttribute('contenteditable','false');
      img.draggable = false;
      if (width) img.style.width = width;

      // Prepend or append to paragraph based on side
      const para = info.para;
      if (layout === 'float-left') {
        para.prepend(img);
      } else {
        para.appendChild(img);
      }
      this._wireImgEvents(img);
      this._ensureClearfix(img);
      setTimeout(() => this._selectImage(img), 30);

    } else {
      // Block drop
      if (info.position === 'before') {
        info.ref.before(src);
      } else {
        info.ref.after(src);
      }
      this._wireImgEvents(src);
      this._ensureAfterParagraph(src);
      const img = src.tagName==='IMG' ? src : src.querySelector('img');
      if (img) setTimeout(() => this._selectImage(src), 30);
    }

    editor.emitChange();
  },

  /* ══════════════════════════════════════════════════════════════
     SELECT / DESELECT
  ══════════════════════════════════════════════════════════════ */
  _selectImage(imgOrFigure) {
    if (this._activeImg && this._activeImg !== imgOrFigure) this._deselectImage();
    this._activeImg = imgOrFigure;
    imgOrFigure.classList.add('rte-img-selected');
    this._showImgToolbar(imgOrFigure);
    this._attachResizeHandle(imgOrFigure);
  },

  _deselectImage() {
    if (!this._activeImg) return;
    this._activeImg.classList.remove('rte-img-selected');
    this._destroyImgToolbar();
    this._destroyResizeHandle();
    this._activeImg = null;
  },

  /* ══════════════════════════════════════════════════════════════
     IMAGE TOOLBAR
  ══════════════════════════════════════════════════════════════ */
  _showImgToolbar(imgOrFigure) {
    this._destroyImgToolbar();
    const editor  = this._editor;
    const toolbar = document.createElement('div');
    toolbar.className = 'rte-img-toolbar';
    toolbar.addEventListener('mousedown', (e) => e.stopPropagation());

    // Determine current layout
    const isFloat  = imgOrFigure.tagName === 'IMG';
    const isFloatL = imgOrFigure.classList.contains('rte-img-float-left');
    const blockAlign = ['left','center','right'].find(a=>imgOrFigure.classList.contains(`rte-img-align-${a}`)) || 'center';
    const currentLayout = isFloat
      ? (isFloatL ? 'float-left' : 'float-right')
      : `block-${blockAlign}`;

    [
      { key:'block-left',   label:'Block left',         icon:this._iconLayoutBlockL },
      { key:'block-center', label:'Block center',       icon:this._iconLayoutBlockC },
      { key:'block-right',  label:'Block right',        icon:this._iconLayoutBlockR },
      { key:'float-left',   label:'Float left (wrap)',  icon:this._iconLayoutWrapL  },
      { key:'float-right',  label:'Float right (wrap)', icon:this._iconLayoutWrapR  },
    ].forEach(({ key, label, icon }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rte-img-tb-btn'+(key===currentLayout?' rte-img-tb-active':'');
      btn.setAttribute('title', label); btn.setAttribute('aria-label', label);
      btn.innerHTML = icon;
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        const newNode = this._changeLayout(imgOrFigure, key);
        this._destroyImgToolbar(); this._destroyResizeHandle();
        this._activeImg = newNode;
        newNode.classList.add('rte-img-selected');
        this._showImgToolbar(newNode);
        this._attachResizeHandle(newNode);
      });
      toolbar.appendChild(btn);
    });

    toolbar.appendChild(this._mkDivider());

    ['25%','50%','75%','100%'].forEach(pct => {
      const btn = document.createElement('button');
      btn.type='button'; btn.className='rte-img-tb-btn rte-img-tb-size';
      btn.textContent=pct; btn.setAttribute('title',`Set width to ${pct}`);
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        const img = imgOrFigure.tagName==='IMG' ? imgOrFigure : imgOrFigure.querySelector('img');
        if (img) { img.style.width=pct; img.style.height='auto'; }
        editor.emitChange();
        requestAnimationFrame(()=>this._positionImgToolbar(imgOrFigure));
      });
      toolbar.appendChild(btn);
    });

    toolbar.appendChild(this._mkDivider());

    const removeBtn = document.createElement('button');
    removeBtn.type='button'; removeBtn.className='rte-img-tb-btn rte-img-tb-danger';
    removeBtn.innerHTML=this._iconRemove;
    removeBtn.setAttribute('title','Remove image'); removeBtn.setAttribute('aria-label','Remove image');
    removeBtn.addEventListener('mousedown', (e) => {
      e.preventDefault(); e.stopPropagation();
      this._deselectImage();
      imgOrFigure.remove();
      editor.emitChange();
    });
    toolbar.appendChild(removeBtn);

    editor.root.appendChild(toolbar);
    this._imgToolbar = toolbar;
    requestAnimationFrame(()=>this._positionImgToolbar(imgOrFigure));
  },

  _positionImgToolbar(node) {
    const tb = this._imgToolbar;
    if (!tb||!node) return;
    const fRect = node.getBoundingClientRect();
    const eRect = this._editor.root.getBoundingClientRect();
    const tbH=tb.offsetHeight, tbW=tb.offsetWidth;
    let top = fRect.top-eRect.top-tbH-8;
    if (top<(this._editor.toolbar?.offsetHeight||46)+4) top=fRect.bottom-eRect.top+8;
    let left = fRect.left-eRect.left+fRect.width/2-tbW/2;
    left = Math.max(4,Math.min(left,eRect.width-tbW-4));
    tb.style.cssText=`position:absolute;top:${top}px;left:${left}px;z-index:1060;`;
  },

  _destroyImgToolbar() { this._imgToolbar?.remove(); this._imgToolbar=null; },

  /* ══════════════════════════════════════════════════════════════
     LAYOUT SWITCHING
  ══════════════════════════════════════════════════════════════ */
  _changeLayout(oldNode, newLayout) {
    const oldImg   = oldNode.tagName==='IMG' ? oldNode : oldNode.querySelector('img');
    const url      = oldImg.src;
    const alt      = oldImg.alt;
    const width    = oldImg.style.width || '';

    const isNewFloat = newLayout.startsWith('float-');

    let newNode;
    if (isNewFloat) {
      newNode = document.createElement('img');
      newNode.src=url; newNode.alt=alt;
      newNode.className=`rte-img ${newLayout==='float-left'?'rte-img-float-left':'rte-img-float-right'}`;
      newNode.setAttribute('data-rte-image','');
      newNode.setAttribute('contenteditable','false');
      newNode.draggable=false;
      if (width) { newNode.style.width=width; newNode.style.height='auto'; }
    } else {
      const alignKey = newLayout.replace('block-','');
      const figure = document.createElement('figure');
      figure.className=`rte-img-figure rte-img-align-${alignKey}`;
      figure.setAttribute('data-rte-image','');
      figure.setAttribute('contenteditable','false');
      newNode = figure;
      const img = document.createElement('img');
      img.src=url; img.alt=alt; img.className='rte-img'; img.draggable=false;
      if (width) { img.style.width=width; img.style.height='auto'; }
      figure.appendChild(img);
    }

    oldNode.replaceWith(newNode);

    // Handle clearfix
    if (isNewFloat) {
      this._ensureClearfix(newNode);
    } else {
      this._ensureAfterParagraph(newNode);
    }

    this._wireImgEvents(newNode);
    this._editor.emitChange();
    return newNode;
  },

  /* ══════════════════════════════════════════════════════════════
     RESIZE HANDLE
  ══════════════════════════════════════════════════════════════ */
  _attachResizeHandle(imgOrFigure) {
    this._destroyResizeHandle();
    const container = imgOrFigure.tagName==='FIGURE' ? imgOrFigure : imgOrFigure;
    const handle = document.createElement('div');
    handle.className='rte-img-resize-handle';
    // For float imgs we need a wrapper trick — position relative on the img itself
    if (imgOrFigure.tagName==='IMG') {
      // Inject a wrapper span to position the handle
      const wrap = document.createElement('span');
      wrap.className='rte-img-float-wrap';
      wrap.setAttribute('contenteditable','false');
      imgOrFigure.replaceWith(wrap);
      wrap.appendChild(imgOrFigure);
      wrap.appendChild(handle);
      this._resizeHandle = handle;
      this._resizeWrap   = wrap;
    } else {
      container.appendChild(handle);
      this._resizeHandle = handle;
      this._resizeWrap   = null;
    }

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault(); e.stopPropagation();
      this._resizing     = true;
      this._resizeStartX = e.clientX;
      const img = imgOrFigure.tagName==='IMG'?imgOrFigure:imgOrFigure.querySelector('img');
      this._resizeStartW = img.getBoundingClientRect().width;
    });
  },

  _destroyResizeHandle() {
    if (this._resizeWrap && this._activeImg) {
      // Unwrap the span back
      const img   = this._resizeWrap.querySelector('img.rte-img');
      const handle= this._resizeWrap.querySelector('.rte-img-resize-handle');
      handle?.remove();
      if (img) this._resizeWrap.replaceWith(img);
    } else {
      this._resizeHandle?.remove();
    }
    this._resizeHandle = null;
    this._resizeWrap   = null;
  },

  /* ══════════════════════════════════════════════════════════════
     GLOBAL MOUSE EVENTS
  ══════════════════════════════════════════════════════════════ */
  _onDocMouseDown(e) {
    // Close dialog on outside click (handled separately)
    if (!this._activeImg && !this._dragImg) return;

    const inImg     = this._activeImg?.contains(e.target) || this._activeImg===e.target;
    const inWrap    = this._resizeWrap?.contains(e.target);
    const inToolbar = this._imgToolbar?.contains(e.target);
    const isHandle  = e.target===this._resizeHandle;

    if (!inImg && !inWrap && !inToolbar && !isHandle) {
      this._deselectImage();
    }
  },

  _onDocMouseMove(e) {
    // ── resize ──
    if (this._resizing && this._activeImg) {
      const dx = e.clientX-this._resizeStartX;
      const w  = Math.min(
        Math.max(40, this._resizeStartW+dx),
        this._editor.contentArea.getBoundingClientRect().width-16
      );
      const img = this._activeImg.tagName==='IMG'
        ? this._activeImg
        : this._activeImg.querySelector('img');
      if (img) { img.style.width=`${w}px`; img.style.height='auto'; }
      return;
    }

    // ── drag ──
    if (!this._dragImg || this._resizing) return;

    const dx = Math.abs(e.clientX-this._dragStartX);
    const dy = Math.abs(e.clientY-this._dragStartY);

    if (!this._dragging && (dx>4||dy>4)) {
      this._startDrag(e);
    }

    if (this._dragging) {
      this._movGhost(e);
      this._computeDropInfo(e);
    }
  },

  _onDocMouseUp(e) {
    // ── finish resize ──
    if (this._resizing) {
      this._resizing = false;
      this._editor.emitChange();
      if (this._activeImg) requestAnimationFrame(()=>this._positionImgToolbar(this._activeImg));
      return;
    }

    // ── finish drag ──
    if (this._dragImg) {
      if (this._dragging && this._dropInfo) {
        this._commitDrop();
      } else {
        // Plain click (no movement) — just restore opacity
        if (this._dragImg) this._dragImg.style.opacity='';
      }
      // Clean up
      this._dragGhost?.remove();    this._dragGhost=null;
      this._dropIndicator?.remove(); this._dropIndicator=null;
      this._dropInfo   = null;
      this._dragImg    = null;
      this._dragging   = false;
    }
  },

  /* ══════════════════════════════════════════════════════════════
     updateState
  ══════════════════════════════════════════════════════════════ */
  isActive()       { return false; },
  updateState(btn) { btn.setAttribute('aria-pressed','false'); },

  _mkDivider() { const d=document.createElement('span'); d.className='rte-img-tb-divider'; return d; },

  /* ══════════════════════════════════════════════════════════════
     ICONS
  ══════════════════════════════════════════════════════════════ */
  _iconLayoutBlockL: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="9" height="9" rx="1" fill="currentColor" opacity=".3"/><line x1="2" y1="16" x2="22" y2="16"/><line x1="2" y1="20" x2="16" y2="20"/></svg>`,
  _iconLayoutBlockC: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="10" rx="1" fill="currentColor" opacity=".3"/><line x1="2" y1="16" x2="22" y2="16"/><line x1="4" y1="20" x2="20" y2="20"/></svg>`,
  _iconLayoutBlockR: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="13" y="4" width="9" height="9" rx="1" fill="currentColor" opacity=".3"/><line x1="2" y1="16" x2="22" y2="16"/><line x1="8" y1="20" x2="22" y2="20"/></svg>`,
  _iconLayoutWrapL:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="9" height="14" rx="1" fill="currentColor" opacity=".3"/><line x1="14" y1="6" x2="22" y2="6"/><line x1="14" y1="10" x2="22" y2="10"/><line x1="14" y1="14" x2="22" y2="14"/><line x1="14" y1="18" x2="20" y2="18"/></svg>`,
  _iconLayoutWrapR:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="13" y="4" width="9" height="14" rx="1" fill="currentColor" opacity=".3"/><line x1="2" y1="6" x2="10" y2="6"/><line x1="2" y1="10" x2="10" y2="10"/><line x1="2" y1="14" x2="10" y2="14"/><line x1="2" y1="18" x2="8" y2="18"/></svg>`,
  _iconRemove: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
};