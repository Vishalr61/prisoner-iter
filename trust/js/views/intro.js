// Cold open + dilemma — show-don't-tell overhaul.
//
// The opening no longer explains the dilemma in prose. It shows two faces,
// drops the player into one anonymous round where a stranger takes what you
// offered, and lets the coins do the teaching. Then one line, and into the
// campaign map. Same public contract: initColdOpen(go) + initDilemma(go).

import { createFace } from '../face.js';
import * as audio from '../audio.js';
import { isReduced } from '../juice.js';

const PAY = { R: 3, T: 5, P: 1, S: 0 };

export function initColdOpen(go) {
  const el = document.getElementById('view-cold-open');
  el.innerHTML = `
    <div class="co">
      <div class="co-kicker"><span class="dot"></span>The Trust Game</div>
      <div class="co-faces">
        <span class="co-face" data-you></span>
        <span class="co-vs">&middot;</span>
        <span class="co-face" data-them></span>
      </div>
      <div class="co-lines">
        <span class="line">You, and a stranger.</span>
        <span class="line">Trust them &mdash; or <em>take what you can</em>.</span>
      </div>
      <div class="co-tap">tap to begin</div>
      <button class="co-hit" data-action="continue" aria-label="Begin"></button>
    </div>
  `;
  const you  = createFace('#6fae8f', { size: 62 });
  const them = createFace('#8a8078', { size: 62 });
  el.querySelector('[data-you]').appendChild(you.el);
  el.querySelector('[data-them]').appendChild(them.el);
  if (!isReduced()) { you.startIdle(); them.startIdle(); }
  them.set('wary');
  el.querySelector('[data-action="continue"]').addEventListener('click', () => { audio.arm(); go('dilemma'); });
}

export function initDilemma(go) {
  const el = document.getElementById('view-dilemma');
  el.innerHTML = `
    <div class="dlm">
      <div class="dlm-kicker"><span class="dot"></span>One round &middot; a stranger</div>

      <div class="dlm-round" data-round>
        <div class="dlm-stranger" data-face></div>
        <p class="dlm-prompt">They choose at the same time &mdash; and you can&rsquo;t see it.<br><span class="q">Share, or take?</span></p>
        <div class="dlm-choices">
          <button class="dlm-choice share" data-action="share"><span class="verb">Share</span><span class="sub">cooperate</span></button>
          <button class="dlm-choice take"  data-action="take"><span class="verb">Take</span><span class="sub">defect</span></button>
        </div>
      </div>

      <div class="dlm-result" data-result>
        <div class="dlm-stranger" data-face2></div>
        <div class="coins">
          <div class="coins-row">
            <div class="coins-side you"><span class="coins-who">You</span><div class="coins-tray you" data-tray="you"></div></div>
            <div class="coins-mid"><span class="coin-move" data-move="you"></span><span class="m2-vs">vs</span><span class="coin-move" data-move="them"></span></div>
            <div class="coins-side them"><span class="coins-who">Stranger</span><div class="coins-tray them" data-tray="them"></div></div>
          </div>
        </div>
        <p class="dlm-line" data-line></p>
        <p class="dlm-subline" data-subline></p>
        <button class="dlm-continue2" data-action="continue" hidden>Now meet people you know &rarr;</button>
      </div>
    </div>
  `;

  const face = createFace('#8a8078', { size: 92 });
  el.querySelector('[data-face]').appendChild(face.el);
  if (!isReduced()) face.startIdle();

  let played = false;
  const round  = el.querySelector('[data-round]');
  const result = el.querySelector('[data-result]');

  function play(move) {
    if (played) return;
    played = true;
    audio.arm();
    audio.play('choose');
    el.querySelectorAll('.dlm-choice').forEach(b => b.disabled = true);

    const shared = move === 'C';
    const myPay    = shared ? PAY.S : PAY.P;   // stranger always takes
    const theirPay = shared ? PAY.T : PAY.P;

    round.classList.add('fading');
    setTimeout(() => {
      round.style.display = 'none';
      result.classList.add('on');

      // Move the stranger's face into the result so their reaction is seen.
      el.querySelector('[data-face2]').appendChild(face.el);
      face.set(shared ? 'cold' : 'wary');

      setMove('you', move);
      setMove('them', 'D');
      dropCoins('you', myPay);
      dropCoins('them', theirPay);
      audio.play(shared ? 'betrayed' : 'mutualTake');

      const line = el.querySelector('[data-line]');
      const sub  = el.querySelector('[data-subline]');
      line.innerHTML = shared
        ? 'You trusted. They took &mdash; because in a single round, taking always wins.'
        : 'You both took. Nobody really won.';
      const cont = el.querySelector('[data-action="continue"]');
      setTimeout(() => line.classList.add('shown'), 500);
      setTimeout(() => { sub.textContent = 'But you’ll play the same people again and again. That changes everything.'; sub.classList.add('shown'); }, 1100);
      setTimeout(() => { cont.hidden = false; cont.classList.add('shown'); }, 1800);
    }, 240);
  }

  function setMove(who, move) {
    const chip = el.querySelector(`[data-move="${who}"]`);
    chip.textContent = move === 'C' ? 'Shared' : 'Took';
    chip.className = `coin-move ${move === 'C' ? 'share' : 'take'} shown`;
  }

  function dropCoins(who, n) {
    const tray = el.querySelector(`[data-tray="${who}"]`);
    tray.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const c = document.createElement('span');
      c.className = 'coin';
      tray.appendChild(c);
      setTimeout(() => { c.classList.add('drop'); if (i < 3) audio.play('coin'); }, 260 + i * (isReduced() ? 0 : 90));
    }
  }

  el.querySelector('[data-action="share"]').addEventListener('click', () => play('C'));
  el.querySelector('[data-action="take"]').addEventListener('click', () => play('D'));
  el.querySelector('[data-action="continue"]').addEventListener('click', () => go('map'));
}
