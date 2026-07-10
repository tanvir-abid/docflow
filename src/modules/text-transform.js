/**
 * Text Transform Tool Module
 * Renders a toolbar trigger with a floating popup, using the same
 * layout and interaction design as the Margin Presets tool.
 *
 * Options:
 *   • UPPERCASE
 *   • lowercase
 *   • Title Case
 *   • Sentence case
 *
 * Operates on the current selection. If nothing is selected,
 * the entire editor content is transformed.
 */

import { positionFloatingPanel } from './panel-position.js';

const TRANSFORMS = [
  {
    id: 'uppercase',
    label: 'UPPERCASE',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 20L8 4l4 16"/>
      <path d="M5.5 14h5"/>
      <path d="M16 4h4"/>
      <path d="M18 4v16"/>
    </svg>`,
    fn: (s) => s.toUpperCase(),
  },
  {
    id: 'lowercase',
    label: 'lowercase',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="8" cy="15" r="4"/>
      <path d="M12 11v8"/>
      <circle cx="17" cy="15" r="4"/>
      <path d="M21 11v8"/>
    </svg>`,
    fn: (s) => s.toLowerCase(),
  },
  {
    id: 'titlecase',
    label: 'Title Case',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 20L8 4l4 16"/>
      <path d="M5.5 14h5"/>
      <path d="M16 14a4 4 0 1 0 4 4v-4h-4"/>
    </svg>`,
    fn: (s) =>
      s.replace(/\w\S*/g, (word) =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ),
  },
  {
    id: 'sentencecase',
    label: 'Sentence case',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 20L8 4l4 16"/>
      <path d="M5.5 14h5"/>
      <circle cx="18" cy="16" r="4"/>
      <path d="M22 12v8"/>
    </svg>`,
    fn: (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(),
  },
];

const MAIN_ICON = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" stroke-width="2" stroke-linecap="round"
       stroke-linejoin="round">
    <polyline points="4 7 4 4 20 4 20 7"/>
    <line x1="9" y1="20" x2="15" y2="20"/>
    <line x1="12" y1="4" x2="12" y2="20"/>
  </svg>
`;

const CHEVRON_ICON = `
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" stroke-width="2.5"
       stroke-linecap="round" stroke-linejoin="round"
       style="margin-left:2px;opacity:0.6;flex-shrink:0">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
`;

export const TextTransformTool = {
  name: 'textTransform',
  ariaLabel: 'Text transform',

  _triggerBtn: null,
  _popup: null,
  _buttons: [],
  _open: false,
  _editor: null,
  _outsideHandler: null,
  _keyHandler: null,

  createButton(editor) {
    this._editor = editor;

    const wrapper = document.createElement('div');
    wrapper.style.cssText =
      'position:relative;display:inline-flex;align-items:center;';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'rte-tool-btn';
    trigger.dataset.tool = this.name;
    trigger.setAttribute('aria-label', this.ariaLabel);
    trigger.setAttribute('title', this.ariaLabel);
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.style.cssText =
      'display:inline-flex;align-items:center;gap:2px;padding-right:4px;';
    trigger.innerHTML = MAIN_ICON + CHEVRON_ICON;

    this._triggerBtn = trigger;

    const popup = document.createElement('div');
    popup.className = 'rte-text-transform-popup';
    popup.setAttribute('role', 'menu');
    popup.setAttribute('aria-label', 'Text transform options');
    popup.style.cssText = [
      'position:absolute',
      'z-index:9999',
      'display:none',
      'flex-direction:column',
      'gap:1px',
      'padding:4px',
      'min-width:172px',
      'border-radius:var(--rte-radius,6px)',
      'background:var(--rte-toolbar-bg,#fff)',
      'border:1px solid var(--rte-border,rgba(0,0,0,.12))',
      'box-shadow:0 4px 12px rgba(0,0,0,.12)',
    ].join(';');

    this._popup = popup;
    this._buttons = [];

    TRANSFORMS.forEach((transform) => {
      const btn = document.createElement('button');

      btn.type = 'button';
      btn.className = 'rte-tool-btn rte-text-transform-option';
      btn.dataset.tool = this.name;
      btn.dataset.transform = transform.id;
      btn.setAttribute('role', 'menuitem');
      btn.setAttribute('aria-label', transform.label);

      btn.style.cssText = [
        'display:flex',
        'align-items:center',
        'gap:8px',
        'width:100%',
        'padding:6px 8px',
        'text-align:left',
        'border-radius:4px',
      ].join(';');

      btn.innerHTML = `
        ${transform.icon}
        <span style="flex:1;font-size:.8rem;font-weight:500;">
          ${transform.label}
        </span>
      `;

      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();

        if (editor.contentArea) {
          editor.contentArea.focus();
        }

        this._applyTransform(transform.fn, editor);
        this._closePopup();

        if (typeof editor.syncToolbarState === 'function') {
          editor.syncToolbarState();
        }
      });

      popup.appendChild(btn);
      this._buttons.push({ btn, transform });
    });

    trigger.addEventListener('mousedown', (e) => {
      e.preventDefault();

      if (this._open) {
        this._closePopup();
      } else {
        this._openPopup(trigger);
      }
    });

    this._outsideHandler = (e) => {
      if (!wrapper.contains(e.target)) {
        this._closePopup();
      }
    };

    document.addEventListener('mousedown', this._outsideHandler);

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

  _openPopup(trigger) {
    const popup = this._popup;

    if (!popup) return;

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

  _applyTransform(fn, editor) {
    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);

    if (range.collapsed) {
      this._transformNode(editor.contentArea, fn);
    } else {
      const selectedText = range.toString();

      if (!selectedText) return;

      const transformedText = fn(selectedText);

      document.execCommand('insertText', false, transformedText);
    }

    editor.emitChange();
  },

  _transformNode(node, fn) {
    if (node.nodeType === Node.TEXT_NODE) {
      node.textContent = fn(node.textContent);
      return;
    }

    node.childNodes.forEach((child) => {
      this._transformNode(child, fn);
    });
  },

  updateState() {},

  destroy() {
    if (this._outsideHandler) {
      document.removeEventListener('mousedown', this._outsideHandler);
    }

    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
    }

    this._triggerBtn = null;
    this._popup = null;
    this._buttons = [];
    this._editor = null;
    this._open = false;
  },
};