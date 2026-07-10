/**
 * Clipboard Tools Module
 * A single toolbar button that opens a floating panel with four actions:
 *   • Copy HTML      — copies editor HTML to clipboard
 *   • Copy Text      — copies editor plain text to clipboard
 *   • Paste as HTML  — reads clipboard and inserts as rich HTML
 *   • Paste as Text  — reads clipboard and inserts as plain text (strips tags)
 *
 * Handles the cross-format cases:
 *   - User copied HTML, wants to paste as plain text → strips all tags first
 *   - User copied plain text, wants to paste as HTML  → escapes special chars,
 *     wraps in a <span> so execCommand('insertHTML') works safely
 *
 * Requires Font Awesome (fa-solid) for panel icons.
 * Follows the same createButton / updateState / destroy contract as the
 * other tool modules (alignment, find-replace, etc.).
 */

import { positionFloatingPanel } from './panel-position.js';

// ── Shared SVG icons (trigger button & copy actions) ────────────────────────

const CLIPBOARD_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const CHEVRON_ICON   = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left:2px;opacity:0.6;flex-shrink:0"><polyline points="6 9 12 15 18 9"/></svg>`;
const CHECK_ICON     = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

// ── Panel action definitions ─────────────────────────────────────────────────

const ACTIONS = [
  {
    key:     'copyHTML',
    label:   'Copy HTML',
    faIcon:  'fa-solid fa-code',
    group:   'copy',
  },
  {
    key:     'copyText',
    label:   'Copy Text',
    faIcon:  'fa-solid fa-font',
    group:   'copy',
  },
  {
    key:     'pasteHTML',
    label:   'Paste as HTML',
    faIcon:  'fa-solid fa-code',
    group:   'paste',
  },
  {
    key:     'pasteText',
    label:   'Paste as Text',
    faIcon:  'fa-solid fa-align-left',
    group:   'paste',
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Strip HTML tags from a string, decode common entities. */
function htmlToPlainText(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent ?? tmp.innerText ?? '';
}

/** Escape a plain-text string so it is safe to pass to insertHTML. */
function escapeForHTML(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

/**
 * Returns true when a string looks like it contains meaningful HTML markup
 * (at least one element tag, not just entities or angle brackets in prose).
 */
function looksLikeHTML(str) {
  return /<\s*[a-z][^>]*>/i.test(str);
}

// ── Module ───────────────────────────────────────────────────────────────────

export const ClipboardTool = {
  name: 'clipboard',
  ariaLabel: 'Clipboard',

  // ── Internal state ──────────────────────────────────────────────────────────
  _triggerBtn: null,
  _popup:      null,
  _editor:     null,
  _open:       false,

  // ── createButton ────────────────────────────────────────────────────────────

  createButton(editor) {
    this._editor = editor;
    this._injectStyles();

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
    trigger.style.cssText = 'display:inline-flex;align-items:center;justify-content:flex-start;gap:2px;padding-right:4px;';
    trigger.innerHTML = CLIPBOARD_ICON + CHEVRON_ICON;
    this._triggerBtn = trigger;

    // Floating popup
    const popup = this._buildPopup();
    this._popup = popup;

    // Toggle on trigger click
    trigger.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this._open ? this._closePopup() : this._openPopup(trigger);
    });

    // Close on outside click
    this._outsideHandler = (e) => {
      if (!wrapper.contains(e.target)) this._closePopup();
    };
    document.addEventListener('mousedown', this._outsideHandler);

    // Close on Escape
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

  // ── Popup construction ───────────────────────────────────────────────────────

  _buildPopup() {
    const popup = document.createElement('div');
    popup.className = 'rte-clipboard-popup';
    popup.setAttribute('role', 'menu');
    popup.setAttribute('aria-label', 'Clipboard options');
    popup.style.cssText = [
      'position:absolute',
      'z-index:9999',
      'display:none',
      'flex-direction:column',
      'min-width:172px',
      'padding:4px',
      'border-radius:var(--rte-radius,6px)',
      'background:var(--rte-toolbar-bg,#fff)',
      'border:1px solid var(--rte-border,rgba(0,0,0,.12))',
      'box-shadow:0 4px 14px rgba(0,0,0,.13)',
    ].join(';');

    let lastGroup = null;

    ACTIONS.forEach(({ key, label, faIcon, group }) => {
      // Divider between copy / paste groups
      if (lastGroup && group !== lastGroup) {
        const divider = document.createElement('div');
        divider.setAttribute('role', 'separator');
        divider.style.cssText = 'height:1px;margin:3px 4px;background:var(--rte-border,rgba(0,0,0,.1));';
        popup.appendChild(divider);
      }
      lastGroup = group;

      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'rte-tool-btn rte-clipboard-item';
      item.setAttribute('role', 'menuitem');
      item.setAttribute('aria-label', label);
      item.dataset.action = key;
      item.style.cssText = [
        'display:flex',
        'align-items:center',
        'gap:8px',
        'width:100%',
        'padding:6px 8px',
        'border-radius:4px',
        'font-size:13px',
        'text-align:left',
        'white-space:nowrap',
      ].join(';');

      // Icon slot — holds either the FA icon or the ✓ flash
      const iconSlot = document.createElement('span');
      iconSlot.className = 'rte-clipboard-icon';
      iconSlot.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:16px;flex-shrink:0;';
      iconSlot.innerHTML = `<i class="${faIcon}" aria-hidden="true" style="font-size:13px;"></i>`;

      const labelEl = document.createElement('span');
      labelEl.textContent = label;

      item.appendChild(iconSlot);
      item.appendChild(labelEl);

      item.addEventListener('mousedown', async (e) => {
        e.preventDefault();
        await this._execute(key, item, iconSlot, faIcon);
      });

      popup.appendChild(item);
    });

    return popup;
  },

  // ── Action execution ─────────────────────────────────────────────────────────

  async _execute(key, itemEl, iconSlot, faIcon) {
    try {
      switch (key) {

        // ── Copy HTML ──────────────────────────────────────────────────────────
        case 'copyHTML': {
          const html = this._editor.getHTML();
          await this._writeClipboard(html);
          this._flash(iconSlot, faIcon);
          break;
        }

        // ── Copy Text ──────────────────────────────────────────────────────────
        case 'copyText': {
          const text = this._editor.getText();
          await this._writeClipboard(text);
          this._flash(iconSlot, faIcon);
          break;
        }

        // ── Paste as HTML ──────────────────────────────────────────────────────
        case 'pasteHTML': {
          const raw = await this._readClipboard();
          if (raw === null) { this._showError(iconSlot, faIcon); break; }

          // If the clipboard contains plain text, wrap it in a span so that
          // insertHTML still works and line-breaks are preserved.
          const html = looksLikeHTML(raw) ? raw : `<span>${escapeForHTML(raw)}</span>`;
          this._insertHTML(html);
          this._closePopup();
          break;
        }

        // ── Paste as Text ──────────────────────────────────────────────────────
        case 'pasteText': {
          const raw = await this._readClipboard();
          if (raw === null) { this._showError(iconSlot, faIcon); break; }

          // Strip markup whether clipboard holds HTML or plain text.
          const plain = looksLikeHTML(raw) ? htmlToPlainText(raw) : raw;
          this._insertPlainText(plain);
          this._closePopup();
          break;
        }
      }
    } catch (err) {
      console.warn('[ClipboardTool]', key, err);
      this._showError(iconSlot, faIcon);
    }

    this._editor.emitChange?.();
  },

  // ── Clipboard read / write ───────────────────────────────────────────────────

  async _writeClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    // Fallback
    const ta = Object.assign(document.createElement('textarea'), {
      value: text,
      style: 'position:fixed;opacity:0',
    });
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  },

  /**
   * Reads the clipboard as text.
   * Returns null when permission is denied or the API is unavailable.
   *
   * Strategy:
   *   1. Try the modern Clipboard API (requires user gesture + permission).
   *   2. Fall back to document.execCommand('paste') in a temporary textarea
   *      (works in some browsers/contexts where the API is blocked).
   */
  async _readClipboard() {
    // 1. Modern API
    if (navigator.clipboard?.readText) {
      try {
        return await navigator.clipboard.readText();
      } catch {
        // Permission denied or not a secure context — try the fallback.
      }
    }

    // 2. execCommand fallback
    const ta = Object.assign(document.createElement('textarea'), {
      style: 'position:fixed;opacity:0',
    });
    document.body.appendChild(ta);
    ta.focus();
    const ok = document.execCommand('paste');
    const value = ok ? ta.value : null;
    ta.remove();
    return value;
  },

  // ── DOM insertion helpers ────────────────────────────────────────────────────

  _insertHTML(html) {
    this._editor.contentArea.focus();
    // insertHTML respects the current caret / selection.
    if (!document.execCommand('insertHTML', false, html)) {
      // Last-resort: append at end if execCommand is unsupported.
      this._editor.contentArea.insertAdjacentHTML('beforeend', html);
    }
  },

  _insertPlainText(text) {
    this._editor.contentArea.focus();
    // insertText keeps it truly plain (no tags injected).
    if (!document.execCommand('insertText', false, text)) {
      // Fallback via Selection API
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        this._editor.contentArea.appendChild(document.createTextNode(text));
      }
    }
  },

  // ── Visual feedback ──────────────────────────────────────────────────────────

  _flash(iconSlot, faIcon) {
    iconSlot.innerHTML = CHECK_ICON;
    setTimeout(() => {
      iconSlot.innerHTML = `<i class="${faIcon}" aria-hidden="true" style="font-size:13px;"></i>`;
    }, 1400);
  },

  _showError(iconSlot, faIcon) {
    iconSlot.innerHTML = `<i class="fa-solid fa-triangle-exclamation" aria-hidden="true" style="font-size:13px;color:var(--rte-error,#c0392b);"></i>`;
    setTimeout(() => {
      iconSlot.innerHTML = `<i class="${faIcon}" aria-hidden="true" style="font-size:13px;"></i>`;
    }, 2000);
  },

  // ── Popup open / close ───────────────────────────────────────────────────────

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
      this._triggerBtn.classList.remove('rte-tool-active');
    }
  },

  // ── Styles ───────────────────────────────────────────────────────────────────

  _injectStyles() {
    if (document.getElementById('rte-clipboard-styles')) return;
    const style = document.createElement('style');
    style.id = 'rte-clipboard-styles';
    style.textContent = `
      .rte-clipboard-item:hover,
      .rte-clipboard-item:focus-visible {
        background: var(--rte-hover-bg, rgba(0,0,0,.06));
      }
    `;
    document.head.appendChild(style);
  },

  // ── Toolbar state sync ───────────────────────────────────────────────────────

  updateState() {
    // No formatting state to reflect on the trigger.
  },

  // ── Cleanup ──────────────────────────────────────────────────────────────────

  destroy() {
    if (this._outsideHandler) document.removeEventListener('mousedown', this._outsideHandler);
    if (this._keyHandler)     document.removeEventListener('keydown',   this._keyHandler);
  },
};