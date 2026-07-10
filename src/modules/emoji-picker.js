/**
 * Emoji Picker Tool — emoji-picker.js
 * ════════════════════════════════════
 * Grid picker organised by category. Inserts the unicode
 * character at the current cursor position in the editor.
 *
 * Follows the same module contract as all other RTE tools:
 *   { name, icon, ariaLabel, createButton(editor), updateState(btnEl) }
 */
import { positionFloatingPanel } from './panel-position.js';

const EMOJI_DATA = {
  'Smileys': [
    '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊',
    '😋','😎','😍','🥰','😘','😗','😙','😚','🙂','🤗',
    '🤔','😐','😑','😶','🙄','😏','😣','😥','😮','🤐',
    '😯','😪','😫','🥱','😴','😌','😛','😜','😝','🤤',
    '😒','😓','😔','😕','🙃','🤑','😲','🙁','😖','😞',
    '😟','😤','😢','😭','😦','😧','😨','😩','🤯','😬',
    '😰','😱','🥵','🥶','😳','🤪','😵','🤠','🥳','😷',
  ],
  'Gestures': [
    '👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞',
    '🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍',
    '👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝',
    '🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂',
  ],
  'Animals': [
    '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯',
    '🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧',
    '🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄',
    '🐝','🐛','🦋','🐌','🐞','🐜','🦗','🕷','🦂','🐢',
  ],
  'Food': [
    '🍎','🍊','🍋','🍇','🍓','🍒','🍑','🥝','🍅','🥑',
    '🥦','🥕','🌽','🍄','🥜','🍞','🥐','🧀','🥚','🍳',
    '🥞','🧇','🥓','🍖','🍗','🌮','🌯','🥙','🧆','🥚',
    '🍔','🍟','🍕','🌭','🥪','🍜','🍝','🍛','🍣','🍱',
  ],
  'Travel': [
    '🚗','🚕','🚙','🚌','🚎','🏎','🚓','🚑','🚒','🚐',
    '🛻','🚚','🚛','🚜','🏍','🛵','🚲','🛺','🚁','🛸',
    '🚀','✈️','🛩','🛫','🛬','🪂','⛵','🚤','🛥','🛳',
    '🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪',
  ],
  'Symbols': [
    '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔',
    '💯','💢','💥','💫','💦','💨','🕳','💬','💭','🗯',
    '♠️','♥️','♦️','♣️','🃏','🎴','🀄','🎲','♟','🎯',
    '🔔','🔕','🎵','🎶','⚠️','☢️','☣️','✅','❌','❓',
  ],
};

export const EmojiPickerTool = {
  name: 'emojiPicker',
  ariaLabel: 'Insert emoji',
  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M8 13s1.5 2 4 2 4-2 4-2"/>
          <line x1="9" y1="9" x2="9.01" y2="9"/>
          <line x1="15" y1="9" x2="15.01" y2="9"/>
        </svg>`,

  _editor:      null,
  _btnEl:       null,
  _panel:       null,
  _savedRange:  null,

  // ── createButton ────────────────────────────────────────────────
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
      // Save selection before the panel steals focus
      const sel = window.getSelection();
      if (sel && sel.rangeCount) this._savedRange = sel.getRangeAt(0).cloneRange();
      this._panel ? this._closePanel() : this._openPanel(btn);
    });

    // Close on outside click
    document.addEventListener('mousedown', (e) => {
      if (this._panel && !this._panel.contains(e.target) && e.target !== btn) {
        this._closePanel();
      }
    });

    return btn;
  },

  // ── Panel ────────────────────────────────────────────────────────
  _openPanel(triggerBtn) {
    this._closePanel();

    const panel = document.createElement('div');
    panel.className = 'rte-emoji-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Emoji picker');

    // Search box
    const searchWrap = document.createElement('div');
    searchWrap.className = 'rte-emoji-search-wrap';
    const searchInput = document.createElement('input');
    searchInput.type        = 'text';
    searchInput.placeholder = 'Search emoji…';
    searchInput.className   = 'rte-emoji-search';
    searchInput.setAttribute('aria-label', 'Search emoji');
    searchWrap.appendChild(searchInput);
    panel.appendChild(searchWrap);

    // Category tabs
    const tabs = document.createElement('div');
    tabs.className = 'rte-emoji-tabs';
    const categories = Object.keys(EMOJI_DATA);
    let activeCategory = categories[0];

    // Grid area
    const gridArea = document.createElement('div');
    gridArea.className = 'rte-emoji-grid-area';

    const renderGrid = (emojis) => {
      gridArea.innerHTML = '';
      if (emojis.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'rte-emoji-empty';
        empty.textContent = 'No emoji found';
        gridArea.appendChild(empty);
        return;
      }
      emojis.forEach(emoji => {
        const btn = document.createElement('button');
        btn.type      = 'button';
        btn.className = 'rte-emoji-btn';
        btn.textContent = emoji;
        btn.setAttribute('title', emoji);
        btn.setAttribute('aria-label', `Insert ${emoji}`);
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this._insert(emoji);
          this._closePanel();
        });
        gridArea.appendChild(btn);
      });
    };

    categories.forEach((cat, i) => {
      const tab = document.createElement('button');
      tab.type      = 'button';
      tab.className = 'rte-emoji-tab' + (i === 0 ? ' rte-emoji-tab-active' : '');
      tab.textContent = cat;
      tab.setAttribute('aria-label', cat);
      tab.addEventListener('mousedown', (e) => {
        e.preventDefault();
        activeCategory = cat;
        tabs.querySelectorAll('.rte-emoji-tab').forEach(t => t.classList.remove('rte-emoji-tab-active'));
        tab.classList.add('rte-emoji-tab-active');
        searchInput.value = '';
        renderGrid(EMOJI_DATA[cat]);
      });
      tabs.appendChild(tab);
    });

    panel.appendChild(tabs);
    panel.appendChild(gridArea);
    renderGrid(EMOJI_DATA[activeCategory]);

    // Search
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      if (!q) { renderGrid(EMOJI_DATA[activeCategory]); return; }
      const all = Object.values(EMOJI_DATA).flat();
      renderGrid(all.filter(e => e.includes(q)));
    });

    // Position
    const editor = this._editor;  
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

  // ── Insert emoji at saved cursor position ───────────────────────
  _insert(emoji) {
    const editor = this._editor;
    editor.contentArea.focus();

    if (this._savedRange) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(this._savedRange);
    }

    document.execCommand('insertText', false, emoji);
    editor.emitChange();
  },

  updateState() {}, // no active state needed
};