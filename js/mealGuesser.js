// mealGuesser.js
// Daily Meal guessing page logic. Reuses shared.js helpers (initShared, notifyGoalGuessed, etc.)
// Creates/updates per-game cookie: idleondle_win_meal and idleondle_last_win handled by shared.js recordWin().

import { initShared, notifyGoalGuessed, getDailyDeterministicIndex, getGoalItem, setGoalItem } from './shared.js';

// Configuration:
// - Dropdown suggestions come from SPICES (`idleon_spices.json`).
// - The actual daily goal to guess is a MEAL chosen deterministically from `idleon_meals.json`.
// - Cookies still record wins under the logical game id 'meal'.
// We therefore load a second dataset (meals) purely to override the goal item after initShared finishes.

// Utility to safely access nested properties
function safeLower(s){ try { return String(s||'').normalize('NFC').toLocaleLowerCase('en'); } catch(e){ return String(s||'').toLowerCase(); } }

// Seed offset so meal daily sequence is different from items/cards.
const SEED_OFFSET = 0; // Use same seed behavior as other games (no additional offset)

// Paths
const MEALS_JSON = '../json/idleon_meals.json';
const SPICES_JSON = '../json/idleon_spices.json';

// Internal cache of meals flattened to { name, icon, raw }
let _meals = [];
// Internal map of spice name -> { name, icon, raw }
let _spiceMap = Object.create(null);
// Game state for spice guessing
let _requiredSpices = [];
let _revealedSpices = new Set();
let _spiceImgMap = Object.create(null); // name -> <img>
let _mealWinFired = false;
let _guessCount = 0; // counts total user guesses until win (used for silhouette progression)
let _spiceSlotMap = Object.create(null); // name -> slot wrapper div

// How many wrong guesses to reach a full reveal (configurable)
const MEAL_REVEAL_GUESSES = 5;

// Update the meal silhouette image based on current guess progress.
// Each wrong guess removes some of the black silhouette effect; when fully
// guessed (or _mealWinFired) the image is shown in full color.
function updateMealImageReveal() {
	try {
		const img = document.getElementById('mealGoalSilhouette');
		if (!img) return;
		// If we've already won, show full color
		if (_mealWinFired) {
			img.style.filter = 'none';
			img.style.opacity = '1';
			img.classList.add('revealed');
			return;
		}
		const f = Math.min(_guessCount / MEAL_REVEAL_GUESSES, 1);
		// Map fraction to CSS filter values
		const grayscale = Math.round((1 - f) * 100); // percent
		// brightness as a number: avoid zero so tiny reveal is visible
		const brightness = (0.08 + (0.92 * f)).toFixed(3);
		const saturate = (0.5 + (1.5 * f)).toFixed(3);
		img.style.filter = `grayscale(${grayscale}%) brightness(${brightness}) saturate(${saturate})`;
		img.style.opacity = `${0.7 + 0.3 * f}`;
	} catch (e) { /* non-fatal */ }
}

