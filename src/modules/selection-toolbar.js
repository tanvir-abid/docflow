/**
 * Selection Toolbar Module
 * ========================
 * Shows a two-row floating popup above any text the user selects inside
 * the editor's content area.
 *
 * Row 1 — Formatting + Alignment + Border row:
 *   Bold · Italic · Underline · Text Color | Align Left · Center · Right · Justify | Border
 *   Clicking "Border" opens an inline sub-panel with:
 *     • Target selector  : Selection | Paragraph | Page
 *     • Style pills      : Solid | Dashed | Dotted | Double
 *     • Width stepper    : 1–8 px
 *     • Color swatch     : preset swatches + native picker + Transparent
 *     • Radius stepper   : 0–24 px
 *     • Apply / Remove   : action buttons
 *
 * Row 2 — Quick-action row:
 *   Copy · Rewrite with AI
 *
 * Depends on:
 *   ./border-tool.js   (BorderTool)
 *
 * Usage:
 *   import { initSelectionToolbar } from './selection-toolbar.js';
 *   const handle = initSelectionToolbar(editor, {
 *     onRewrite: (text, markerId) => { ... },
 *     onToast  : (msg)            => { ... },
 *   });
 *   handle.destroy(); // cleanup
 */

import { HighlightTool } from './highlight.js';
import { BorderTool     } from './border-tool.js';
import { BoldTool       } from './bold.js';
import { ItalicTool     } from './italic.js';
import { TextColorTool  } from './text-color.js';

export const MAX_REWRITE_CHARS = 4000;

const STYLE_ID = 'rte-selection-toolbar-styles';

