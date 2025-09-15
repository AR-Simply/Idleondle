// mealGuesser.js
// Daily Meal guessing page logic. Reuses shared.js helpers (initShared, notifyGoalGuessed, etc.)
// Creates/updates per-game cookie: idleondle_win_meal and idleondle_last_win handled by shared.js recordWin().

import { initShared, notifyGoalGuessed, getDailyDeterministicIndex, getGoalItem } from './shared.js';

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
		if (!_mealWinFired) { _guessCount++; }
		// Tag item with friendly game name so shared.js records correct cookie
		it._gameName = 'meal';
		const goal = window.getGoalItem ? window.getGoalItem() : null;
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
			}
			// Remove spice overlay if present (direct meal guess win)
			try { const ov = document.getElementById('mealSpiceOverlay'); if (ov) ov.remove(); } catch(e){}
			return;
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
	
	const variant = (getDailyDeterministicIndex(3, 0) % 3) + 1; // 1..3
	window.__mealDailyVariant = variant;
	const variantTextMap = {
		1: 'Best recipe by <span class="mv-key">Luck</span>:',
		2: 'Best recipe by <span class="mv-key">Fire Time</span>:',
		3: '<span class="mv-key">Earliest</span> Recipe:'
	};
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
		// Variant label sits at top as full-width header
		let labelEl = document.getElementById('mealVariantLabel');
		if (!labelEl) {
			labelEl = document.createElement('div');
			labelEl.id = 'mealVariantLabel';
			labelEl.style.position = 'absolute';
			labelEl.style.top = '10px';
			labelEl.style.left = '50%';
			labelEl.style.transform = 'translateX(-50%)';
			labelEl.style.width = '100%';
			labelEl.style.textAlign = 'center';
			labelEl.style.padding = '0 6px';
			labelEl.style.pointerEvents = 'none';
			spiceBox.appendChild(labelEl);
		}
		labelEl.innerHTML = variantTextMap[variant] || '';
		labelEl.style.fontSize = '22px';
		labelEl.style.lineHeight = '1.15';
		labelEl.style.fontWeight = '800';
		labelEl.style.letterSpacing = '0.5px';
		labelEl.style.textShadow = '0 2px 6px rgba(0,0,0,0.55)';
		labelEl.style.color = '#ffffff';
		try { labelEl.querySelectorAll('.mv-key').forEach(span => { span.style.color = '#ff4242'; span.style.fontWeight = '900'; span.style.textShadow = '0 1px 4px rgba(0,0,0,0.55)'; }); } catch(e){}

		// Spacer to push icons below absolutely positioned header
		const headerSpacer = document.createElement('div');
		headerSpacer.style.width = '100%';
		headerSpacer.style.height = '28px';
		spiceBox.appendChild(headerSpacer);

		// Build spice silhouettes
		try {
			const variantKey = variant === 1 ? 'luck' : (variant === 2 ? 'fire' : 'early');
			const spiceNames = Array.isArray(mealGoal?.raw?.[variantKey]) ? mealGoal.raw[variantKey] : [];
			const entries = spiceNames.map(n => { const rec = _spiceMap[n]; return { name: n, icon: rec?.icon || '../images/icon.png' }; }).slice(0,4);
			_requiredSpices = entries.map(e => e.name);
			_revealedSpices = new Set();
			_spiceImgMap = Object.create(null);
			entries.forEach(ent => {
				const img = document.createElement('img');
				img.src = ent.icon;
				img.alt = '';
				img.title = '';
				img.dataset.originalName = ent.name;
				img.style.width = '64px';
				img.style.height = '64px';
				img.style.objectFit = 'contain';
				// Show full-color icon by default; visibility handled in updateSpiceOutlineProgress()
				img.style.filter = 'none';
				img.style.opacity = '1';
				img.style.borderRadius = '8px';
				img.style.background = 'rgba(255,255,255,0.02)';
				img.style.transition = 'filter 400ms ease, opacity 400ms ease';
				img.onerror = () => { img.src = '../images/icon.png'; };
				const slot = document.createElement('div');
				slot.className = 'spice-slot';
				slot.style.position = 'relative';
				slot.style.width = '64px';
				slot.style.height = '64px';
				slot.style.display = 'inline-flex';
				slot.style.alignItems = 'center';
				slot.style.justifyContent = 'center';
				slot.style.pointerEvents = 'none';
				img.style.position = 'absolute';
				img.style.left = '0';
				img.style.top = '0';
				img.style.right = '0';
				img.style.bottom = '0';
				slot.appendChild(img);
				const q = document.createElement('span');
				q.className = 'spice-q';
				q.textContent = '?';
				q.style.position = 'relative';
				q.style.fontWeight = '900';
				q.style.fontSize = '36px';
				q.style.color = '#ffffffd9';
				q.style.textShadow = '0 2px 6px rgba(0,0,0,0.65)';
				slot.appendChild(q);
				spiceBox.appendChild(slot);
				_spiceImgMap[ent.name] = img;
				_spiceSlotMap[ent.name] = slot;
			});
			_guessCount = 0;
			updateSpiceOutlineProgress();
			let overlay = document.getElementById('mealSpiceOverlay');
			if (!overlay) {
				overlay = document.createElement('div');
				overlay.id = 'mealSpiceOverlay';
				overlay.style.position = 'absolute';
				overlay.style.inset = '0';
				overlay.style.background = 'rgba(0,0,0,0)';
				overlay.style.cursor = 'default';
				overlay.style.zIndex = '5';
				overlay.style.pointerEvents = 'auto';
				overlay.setAttribute('aria-hidden', 'true');
				overlay.addEventListener('contextmenu', ev => { ev.preventDefault(); return false; });
				if (getComputedStyle(spiceBox).position === 'static') spiceBox.style.position = 'relative';
				spiceBox.appendChild(overlay);
			}
			// Auto-reveal if already won today
			try {
				function _mealHasWinToday(){
					try {
						const key='idleondle_win_meal';
						const pair=(document.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(key+'='));
						if(!pair) return false;
						const raw=decodeURIComponent(pair.split('=')[1]||'');
						let timeStr=null; try { const parsed=JSON.parse(raw); if(parsed&&parsed.time) timeStr=parsed.time; } catch(e){ timeStr=raw; }
						if(!timeStr) return false; const then=new Date(timeStr); if(isNaN(then.getTime())) return false; const now=new Date();
						return then.getFullYear()===now.getFullYear() && then.getMonth()===now.getMonth() && then.getDate()===now.getDate();
					} catch(e){ return false; }
				}
				if (_requiredSpices.length && _mealHasWinToday()) {
					_requiredSpices.forEach(n=>{ const img=_spiceImgMap[n]; if(img){ img.style.filter='none'; img.style.opacity='1'; if(!img.alt && img.dataset.originalName){ img.alt=img.dataset.originalName; img.title=img.dataset.originalName; } } });
					_revealedSpices = new Set(_requiredSpices);
					_mealWinFired = true;
					try { const ov=document.getElementById('mealSpiceOverlay'); if(ov) ov.remove(); } catch(e){}
					_requiredSpices.forEach(n=>{ try { const slot=_spiceSlotMap[n]; const q=slot?.querySelector('.spice-q'); if(q) q.style.display='none'; } catch(e){} });
					updateSpiceOutlineProgress();
				}
			} catch(e){}
		} catch(e){ console.warn('MealGuesser: spice box build failed', e); }
	}
}

// Initialise once DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
	await Promise.all([loadMeals(), loadSpices()]);
	await initShared({
		dataUrl: MEALS_JSON,
		imageBase: '../images',
		seedOffset: SEED_OFFSET,
		onSelect: onSelectMeal,
		clueUnlocks: { category: 5 }, // shared system manages unlock; we override button text when clicked
		guessButtonHandlers: guessHandlers
	});
	// Build UI now (or shortly if goal not yet populated)
	if (!getGoalItem()) setTimeout(buildDailyMealUI, 120); else buildDailyMealUI();
});
