// Screen "juice": the small feedback effects that make moments land — a color
// flash on betrayal, a warm particle pop on a cooperation streak, a shake when
// a relationship shatters. All of it is gated behind prefers-reduced-motion in
// one place, so callers never have to check.

let reduced = false;
function refresh() {
  reduced = typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
refresh();
if (typeof window !== 'undefined' && window.matchMedia) {
  try { window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', refresh); } catch {}
}

export function isReduced() { return reduced; }

let flashEl = null;
function ensureFlash() {
  if (!flashEl) {
    flashEl = document.createElement('div');
    flashEl.className = 'tg-flash';
    document.body.appendChild(flashEl);
  }
  return flashEl;
}

// Full-screen radial flash. `color` is any CSS color.
export function flash(color = 'rgba(210,75,75,0.4)', dur = 440) {
  if (reduced) return;
  const el = ensureFlash();
  el.style.setProperty('--flash-color', color);
  el.classList.remove('on');
  void el.offsetWidth;         // restart the animation
  el.classList.add('on');
  setTimeout(() => el.classList.remove('on'), dur);
}

// Quick position shake on an element.
export function shake(el) {
  if (reduced || !el) return;
  el.classList.remove('tg-shake');
  void el.offsetWidth;
  el.classList.add('tg-shake');
  el.addEventListener('animationend', () => el.classList.remove('tg-shake'), { once: true });
}

// A radial burst of particles from the center of an element.
// `shape` is 'dot' | 'coin' | 'shard' — coins for cooperation, shards for
// betrayal, so the confetti carries meaning.
export function burst(anchorEl, { color = '#f0c674', count = 12, shape = 'dot' } = {}) {
  if (reduced || !anchorEl) return;
  const rect = anchorEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const layer = document.createElement('div');
  layer.className = 'tg-burst';
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = `tg-particle tg-particle-${shape}`;
    const ang = (Math.PI * 2 * i) / count + Math.random() * 0.6;
    const dist = 34 + Math.random() * 46;
    p.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
    p.style.setProperty('--dy', `${Math.sin(ang) * dist}px`);
    p.style.setProperty('--rot', `${Math.random() * 360}deg`);
    p.style.left = `${cx}px`;
    p.style.top = `${cy}px`;
    if (shape !== 'coin') p.style.background = Array.isArray(color) ? color[i % color.length] : color;
    layer.appendChild(p);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 950);
}

// Mobile haptics. `pattern` is a number or array (ms), per the Vibration API.
// Gated behind reduced-motion, since it's a physical motion cue.
export function haptic(pattern) {
  if (reduced) return;
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch {}
}

// Briefly pulse an element (adds a class the CSS animates, then removes it).
export function pulse(el, cls = 'tg-pulse') {
  if (reduced || !el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}