// Reveal spice silhouettes progressively: first spice visible from start, then one new outline every 2 guesses
function updateSpiceOutlineProgress() {
	try {
		if (!_requiredSpices.length) return;
		const total = _requiredSpices.length;
		const visibleSilhouettes = Math.min(1 + Math.floor(_guessCount / 2), total);
		_requiredSpices.forEach((name, idx) => {
			const img = _spiceImgMap[name];
			const slot = _spiceSlotMap[name] || (img ? img.parentNode : null);
			if (!img || !slot) return;
			const q = slot.querySelector('.spice-q');
			if (_revealedSpices.has(name)) {
				slot.style.display = 'inline-flex';
				img.style.filter = 'none';
				img.style.opacity = '1';
				img.style.display = 'inline-block';
				if (q) q.style.display = 'none';
				if (!img.alt && img.dataset.originalName) {
					img.alt = img.dataset.originalName;
					img.title = img.dataset.originalName;
				}
			} else {
				if (idx < visibleSilhouettes) {
					// Silhouette unlocked: show full-color image, hide '?'
					slot.style.display = 'inline-flex';
					img.style.display = 'inline-block';
					img.style.filter = 'none';
					img.style.opacity = '1';
					if (q) q.style.display = 'none';
				} else {
					// Locked: hide image completely, show '?'
					slot.style.display = 'inline-flex';
					img.style.display = 'none';
					if (q) q.style.display = 'block';
				}
			}
		});
		// Progress note element
		let note = document.getElementById('mealSpiceProgress');
		const spiceBox = document.getElementById('mealSpiceBox');
		if (!note && spiceBox) {
			note = document.createElement('div');
			note.id = 'mealSpiceProgress';
			note.style.width = '100%';
			note.style.textAlign = 'center';
			note.style.fontSize = '15px';
			note.style.fontWeight = '600';
			note.style.letterSpacing = '0.4px';
			note.style.marginTop = '4px';
			note.style.opacity = '0.9';
			note.style.color = '#fff';
			spiceBox.appendChild(note);
		}
		if (note) {
			const currentVisible = Math.min(visibleSilhouettes, total);
			if (_revealedSpices.size === total || currentVisible === total) {
				// Hide the note entirely when everything is visible or revealed
				note.style.display = 'none';
			} else {
				note.style.display = 'block';
				const nextRevealAt = currentVisible * 2; // guess count when next silhouette appears
				const remaining = Math.max(0, nextRevealAt - _guessCount);
				note.textContent = `Spice revealed in ${remaining} guess${remaining === 1 ? '' : 'es'}`;
			}
		}
	} catch(e){ /* non-fatal */ }
}

async function loadMeals() {
	try {
		const res = await fetch(MEALS_JSON, { cache: 'no-store' });
		if (!res.ok) throw new Error('Failed meals.json ' + res.status);
		const json = await res.json();
		const mealsNode = json.Meals || json.meals || json;
		const out = [];
		for (const [name, obj] of Object.entries(mealsNode)) {
			if (!name || !obj) continue;
			const icon = obj.icon || obj.Icon || obj.image;
			if (!icon) continue;
			out.push({ name: String(name), icon: resolveIconRelative(icon), raw: obj });
		}
		_meals = out;
	} catch (e) { console.warn('MealGuesser: could not load meals JSON', e); }
}