const ICONS = {
  copy:        `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  rewrite:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 4.6L5.5 9.5l4.6 1.9L12 16l1.9-4.6 4.6-1.9-4.6-1.9Z"/><path d="M19 17v4"/><path d="M21 19h-4"/></svg>`,
  highlight:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h3l6-6"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/><path d="M3 21h6"/></svg>`,
  check:       `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  alignLeft:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="6" x2="3" y2="6"/><line x1="15" y1="12" x2="3" y2="12"/><line x1="17" y1="18" x2="3" y2="18"/></svg>`,
  alignCenter: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="6" x2="3" y2="6"/><line x1="17" y1="12" x2="7" y2="12"/><line x1="19" y1="18" x2="5" y2="18"/></svg>`,
  alignRight:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="12" x2="9" y2="12"/><line x1="21" y1="18" x2="7" y2="18"/></svg>`,
  alignJustify:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="12" x2="3" y2="12"/><line x1="21" y1="18" x2="3" y2="18"/></svg>`,
  border:      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21" stroke-dasharray="2 2"/><line x1="15" y1="3" x2="15" y2="21" stroke-dasharray="2 2"/><line x1="3" y1="9" x2="21" y2="9" stroke-dasharray="2 2"/><line x1="3" y1="15" x2="21" y2="15" stroke-dasharray="2 2"/></svg>`,
  bold:        `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>`,
  italic:      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>`,
  underline: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2.4" stroke-linecap="round"
  stroke-linejoin="round">
  <path d="M6 4v7a6 6 0 0 0 12 0V4"/>
  <line x1="4" y1="20" x2="20" y2="20"/>
</svg>`,
textColor: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round"
  stroke-linejoin="round">
  <path d="M9 3L5 18"/>
  <path d="M15 3l4 15"/>
  <path d="M7 13h10"/>
  <rect x="3" y="20" width="18" height="2.5" rx="1"
        fill="#e53e3e" stroke="none"/>
</svg>`,
  minus:       `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  plus:        `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
};

// Border panel preset colors
const BORDER_COLORS = [
  '#1e293b', '#6b7280', '#e5e7eb',
  '#6366f1', '#3b82f6', '#06b6d4',
  '#10b981', '#f59e0b', '#ef4444',
];

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* ── Popup shell ───────────────────────────────────────────────── */
    .rte-selection-popup {
      position: fixed;
      z-index: 10000;
      display: none;
      flex-direction: column;
      padding: 4px;
      border-radius: var(--rte-radius, 8px);
      background: var(--rte-toolbar-bg, #fff);
      border: 1px solid var(--rte-border, rgba(0,0,0,.12));
      box-shadow: 0 6px 24px rgba(0,0,0,.14);
      font-family: 'Inter', sans-serif;
      min-width: max-content;
    }

    /* ── Rows ──────────────────────────────────────────────────────── */
    .rte-sel-row {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .rte-sel-row-divider {
      height: 1px;
      background: var(--rte-border, rgba(0,0,0,.08));
      margin: 2px 4px;
    }

    /* ── Shared button ─────────────────────────────────────────────── */
    .rte-sel-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 10px;
      font-size: .75rem;
      font-weight: 500;
      font-family: inherit;
      color: #374151;
      background: transparent;
      border: none;
      border-radius: calc(var(--rte-radius, 8px) - 3px);
      cursor: pointer;
      line-height: 1;
      white-space: nowrap;
      transition: background .12s, color .12s;
    }
    .rte-sel-btn:hover { background: rgba(79,70,229,.08); color: var(--indigo, #4f46e5); }
    .rte-sel-btn[data-action="rewrite"] { color: var(--indigo, #4f46e5); }
    .rte-sel-btn[data-action="border"].active {
      background: rgba(79,70,229,.1);
      color: var(--indigo, #4f46e5);
    }

    /* ── Icon-only format buttons (Bold / Italic / Highlight) ─────────── */
    .rte-sel-icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      font-family: inherit;
      color: #374151;
      background: transparent;
      border: none;
      border-radius: calc(var(--rte-radius, 8px) - 3px);
      cursor: pointer;
      flex-shrink: 0;
      transition: background .12s, color .12s;
    }
    .rte-sel-icon-btn:hover { background: rgba(79,70,229,.08); color: var(--indigo, #4f46e5); }
    .rte-sel-icon-btn.active {
      background: rgba(79,70,229,.1);
      color: var(--indigo, #4f46e5);
    }

    .rte-sel-divider {
      width: 1px; height: 16px;
      background: var(--rte-border, rgba(0,0,0,.12));
      flex-shrink: 0;
      margin: 0 1px;
    }

    /* ── Border sub-panel ──────────────────────────────────────────── */
    .rte-border-panel {
      display: none;
      flex-direction: column;
      gap: 10px;
      padding: 10px 12px 12px;
      border-top: 1px solid var(--rte-border, rgba(0,0,0,.08));
      margin-top: 2px;
    }
    .rte-border-panel.open { display: flex; }

    .rte-bp-label {
      font-size: .68rem;
      font-weight: 600;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: .06em;
      margin-bottom: 3px;
    }

    /* Target pills */
    .rte-bp-targets {
      display: flex;
      gap: 4px;
    }
    .rte-bp-target {
      flex: 1;
      padding: 5px 4px;
      font-size: .7rem;
      font-weight: 500;
      font-family: inherit;
      color: #64748b;
      background: #f8fafc;
      border: 1.5px solid #e2e8f0;
      border-radius: 6px;
      cursor: pointer;
      text-align: center;
      transition: all .12s;
    }
    .rte-bp-target:hover { border-color: #6366f1; color: #6366f1; }
    .rte-bp-target.active {
      background: #ede9fe;
      border-color: #6366f1;
      color: #6366f1;
      font-weight: 600;
    }

    /* Style pills */
    .rte-bp-styles {
      display: flex;
      gap: 4px;
    }
    .rte-bp-style {
      flex: 1;
      padding: 5px 2px;
      font-size: .68rem;
      font-weight: 500;
      font-family: inherit;
      color: #64748b;
      background: #f8fafc;
      border: 1.5px solid #e2e8f0;
      border-radius: 6px;
      cursor: pointer;
      text-align: center;
      transition: all .12s;
    }
    .rte-bp-style:hover { border-color: #6366f1; color: #6366f1; }
    .rte-bp-style.active {
      background: #ede9fe;
      border-color: #6366f1;
      color: #4f46e5;
      font-weight: 600;
    }

    /* Stepper */
    .rte-bp-stepper {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .rte-bp-step-btn {
      width: 22px; height: 22px;
      display: inline-flex; align-items: center; justify-content: center;
      background: #f8fafc;
      border: 1.5px solid #e2e8f0;
      border-radius: 5px;
      cursor: pointer;
      color: #475569;
      flex-shrink: 0;
      transition: all .12s;
    }
    .rte-bp-step-btn:hover { border-color: #6366f1; color: #6366f1; background: #ede9fe; }
    .rte-bp-step-val {
      font-size: .75rem;
      font-weight: 600;
      color: #1e293b;
      min-width: 26px;
      text-align: center;
    }

    /* Color row */
    .rte-bp-colors {
      display: flex;
      align-items: center;
      gap: 5px;
      flex-wrap: wrap;
    }
    .rte-bp-color-swatch {
      width: 20px; height: 20px;
      border-radius: 5px;
      border: 2px solid rgba(0,0,0,.08);
      cursor: pointer;
      flex-shrink: 0;
      transition: transform .1s, border-color .1s;
      outline-offset: 2px;
    }
    .rte-bp-color-swatch:hover { transform: scale(1.2); border-color: #475569; }
    .rte-bp-color-swatch.active { border-color: #6366f1 !important; box-shadow: 0 0 0 2px #ede9fe; }
    .rte-bp-color-swatch.transparent-swatch {
      background: linear-gradient(135deg, #fff 40%, #f1f5f9 40%);
      border: 2px dashed #cbd5e1;
      position: relative;
    }
    .rte-bp-color-swatch.transparent-swatch::after {
      content: '';
      position: absolute;
      inset: 2px;
      background: linear-gradient(135deg, transparent 45%, #ef4444 45%, #ef4444 55%, transparent 55%);
    }
    .rte-bp-custom-swatch {
      position: relative;
      width: 20px; height: 20px;
      border-radius: 5px;
      border: 2px dashed #cbd5e1;
      overflow: hidden;
      cursor: pointer;
      flex-shrink: 0;
    }
    .rte-bp-custom-preview {
      width: 100%; height: 100%;
      pointer-events: none;
    }
    .rte-bp-custom-input {
      position: absolute;
      opacity: 0;
      width: 200%; height: 200%;
      top: -50%; left: -50%;
      cursor: pointer;
    }

    /* Action buttons */
    .rte-bp-actions {
      display: flex;
      gap: 6px;
    }
    .rte-bp-apply {
      flex: 1;
      padding: 6px 0;
      font-size: .74rem;
      font-weight: 600;
      font-family: inherit;
      color: #fff;
      background: #6366f1;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      transition: background .12s;
    }
    .rte-bp-apply:hover { background: #4f46e5; }
    .rte-bp-remove {
      flex: 1;
      padding: 6px 0;
      font-size: .74rem;
      font-weight: 500;
      font-family: inherit;
      color: #64748b;
      background: #f8fafc;
      border: 1.5px solid #e2e8f0;
      border-radius: 6px;
      cursor: pointer;
      transition: all .12s;
    }
    .rte-bp-remove:hover { border-color: #ef4444; color: #ef4444; background: #fef2f2; }

    /* ── Rewrite marker ─────────────────────────────────────────────── */
    .rte-rewrite-marker {
      background: rgba(79,70,229,.12);
      border-radius: 2px;
      box-shadow: 0 0 0 1px rgba(79,70,229,.18);
    }
  `;
  document.head.appendChild(style);
}

