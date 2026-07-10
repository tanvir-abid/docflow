/**
 * Link Tool Module
 * Inserts or edits a hyperlink. Shows an inline popover for URL input.
 */

import { positionFloatingPanel } from './panel-position.js';

export const LinkTool = {
  name: 'link',
  ariaLabel: 'Insert link (Ctrl+K)',
  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,

  _savedRange: null,
  _popover: null,

  createButton(editor) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rte-tool-btn';
    btn.dataset.tool = this.name;
    btn.setAttribute('aria-label', this.ariaLabel);
    btn.setAttribute('title', this.ariaLabel);
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = this.icon;
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); this.execute(editor, btn); });
    return btn;
  },

  execute(editor, triggerBtn) {
    // If already in a link, remove it
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      let node = sel.anchorNode;
      if (node?.nodeType === Node.TEXT_NODE) node = node.parentNode;
      const existingLink = node?.closest?.('a');
      if (existingLink) {
        const parent = existingLink.parentNode;
        while (existingLink.firstChild) parent.insertBefore(existingLink.firstChild, existingLink);
        parent.removeChild(existingLink);
        editor.syncToolbarState();
        editor.emitChange();
        return;
      }
    }

    this._savedRange = this._saveRange();
    this._showPopover(editor, triggerBtn);
  },

  _showPopover(editor, triggerBtn) {
    this._destroyPopover();

    const popover = document.createElement('div');
    popover.className = 'rte-link-popover';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', 'Insert link');
    popover.innerHTML = `
      <input class="rte-link-input" type="url" placeholder="https://example.com" aria-label="URL" autocomplete="off" spellcheck="false"/>
      <button class="rte-link-apply" type="button" aria-label="Apply link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      <button class="rte-link-cancel" type="button" aria-label="Cancel">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;

    // Position near trigger button
    popover.style.cssText = 'position: absolute; z-index: 1000; visibility: hidden;';
    editor.root.style.position = 'relative';
    editor.root.appendChild(popover);
    this._popover = popover;

    positionFloatingPanel(popover, triggerBtn, editor.root);
    popover.style.visibility = '';

    const input = popover.querySelector('.rte-link-input');
    input.focus();

    const apply = () => {
      const url = input.value.trim();
      if (url) {
        if (this._savedRange) this._restoreRange(this._savedRange);
        editor.contentArea.focus();
        document.execCommand('createLink', false, url);
        // Make link open in new tab
        const links = editor.contentArea.querySelectorAll('a[href="' + CSS.escape(url) + '"]');
        links.forEach(a => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
        editor.syncToolbarState();
        editor.emitChange();
      }
      this._destroyPopover();
    };

    popover.querySelector('.rte-link-apply').addEventListener('click', apply);
    popover.querySelector('.rte-link-cancel').addEventListener('click', () => this._destroyPopover());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); apply(); }
      if (e.key === 'Escape') this._destroyPopover();
    });

    // Dismiss on outside click
    setTimeout(() => {
      document.addEventListener('mousedown', this._outsideClickHandler = (e) => {
        if (!popover.contains(e.target)) this._destroyPopover();
      });
    }, 10);
  },

  _destroyPopover() {
    if (this._popover) {
      this._popover.remove();
      this._popover = null;
    }
    if (this._outsideClickHandler) {
      document.removeEventListener('mousedown', this._outsideClickHandler);
      this._outsideClickHandler = null;
    }
  },

  isActive() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    let node = sel.anchorNode;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentNode;
    return !!node?.closest?.('a');
  },

  updateState(btn) {
    const active = this.isActive();
    btn.classList.toggle('rte-tool-active', active);
    btn.setAttribute('aria-pressed', String(active));
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
};
