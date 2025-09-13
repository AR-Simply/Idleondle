// js/results.js
// Render a Daily Results box by reading cookies created by shared.js

function safeLower(s) { try { return String(s).normalize('NFC').toLocaleLowerCase('en'); } catch(e){ return String(s||'').toLowerCase(); } }

function getCookie(name) {
	try {
		const pairs = document.cookie.split(';').map(s => s.trim());
		for (const p of pairs) {
			if (!p) continue;
			const idx = p.indexOf('=');
			const k = idx === -1 ? p : p.slice(0, idx);
			const v = idx === -1 ? '' : p.slice(idx + 1);
			if (k === name) return decodeURIComponent(v || '');
		}
	} catch (e) {}
	return null;
}

function parseWinPayload(val) {
	if (!val) return null;
	try { const p = JSON.parse(val); if (p && p.time) return p; } catch (e) {}
	// legacy ISO string
	const d = new Date(val);
	if (isNaN(d.getTime())) return null;
	return { time: d.toISOString(), guesses: 0 };
}

function isTodayISOString(iso) {
	if (!iso) return false;
	const then = new Date(iso);
	if (isNaN(then.getTime())) return false;
	const now = new Date();
	return then.getFullYear() === now.getFullYear() && then.getMonth() === now.getMonth() && then.getDate() === now.getDate();
}

function collectWinsToday() {
	const wins = [];
	try {
		const pairs = document.cookie.split(';').map(s => s.trim()).filter(Boolean);
		for (const p of pairs) {
			const eq = p.indexOf('=');
			const k = eq === -1 ? p : p.slice(0, eq);
			const v = eq === -1 ? '' : decodeURIComponent(p.slice(eq+1));
			if (!k.startsWith('idleondle_win_')) continue;
					const gameRaw = k.slice('idleondle_win_'.length) || 'unknown';
					const gameName = gameRaw.replace(/_/g, ' ');
			const payload = parseWinPayload(v);
			if (payload && isTodayISOString(payload.time)) {
				wins.push({ key: k, game: gameName, guesses: Number(payload.guesses) || 0, time: payload.time });
			}
		}
	} catch (e) { /* non-fatal */ }
	// Sort by time ascending (earlier wins first)
	wins.sort((a,b) => new Date(a.time) - new Date(b.time));
	return wins;
}

function resolveIcon(src) {
	if (!src) return '../images/Gem.png';
	// If src already looks like a URL or path, return it; otherwise default
	return src;
}

