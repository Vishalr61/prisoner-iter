// Cold open and dilemma screens — opening-sequence overhaul.
// Each view now builds its own DOM (matching the builder/evolution pattern),
// so the redesign is self-contained. Same public contract: initColdOpen(go)
// and initDilemma(go), both called once at boot; views are shown via the
// router toggling `.active`.

const PAYOFFS = { R: 3, T: 5, P: 1, S: 0 };

export function initColdOpen(go) {
  const el = document.getElementById('view-cold-open');
  el.innerHTML = `
    <div class="co">
      <div class="co-kicker"><span class="dot"></span>The Trust Game</div>
      <div class="co-lines" aria-live="polite">
        <span class="line">You and a stranger.</span>
        <span class="line">One choice.</span>
        <span class="line">Trust them, or <em>take what you can</em>.</span>
      </div>
      <div class="co-tap">tap anywhere to continue</div>
      <button class="co-hit" data-action="continue" aria-label="Continue"></button>
    </div>
  `;
  el.querySelector('[data-action="continue"]').addEventListener('click', () => go('dilemma'));
}

export function initDilemma(go) {
  const el = document.getElementById('view-dilemma');
  el.innerHTML = `
    <div class="dlm">
      <div class="dlm-kicker"><span class="dot"></span>The Setup · One round</div>

      <div class="dlm-intro" data-intro>
        <p class="dlm-prose">
          <span class="pause">You can share, or you can take.</span>
          <span class="pause">They can share, or they can take.</span>
          <span class="pause dim">Neither of you sees the other's choice.</span>
        </p>

        <div class="dlm-matrix-wrap">
          <span class="dlm-matrix-label">Points · you / them</span>
          <div class="dlm-matrix">
            <div class="dlm-cell dlm-corner"></div>
            <div class="dlm-cell"><span class="dlm-col-head">They<br>share</span></div>
            <div class="dlm-cell"><span class="dlm-col-head">They<br>take</span></div>

            <div class="dlm-cell"><span class="dlm-row-head">You<br>share</span></div>
            <div class="dlm-cell coop"><span class="dlm-payoff"><span class="mine">3</span><span class="sep">/</span><span class="theirs">3</span></span><span class="dlm-cell-note">Trust</span></div>
            <div class="dlm-cell"><span class="dlm-payoff"><span class="mine">0</span><span class="sep">/</span><span class="theirs">5</span></span><span class="dlm-cell-note">Played</span></div>

            <div class="dlm-cell"><span class="dlm-row-head">You<br>take</span></div>
            <div class="dlm-cell tempt"><span class="dlm-payoff"><span class="mine">5</span><span class="sep">/</span><span class="theirs">0</span></span><span class="dlm-cell-note">Tempt</span></div>
            <div class="dlm-cell both-take"><span class="dlm-payoff"><span class="mine">1</span><span class="sep">/</span><span class="theirs">1</span></span><span class="dlm-cell-note">Stalemate</span></div>
          </div>
        </div>

        <p class="dlm-question">What do you do?</p>

        <div class="dlm-choices">
          <button class="dlm-choice share" data-action="share"><span class="verb">Share</span><span class="sub">cooperate</span></button>
          <button class="dlm-choice take"  data-action="take"><span class="verb">Take</span><span class="sub">defect</span></button>
        </div>
      </div>

      <div class="dlm-reveal" data-reveal>
        <div class="dlm-versus">
          <div class="dlm-vside" data-your><span class="dlm-vlabel">You</span><span class="dlm-token" data-your-token></span></div>
          <span class="dlm-vs-mark">vs</span>
          <div class="dlm-vside" data-their><span class="dlm-vlabel">Stranger</span><span class="dlm-token take">Took</span></div>
        </div>
        <p class="dlm-payoff-line" data-payoff></p>
        <div class="dlm-after" data-after>
          <p class="dlm-after-text">
            That's the dilemma.
            <span class="pause">Now imagine playing it ten times. With the same person.</span>
            <span class="pause em">Or a hundred.</span>
          </p>
        </div>
        <button class="dlm-continue" data-action="continue">Meet your first opponent →</button>
      </div>
    </div>
  `;

  const intro      = el.querySelector('[data-intro]');
  const reveal     = el.querySelector('[data-reveal]');
  const btnShare   = el.querySelector('[data-action="share"]');
  const btnTake    = el.querySelector('[data-action="take"]');
  const yourSide   = el.querySelector('[data-your]');
  const theirSide  = el.querySelector('[data-their]');
  const yourToken  = el.querySelector('[data-your-token]');
  const payoffEl   = el.querySelector('[data-payoff]');
  const afterEl    = el.querySelector('[data-after]');
  const btnContinue = el.querySelector('[data-action="continue"]');
  let played = false;

  function play(humanMove) {
    if (played) return;
    played = true;
    btnShare.disabled = true;
    btnTake.disabled = true;

    // Fade the intro out, then swap to the reveal.
    intro.classList.add('fading');
    setTimeout(() => {
      intro.style.display = 'none';
      reveal.classList.add('on');

      const shared = humanMove === 'C';
      const myPay = shared ? PAYOFFS.S : PAYOFFS.P;       // stranger always takes
      const theirPay = shared ? PAYOFFS.T : PAYOFFS.P;

      yourToken.textContent = shared ? 'Shared' : 'Took';
      yourToken.className = `dlm-token ${shared ? 'share' : 'take'}`;
      payoffEl.innerHTML = shared
        ? `You got <span class="num bad">${myPay}</span>. They got <span class="num good">${theirPay}</span>.`
        : `You each got <span class="num meh">${myPay}</span>.`;

      setTimeout(() => yourSide.classList.add('shown'), 50);
      setTimeout(() => theirSide.classList.add('shown'), 450);
      setTimeout(() => {
        payoffEl.classList.add('shown');
        afterEl.classList.add('shown');
        setTimeout(() => { btnContinue.style.display = 'inline-flex'; }, 600);
      }, 850);
    }, 220);
  }

  btnShare.addEventListener('click', () => play('C'));
  btnTake.addEventListener('click', () => play('D'));
  btnContinue.addEventListener('click', () => go('intro-card', { characterIndex: 0 }));
}
