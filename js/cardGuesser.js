// js/cardGuesser.js
import { initShared, getGoalItem } from './shared.js';

// Module-level reference to the daily image so setCardBlur can operate before/after init
let _dailyImg = null;
// Track current blur percent so event-driven updates can decrement it
let _currentBlurPercent = null;

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
    _dailyImg.style.filter = `blur(${px}px)`;
  } catch (e) { console.warn('setCardBlur failed', e); }
}

export async function initCardGuesser(options = {}) {
  await initShared(Object.assign({ dataUrl: '../json/idleon_cards.json', imageBase: '../images' }, options));
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

  // Start blurred at 70% as requested and keep local state
  _currentBlurPercent = 80;
  setCardBlur(_currentBlurPercent);

  // Listen for guess events from shared.js and decrement blur by 5% per guess
  try {
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('guess:updated', (e) => {
        try {
          // Each guess reduces blur by 5% (clamped to 0)
          _currentBlurPercent = Math.max(0, (_currentBlurPercent || 0) - 10);
          setCardBlur(_currentBlurPercent);
        } catch (err) { /* non-fatal */ }
      });
      // When the guess is correct, immediately unblur the image and keep it unblurred
      document.addEventListener('guess:correct', (e) => {
        try {
          _currentBlurPercent = 0;
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
