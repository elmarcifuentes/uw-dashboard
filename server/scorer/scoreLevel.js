// Weights for the final score
const W1 = 0.35; // options_bias
const W2 = 0.35; // dark_pool_strength
const W3 = 0.20; // flow_bias
const W4 = 0.10; // distance_weighting

// Window sizes as fraction of level price
const TOUCH_PCT   = 0.0010; // ±0.10%
const WINDOW_PCT  = 0.0030; //  0.30%

function clamp(val, min = -100, max = 100) {
  return Math.max(min, Math.min(max, val));
}

// Scale a -1..1 raw signal to 0..100 (50 = neutral)
function to100(raw) {
  return clamp(Math.round((raw + 1) * 50), 0, 100);
}

// ─── Options bias from options-volume (session-wide, uniform across all levels)
function computeOptionsBias(optionsVolume) {
  const d = optionsVolume?.data ?? optionsVolume ?? {};
  // options-volume may return an array (one row per date) or a single object
  const row = Array.isArray(d) ? d[0] : d;

  const callVol = parseFloat(row?.call_volume ?? row?.calls_volume ?? 0);
  const putVol  = parseFloat(row?.put_volume  ?? row?.puts_volume  ?? 0);

  const total = callVol + putVol;
  if (total === 0) return 0;
  return (callVol - putVol) / total; // -1..1
}

// ─── Dark pool strength ─────────────────────────────────────────────────────
function computeDarkPoolStrength(level, darkPoolData) {
  const L = level.price;
  const supportLo = L * (1 - WINDOW_PCT);
  const supportHi = L;
  const resistLo  = L;
  const resistHi  = L * (1 + WINDOW_PCT);

  const prints = darkPoolData?.data ?? darkPoolData ?? [];

  let belowNotional = 0, aboveNotional = 0;

  for (const print of prints) {
    const price    = parseFloat(print.price ?? print.executed_price ?? 0);
    const notional = parseFloat(print.premium ?? print.notional ?? print.size ?? 0);

    if (price >= supportLo && price <= supportHi) belowNotional += notional;
    if (price >= resistLo  && price <= resistHi)  aboveNotional += notional;
  }

  const total = belowNotional + aboveNotional;
  if (total === 0) return 0;
  // positive = bullish (activity below/at level), negative = bearish (above)
  return (belowNotional - aboveNotional) / total; // -1..1
}

// ─── Flow bias filtered to level's ±0.30% strike window ────────────────────
function computeFlowBias(level, flowData) {
  const L  = level.price;
  const lo = L * 0.997;
  const hi = L * 1.003;

  const alerts = flowData?.data ?? flowData ?? [];

  let bullishPremium = 0, bearishPremium = 0, matchCount = 0;

  for (const alert of alerts) {
    const strike = parseFloat(alert.strike ?? alert.strike_price ?? 0);
    if (strike < lo || strike > hi) continue;

    matchCount++;
    const premium = parseFloat(alert.total_premium ?? alert.premium ?? 0);
    const side    = (alert.type ?? alert.sentiment ?? alert.put_call ?? '').toLowerCase();

    if (side === 'call' || side === 'bullish') {
      bullishPremium += premium;
    } else if (side === 'put' || side === 'bearish') {
      bearishPremium += premium;
    }
  }

  const total = bullishPremium + bearishPremium;
  const bias  = total === 0 ? 0 : (bullishPremium - bearishPremium) / total;
  return { bias, matchCount }; // -1..1 + diagnostic count
}

// ─── Distance weighting ─────────────────────────────────────────────────────
// Returns a 0..1 multiplier; closer to level = closer to 1
function distanceWeight(level, referenceSignal) {
  // Here we use the level's own price as the reference point.
  // For now we return a neutral 1.0 (no distance reduction at exact level).
  // In live use you'd pass in the actual traded price. We include it as w4
  // contribution as a flat 50 (neutral) baseline since we have no live price.
  return 0; // contributes 0 raw signal until a live price is fed in
}

// ─── Main scoring function ──────────────────────────────────────────────────
export function scoreLevel(level, { darkPoolData, flowData, optionsVolume }) {
  const optionsBiasRaw            = computeOptionsBias(optionsVolume);
  const darkPoolRaw               = computeDarkPoolStrength(level, darkPoolData);
  const { bias: flowBiasRaw, matchCount: flowMatchCount } = computeFlowBias(level, flowData);

  const MIN_FLOW_MATCHES = 4;
  const flowBiasEffective = flowMatchCount >= MIN_FLOW_MATCHES ? flowBiasRaw : 0;
  const flowZeroed        = flowMatchCount < MIN_FLOW_MATCHES;

  // Convert each -1..1 raw to 0..100
  const optionsBias100 = to100(optionsBiasRaw);
  const darkPool100    = to100(darkPoolRaw);
  const flowBias100    = to100(flowBiasEffective); // uses zeroed value when below threshold
  const distance100    = 50; // neutral baseline (no live price available)

  const composite = Math.round(
    W1 * optionsBias100 +
    W2 * darkPool100    +
    W3 * flowBias100    +
    W4 * distance100
  );

  const buy_support_score     = composite;
  const sell_resistance_score = 100 - composite;
  // continuation uses effective bias so sparse-match levels don't inflate cont score
  const continuationRaw       = Math.abs((optionsBiasRaw + darkPoolRaw + flowBiasEffective) / 3);
  const continuation_score    = Math.round(continuationRaw * 100);

  return {
    level_id: level.level_id,
    price: level.price,
    type: level.type,
    raw: {
      options_bias:     +optionsBiasRaw.toFixed(4),
      dark_pool:        +darkPoolRaw.toFixed(4),
      flow_bias:        +flowBiasRaw.toFixed(4),     // raw value always displayed
      flow_bias_used:   +flowBiasEffective.toFixed(4), // what actually went into score
      flow_match_count: flowMatchCount,
      flow_zeroed:      flowZeroed,
    },
    scores: {
      buy_support_score,
      sell_resistance_score,
      continuation_score,
    },
  };
}

