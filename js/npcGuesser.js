// js/npcGuesser.js
import { initShared, getGoalItem } from './shared.js';

export async function initNpcGuesser(options = {}) {
  // Custom handlers for NPC-specific clue buttons
  const npcGuessHandlers = {
    guessBtn1: () => {
      const gb1 = document.getElementById('guessBtn1'); 
      if (!gb1 || gb1.disabled) return;
      const g = getGoalItem();
      const world = g?.raw?.world || g?.raw?.World || 'Unknown';
      gb1.textContent = world;
      gb1.setAttribute('aria-label', `World: ${world}`);
    },
    guessBtn2: () => {
      const gb2 = document.getElementById('guessBtn2'); 
      if (!gb2 || gb2.disabled) return;
      const g = getGoalItem();
      const quests = g?.raw?.['Total Quests'] || g?.raw?.totalQuests || 'Unknown';
      gb2.textContent = `${quests} Quests`;
      gb2.setAttribute('aria-label', `Total Quests: ${quests}`);
    }
  };

  const sharedConfig = Object.assign({
    dataUrl: '../json/idleon_npcs.json',
    imageBase: '../images',
    guessButtonHandlers: npcGuessHandlers
  }, options || {});

  await initShared(sharedConfig);

  // Render the daily NPC quote below the combo (search input + dropdown)
  try {
    const goal = getGoalItem();
    const container = document.createElement('div');
    container.id = 'dailyNpc';
    container.className = 'daily-npc-quote';

    const quoteText = document.createElement('div');
    quoteText.className = 'npc-quote-text';
    const quote = goal?.raw?.quote || goal?.raw?.Quote || 'A mysterious NPC with a secret...';
    quoteText.textContent = `"${quote}"`;

    container.appendChild(quoteText);

    // Add overlay to prevent text selection/copying
    const overlay = document.createElement('div');
    overlay.className = 'daily-npc-overlay';
    overlay.addEventListener('contextmenu', (ev) => { ev.preventDefault(); });
    overlay.addEventListener('selectstart', (ev) => { ev.preventDefault(); });
    container.appendChild(overlay);

    // Insert after the combo (so it appears below the input and dropdown)
    const combo = document.getElementById('combo');
    if (combo && combo.parentNode) combo.parentNode.insertBefore(container, combo.nextSibling);
  } catch (e) {
    console.warn('Failed to render daily NPC quote', e);
  }
}

// Auto-init when imported
if (typeof window !== 'undefined') {
  initNpcGuesser().catch(e => console.error('NpcGuesser init failed', e));
  window.npcGuesser = window.npcGuesser || {};
  window.npcGuesser.initNpcGuesser = initNpcGuesser;
}

export default { initNpcGuesser };
