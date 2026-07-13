// Expressive SVG face — the thing to latch onto.
//
// A single, uniform face geometry tinted by the character's color. It emotes
// by state (neutral, warm, hurt, cold, wary, bright, thinking): eyes and brows
// move via CSS transforms keyed off a data-emotion attribute; the mouth path
// is swapped in JS for clean shape changes. It also idles (slow breathing +
// occasional blink) and can reveal its "true form" (the abstract silhouette)
// for the campaign map and the reveal.
//
// Contract:
//   const face = createFace(color, { size });
//   container.appendChild(face.el);
//   face.set('warm');            // change expression
//   face.reactTo(outcome);       // map an engine outcome → expression
//   face.startIdle() / stopIdle();
//   face.revealTrueForm(innerSvg);

const MOUTHS = {
  neutral:  'M38,64 Q50,69 62,64',
  warm:     'M36,62 Q50,77 64,62',
  bright:   'M34,60 Q50,84 66,60',
  hurt:     'M37,70 Q50,59 63,70',
  cold:     'M39,66 L61,66',
  wary:     'M40,66 Q50,68 61,63',
  thinking: 'M42,66 Q50,64 58,66',
};

let uid = 0;

export function createFace(color = '#f4ede4', opts = {}) {
  const { size = 130, emotion = 'neutral' } = opts;
  const id = `face${++uid}`;

  const wrap = document.createElement('div');
  wrap.className = 'tg-face-wrap';
  wrap.style.setProperty('--face-color', color);
  wrap.style.width = wrap.style.height = `${size}px`;

  wrap.innerHTML = `
    <svg class="tg-face" viewBox="0 0 100 100" data-emotion="${emotion}" aria-hidden="true">
      <defs>
        <radialGradient id="${id}-fill" cx="42%" cy="36%" r="72%">
          <stop offset="0%"  stop-color="${color}" stop-opacity="0.95"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.62"/>
        </radialGradient>
      </defs>
      <g class="tg-face-head">
        <ellipse class="tg-head" cx="50" cy="52" rx="39" ry="41" fill="url(#${id}-fill)"/>
        <ellipse class="tg-head-rim" cx="50" cy="52" rx="39" ry="41" fill="none" stroke="${color}" stroke-opacity="0.9" stroke-width="1.4"/>
      </g>
      <g class="tg-face-features">
        <path class="tg-brow tg-brow-l" d="M31,38 Q38,35 45,38"/>
        <path class="tg-brow tg-brow-r" d="M55,38 Q62,35 69,38"/>
        <g class="tg-eye tg-eye-l"><ellipse cx="38" cy="47" rx="4.2" ry="5.4"/></g>
        <g class="tg-eye tg-eye-r"><ellipse cx="62" cy="47" rx="4.2" ry="5.4"/></g>
        <path class="tg-mouth" d="${MOUTHS[emotion] || MOUTHS.neutral}" fill="none"/>
        <circle class="tg-cheek tg-cheek-l" cx="30" cy="60" r="5"/>
        <circle class="tg-cheek tg-cheek-r" cx="70" cy="60" r="5"/>
      </g>
      <g class="tg-face-glyph" aria-hidden="true"></g>
    </svg>
  `;

  const svg    = wrap.querySelector('.tg-face');
  const mouth  = wrap.querySelector('.tg-mouth');
  const glyphG = wrap.querySelector('.tg-face-glyph');

  let idleTimer = null;
  let blinkTimer = null;
  let current = emotion;

  function set(next) {
    if (!MOUTHS[next]) next = 'neutral';
    current = next;
    svg.setAttribute('data-emotion', next);
    mouth.setAttribute('d', MOUTHS[next]);
  }

  // Map a match outcome (or a bot move) to an expression.
  function reactTo(outcome) {
    switch (outcome) {
      case 'mutual-share': set('warm'); break;
      case 'exploited':    set('cold'); break;   // human shared, bot took → bot is smug/closed; used for opponent it's "cold"
      case 'exploiter':    set('hurt'); break;   // human took, bot shared → bot is hurt
      case 'mutual-take':  set('wary'); break;
      default:             set('neutral');
    }
  }

  function blink() {
    if (svg.getAttribute('data-emotion') === 'cold') return; // eyes already shut
    svg.classList.add('tg-blinking');
    clearTimeout(blinkTimer);
    blinkTimer = setTimeout(() => svg.classList.remove('tg-blinking'), 130);
  }

  function scheduleBlink() {
    if (!idleTimer && idleTimer !== 0) return;
    idleTimer = setTimeout(() => { blink(); scheduleBlink(); }, 2400 + Math.random() * 3200);
  }

  function startIdle() {
    svg.classList.add('tg-idle');
    idleTimer = 0;                 // mark "on"
    scheduleBlink();
  }

  function stopIdle() {
    svg.classList.remove('tg-idle');
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
    clearTimeout(blinkTimer);
    svg.classList.remove('tg-blinking');
  }

  // Crossfade the face out and an abstract "true form" glyph in.
  function revealTrueForm(innerSvg) {
    glyphG.innerHTML = innerSvg;
    svg.classList.add('tg-revealed');
  }

  return { el: wrap, svg, set, reactTo, blink, startIdle, stopIdle, revealTrueForm,
           get emotion() { return current; } };
}