// ─── Classification ─────────────────────────────────────────────────────────
export function classifyLevel(scored) {
  const { buy_support_score: buy, sell_resistance_score: sell, continuation_score: cont } = scored.scores;

  let classification = 'no_edge';

  if (buy >= 65 && (buy - sell) >= 15)        classification = 'buy_support';
  else if (sell >= 65 && (sell - buy) >= 15)  classification = 'sell_resistance';
  else if (cont >= 60 && Math.min(buy, sell) < 45) classification = 'continuation';

  // Type-aware structural conflict detection
  let structural_conflict = false;
  if (scored.type === 'support' && classification === 'sell_resistance')     structural_conflict = true;
  if (scored.type === 'resistance' && classification === 'buy_support')       structural_conflict = true;

  // Mid-level continuation direction
  let continuation_direction = null;
  if (scored.type === 'mid' && classification === 'continuation') {
    continuation_direction = scored.raw.options_bias + scored.raw.dark_pool + scored.raw.flow_bias > 0
      ? 'up'
      : 'down';
  }

  return {
    ...scored,
    classification,
    structural_conflict,
    continuation_direction,
  };
}

// ─── GEX context — display only, not used in scoring ───────────────────────
const GEX_WINDOW_PCT = 0.010; // ±1.0% — wide enough to capture $5-increment strikes

export function gexContext(level, gexData) {
  const L  = level.price;
  const lo = L * (1 - GEX_WINDOW_PCT);
  const hi = L * (1 + GEX_WINDOW_PCT);

  const rows = gexData?.data ?? gexData ?? [];
  let net_gex = 0, absSum = 0;

  for (const row of rows) {
    const strike = parseFloat(row.strike ?? 0);
    if (strike < lo || strike > hi) continue;
    const cg = parseFloat(row.call_gex ?? 0);
    const pg = parseFloat(row.put_gex  ?? 0);
    net_gex += cg + pg;
    absSum  += Math.abs(cg) + Math.abs(pg);
  }

  // neutral band: net is less than 5% of total absolute GEX in window
  let gex_bias = 'neutral';
  if (absSum > 0 && Math.abs(net_gex) / absSum > 0.05) {
    gex_bias = net_gex > 0 ? 'pinning' : 'expansion';
  }

  return { net_gex: Math.round(net_gex), gex_bias };
}

// ─── Confidence tier ────────────────────────────────────────────────────────
// Base tier from score + flow count. Structural conflict is a separate annotation
// and does not reduce tier here — it flags label/classification mismatch only.
// ETF tide modifier is applied externally in index.js.
//
//   high   — score ≥ 70, flow ≥ 8
//   medium — score ≥ 65, flow ≥ 4  (includes score ≥ 70 with sparse flow)
//   none   — no_edge, flow < 4, or score < 65
export function getConfidenceTier(result) {
  const { classification, scores, raw } = result;
  if (classification === 'no_edge') return 'none';
  if (raw.flow_match_count < 4) return 'none';

  const primaryScore = classification === 'buy_support'
    ? scores.buy_support_score
    : classification === 'sell_resistance'
    ? scores.sell_resistance_score
    : scores.continuation_score;

  if (primaryScore < 65) return 'none';
  if (primaryScore >= 70 && raw.flow_match_count >= 8) return 'high';
  return 'medium';
}

// ─── Plain-English summary ──────────────────────────────────────────────────
export function toPlainEnglish(result) {
  const { level_id, classification, continuation_direction, structural_conflict, scores, raw } = result;
  const { buy_support_score: buy, sell_resistance_score: sell, continuation_score: cont } = scores;

  const conflictNote = structural_conflict ? ' ⚠ structural conflict with level type.' : '';

  switch (classification) {
    case 'buy_support':
      return `${level_id} → buy_support (score ${buy}) — call-heavy exposure and bullish flow confirm likely support on first touch.${conflictNote}`;

    case 'sell_resistance':
      return `${level_id} → sell_resistance (score ${sell}) — put-heavy strikes overhead and bearish flow confirm likely rejection on first touch.${conflictNote}`;

    case 'continuation': {
      const dir = continuation_direction ?? (buy > sell ? 'up' : 'down');
      const toward = dir === 'up' ? 'upward' : 'downward';
      const score  = dir === 'up' ? buy : sell;
      return `${level_id} → continuation_${dir} (score ${cont}) — weak opposing data at level, dominant bias suggests ${toward} continuation.${conflictNote}`;
    }

    default:
      return `${level_id} → no_edge — mixed or insufficient data; level does not show a high-confidence setup.${conflictNote}`;
  }
}
