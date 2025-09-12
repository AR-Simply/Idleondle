// js/cardGuesser.js
import { initShared, getGoalItem } from './shared.js';

// Module-level reference to the daily image so setCardBlur can operate before/after init
let _dailyImg = null;
// Track current blur percent so event-driven updates can decrement it
let _currentBlurPercent = null;
// Whether the color clue has been used/unlocked. While false the image stays grayscale.
let _colorUnlocked = false;

function percentToPx(p) {
  const n = Number(p) || 0;
  const clamped = Math.max(0, Math.min(100, n));
  return (clamped / 100) * 40; // 40px max blur
}

export function setCardBlur(percent) {
  try {
    if (!_dailyImg) { console.warn('daily image not ready yet'); return; }
  const pct = Number(percent) || 0;
  _currentBlurPercent = Math.max(0, Math.min(100, pct));
  const px = percentToPx(_currentBlurPercent);
    _dailyImg.style.transition = 'filter 320ms ease';
    // Preserve grayscale until color clue is unlocked/used
    const filterVal = _colorUnlocked ? `blur(${px}px)` : `grayscale(100%) blur(${px}px)`;
    _dailyImg.style.filter = filterVal;
  } catch (e) { console.warn('setCardBlur failed', e); }
}

export async function initCardGuesser(options = {}) {
  // Detect whether this page should start in "hard" mode (keep grayscale)
  const _isHardPage = (typeof location !== 'undefined' && (((location.pathname || '').toLowerCase().includes('hardcardguesser')) || ((location.href || '').toLowerCase().includes('hardcardguesser'))))
    || (typeof document !== 'undefined' && (document.body?.dataset?.hard === 'true' || !!document.querySelector('[data-hard]')));
  // For normal cardGuesser pages, show color by default. For hard pages, keep grayscale locked.
  _colorUnlocked = !_isHardPage;
  // Per-page configuration: how many guesses until color unlock and how much blur reduces per guess
  const colorUnlockThreshold = _isHardPage ? 7 : 3;
  // Hard mode reduces blur more slowly (6% per guess) while normal is faster (10% per guess)
  const percentPerGuess = _isHardPage ? 5 : 10;
  // Ensure the category clue requires 4 guesses on the normal cardGuesser page by default.
  // Allow pages to override via options.clueUnlocks passed into initCardGuesser or initShared.
  const sharedInitConfig = Object.assign({
    dataUrl: '../json/idleon_cards.json',
    imageBase: '../images',
    clueUnlocks: Object.assign({}, (options && options.clueUnlocks) || {}, { category: _isHardPage ? 6 : 4 })
  }, options || {});
  await initShared(sharedInitConfig);
  // Render the daily card prominently below the combo (search input + dropdown)
  try {
    const goal = getGoalItem();
    const container = document.createElement('div');
    container.id = 'dailyCard';
    container.className = 'daily-card';

    const img = document.createElement('img');
    img.className = 'daily-card-img';
    img.alt = goal?.name || 'Daily card';
    img.src = goal?.icon || ('../images/icon.png');
    img.onerror = () => { img.src = '../images/icon.png'; };

    // Only render the large image; caption/label removed per UI request
  container.appendChild(img);

  // Add a transparent overlay above the image so users can't directly interact
  // with or view the unblurred image via context menu / drag. This overlay
  // sits above the img (which will receive CSS blur) and itself is not blurred.
  const overlay = document.createElement('div');
  overlay.className = 'daily-card-overlay';
  // Prevent context menu on the overlay to avoid "open image in new tab" cheat
  overlay.addEventListener('contextmenu', (ev) => { ev.preventDefault(); });
  // Prevent dragging the underlying image via pointer events
  overlay.addEventListener('dragstart', (ev) => { ev.preventDefault(); });
  container.appendChild(overlay);

  // remember image for module-level control and expose on window for convenience
  _dailyImg = img;

  // Apply initial filter to the image (grayscale if color not unlocked)
  try {
    const initialPx = percentToPx(_currentBlurPercent);
    _dailyImg.style.filter = _colorUnlocked ? `blur(${initialPx}px)` : `grayscale(100%) blur(${initialPx}px)`;
    _dailyImg.style.transition = 'filter 320ms ease';
  } catch (e) { /* non-fatal */ }

  // Color button handling (a button is inserted in the page HTML)
  const colorBtn = document.getElementById('colorBtn');
  function setColorLocked(locked) {
    try {
      if (!colorBtn) return;
      // Remember previous locked state for transition detection
      const prevLocked = (typeof colorBtn.__prevLocked === 'boolean') ? colorBtn.__prevLocked : !!(colorBtn.disabled || colorBtn.classList.contains('locked'));
      colorBtn.disabled = locked;
      if (locked) {
        colorBtn.classList.remove('unlocked-outline');
        colorBtn.textContent = 'Color Clue';
        try { const n = document.getElementById('noteColor'); if (n) n.textContent = locked ? `${colorUnlockThreshold} guesses left` : ''; } catch (e) {}
      } else {
        colorBtn.classList.add('unlocked-outline');
        // keep label until clicked
        colorBtn.textContent = 'Color Clue';
  try { const n = document.getElementById('noteColor'); if (n) n.textContent = `0 guesses left`; } catch (e) {}
      }
      // store current locked state for future comparisons
      try { colorBtn.__prevLocked = !!locked; } catch (e) {}
      return prevLocked;
    } catch (e) {}
  }
  // start locked state depends on whether color is already unlocked
  setColorLocked(!_colorUnlocked);

  // Clicking the button removes grayscale and updates label
  if (colorBtn) colorBtn.addEventListener('click', () => {
    try {
      if (colorBtn.disabled) return;
      // reveal color and preserve current blur
      _colorUnlocked = true;
      setCardBlur(_currentBlurPercent || 0);
      colorBtn.textContent = 'Colors!';
      colorBtn.classList.remove('unlocked-outline');
    } catch (e) { console.warn('colorBtn click failed', e); }
  });

  // Start blurred at 70% as requested and keep local state
  _currentBlurPercent = 80;
  setCardBlur(_currentBlurPercent);

  // Listen for guess events from shared.js and decrement blur by 5% per guess
  try {
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('guess:updated', (e) => {
        try {
          // Each guess reduces blur by a configurable percent (clamped to 0)
          _currentBlurPercent = Math.max(0, (_currentBlurPercent || 0) - percentPerGuess);
          setCardBlur(_currentBlurPercent);
          // Unlock color clue after the configured threshold (e.g., 3 normal, 7 hard)
          try {
            const count = (e && e.detail && typeof e.detail.guessCount === 'number') ? e.detail.guessCount : null;
            // If detail not provided, derive from global exposed by shared.js
            const globalCount = (typeof window !== 'undefined' && typeof window.guessCount === 'number') ? window.guessCount : null;
            const guessNum = count !== null ? count : (globalCount !== null ? globalCount : null);
            // fallback: if unable to determine, do nothing
            if (guessNum !== null && !_colorUnlocked) {
              if (guessNum >= colorUnlockThreshold) {
                // Only announce unlock when transitioning from locked -> unlocked
                let wasLocked = true;
                try { wasLocked = (typeof colorBtn !== 'undefined' && colorBtn) ? !!colorBtn.__prevLocked : true; } catch (e) {}
                setColorLocked(false);
                if (wasLocked) {
                  try { if (typeof window !== 'undefined' && typeof window.showToast === 'function') showToast('Clue unlocked: Color', { timeout: 3000 }); } catch (e) {}
                }
                // update unlock note to show it's available
                try { const n = document.getElementById('noteColor'); if (n) n.textContent = ''; } catch (e) {}
                // when user clicks the color button, clear outline and note
                try {
                  if (colorBtn) {
                    const _clear = function _clearColorNote() { try { colorBtn.classList.remove('unlocked-outline'); const n = document.getElementById('noteColor'); if (n) n.textContent = ''; colorBtn.removeEventListener('click', _clear); } catch (e) {} };
                    colorBtn.addEventListener('click', _clear);
                  }
                } catch (e) {}
                } else {
                // show remaining count (never negative)
                try {
                  const n = document.getElementById('noteColor');
                  if (n) {
                    const remaining = Math.max(0, Number(colorUnlockThreshold) - Number(guessNum));
                    n.textContent = `${remaining} ${remaining === 1 ? 'guess' : 'guesses'} left`;
                  }
                } catch (e) {}
              }
            }
          } catch (ee) {}
        } catch (err) { /* non-fatal */ }
      });
      // When the guess is correct, immediately unblur the image and keep it unblurred
      document.addEventListener('guess:correct', (e) => {
        try {
          _currentBlurPercent = 0;
          // reveal color when the guess is correct
          _colorUnlocked = true;
          setCardBlur(0);
        } catch (err) { /* non-fatal */ }
      });
    }
  } catch (e) { /* non-fatal */ }

  // Insert after the combo (so it appears below the input and dropdown)
  const combo = document.getElementById('combo');
  if (combo && combo.parentNode) combo.parentNode.insertBefore(container, combo.nextSibling);
  } catch (e) { console.warn('Failed to render daily card', e); }
}

// Auto-init when imported directly from the page
if (typeof window !== 'undefined') {
  // allow pages to import and call manually; but also auto-start for simplicity
  initCardGuesser().catch(e => console.error('CardGuesser init failed', e));
  // expose helpers for console/debug ease (both camelCase and lowercase)
  window.cardGuesser = window.cardGuesser || {};
  window.cardGuesser.setCardBlur = setCardBlur;
  window.cardGuesser.setcardblur = setCardBlur;
  window.setCardBlur = setCardBlur;
  window.setcardblur = setCardBlur;
}

export default { initCardGuesser, setCardBlur };