function renderResultsBox() {
	const container = document.getElementById('resultsList');
	if (!container) return;
	const wins = collectWinsToday();
	container.innerHTML = '';
	// Center everything inside the results area
	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.alignItems = 'center';
	container.style.justifyContent = 'flex-start';
	container.style.gap = '6px';
	container.style.padding = '4px 0';

	if (!wins.length) {
		const em = document.createElement('em'); em.textContent = 'Win some games and come back'; em.style.fontStyle = 'italic'; container.appendChild(em); return;
	}

	const list = document.createElement('div'); list.className = 'results-items';
	list.style.display = 'flex'; list.style.flexDirection = 'column'; list.style.gap = '4px'; list.style.width = '100%';
			// Map raw cookie suffixes to friendly display labels
			const labelMap = {
				'item': 'Item Guesser',
				'hard item': 'HARD Item Guesser',
				'hard_item': 'HARD Item Guesser',
				'card': 'Card Guesser',
				'hard card': 'HARD Card Guesser',
				'hard_card': 'HARD Card Guesser',
				'monster': 'Monster Guesser',
				'meal': 'Meal Guesser'
			};

			for (const w of wins) {
			const row = document.createElement('div'); row.className = 'results-row results-row-line';
			row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.justifyContent = 'space-between';
			row.style.gap = '8px'; row.style.width = '100%'; row.style.maxWidth = '360px'; row.style.margin = '0 auto';

			const leftWrap = document.createElement('div'); leftWrap.className = 'results-line-left';
				const raw = w.game.trim();
				const key = raw.toLowerCase();
				const friendly = labelMap[key] || labelMap[key.replace(/\s+/g,'_')] || capitalizeWords(raw);
				const nameSpan = document.createElement('span'); nameSpan.className = 'results-game-line'; nameSpan.textContent = friendly + ':';
				// Mark hard modes visually (red text)
				if (/hard/i.test(friendly)) nameSpan.classList.add('hard-mode');
			leftWrap.appendChild(nameSpan);

			const rightWrap = document.createElement('div'); rightWrap.className = 'results-line-right'; rightWrap.style.display = 'flex'; rightWrap.style.alignItems = 'center'; rightWrap.style.gap = '6px';
			const guessesSpan = document.createElement('span'); guessesSpan.className = 'results-meta-line'; guessesSpan.textContent = w.guesses;
			// Determine rank icon based on guesses and mode
			const isHard = /hard/i.test(friendly);
			const rank = determineRank(w.guesses, isHard);
			const icon = document.createElement('img');
			icon.className = 'results-gem rank-icon';
			icon.alt = 'rank ' + rank;
			icon.src = buildRankIcon(rank);
			rightWrap.appendChild(guessesSpan); rightWrap.appendChild(icon);

			row.appendChild(leftWrap);
			row.appendChild(rightWrap);
			list.appendChild(row);
		}
	container.appendChild(list);

	// Footer section (title image + thank you + countdown)
	const footer = document.createElement('div');
	footer.className = 'results-end-section';
	footer.style.display = 'flex';
	footer.style.flexDirection = 'column';
	footer.style.alignItems = 'center';
	footer.style.justifyContent = 'center';
	footer.style.marginTop = wins.length ? '18px' : '12px';
	footer.style.gap = '6px';

	const titleImg = document.createElement('img');
	titleImg.src = '../images/title.png';
	titleImg.alt = 'Idleondle';
	titleImg.style.width = '240px';
	titleImg.style.maxWidth = '80%';
	titleImg.style.filter = 'drop-shadow(0 4px 10px rgba(0,0,0,0.35))';

	const thanks = document.createElement('div');
	thanks.textContent = 'Thank you for playing!';
	thanks.style.fontWeight = '800';
	thanks.style.fontSize = '18px';
	thanks.style.letterSpacing = '0.5px';

	const see = document.createElement('div');
	see.textContent = 'See you in:';
	see.style.fontSize = '13px';
	see.style.fontWeight = '600';
	see.style.color = 'var(--muted)';
	see.style.marginTop = '2px';

    // Use same structure and classes as goal modal timer
    const timerWrap = document.createElement('div');
    timerWrap.className = 'goal-timer-wrap';
    const timer = document.createElement('span');
    timer.className = 'goal-timer';
    timer.id = 'resultsMidnightTimer';
    timer.textContent = '00:00:00';

	footer.appendChild(titleImg);
	footer.appendChild(thanks);
	footer.appendChild(see);
	timerWrap.appendChild(timer);
	footer.appendChild(timerWrap);

	// Ko-fi support link
	const kofiMsg = document.createElement('div');
	kofiMsg.textContent = 'Follow on Ko-fi for development updates and news';
	kofiMsg.style.fontSize = '13px';
	kofiMsg.style.fontWeight = '600';
	kofiMsg.style.color = 'var(--muted)';
	kofiMsg.style.marginTop = '8px';
	kofiMsg.style.textAlign = 'center';
	footer.appendChild(kofiMsg);
	const kofi = document.createElement('div');
	kofi.style.marginTop = '6px';
	kofi.innerHTML = "<a href='https://ko-fi.com/S6S51KOEMK' target='_blank' rel='noopener'><img height='36' style='border:0;height:36px;' src='https://storage.ko-fi.com/cdn/kofi6.png?v=6' alt='Buy Me a Coffee at ko-fi.com' /></a>";
	footer.appendChild(kofi);
	container.appendChild(footer);

	startMidnightCountdown(timer);
}

// --- Page switcher completion marking (results page only) ---
function hasWinToday(game) {
	try {
		const key = 'idleondle_win_' + safeLower(String(game || 'unknown').replace(/[^a-z0-9_-]+/gi, '_'));
		const val = getCookie(key);
		if (!val) return false;
		let iso = null;
		try { const parsed = JSON.parse(val); if (parsed && parsed.time) iso = parsed.time; } catch (e) { iso = val; }
		if (!iso) return false;
		const d = new Date(iso); if (isNaN(d.getTime())) return false;
		const now = new Date();
		return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
	} catch (e) { return false; }
}

function markPageSwitcherCompletion() {
	const btnItems = document.getElementById('btn-items');
	const btnCards = document.getElementById('btn-cards');
	const btnMonster = document.getElementById('btn-monster');
	// Item (normal or hard)
	if (btnItems && (hasWinToday('item') || hasWinToday('hard_item'))) {
		btnItems.classList.add('complete');
		btnItems.style.background = '#2ecc71';
		btnItems.style.borderColor = '#2ecc71';
	}
	// Card (normal or hard)
	if (btnCards && (hasWinToday('card') || hasWinToday('hard_card'))) {
		btnCards.classList.add('complete');
		btnCards.style.background = '#2ecc71';
		btnCards.style.borderColor = '#2ecc71';
	}
	// Monster
	if (btnMonster && hasWinToday('monster')) {
		btnMonster.classList.add('complete');
		btnMonster.style.background = '#2ecc71';
		btnMonster.style.borderColor = '#2ecc71';
	}
}

