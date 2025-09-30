import { initShared, getGoalItem } from './shared.js';

// Initializes the monster guesser module
export async function initMonsterGuesser(options = {}) {
  // NOTE: JSON file in repo is named `idleon_monster.json` (singular)
  await initShared(Object.assign({ dataUrl: '../json/idleon_monster.json', imageBase: '../images' }, options));

  // Twemoji configuration to use jsDelivr for assets (matches the script CDN)
  const TWEMOJI_OPTS = { base: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/', folder: 'svg', ext: '.svg' };

  // Render the emojibox using the current goal's emoji1 and placeholders for emoji2/3.
  try {
    const goal = getGoalItem();
    const box = document.getElementById('emojibox');
    if (!box) return;
    // Build slots similar to spice silhouettes: first slot shows first emoji, others hidden behind '?'
    const e1 = (goal && goal.raw && goal.raw.emoji1) ? String(goal.raw.emoji1) : '❓';
    const slotWrap = document.createElement('div');
    slotWrap.className = 'emoji-row';
    box.innerHTML = '';

    function makeSlot(index, content, revealed) {
      const slot = document.createElement('div');
      slot.className = 'emoji-slot' + (revealed ? ' revealed' : ' hidden-initial');
      slot.dataset.index = String(index);
      const inner = document.createElement('div');
      inner.className = 'emoji-inner emoji-tile';
      inner.textContent = content;
      inner.setAttribute('aria-label', 'emoji ' + index);
      const q = document.createElement('span');
      q.className = 'emoji-q';
      q.textContent = '?';
      slot.appendChild(inner);
      slot.appendChild(q);
      if (revealed) { q.style.display = 'none'; }
      return slot;
    }

    const slot1 = makeSlot(1, e1, true);
    const slot2 = makeSlot(2, '', false);
    const slot3 = makeSlot(3, '', false);
    const slot4 = makeSlot(4, '', false);
    slotWrap.appendChild(slot1);
    slotWrap.appendChild(slot2);
    slotWrap.appendChild(slot3);
    slotWrap.appendChild(slot4);
    box.appendChild(slotWrap);

    // Ensure there is a note element placed inside the emojibox (as a child)
    let note = document.getElementById('emojiNote');
    if (!note) {
      note = document.createElement('div');
      note.id = 'emojiNote';
      note.className = 'emoji-note';
      note.textContent = 'Emoji revealed in 2 guesses';
      // append into the emojibox so it appears below the emoji tiles but still inside the box
      box.appendChild(note);
    } else if (note.parentNode !== box) {
      // if an existing note was placed elsewhere, move it into the box for consistent layout
      box.appendChild(note);
    }

    // Helper to reveal nth emoji from goal raw fields
    const reveal = (n) => {
      const slot = box.querySelector(`.emoji-slot[data-index="${n}"]`);
      if (!slot) return;
      const inner = slot.querySelector('.emoji-inner');
      if (!inner) return;
      const key = `emoji${n}`;
      const val = goal && goal.raw ? (goal.raw[key] || '') : '';
      inner.textContent = val || '';
      slot.classList.add('revealed');
      slot.classList.remove('hidden-initial');
      const q = slot.querySelector('.emoji-q');
      if (q) q.style.display = 'none';
  try { if (window.twemoji && typeof window.twemoji.parse === 'function') window.twemoji.parse(inner, TWEMOJI_OPTS); } catch (e) { /* non-fatal */ }
    };

    const updateNote = (count) => {
      if (!note) return;
      if (count >= 6) { note.style.display = 'none'; return; }
      note.style.display = '';
      // Reveal schedule: every 2 guesses. Remaining reveals at 2,4,6 -> total 3 more reveals
      const nextRevealAt = [2,4,6].find(n => count < n);
      if (nextRevealAt === undefined) {
        note.textContent = `Emoji revealed in 0 guesses`;
      } else {
        const rem = nextRevealAt - count;
        note.textContent = `Next emoji revealed in ${rem} guesses`;
      }
    };

    // Listen for shared guess updates. detail.guessCount is provided by shared.js
    try {
      document.addEventListener('guess:updated', (e) => {
        try {
          const count = (e && e.detail && typeof e.detail.guessCount === 'number') ? e.detail.guessCount : 0;
          // Reveal 2nd emoji at 2 guesses, 3rd at 4, 4th at 6
          if (count >= 2) reveal(2);
          if (count >= 4) reveal(3);
          if (count >= 6) reveal(4);
          updateNote(count);
        } catch (err) { /* non-fatal */ }
      });
      // When correct, reveal all
      document.addEventListener('guess:correct', () => { reveal(2); reveal(3); reveal(4); if (note) note.style.display = 'none';
        // parse the whole emojibox so all emoji are replaced with Twemoji images
  try { if (window.twemoji && typeof window.twemoji.parse === 'function') window.twemoji.parse(box, TWEMOJI_OPTS); } catch (e) { /* non-fatal */ }
      });
    } catch (e) { /* non-fatal */ }
  } catch (e) { console.warn('Failed to render emojibox', e); }

  // If twemoji is available, parse the initial emojibox so emoji render consistently across systems
  try { if (window.twemoji && typeof window.twemoji.parse === 'function') window.twemoji.parse(document.getElementById('emojibox') || document.body, TWEMOJI_OPTS); } catch (e) { /* non-fatal */ }
}

// Auto-init when imported directly from the page (mirrors cardGuesser.js behavior)
if (typeof window !== 'undefined') {
  initMonsterGuesser().catch(e => console.error('MonsterGuesser init failed', e));
  // expose for debugging if desired
  window.monsterGuesser = window.monsterGuesser || {};
  window.monsterGuesser.init = initMonsterGuesser;
}

export default { initMonsterGuesser };