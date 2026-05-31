// Strategy schema, compilation, and URL encoding.
//
// A Strategy is data:
//   { id, name, color, source, description, config? | rules?, version: 1 }
//
// compileStrategy(spec) produces an executable form whose move() takes the
// full match context — including the strategy's own RNG, bound by runMatch.

import { parseCondition } from './conditions.js';
import { parseAction }    from './actions.js';

const SCHEMA_VERSION = 1;

// ── Compilation ───────────────────────────────────────────────────────────────

export function compileStrategy(spec) {
  if (!spec.id) throw new Error('Strategy spec missing id');
  const rules = spec.rules ?? configToRules(spec.config);
  if (!rules || rules.length === 0) {
    throw new Error(`Strategy ${spec.id} has neither rules nor config`);
  }

  // Pre-parse every condition/action so .move() is a tight loop with no
  // string splitting per call. Hot path for spatial sims (~5M move() calls
  // per generation on a 160×120 grid).
  const compiled = rules.map(r => ({
    cond:   parseCondition(r.if),
    action: parseAction(r.then),
  }));

  return {
    id:          spec.id,
    name:        spec.name,
    color:       spec.color,
    source:      spec.source,
    description: spec.description,
    spec,
    move(ctx) {
      for (let i = 0; i < compiled.length; i++) {
        if (compiled[i].cond(ctx)) return compiled[i].action(ctx);
      }
      throw new Error(`Strategy ${spec.id} matched no rule (missing 'always' default)`);
    },
  };
}

// Compile the SimplifiedConfig (builder UI shape) into condition-action rules.
// Five fields: opener, mode, reaction, forgiveness, noise.
// (noise is environment-level — applied in runMatch, not here.)
export function configToRules(config) {
  if (!config) return null;
  const { opener, mode, reaction, forgiveness = 0 } = config;

  const openerAction = opener === 'C' ? 'cooperate'
                     : opener === 'D' ? 'defect'
                     : 'random';

  if (mode === 'none') {
    return [{ if: 'always', then: openerAction }];
  }
  if (mode === 'random') {
    return [{ if: 'always', then: 'random' }];
  }

  const rules = [{ if: 'first-round', then: openerAction }];

  if (mode === 'opponent-reactive') {
    if (reaction === 'mirror') {
      if (forgiveness > 0) {
        rules.push({ if: 'opponent-last-was D', then: `random-weighted ${forgiveness}` });
        rules.push({ if: 'always', then: 'cooperate' });
      } else {
        rules.push({ if: 'always', then: 'mirror-opponent' });
      }
    } else if (reaction === 'mirror-after-two') {
      rules.push({ if: 'opponent-defected-count-in-last 2 at-least 2', then: 'defect' });
      rules.push({ if: 'always', then: 'cooperate' });
    } else if (reaction === 'permanent-punishment') {
      rules.push({ if: 'opponent-ever-defected', then: 'defect' });
      rules.push({ if: 'always', then: 'cooperate' });
    } else {
      throw new Error(`Unknown opponent-reactive reaction: ${reaction}`);
    }
  } else if (mode === 'outcome-reactive') {
    if (reaction === 'repeat-on-success') {
      rules.push({ if: 'last-round-payoff-was-good', then: 'repeat-last-move' });
      rules.push({ if: 'always', then: 'flip-last-move' });
    } else if (reaction === 'flip-on-success') {
      rules.push({ if: 'last-round-payoff-was-good', then: 'flip-last-move' });
      rules.push({ if: 'always', then: 'repeat-last-move' });
    } else {
      throw new Error(`Unknown outcome-reactive reaction: ${reaction}`);
    }
  } else {
    throw new Error(`Unknown mode: ${mode}`);
  }

  return rules;
}

// ── URL encoding ──────────────────────────────────────────────────────────────

export function encodeStrategy(spec) {
  const withVersion = { ...spec, version: spec.version ?? SCHEMA_VERSION };
  const json = JSON.stringify(withVersion);
  return base64urlEncode(json);
}

export function decodeStrategy(encoded) {
  const json = base64urlDecode(encoded);
  const spec = JSON.parse(json);
  return migrate(spec);
}

function migrate(spec) {
  const v = spec.version ?? 1;
  if (v === 1) return spec;
  throw new Error(`Unknown strategy schema version: ${v}`);
}

function base64urlEncode(str) {
  const b64 = btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(s) {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return decodeURIComponent(escape(atob(b64)));
}