// ── Border panel state (shared across show/hide cycles) ───────────────────────
const borderState = {
  target : 'paragraph',  // 'selection' | 'paragraph' | 'page'
  style  : 'solid',
  width  : 2,
  color  : '#6366f1',
  radius : 6,
};

// ── Build border sub-panel DOM ────────────────────────────────────────────────
function buildBorderPanel(editor, onApply, onRemove) {
  const panel = document.createElement('div');
  panel.className = 'rte-border-panel';

  // ── Target ────────────────────────────────────────────────────────────────
  const targetLabel = document.createElement('div');
  targetLabel.className = 'rte-bp-label';
  targetLabel.textContent = 'Apply to';
  panel.appendChild(targetLabel);

  const targets = document.createElement('div');
  targets.className = 'rte-bp-targets';

  const targetOpts = [
    { value: 'selection', label: 'Selection' },
    { value: 'paragraph', label: 'Paragraph' },
    { value: 'page',      label: 'Page' },
  ];

  targetOpts.forEach(({ value, label }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rte-bp-target' + (borderState.target === value ? ' active' : '');
    btn.textContent = label;
    btn.dataset.value = value;
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      borderState.target = value;
      targets.querySelectorAll('.rte-bp-target').forEach(b =>
        b.classList.toggle('active', b.dataset.value === value)
      );
    });
    targets.appendChild(btn);
  });
  panel.appendChild(targets);

  // ── Style ─────────────────────────────────────────────────────────────────
  const styleLabel = document.createElement('div');
  styleLabel.className = 'rte-bp-label';
  styleLabel.textContent = 'Style';
  panel.appendChild(styleLabel);

  const stylesRow = document.createElement('div');
  stylesRow.className = 'rte-bp-styles';

  const styleOpts = ['Solid', 'Dashed', 'Dotted', 'Double'];
  styleOpts.forEach((s) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rte-bp-style' + (borderState.style === s.toLowerCase() ? ' active' : '');
    btn.textContent = s;
    btn.dataset.value = s.toLowerCase();
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      borderState.style = s.toLowerCase();
      stylesRow.querySelectorAll('.rte-bp-style').forEach(b =>
        b.classList.toggle('active', b.dataset.value === borderState.style)
      );
    });
    stylesRow.appendChild(btn);
  });
  panel.appendChild(stylesRow);

  // ── Width & Radius steppers ───────────────────────────────────────────────
  const stepRow = document.createElement('div');
  stepRow.style.cssText = 'display:flex;gap:16px;';

  function makeStepper(labelText, stateKey, min, max, unit) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'flex:1;';

    const lbl = document.createElement('div');
    lbl.className = 'rte-bp-label';
    lbl.textContent = labelText;

    const stepper = document.createElement('div');
    stepper.className = 'rte-bp-stepper';

    const decBtn = document.createElement('button');
    decBtn.type = 'button';
    decBtn.className = 'rte-bp-step-btn';
    decBtn.innerHTML = ICONS.minus;

    const valEl = document.createElement('span');
    valEl.className = 'rte-bp-step-val';
    valEl.textContent = `${borderState[stateKey]}${unit}`;

    const incBtn = document.createElement('button');
    incBtn.type = 'button';
    incBtn.className = 'rte-bp-step-btn';
    incBtn.innerHTML = ICONS.plus;

    decBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (borderState[stateKey] > min) {
        borderState[stateKey]--;
        valEl.textContent = `${borderState[stateKey]}${unit}`;
      }
    });
    incBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (borderState[stateKey] < max) {
        borderState[stateKey]++;
        valEl.textContent = `${borderState[stateKey]}${unit}`;
      }
    });

    stepper.appendChild(decBtn);
    stepper.appendChild(valEl);
    stepper.appendChild(incBtn);
    wrap.appendChild(lbl);
    wrap.appendChild(stepper);
    return wrap;
  }

  stepRow.appendChild(makeStepper('Width', 'width',  1, 8,  'px'));
  stepRow.appendChild(makeStepper('Radius', 'radius', 0, 24, 'px'));
  panel.appendChild(stepRow);

  // ── Color ─────────────────────────────────────────────────────────────────
  const colorLabel = document.createElement('div');
  colorLabel.className = 'rte-bp-label';
  colorLabel.textContent = 'Color';
  panel.appendChild(colorLabel);

  const colorsRow = document.createElement('div');
  colorsRow.className = 'rte-bp-colors';

  // Transparent swatch
  const transSwatch = document.createElement('button');
  transSwatch.type = 'button';
  transSwatch.className = 'rte-bp-color-swatch transparent-swatch' + (borderState.color === 'transparent' ? ' active' : '');
  transSwatch.title = 'Transparent';
  transSwatch.addEventListener('mousedown', (e) => {
    e.preventDefault();
    borderState.color = 'transparent';
    colorsRow.querySelectorAll('.rte-bp-color-swatch').forEach(s => s.classList.remove('active'));
    transSwatch.classList.add('active');
    customPreview.style.background = 'transparent';
  });
  colorsRow.appendChild(transSwatch);

  // Preset swatches
  BORDER_COLORS.forEach((hex) => {
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'rte-bp-color-swatch' + (borderState.color === hex ? ' active' : '');
    sw.style.background = hex;
    sw.title = hex;
    sw.dataset.color = hex;
    sw.addEventListener('mousedown', (e) => {
      e.preventDefault();
      borderState.color = hex;
      colorsRow.querySelectorAll('.rte-bp-color-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      customPreview.style.background = hex;
      customInput.value = hex;
    });
    colorsRow.appendChild(sw);
  });

  // Custom color swatch + hidden native picker
  const customSwatch = document.createElement('div');
  customSwatch.className = 'rte-bp-custom-swatch';
  customSwatch.title = 'Custom color';

  const customPreview = document.createElement('div');
  customPreview.className = 'rte-bp-custom-preview';
  customPreview.style.background = BORDER_COLORS.includes(borderState.color) ? '#fff' : borderState.color;

  const customInput = document.createElement('input');
  customInput.type = 'color';
  customInput.className = 'rte-bp-custom-input';
  customInput.value = BORDER_COLORS.includes(borderState.color) ? '#6366f1' : borderState.color;

  customInput.addEventListener('input', (e) => {
    customPreview.style.background = e.target.value;
  });
  customInput.addEventListener('change', (e) => {
    borderState.color = e.target.value;
    colorsRow.querySelectorAll('.rte-bp-color-swatch').forEach(s => s.classList.remove('active'));
    customPreview.style.background = e.target.value;
  });

  customSwatch.appendChild(customPreview);
  customSwatch.appendChild(customInput);
  colorsRow.appendChild(customSwatch);
  panel.appendChild(colorsRow);

  // ── Apply / Remove ────────────────────────────────────────────────────────
  const actions = document.createElement('div');
  actions.className = 'rte-bp-actions';

  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'rte-bp-apply';
  applyBtn.textContent = 'Apply border';
  applyBtn.addEventListener('mousedown', (e) => { e.preventDefault(); onApply(); });

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'rte-bp-remove';
  removeBtn.textContent = 'Remove';
  removeBtn.addEventListener('mousedown', (e) => { e.preventDefault(); onRemove(); });

  actions.appendChild(applyBtn);
  actions.appendChild(removeBtn);
  panel.appendChild(actions);

  return panel;
}