function capitalizeWords(s){ return String(s||'').split(' ').map(w=> w ? w[0].toUpperCase()+w.slice(1) : '').join(' ').trim(); }

function copyShareText() {
	const wins = collectWinsToday();
	if (!wins.length) { navigator.clipboard?.writeText('I played Idleondle today — go win some games!'); return; }
	const pieces = wins.map(w => `${capitalizeWords(w.game)}: ${w.guesses} ${w.guesses===1?'guess':'guesses'}`);
	const txt = `My Idleondle daily results (${new Date().toLocaleDateString()}):\n` + pieces.join('\n') + '\nCan you beat me?';
	if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(()=> showToast('Results copied to clipboard!')).catch(()=> showToast('Could not copy results.'));
}

// Graceful fallback for showToast used by shared.js
function showToast(msg) { try { if (window.showToast) window.showToast(msg); else alert(msg); } catch(e){ try{ alert(msg);}catch(e){} } }

document.addEventListener('DOMContentLoaded', () => {
	renderResultsBox();
	markPageSwitcherCompletion();
	// Re-render on header click (manual refresh)
	const header = document.querySelector('#resultsbox .results-box-header h2'); if (header) header.addEventListener('click', renderResultsBox);

	// Wire privacy modal (not available via shared.js on results page)
	try {
		const privacyLink = document.getElementById('privacyLink');
		const privacyModal = document.getElementById('privacyModal');
		const privacyClose = document.getElementById('privacyClose');
		if (privacyLink && privacyModal) {
			privacyLink.addEventListener('click', (e) => { e.preventDefault(); privacyModal.setAttribute('aria-hidden','false'); });
		}
		if (privacyClose && privacyModal) {
			privacyClose.addEventListener('click', () => { privacyModal.setAttribute('aria-hidden','true'); });
		}
		if (privacyModal) {
			privacyModal.addEventListener('click', (e) => { if (e.target === privacyModal) privacyModal.setAttribute('aria-hidden','true'); });
		}
	} catch (e) { /* non-fatal */ }
});

// Expose for debugging
window._idleondle_results = { collectWinsToday, renderResultsBox };

// --- Midnight countdown ---
let _midnightTimerInterval = null;
function startMidnightCountdown(el){
	if (!el) return;
	if (_midnightTimerInterval) { clearInterval(_midnightTimerInterval); _midnightTimerInterval = null; }
	function update(){
		const now = new Date();
		const midnight = new Date(now); midnight.setHours(24,0,0,0);
		let diff = midnight - now;
		if (diff < 0) diff = 0;
		const h = String(Math.floor(diff / 3_600_000)).padStart(2,'0');
		const m = String(Math.floor((diff % 3_600_000) / 60_000)).padStart(2,'0');
		const s = String(Math.floor((diff % 60_000) / 1000)).padStart(2,'0');
		el.textContent = `${h}:${m}:${s}`;
		if (diff === 0) { clearInterval(_midnightTimerInterval); _midnightTimerInterval = null; }
	}
	update();
	_midnightTimerInterval = setInterval(update, 1000);
}

// --- Rank helpers ---
// Threshold interpretation chosen so overlapping bounds favor the lower rank threshold for upper range (non-inclusive on upper except final):
// Normal: 1 ->1, 2-3 ->2, 4-6 ->3, 7-9 ->4, 10+ ->5
// Hard:   1 ->1, 2-4 ->2, 5-8 ->3, 9-14 ->4, 15+ ->5
function determineRank(guesses, isHard){
	const g = Number(guesses) || 0;
	if (g <= 1) return 1;
	if (!isHard) { // normal thresholds
		if (g <= 3) return 2;
		if (g <= 6) return 3;
		if (g <= 9) return 4;
		return 5;
	} else { // hard thresholds
		if (g <= 4) return 2;
		if (g <= 8) return 3;
		if (g <= 14) return 4;
		return 5;
	}
}

function buildRankIcon(rank){
	const r = Math.min(5, Math.max(1, Number(rank)||5));
	// results.html is in html/ so we need ../images/...
	return '../images/rank/rank' + r + '.png';
}
