import { initShared, getGoalItem } from './shared.js';

// Initializes the monster guesser module
export async function initMonsterGuesser(options = {}) {
  // NOTE: JSON file in repo is named `idleon_monster.json` (singular)
  await initShared(Object.assign({ dataUrl: '../json/idleon_monster.json', imageBase: '../images' }, options));

  // Render the emojibox using the current goal's emoji1 and placeholders for emoji2/3.
  try {
    const goal = getGoalItem();
    const box = document.getElementById('emojibox');
    if (!box) return;
    // Replace existing contents with a row of emoji tiles, so the note can sit below them.
    const e1 = (goal && goal.raw && goal.raw.emoji1) ? String(goal.raw.emoji1) : '❓';
    const placeholder = '?';
    box.innerHTML = `
      <div class="emoji-row">
        <div class="emoji-tile" data-index="1">${e1}</div>
        <div class="emoji-tile locked" data-index="2">${placeholder}</div>
        <div class="emoji-tile locked" data-index="3">${placeholder}</div>
      </div>
    `;

    // Ensure there is a note element placed inside the emojibox (as a child)
    let note = document.getElementById('emojiNote');
    if (!note) {
      note = document.createElement('div');
      note.id = 'emojiNote';
      note.className = 'emoji-note';
      note.textContent = 'Emoji revealed in 3 guesses';
      // append into the emojibox so it appears below the emoji tiles but still inside the box
      box.appendChild(note);
    } else if (note.parentNode !== box) {
      // if an existing note was placed elsewhere, move it into the box for consistent layout
      box.appendChild(note);
    }

    // Helper to reveal nth emoji from goal raw fields
    const reveal = (n) => {
      const tile = box.querySelector(`.emoji-tile[data-index="${n}"]`);
      if (!tile) return;
      const key = `emoji${n}`;
      const val = goal && goal.raw ? (goal.raw[key] || '') : '';
      tile.textContent = val || '';
      tile.classList.remove('locked');
      // If twemoji is available, parse only this tile (or the emojibox) to replace with images
      try { if (window.twemoji && typeof window.twemoji.parse === 'function') window.twemoji.parse(tile, { folder: 'svg', ext: '.svg' }); } catch (e) { /* non-fatal */ }
    };

    const updateNote = (count) => {
      if (!note) return;
      if (count >= 6) { note.style.display = 'none'; return; }
      note.style.display = '';
      if (count >= 3) {
        const rem = Math.max(0, 6 - count);
        note.textContent = `Emoji revealed in ${rem} guesses`;
        return;
      }
      // count < 3
      const rem = Math.max(0, 3 - count);
      note.textContent = `Emoji revealed in ${rem} guesses`;
    };

    // Listen for shared guess updates. detail.guessCount is provided by shared.js
    try {
      document.addEventListener('guess:updated', (e) => {
        try {
          const count = (e && e.detail && typeof e.detail.guessCount === 'number') ? e.detail.guessCount : 0;
          if (count >= 3) reveal(2);
          if (count >= 6) reveal(3);
          updateNote(count);
        } catch (err) { /* non-fatal */ }
      });
      // When correct, reveal all
      document.addEventListener('guess:correct', () => { reveal(2); reveal(3); if (note) note.style.display = 'none';
        // parse the whole emojibox so all emoji are replaced with Twemoji images
        try { if (window.twemoji && typeof window.twemoji.parse === 'function') window.twemoji.parse(box, { folder: 'svg', ext: '.svg' }); } catch (e) { /* non-fatal */ }
      });
    } catch (e) { /* non-fatal */ }
  } catch (e) { console.warn('Failed to render emojibox', e); }

  // If twemoji is available, parse the initial emojibox so emoji render consistently across systems
  try { if (window.twemoji && typeof window.twemoji.parse === 'function') window.twemoji.parse(document.getElementById('emojibox') || document.body, { folder: 'svg', ext: '.svg' }); } catch (e) { /* non-fatal */ }
}

// Auto-init when imported directly from the page (mirrors cardGuesser.js behavior)
if (typeof window !== 'undefined') {
  initMonsterGuesser().catch(e => console.error('MonsterGuesser init failed', e));
  // expose for debugging if desired
  window.monsterGuesser = window.monsterGuesser || {};
  window.monsterGuesser.init = initMonsterGuesser;
}

export default { initMonsterGuesser };