// ── Main export ───────────────────────────────────────────────────────────────
export function initSelectionToolbar(editor, { onRewrite, onToast } = {}) {
  const contentArea = editor && editor.contentArea;
  if (!contentArea) {
    console.warn('DocFlow: initSelectionToolbar called without editor.contentArea');
    return { destroy() {}, hide() {} };
  }

  injectStyles();

  // ── Build popup ─────────────────────────────────────────────────────────────
  const popup = document.createElement('div');
  popup.className = 'rte-selection-popup';
  popup.setAttribute('role', 'toolbar');
  popup.setAttribute('aria-label', 'Selection actions');

  // ── Row 1: Formatting + Border ────────────────────────────────────────────
  const borderRow = document.createElement('div');
  borderRow.className = 'rte-sel-row';

  function makeIconBtn(action, icon, title) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rte-sel-btn rte-sel-icon-btn';
    b.dataset.action = action;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.innerHTML = icon;
    return b;
  }

  const boldBtn      = makeIconBtn('bold',      ICONS.bold,      'Bold');
  const italicBtn    = makeIconBtn('italic',    ICONS.italic,    'Italic');
  const underlineBtn = makeIconBtn('underline', ICONS.underline, 'Underline');
  const textColorBtn = makeIconBtn('textColor', ICONS.textColor, 'Text color');

  borderRow.appendChild(boldBtn);
  borderRow.appendChild(italicBtn);
  borderRow.appendChild(underlineBtn);
  borderRow.appendChild(textColorBtn);

  const formatDivider = document.createElement('span');
  formatDivider.className = 'rte-sel-divider';
  borderRow.appendChild(formatDivider);

  const alignLeftBtn   = makeIconBtn('justifyLeft',   ICONS.alignLeft,   'Align left');
  const alignCenterBtn = makeIconBtn('justifyCenter', ICONS.alignCenter, 'Align center');
  const alignRightBtn  = makeIconBtn('justifyRight',  ICONS.alignRight,  'Align right');
  const alignJustBtn   = makeIconBtn('justifyFull',   ICONS.alignJustify,'Justify');

  borderRow.appendChild(alignLeftBtn);
  borderRow.appendChild(alignCenterBtn);
  borderRow.appendChild(alignRightBtn);
  borderRow.appendChild(alignJustBtn);

  const alignDivider = document.createElement('span');
  alignDivider.className = 'rte-sel-divider';
  borderRow.appendChild(alignDivider);

  const borderBtn = document.createElement('button');
  borderBtn.type = 'button';
  borderBtn.className = 'rte-sel-btn';
  borderBtn.dataset.action = 'border';
  borderBtn.title = 'Add border';
  borderBtn.innerHTML = `${ICONS.border}<span>Border</span>`;
  borderRow.appendChild(borderBtn);

  popup.appendChild(borderRow);

  // ── Border sub-panel (injected below row 1) ────────────────────────────────
  const borderPanel = buildBorderPanel(
    editor,
    // onApply
    () => {
      if (currentRange) restoreSelection(currentRange);
      BorderTool.apply(editor, { ...borderState });
      editor.syncToolbarState && editor.syncToolbarState();
      hide();
    },
    // onRemove
    () => {
      if (currentRange) restoreSelection(currentRange);
      BorderTool.remove(editor, borderState.target);
      editor.syncToolbarState && editor.syncToolbarState();
      hide();
    }
  );
  popup.appendChild(borderPanel);

  // ── Divider between rows ───────────────────────────────────────────────────
  const rowDivider = document.createElement('div');
  rowDivider.className = 'rte-sel-row-divider';
  popup.appendChild(rowDivider);

  // ── Row 2: Quick actions ───────────────────────────────────────────────────
  const quickRow = document.createElement('div');
  quickRow.className = 'rte-sel-row';
  quickRow.innerHTML = `
    <button type="button" class="rte-sel-btn" data-action="copy" title="Copy">
      ${ICONS.copy}<span>Copy</span>
    </button>
    <span class="rte-sel-divider"></span>
    <button type="button" class="rte-sel-btn" data-action="rewrite" title="Rewrite with AI">
      ${ICONS.rewrite}<span>Rewrite with AI</span>
    </button>
    <span class="rte-sel-divider"></span>
    <button type="button" class="rte-sel-btn" data-action="highlight" title="Highlight">
      ${ICONS.highlight}<span>Highlight</span>
    </button>
  `;
  popup.appendChild(quickRow);

  document.body.appendChild(popup);

  let currentRange = null;
  let visible = false;
  let borderPanelOpen = false;

  function updateFormatButtonsState() {
    boldBtn.classList.toggle('active', BoldTool.isActive());
    italicBtn.classList.toggle('active', ItalicTool.isActive());

    underlineBtn.classList.toggle(
      'active',
      document.queryCommandState('underline')
    );

    alignLeftBtn.classList.toggle('active',   document.queryCommandState('justifyLeft'));
    alignCenterBtn.classList.toggle('active', document.queryCommandState('justifyCenter'));
    alignRightBtn.classList.toggle('active',  document.queryCommandState('justifyRight'));
    alignJustBtn.classList.toggle('active',   document.queryCommandState('justifyFull'));
  }

  // ── Show / hide / position ─────────────────────────────────────────────────
  function show(range) {
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) { hide(); return; }

    currentRange = range.cloneRange();
    popup.style.display = 'flex';
    visible = true;
    updateFormatButtonsState();

    const popupRect = popup.getBoundingClientRect();
    const gap = 8;

    let top = rect.top - popupRect.height - gap;
    let flippedBelow = false;
    if (top < 8) { top = rect.bottom + gap; flippedBelow = true; }

    let left = rect.left + rect.width / 2 - popupRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - popupRect.width - 8));

    if (flippedBelow && top + popupRect.height > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - popupRect.height - 8);
    }

    popup.style.top  = `${top}px`;
    popup.style.left = `${left}px`;
  }

  function hide() {
    popup.style.display = 'none';
    visible = false;
    currentRange = null;
    closeBorderPanel();
  }

  function toggleBorderPanel() {
    borderPanelOpen = !borderPanelOpen;
    borderPanel.classList.toggle('open', borderPanelOpen);
    borderBtn.classList.toggle('active', borderPanelOpen);
    rowDivider.style.display = borderPanelOpen ? 'none' : '';

    // Reposition after panel opens (it changes popup height)
    if (borderPanelOpen && currentRange) {
      requestAnimationFrame(() => show(currentRange));
    }
  }

  function closeBorderPanel() {
    borderPanelOpen = false;
    borderPanel.classList.remove('open');
    borderBtn.classList.remove('active');
    rowDivider.style.display = '';
  }

  // ── Selection tracking ─────────────────────────────────────────────────────
  function handleSelectionCheck() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { hide(); return; }
    const range = sel.getRangeAt(0);
    if (!contentArea.contains(range.commonAncestorContainer)) { hide(); return; }
    if (!range.toString().trim()) { hide(); return; }
    show(range);
  }

  contentArea.addEventListener('mouseup', handleSelectionCheck);
  contentArea.addEventListener('keyup', (e) => {
    if (e.shiftKey || e.key === 'Shift' || e.key.indexOf('Arrow') === 0) handleSelectionCheck();
  });

  const outsideHandler = (e) => {
    if (popup.contains(e.target)) return;
    if (contentArea.contains(e.target)) return;
    hide();
  };
  document.addEventListener('mousedown', outsideHandler);

  const onScroll = () => hide();
  const onResize = () => hide();
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);

  // ── Action dispatch ────────────────────────────────────────────────────────
  popup.addEventListener('mousedown', (e) => {
    const btn = e.target.closest('.rte-sel-btn');
    if (!btn) return;
    e.preventDefault();

    const action = btn.dataset.action;

    if (action === 'border') {
      toggleBorderPanel();
      return;
    }

    // All other actions need a valid range
    if (!currentRange) return;
    const range = currentRange;

    if (action === 'bold') {
      restoreSelection(range);
      BoldTool.execute(editor);
      hide();
      return;
    }

    if (action === 'italic') {
      restoreSelection(range);
      ItalicTool.execute(editor);
      hide();
      return;
    }

    if (action === 'underline') {
      restoreSelection(range);

      editor.contentArea.focus();
      document.execCommand('underline', false, null);

      editor.syncToolbarState && editor.syncToolbarState();
      editor.emitChange && editor.emitChange();

      hide();
      return;
    }

    if (action === 'textColor') {
      restoreSelection(range);

      // Use the same default color as TextColorTool.
      // This applies a color directly from the selection toolbar.
      const color = TextColorTool._lastColor || '#e53e3e';

      editor.contentArea.focus();

      const applied = document.execCommand('foreColor', false, color);

      // Fallback if execCommand fails
      if (!applied) {
        const sel = window.getSelection();

        if (sel && sel.rangeCount) {
          const selectedRange = sel.getRangeAt(0);
          const span = document.createElement('span');

          span.style.color = color;

          try {
            selectedRange.surroundContents(span);
          } catch {
            span.appendChild(selectedRange.extractContents());
            selectedRange.insertNode(span);
          }
        }
      }

      editor.syncToolbarState && editor.syncToolbarState();
      editor.emitChange && editor.emitChange();

      hide();
      return;
    }

    if (action === 'copy') {
      copyToClipboard(range.toString());
      onToast && onToast('Copied to clipboard');
      hide();
      return;
    }

    if (action === 'justifyLeft' || action === 'justifyCenter' ||
        action === 'justifyRight' || action === 'justifyFull') {
      restoreSelection(range);
      editor.contentArea.focus();
      document.execCommand(action, false, null);
      editor.syncToolbarState && editor.syncToolbarState();
      editor.emitChange && editor.emitChange();
      hide();
      return;
    }

    if (action === 'highlight') {
      restoreSelection(range);
      HighlightTool.applyColor(editor, HighlightTool.DEFAULT_COLOR);
      editor.syncToolbarState && editor.syncToolbarState();
      editor.emitChange && editor.emitChange();
      hide();
      return;
    }

    if (action === 'rewrite') {
      const text = range.toString();
      if (!text.trim()) { hide(); return; }
      if (text.length > MAX_REWRITE_CHARS) {
        onToast && onToast(
          `That selection is too long to rewrite (${text.length.toLocaleString()} / ${MAX_REWRITE_CHARS.toLocaleString()} character limit). Please select a shorter passage.`
        );
        hide();
        return;
      }
      const markerId = markSelection(editor, range);
      hide();
      onRewrite && onRewrite(text, markerId);
      return;
    }
  });

  // ── Cleanup ────────────────────────────────────────────────────────────────
  function destroy() {
    contentArea.removeEventListener('mouseup', handleSelectionCheck);
    document.removeEventListener('mousedown', outsideHandler);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onResize);
    popup.remove();
  }

  return { destroy, hide };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function markSelection(editor, range) {
  const id = `rw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const span = document.createElement('span');
  span.className = 'rte-rewrite-marker';
  span.dataset.rewriteId = id;
  try {
    const frag = range.cloneContents();
    range.deleteContents();
    span.appendChild(frag);
    range.insertNode(span);
  } catch (err) {
    console.warn('DocFlow: could not mark selection for rewrite', err);
    return null;
  }
  editor.emitChange && editor.emitChange();
  return id;
}

function restoreSelection(range) {
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;left:-9999px;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  } catch { /* clipboard unavailable */ }
}