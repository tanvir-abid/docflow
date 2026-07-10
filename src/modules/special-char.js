/**
 * Special Characters Tool — special-chars.js
 * ═══════════════════════════════════════════
 * Categorised panel of symbols: punctuation, currency, arrows,
 * math, and latin. Inserts unicode at the cursor.
 */

import { positionFloatingPanel } from './panel-position.js';

const CHAR_DATA = {
  'Punctuation': [
    { ch: '©',  label: 'Copyright' },
    { ch: '®',  label: 'Registered' },
    { ch: '™',  label: 'Trademark' },
    { ch: '℠',  label: 'Service Mark' },
    { ch: '°',  label: 'Degree' },
    { ch: '·',  label: 'Middle Dot' },
    { ch: '•',  label: 'Bullet' },
    { ch: '…',  label: 'Ellipsis' },
    { ch: '—',  label: 'Em Dash' },
    { ch: '–',  label: 'En Dash' },
    { ch: '"',  label: 'Left Double Quote' },
    { ch: '"',  label: 'Right Double Quote' },
    { ch: '«',  label: 'Left Guillemet' },
    { ch: '»',  label: 'Right Guillemet' },
    { ch: '†',  label: 'Dagger' },
    { ch: '‡',  label: 'Double Dagger' },
    { ch: '§',  label: 'Section' },
    { ch: '¶',  label: 'Pilcrow' },
    { ch: '‰',  label: 'Per Mille' },
    { ch: '‱',  label: 'Per Ten Thousand' },
    { ch: '′',  label: 'Prime' },
    { ch: '″',  label: 'Double Prime' },
  ],
  'Currency': [
    { ch: '$',  label: 'Dollar' },
    { ch: '€',  label: 'Euro' },
    { ch: '£',  label: 'Pound' },
    { ch: '¥',  label: 'Yen / Yuan' },
    { ch: '₹',  label: 'Rupee' },
    { ch: '₩',  label: 'Won' },
    { ch: '₣',  label: 'Franc' },
    { ch: '₿',  label: 'Bitcoin' },
    { ch: '¢',  label: 'Cent' },
    { ch: '₺',  label: 'Lira' },
    { ch: '₴',  label: 'Hryvnia' },
    { ch: '₦',  label: 'Naira' },
    { ch: '฿',  label: 'Baht' },
    { ch: '₫',  label: 'Dong' },
    { ch: '₱',  label: 'Peso' },
    { ch: '﷼',  label: 'Rial' },
  ],
  'Arrows': [
    { ch: '←',  label: 'Left Arrow' },
    { ch: '→',  label: 'Right Arrow' },
    { ch: '↑',  label: 'Up Arrow' },
    { ch: '↓',  label: 'Down Arrow' },
    { ch: '↔',  label: 'Left-Right Arrow' },
    { ch: '↕',  label: 'Up-Down Arrow' },
    { ch: '↖',  label: 'Northwest Arrow' },
    { ch: '↗',  label: 'Northeast Arrow' },
    { ch: '↘',  label: 'Southeast Arrow' },
    { ch: '↙',  label: 'Southwest Arrow' },
    { ch: '⇐',  label: 'Double Left' },
    { ch: '⇒',  label: 'Double Right' },
    { ch: '⇑',  label: 'Double Up' },
    { ch: '⇓',  label: 'Double Down' },
    { ch: '⇔',  label: 'Double Left-Right' },
    { ch: '↩',  label: 'Return' },
    { ch: '↪',  label: 'Return Right' },
    { ch: '↻',  label: 'Clockwise' },
    { ch: '↺',  label: 'Counter-Clockwise' },
    { ch: '➡',  label: 'Bold Right' },
  ],
  'Math': [
    { ch: '±',  label: 'Plus-Minus' },
    { ch: '×',  label: 'Multiply' },
    { ch: '÷',  label: 'Divide' },
    { ch: '=',  label: 'Equals' },
    { ch: '≠',  label: 'Not Equal' },
    { ch: '≈',  label: 'Approximately' },
    { ch: '<',  label: 'Less Than' },
    { ch: '>',  label: 'Greater Than' },
    { ch: '≤',  label: 'Less or Equal' },
    { ch: '≥',  label: 'Greater or Equal' },
    { ch: '∞',  label: 'Infinity' },
    { ch: '√',  label: 'Square Root' },
    { ch: '∑',  label: 'Sigma / Sum' },
    { ch: '∏',  label: 'Pi / Product' },
    { ch: '∫',  label: 'Integral' },
    { ch: 'π',  label: 'Pi' },
    { ch: 'Ω',  label: 'Omega' },
    { ch: '∂',  label: 'Partial Diff' },
    { ch: '∆',  label: 'Delta' },
    { ch: '∇',  label: 'Nabla' },
    { ch: '∈',  label: 'Element Of' },
    { ch: '∉',  label: 'Not Element Of' },
    { ch: '∩',  label: 'Intersection' },
    { ch: '∪',  label: 'Union' },
    { ch: 'ⁿ',  label: 'Super n' },
    { ch: '½',  label: 'One Half' },
    { ch: '¼',  label: 'One Quarter' },
    { ch: '¾',  label: 'Three Quarters' },
  ],
  'Latin': [
    { ch: 'À',  label: 'A grave' },  { ch: 'Á',  label: 'A acute' },
    { ch: 'Â',  label: 'A circ' },   { ch: 'Ã',  label: 'A tilde' },
    { ch: 'Ä',  label: 'A umlaut' }, { ch: 'Å',  label: 'A ring' },
    { ch: 'Æ',  label: 'AE' },       { ch: 'Ç',  label: 'C cedilla' },
    { ch: 'È',  label: 'E grave' },  { ch: 'É',  label: 'E acute' },
    { ch: 'Ê',  label: 'E circ' },   { ch: 'Ë',  label: 'E umlaut' },
    { ch: 'Ì',  label: 'I grave' },  { ch: 'Í',  label: 'I acute' },
    { ch: 'Î',  label: 'I circ' },   { ch: 'Ï',  label: 'I umlaut' },
    { ch: 'Ñ',  label: 'N tilde' },  { ch: 'Ò',  label: 'O grave' },
    { ch: 'Ó',  label: 'O acute' },  { ch: 'Ô',  label: 'O circ' },
    { ch: 'Õ',  label: 'O tilde' },  { ch: 'Ö',  label: 'O umlaut' },
    { ch: 'Ø',  label: 'O slash' },  { ch: 'Ù',  label: 'U grave' },
    { ch: 'Ú',  label: 'U acute' },  { ch: 'Û',  label: 'U circ' },
    { ch: 'Ü',  label: 'U umlaut' }, { ch: 'Ý',  label: 'Y acute' },
    { ch: 'ß',  label: 'Sharp S' },  { ch: 'à',  label: 'a grave' },
    { ch: 'á',  label: 'a acute' },  { ch: 'â',  label: 'a circ' },
    { ch: 'ã',  label: 'a tilde' },  { ch: 'ä',  label: 'a umlaut' },
    { ch: 'å',  label: 'a ring' },   { ch: 'æ',  label: 'ae' },
    { ch: 'ç',  label: 'c cedilla' },{ ch: 'é',  label: 'e acute' },
    { ch: 'ñ',  label: 'n tilde' },  { ch: 'ö',  label: 'o umlaut' },
    { ch: 'ü',  label: 'u umlaut' },
  ],
};