// Load spices JSON (for icon mapping when rendering required spices panel)
async function loadSpices() {
    try {
        const res = await fetch(SPICES_JSON, { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed spices.json ' + res.status);
        const json = await res.json();
        const node = json.Spices || json.spices || json;
        for (const [name, obj] of Object.entries(node)) {
            if (!name || !obj) continue;
            const icon = obj.icon || obj.Icon || obj.image;
            if (!icon) continue;
            _spiceMap[name] = { name, icon: resolveIconRelative(icon), raw: obj };
        }
    } catch (e) { console.warn('MealGuesser: could not load spices JSON (icons)', e); }
}

// Resolve icons inside meals file (icons are relative, we assume they belong under images/meals or provided raw)
function resolveIconRelative(p){
	// Also normalise Windows style backslashes to forward slashes for web paths
	const cleaned = String(p||'')
		.replace(/^\.\/?/, '')
		.replace(/\\\\/g,'/')
		.replace(/\\/g,'/');
	// If the path already looks like an images path keep as-is, else prefix with ../images/ if not already
	if (/^https?:/i.test(cleaned)) return cleaned;
	if (cleaned.startsWith('../')) return cleaned;
	if (cleaned.startsWith('images/')) return '../' + cleaned;
	return '../images/' + cleaned; // fallback
}



// After selection, check if guessed meal is goal and show modal (shared handles cookie recording)
function onSelectMeal(it){
	try {
		if (!it) return;
		// Increment guess counter for any guess that isn't an immediate win (we will
		// decrement or mark win below when appropriate). This powers the progressive reveal.
		if (!_mealWinFired) { _guessCount++; }
		// Update meal image reveal state on any guess
		try { updateMealImageReveal(); } catch(e) {}
		// Tag item with friendly game name so shared.js records correct cookie
		it._gameName = 'meal';
		const goal = window.getGoalItem ? window.getGoalItem() : null;
		// If selection looks like an effect-only entry (we passed effect text as items)
		const isEffectGuess = !!(it && (!it.icon || String(it.icon||'').trim() === ''));

		// If player guesses the meal name directly, count that as immediate win
		if (goal && goal.name === it.name) {
			// Correct full meal guess: reward by decrementing guess counter
			if (_guessCount > 0) _guessCount = Math.max(0, _guessCount - 1);
			if (!_mealWinFired) {
				_mealWinFired = true;
				// Reveal all spices immediately (same logic as cookie auto-win)
				try {
					_requiredSpices.forEach(name => {
						const img = _spiceImgMap[name];
						if (img) {
							img.style.filter = 'none';
							img.style.opacity = '1';
							img.style.display = 'inline-block';
							if (!img.alt && img.dataset.originalName) {
								img.alt = img.dataset.originalName;
								img.title = img.dataset.originalName;
							}
							try { const slot = img.parentNode; const q = slot?.querySelector('.spice-q'); if (q) q.style.display='none'; } catch(e){}
						}
					});
					_revealedSpices = new Set(_requiredSpices);
					updateSpiceOutlineProgress();
				} catch(e){}
				notifyGoalGuessed(it);
				// Reveal meal image fully
				try { updateMealImageReveal(); } catch(e) {}
			}
			// Remove spice overlay if present (direct meal guess win)
			try { const ov = document.getElementById('mealSpiceOverlay'); if (ov) ov.remove(); } catch(e){}
			return;
		}
		// If this selection is an effect guess (text-only), treat it specially
		if (isEffectGuess && goal) {
			const goalEffect = String(goal?.raw?.effect || goal?.raw?.Effect || '').trim();
			const guessEffect = String(it.name || '').trim();
				if (guessEffect && goalEffect && guessEffect === goalEffect) {
				// Correct effect guessed: register win
				if (_guessCount > 0) _guessCount = Math.max(0, _guessCount - 1);
				if (!_mealWinFired) {
					_mealWinFired = true;
					notifyGoalGuessed(goal);
						// Reveal meal image fully
						try { updateMealImageReveal(); } catch(e) {}
				}
				try { const ov = document.getElementById('mealSpiceOverlay'); if (ov) ov.remove(); } catch(e){}
				return;
			}
		}
		// Otherwise treat guesses as spice guesses; if the guessed item is a required spice, reveal it
		try {
			if (_requiredSpices.length && it && it.name) {
				// Normalize comparison similar to shared filter logic
				const guessName = it.name.trim();
				const matchIdx = _requiredSpices.findIndex(s => s === guessName);
					if (matchIdx !== -1 && !_revealedSpices.has(guessName)) {
					_revealedSpices.add(guessName);
					const img = _spiceImgMap[guessName];
					if (img) {
						img.classList.add('revealed');
						img.style.transition = 'filter 400ms ease, opacity 400ms ease';
							requestAnimationFrame(()=>{ img.style.filter='none'; img.style.opacity='1'; img.style.display='inline-block'; });
							// Restore alt/title now that spice is revealed
							if (!img.alt && img.dataset.originalName) {
								img.alt = img.dataset.originalName;
								img.title = img.dataset.originalName;
							}
							// Hide question mark overlay
							try { const slot = img.parentNode; const q = slot?.querySelector('.spice-q'); if (q) q.style.display='none'; } catch(e){}
					}
					// Correct spice guess: decrement guess counter as reward
					if (_guessCount > 0) _guessCount = Math.max(0, _guessCount - 1);
					// Update meal reveal since rewarding the player should also slightly
					// reduce the remaining silhouette (make it more colorful).
					try { updateMealImageReveal(); } catch(e) {}
					// Win if all required spices are revealed
					if (_revealedSpices.size === _requiredSpices.length) {
						if (!_mealWinFired) {
							_mealWinFired = true;
							// Use goal meal as the winning item reference
								if (goal) notifyGoalGuessed(goal); else notifyGoalGuessed(it);
								// Remove spice overlay upon win
								try { const ov = document.getElementById('mealSpiceOverlay'); if (ov) ov.remove(); } catch(e){}
						}
					}
				}
			}
			// Update outline progression after processing spice guess
			updateSpiceOutlineProgress();
		} catch(e){ /* non-fatal spice reveal */ }
		// Update outline progression for any non-spice guess as well
		updateSpiceOutlineProgress();
	} catch(e){ /* non-fatal */ }
}

// Clue handler: use shared system's guessBtn2 unlock (category threshold) but display meal effect instead
const guessHandlers = {
	guessBtn2: () => {
		const btn = document.getElementById('guessBtn2');
		if (!btn || btn.disabled) return;
		try {
			const goal = window.getGoalItem ? window.getGoalItem() : null;
			const effect = goal?.raw?.effect || goal?.raw?.Effect || 'Unknown';
			btn.textContent = effect;
			btn.setAttribute('aria-label', `Meal effect: ${effect}`);
		} catch(e){ /* ignore */ }
	}
};

// Build the per-day meal UI (variant label, image, spice silhouettes) using the shared-selected goal.
function buildDailyMealUI(){
	const mealGoal = getGoalItem();
	if (!mealGoal) return; // not yet ready
	window.__mealDailyGoal = mealGoal;
	const combo = document.getElementById('combo');
	if (combo && combo.parentNode) {
		// Build or reuse spice box (now primary container)
		let spiceBox = document.getElementById('mealSpiceBox');
		if (!spiceBox) {
			spiceBox = document.createElement('div');
			spiceBox.id = 'mealSpiceBox';
			spiceBox.style.margin = '16px auto 14px';
			spiceBox.style.width = 'min(425px, 90%)';
			spiceBox.style.display = 'flex';
			spiceBox.style.flexWrap = 'wrap';
			spiceBox.style.gap = '14px';
			spiceBox.style.justifyContent = 'center';
			spiceBox.style.alignItems = 'center';
			spiceBox.style.padding = '18px 14px 14px';
			spiceBox.style.background = 'rgba(20,24,48,0.65)';
			spiceBox.style.border = '1px solid rgba(122,162,255,0.25)';
			spiceBox.style.borderRadius = '12px';
			spiceBox.style.boxShadow = '0 4px 12px rgba(0,0,0,0.35)';
			spiceBox.style.backdropFilter = 'blur(4px)';
			spiceBox.style.webkitBackdropFilter = 'blur(4px)';
			spiceBox.style.position = 'relative';
			combo.parentNode.insertBefore(spiceBox, combo.nextSibling);
		} else {
			spiceBox.innerHTML = '';
		}
		// No variant label; proceed directly to silhouette rendering

		// Instead of building individual spice slots, render a single black silhouette
		// of the goal meal image inside the spice box. This replaces the previous
		// visual design where individual spice icons and question marks were shown.
		try {
			// Clear any spice state used by the old UI so other functions gracefully short-circuit
			_requiredSpices = [];
			_revealedSpices = new Set();
			_spiceImgMap = Object.create(null);
			_spiceSlotMap = Object.create(null);

			// Use the actual goal meal (from getGoalItem) for the silhouette image so
			// the displayed icon always matches the day's goal.
			const sil = document.createElement('img');
			sil.id = 'mealGoalSilhouette';
			sil.src = (mealGoal && mealGoal.icon) || (mealGoal.raw && mealGoal.raw.icon) || '../images/icon.png';
			sil.alt = '';
			sil.title = '';
			// Visual styling: start as a dark silhouette; updateMealImageReveal will
			// compute the exact filter based on _guessCount (supports smooth progression)
			sil.style.width = '160px';
			sil.style.height = '160px';
			sil.style.objectFit = 'contain';
			sil.style.borderRadius = '12px';
			sil.style.background = 'transparent';
			sil.style.transition = 'filter 280ms ease, opacity 280ms ease, transform 200ms ease';
			sil.onerror = () => { sil.src = '../images/icon.png'; };

			// Center wrapper so the silhouette is centered and responsive
			const wrap = document.createElement('div');
			wrap.style.width = '100%';
			wrap.style.display = 'flex';
			wrap.style.justifyContent = 'center';
			wrap.style.alignItems = 'center';
			wrap.style.padding = '18px 0 6px';
			wrap.appendChild(sil);

			spiceBox.appendChild(wrap);

			// Reset guess counter and run outline update (no-op when no spices)
			_guessCount = 0;
			updateSpiceOutlineProgress();
			// Ensure the meal image reflect initial reveal state
			try { updateMealImageReveal(); } catch(e) {}
		} catch(e){ console.warn('MealGuesser: silhouette build failed', e); }
	}
}

// Initialise once DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
	await Promise.all([loadMeals(), loadSpices()]);

	// Build a unique list of meal effects (dedupe identical effects). Each
	// dropdown entry is shaped like { name: '<Effect text>', icon: '' } so the
	// shared dropdown can render labels. We set showIcons:false so the list
	// is text-only.
	const effectsSet = new Set();
	const effectItems = [];
	try {
		for (const m of _meals) {
			const effect = m?.raw?.effect || m?.raw?.Effect || (m?.raw && (m.raw.effect || m.raw.Effect)) || 'Unknown';
			const trimmed = String(effect || 'Unknown').trim();
			if (!effectsSet.has(trimmed)) {
				effectsSet.add(trimmed);
				effectItems.push({ name: trimmed, icon: '' });
			}
		}
	} catch (e) { /* non-fatal */ }

	await initShared({
		dataUrl: MEALS_JSON,
		imageBase: '../images',
		seedOffset: SEED_OFFSET,
		onSelect: onSelectMeal,
		clueUnlocks: { category: 99 }, // shared system manages unlock; we override button text when clicked
		guessButtonHandlers: guessHandlers,
		overrideItems: effectItems,
		showIcons: false
	});

	// The shared module's goalItem was selected from the overrideItems (effects list).
	// We need to override the shared goal with the actual meal object from _meals
	// so the UI (and cookie recording) references the meal icon and metadata.
	try {
		if (Array.isArray(_meals) && _meals.length) {
			const idx = getDailyDeterministicIndex(_meals.length, SEED_OFFSET+5) || 0;
			const actualMeal = _meals[idx] || _meals[0];
			// Update shared's internal goalItem so getGoalItem() returns the meal
			try { setGoalItem(actualMeal); } catch (e) { /* non-fatal */ }
			// Also expose on window for compatibility with existing code
			window.__mealDailyGoal = actualMeal;
		}
	} catch (e) { /* non-fatal */ }
	// Build UI now (or shortly if goal not yet populated)
	if (!getGoalItem()) setTimeout(buildDailyMealUI, 120); else buildDailyMealUI();

	// Listen for the shared 'guess:correct' event which the shared module
	// dispatches when a win is detected (including wins loaded from cookie).
	// When received, ensure the meal image is revealed fully.
	document.addEventListener('guess:correct', (ev) => {
		try {
			// Mark as won and force a full reveal
			_mealWinFired = true;
			_guessCount = MEAL_REVEAL_GUESSES;
			try { updateMealImageReveal(); } catch (e) {}
			// Remove any overlay if present
			try { const ov = document.getElementById('mealSpiceOverlay'); if (ov) ov.remove(); } catch (e) {}
		} catch (e) { /* non-fatal */ }
	});
});
