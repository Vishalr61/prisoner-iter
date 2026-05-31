// DEV ONLY — remove this file and its import in main.js before deploying
import { CHARACTERS } from './characters.js';
import { navigate } from './main.js';

const ITEMS = [
  { label: 'Cold open',    action: () => { clear(); navigate('cold-open'); } },
  { label: 'Dilemma',     action: () => { clear(); navigate('dilemma'); } },
  ...CHARACTERS.map((c, i) => ({
    label: c.name,
    color: c.color,
    action: () => { seed({ charIndex: i }); navigate('intro-card', { characterIndex: i }); },
  })),
  { label: 'Campaign end', action: () => { seed({ done: true }); navigate('campaign-end'); } },
  { label: 'Reveal',       action: () => { seed({ done: true }); navigate('reveal'); } },
  { label: 'Evolution',    action: () => { seed({ done: true }); navigate('evolution'); } },
  { label: 'Builder',      action: () => { clear(); navigate('builder'); } },
];

export function initDevMenu() {
  const wrap = document.createElement('div');
  wrap.id = 'dev-menu';
  wrap.innerHTML = `
    <button id="dev-toggle">DEV</button>
    <div id="dev-panel">
      ${ITEMS.map((item, i) => `
        <button class="dev-item" data-i="${i}" ${item.color ? `style="border-left:3px solid ${item.color}"` : ''}>
          ${item.label}
        </button>
      `).join('')}
    </div>
  `;
  document.body.appendChild(wrap);

  const toggle = wrap.querySelector('#dev-toggle');
  const panel  = wrap.querySelector('#dev-panel');

  toggle.addEventListener('click', () => panel.classList.toggle('open'));
  wrap.querySelectorAll('.dev-item').forEach(btn => {
    btn.addEventListener('click', () => {
      ITEMS[+btn.dataset.i].action();
      panel.classList.remove('open');
    });
  });

  injectStyles();
}

function seed(state) {
  try { localStorage.setItem('tg_state', JSON.stringify(state)); } catch {}
}

function clear() {
  try { localStorage.removeItem('tg_state'); } catch {}
}

function injectStyles() {
  const s = document.createElement('style');
  s.textContent = `
    #dev-menu { position: fixed; bottom: 16px; right: 16px; z-index: 9999; font-family: monospace; }
    #dev-toggle {
      background: #333; color: #aaa; border: 1px solid #555;
      padding: 5px 10px; border-radius: 6px; font-size: 11px;
      cursor: pointer; letter-spacing: 0.05em;
    }
    #dev-panel {
      display: none; flex-direction: column; gap: 2px;
      position: absolute; bottom: 36px; right: 0;
      background: #1a1a1a; border: 1px solid #444;
      border-radius: 8px; padding: 6px; min-width: 160px;
    }
    #dev-panel.open { display: flex; }
    .dev-item {
      background: transparent; color: #ccc; border: none;
      text-align: left; padding: 6px 10px; border-radius: 4px;
      font-size: 12px; cursor: pointer;
    }
    .dev-item:hover { background: #2a2a2a; color: #fff; }
  `;
  document.head.appendChild(s);
}
