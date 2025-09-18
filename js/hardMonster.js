// hardMonster.js
// Page logic for the Hard Monster page: uses shared data/selection and fills a statsbox.

import { initShared, getGoalItem, notifyGoalGuessed } from './shared.js';

// Internal state: store the current goal's raw stats so we can reveal progressively
let __goalRaw = null;

// Render all stats into the 2x2 statsbox (used on win or when revisiting a won day)
function renderStats(mon) {
  try {
    const a = document.getElementById('statAttack');
    const d = document.getElementById('statDef');
    const h = document.getElementById('statHP');
    const ac = document.getElementById('statAcc');
    if (!a || !d || !h || !ac) return;
    const raw = mon?.raw || {};
    // The monster JSON uses keys: attack, def, health, accuracy (strings)
    a.textContent = raw.attack ?? '??';
    d.textContent = raw.def ?? raw.Def ?? '??';
    h.textContent = raw.health ?? raw.hp ?? '??';
    ac.textContent = raw.accuracy ?? raw.Accuracy ?? '??';
  } catch (e) { /* non-fatal */ }
}

// Apply progressive reveal based on guessCount.
// Thresholds: 0 -> DEF, 3 -> ATTACK, 6 -> HP, 9 -> ACCURACY
function applyReveal(guessCount) {
  try {
    // Ensure we have source stats
    if (!__goalRaw) {
      const gi = getGoalItem();
      __goalRaw = gi?.raw || __goalRaw;
    }
    const a = document.getElementById('statAttack');
    const d = document.getElementById('statDef');
    const h = document.getElementById('statHP');
    const ac = document.getElementById('statAcc');
    if (!a || !d || !h || !ac) return;
    const raw = __goalRaw || {};
    // Find parent stat cells for styling
    const aCell = a.closest('.stat');
    const dCell = d.closest('.stat');
    const hCell = h.closest('.stat');
    const acCell = ac.closest('.stat');

    // Always show DEF (page load)
    d.textContent = raw.def ?? raw.Def ?? '??';
    if (dCell) dCell.classList.remove('unrevealed');
    // Reveal ATTACK at >=3 guesses
    const aRev = guessCount >= 3;
    a.textContent = aRev ? (raw.attack ?? '??') : '??';
    if (aCell) aCell.classList.toggle('unrevealed', !aRev);
    // Reveal HP at >=6 guesses
    const hRev = guessCount >= 6;
    h.textContent = hRev ? (raw.health ?? raw.hp ?? '??') : '??';
    if (hCell) hCell.classList.toggle('unrevealed', !hRev);
    // Reveal ACCURACY at >=9 guesses
    const acRev = guessCount >= 9;
    ac.textContent = acRev ? (raw.accuracy ?? raw.Accuracy ?? '??') : '??';
    if (acCell) acCell.classList.toggle('unrevealed', !acRev);
    // DEF should never be marked unrevealed
    if (dCell) dCell.classList.remove('unrevealed');
    // Update reveal note at bottom of stats box
    try {
      const note = document.getElementById('statsNote');
      if (note) {
        const thresholds = [3, 6, 9];
        const next = thresholds.find(t => guessCount < t);
        if (next === undefined) {
          note.textContent = '';
          note.style.display = 'none';
          note.setAttribute('aria-hidden', 'true');
        } else {
          const remaining = Math.max(0, next - guessCount);
          note.textContent = `Stat revealed in ${remaining} ${remaining === 1 ? 'guess' : 'guesses'}`;
          note.style.display = '';
          note.removeAttribute('aria-hidden');
        }
      }
    } catch (e3) { /* non-fatal */ }
  } catch (e) { /* non-fatal */ }
}

// When the correct enemy is guessed, record win as 'monster' and show modal
function onCorrectGuess(e) {
  try {
    const item = e?.detail?.item || getGoalItem();
    renderStats(item);
    // Remove unrevealed styling on win
    try {
      document.querySelectorAll('.statsbox .stat').forEach(el => el.classList.remove('unrevealed'));
    } catch (e2) { /* non-fatal */ }
    // Hide note on win
    try {
      const note = document.getElementById('statsNote');
      if (note) { note.textContent = ''; note.style.display = 'none'; note.setAttribute('aria-hidden', 'true'); }
    } catch (e3) { /* non-fatal */ }
    // ensure modal shows as usual (shared will handle)
  } catch (err) { /* non-fatal */ }
}

document.addEventListener('guess:correct', onCorrectGuess);
// Update reveals as guesses increase
document.addEventListener('guess:updated', (e) => {
  const gc = Number(e?.detail?.guessCount) || 0;
  applyReveal(gc);
});

document.addEventListener('DOMContentLoaded', () => {
  // Initialize shared with monsters dataset; neutralize clue buttons for this page
  // Mark page as hard mode for shared detection
  try { if (document?.body) { document.body.dataset.hard = 'monster'; document.body.dataset.game = 'hard_monster'; } } catch (e) { /* non-fatal */ }

  const initP = initShared({
    dataUrl: '../json/idleon_monster.json',
    imageBase: '../images',
    clueUnlocks: { world: 999, category: 999 },
    seedOffset: 998,
    // Exclude flagged entries from dataset (raw.exclude === 'yes'|'true'|true)
    exclude: true,
    guessButtonHandlers: {
      // No clues for hardmonster page
      guessBtn1: () => {},
      guessBtn2: () => {},
    },
    onSelect: (it) => {
      // Compare selection with goal; if correct, notify and render
      try {
        const goal = getGoalItem();
        if (goal && it && it.name === goal.name) {
          notifyGoalGuessed(Object.assign({ _gameName: 'hard_monster' }, goal));
          renderStats(goal);
        }
      } catch (e) { /* non-fatal */ }
    }
  });

  // After init, capture the goal stats and apply initial reveal (DEF only).
  // Also handle case where the day is already won: the 'guess:correct' handler will render all.
  Promise.resolve(initP).then(() => {
    try {
      const gi = getGoalItem();
      if (gi) { __goalRaw = gi.raw || __goalRaw; }
    } catch (e) { /* non-fatal */ }
    try {
      const gc = (typeof window !== 'undefined' && typeof window.guessCount === 'number') ? window.guessCount : 0;
      applyReveal(gc || 0);
    } catch (e) { /* non-fatal */ }
  }).catch(() => {
    // fallback: try a delayed pass
    setTimeout(() => { try { applyReveal((window.guessCount||0)); } catch (e) {} }, 250);
  });
});