export const SpecialCharsTool = {
  name: 'specialChars',
  ariaLabel: 'Insert special character',
  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 7V4h16v3"/>
          <path d="M9 20h6"/>
          <path d="M12 4v16"/>
          <text x="3" y="20" font-size="9" stroke="none"
                fill="currentColor" font-family="serif">Ω</text>
        </svg>`,

  _editor:     null,
  _btnEl:      null,
  _panel:      null,
  _savedRange: null,

  createButton(editor) {
    this._editor = editor;

    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'rte-tool-btn';
    btn.dataset.tool = this.name;
    btn.setAttribute('aria-label', this.ariaLabel);
    btn.setAttribute('title',      this.ariaLabel);
    btn.innerHTML = this.icon;
    this._btnEl   = btn;

    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const sel = window.getSelection();
      if (sel && sel.rangeCount) this._savedRange = sel.getRangeAt(0).cloneRange();
      this._panel ? this._closePanel() : this._openPanel(btn);
    });

    document.addEventListener('mousedown', (e) => {
      if (this._panel && !this._panel.contains(e.target) && e.target !== btn) {
        this._closePanel();
      }
    });

    return btn;
  },

  _openPanel(triggerBtn) {
    this._closePanel();
    const editor = this._editor;

    const panel = document.createElement('div');
    panel.className = 'rte-sc-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Special characters');

    // Header
    const header = document.createElement('div');
    header.className = 'rte-sc-header';
    const title = document.createElement('span');
    title.className = 'rte-sc-title';
    title.textContent = 'Special Characters';
    // Search
    const searchInput = document.createElement('input');
    searchInput.type        = 'text';
    searchInput.placeholder = 'Search…';
    searchInput.className   = 'rte-sc-search';
    searchInput.setAttribute('aria-label', 'Search characters');
    header.appendChild(title);
    header.appendChild(searchInput);
    panel.appendChild(header);

    // Preview bar
    const preview = document.createElement('div');
    preview.className = 'rte-sc-preview';
    const previewChar  = document.createElement('span');
    previewChar.className = 'rte-sc-preview-char';
    previewChar.textContent = ' ';
    const previewLabel = document.createElement('span');
    previewLabel.className = 'rte-sc-preview-label';
    previewLabel.textContent = 'Hover a character to preview';
    preview.appendChild(previewChar);
    preview.appendChild(previewLabel);
    panel.appendChild(preview);

    // Category tabs
    const tabs = document.createElement('div');
    tabs.className = 'rte-sc-tabs';
    const categories = Object.keys(CHAR_DATA);
    let activeCategory = categories[0];

    // Grid area
    const gridArea = document.createElement('div');
    gridArea.className = 'rte-sc-grid-area';

    const renderGrid = (items) => {
      gridArea.innerHTML = '';
      if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'rte-sc-empty';
        empty.textContent = 'No characters found';
        gridArea.appendChild(empty);
        return;
      }
      items.forEach(({ ch, label }) => {
        const btn = document.createElement('button');
        btn.type      = 'button';
        btn.className = 'rte-sc-char-btn';
        btn.textContent = ch;
        btn.setAttribute('title', label);
        btn.setAttribute('aria-label', `Insert ${label} (${ch})`);

        btn.addEventListener('mouseenter', () => {
          previewChar.textContent  = ch;
          previewLabel.textContent = label;
        });
        btn.addEventListener('mouseleave', () => {
          previewChar.textContent  = ' ';
          previewLabel.textContent = 'Hover a character to preview';
        });
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this._insert(ch);
          this._closePanel();
        });
        gridArea.appendChild(btn);
      });
    };

    categories.forEach((cat, i) => {
      const tab = document.createElement('button');
      tab.type      = 'button';
      tab.className = 'rte-sc-tab' + (i === 0 ? ' rte-sc-tab-active' : '');
      tab.textContent = cat;
      tab.addEventListener('mousedown', (e) => {
        e.preventDefault();
        activeCategory = cat;
        tabs.querySelectorAll('.rte-sc-tab').forEach(t => t.classList.remove('rte-sc-tab-active'));
        tab.classList.add('rte-sc-tab-active');
        searchInput.value = '';
        renderGrid(CHAR_DATA[cat]);
      });
      tabs.appendChild(tab);
    });

    panel.appendChild(tabs);
    panel.appendChild(gridArea);
    panel.appendChild(preview);
    renderGrid(CHAR_DATA[activeCategory]);

    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      if (!q) { renderGrid(CHAR_DATA[activeCategory]); return; }
      const all = Object.values(CHAR_DATA).flat();
      renderGrid(all.filter(({ ch, label }) =>
        label.toLowerCase().includes(q) || ch.includes(q)
      ));
    });

    // Position
    panel.style.visibility = 'hidden';
    editor.root.appendChild(panel);
    positionFloatingPanel(panel, triggerBtn, editor.root);
    panel.style.visibility = '';
    
    this._panel = panel;
    this._btnEl.setAttribute('aria-pressed', 'true');
    searchInput.focus();
  },

  _closePanel() {
    this._panel?.remove();
    this._panel = null;
    this._btnEl?.setAttribute('aria-pressed', 'false');
  },

  _insert(ch) {
    this._editor.contentArea.focus();
    if (this._savedRange) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(this._savedRange);
    }
    document.execCommand('insertText', false, ch);
    this._editor.emitChange();
  },

  updateState() {},
};