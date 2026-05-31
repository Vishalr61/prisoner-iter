// Seeded RNG with per-strategy derived streams.
//
// mulberry32 is a tiny, fast, well-distributed seedable PRNG. Each strategy
// in a match gets its own RNG derived from hash(masterSeed, strategyId), so
// a strategy's probabilistic decisions are deterministic and independent of
// which opponent it faces. See the architecture plan for why this matters.

export function makeRng(seed) {
  let state = (seed >>> 0) || 1;
  return {
    float() {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

// FNV-1a 32-bit string hash.
function hashString(str) {
  let h = 0x811C9DC5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Derive a per-strategy seed from (masterSeed, strategyId).
// Same master + same id → same stream, every time.
export function deriveSeed(masterSeed, strategyId) {
  const idHash = hashString(String(strategyId));
  // Mix the two with a 32-bit multiplier; avoids trivial collisions like
  // (seed=0, id='a') vs (seed=hash('a'), id='').
  return (Math.imul(masterSeed >>> 0, 0x9E3779B1) ^ idHash) >>> 0;
}

// Convenience: build an RNG keyed by (masterSeed, strategyId).
export function makeStrategyRng(masterSeed, strategyId) {
  return makeRng(deriveSeed(masterSeed, strategyId));
}
