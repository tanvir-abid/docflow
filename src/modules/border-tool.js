/**
 * Border Tool Module
 * ==================
 * Applies a configurable border (style, width, color, radius) to one of:
 *
 *   - 'selection'  → wraps selected inline content in a <span>
 *   - 'paragraph'  → applies to the nearest block ancestor of the selection
 *   - 'page'       → applies to the editor's root content area element
 *
 * The module is intentionally free of UI — it exposes only the apply / remove
 * helpers so that any toolbar or popup (e.g. the selection-toolbar) can drive
 * it without coupling to a specific widget structure.
 *
 * Usage:
 *
 *   import { BorderTool } from './border-tool.js';
 *
 *   BorderTool.apply(editor, {
 *     target : 'paragraph',   // 'selection' | 'paragraph' | 'page'
 *     style  : 'solid',       // 'solid' | 'dashed' | 'dotted' | 'double'
 *     width  : 2,             // px integer 1–8
 *     color  : '#6366f1',     // hex string or 'transparent'
 *     radius : 6,             // px integer 0–24
 *   });
 *
 *   BorderTool.remove(editor, 'paragraph');
 */

export const BorderTool = {

  DEFAULTS: {
    style : 'solid',
    width : 2,
    color : '#6366f1',
    radius: 6,
  },

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Apply border to the chosen target.
   * @param {Object} editor
   * @param {{ target: string, style: string, width: number, color: string, radius: number }} opts
   * @returns {Element|null} the element that received the border (if any)
   */
  apply(editor, opts = {}) {
    const { target = 'paragraph', style = this.DEFAULTS.style,
            width = this.DEFAULTS.width, color = this.DEFAULTS.color,
            radius = this.DEFAULTS.radius } = opts;

    const borderValue  = `${width}px ${style} ${color}`;
    const radiusValue  = `${radius}px`;

    let el = null;

    if (target === 'page') {
      el = editor.contentArea;
    } else if (target === 'paragraph') {
      el = this._nearestBlock(editor);
    } else if (target === 'selection') {
      el = this._wrapSelection(editor);
    }

    if (!el) return null;

    el.style.border       = borderValue;
    el.style.borderRadius = radiusValue;
    el.style.boxSizing    = 'border-box';
    el.style.padding      = '0 5px';

    // Tag the element so we can identify / remove it later
    el.dataset.rteBorder = '1';

    editor.emitChange && editor.emitChange();
    return el;
  },

  /**
   * Remove border from the chosen target.
   * @param {Object} editor
   * @param {'selection'|'paragraph'|'page'} target
   */
  remove(editor, target = 'paragraph') {
    let el = null;

    if (target === 'page') {
      el = editor.contentArea;
    } else if (target === 'paragraph') {
      el = this._nearestBlock(editor);
    } else if (target === 'selection') {
      // Find the closest ancestor marked as a border span
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        let node = sel.getRangeAt(0).commonAncestorContainer;
        while (node && node !== editor.contentArea) {
          if (node.dataset && node.dataset.rteBorder) { el = node; break; }
          node = node.parentNode;
        }
      }
    }

    if (!el) return;

    el.style.removeProperty('border');
    el.style.removeProperty('border-radius');
    el.style.removeProperty('box-sizing');
    delete el.dataset.rteBorder;

    editor.emitChange && editor.emitChange();
  },

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Walk up from the selection anchor to find the nearest block-level element
   * that is a direct child of (or the) contentArea.
   */
  _nearestBlock(editor) {
    const BLOCK_TAGS = new Set([
      'P','H1','H2','H3','H4','H5','H6',
      'LI','UL','OL','BLOCKQUOTE','PRE',
      'DIV','SECTION','ARTICLE','FIGURE',
    ]);

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;

    let node = sel.getRangeAt(0).commonAncestorContainer;

    // Text nodes → step up to their parent element
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;

    // Walk up until we hit a block or the contentArea itself
    while (node && node !== editor.contentArea) {
      if (BLOCK_TAGS.has(node.tagName)) return node;
      node = node.parentElement;
    }

    // Fallback: if the cursor is directly inside contentArea with no block wrapper
    return editor.contentArea;
  },

  /**
   * Wrap the current selection in a <span> and return it.
   * If the selection is already inside a data-rte-border span, return that
   * instead (avoid double-wrapping on re-apply).
   */
  _wrapSelection(editor) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;

    const range = sel.getRangeAt(0);

    // Check if already wrapped
    let ancestor = range.commonAncestorContainer;
    if (ancestor.nodeType === Node.TEXT_NODE) ancestor = ancestor.parentElement;
    if (ancestor && ancestor.dataset && ancestor.dataset.rteBorder) return ancestor;

    const span = document.createElement('span');
    span.style.display = 'inline-block'; // border on inline text needs inline-block

    try {
      range.surroundContents(span);
    } catch {
      // Cross-element selection: extract → insert
      span.appendChild(range.extractContents());
      range.insertNode(span);
    }

    return span;
  },
};