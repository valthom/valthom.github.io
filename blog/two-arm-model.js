/* Deterministic on-policy bandit simulations shared by the interactive controls. */
(function (root) {
  'use strict';
  const steps = 500;
  const runs = 1000;
  const sampleRuns = 100;
  const seed = 2026;
  let uniforms;

  function sigmoid(value) {
    if (value >= 0) return 1 / (1 + Math.exp(-value));
    const exp = Math.exp(value);
    return exp / (1 + exp);
  }

  function draws() {
    if (uniforms) return uniforms;
    uniforms = new Float64Array(runs * steps);
    let state = seed;
    // Mulberry32. All settings and both baselines reuse the same random draws;
    // the sampled actions still depend on each learner's current probabilities.
    for (let i = 0; i < uniforms.length; i++) {
      state = (state + 0x6D2B79F5) >>> 0;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      uniforms[i] = ((value ^ value >>> 14) >>> 0) / 4294967296;
    }
    return uniforms;
  }

  function simulate(method, initialBlue, learningRate) {
    if (!['npg', 'adam'].includes(method) || !(initialBlue > 0 && initialBlue < 1) || !(learningRate > 0 && Number.isFinite(learningRate))) {
      throw new Error('Invalid bandit settings');
    }
    const randomDraws = draws();
    const initialLogOdds = Math.log(initialBlue / (1 - initialBlue));
    const corrections = [];
    for (let t = 1; t <= steps; t++) corrections.push([1 - Math.pow(0.9, t), 1 - Math.pow(0.999, t)]);
    const result = { steps, runs, sampleRuns, seed, method, initialBlue, learningRate };
    for (const [kind, baseline] of [['low', -0.4], ['high', 0.4]]) {
      const mean = new Array(steps + 1).fill(0);
      const belowPointOne = new Array(steps + 1).fill(0);
      const samples = [];
      for (let run = 0; run < runs; run++) {
        let logOdds = initialLogOdds;
        let first = 0;
        let second = 0;
        const curve = run < sampleRuns ? new Array(steps + 1) : null;
        for (let t = 0; t <= steps; t++) {
          const p = t === 0 ? initialBlue : sigmoid(logOdds);
          mean[t] += p;
          belowPointOne[t] += Number(p < 0.1);
          if (curve) curve[t] = p;
          if (t === steps) break;
          const blue = randomDraws[run * steps + t] < p;
          const advantage = Number(blue) - baseline;
          if (method === 'npg') {
            logOdds += learningRate * advantage / (blue ? p : 1 - p) * (blue ? 1 : -1);
          } else {
            const gradient = advantage * (Number(blue) - p);
            first = 0.9 * first + 0.1 * gradient;
            second = 0.999 * second + 0.001 * gradient * gradient;
            const [firstCorrection, secondCorrection] = corrections[t];
            // Two softmax logits have opposite gradients and moments. Their
            // difference therefore takes twice this bias-corrected Adam step.
            logOdds += 2 * learningRate * (first / firstCorrection) / (Math.sqrt(second / secondCorrection) + 1e-8);
          }
        }
        if (curve) samples.push(curve);
      }
      result[kind] = { baseline, mean: mean.map(value => value / runs), samples, belowPointOne };
    }
    return result;
  }

  const model = { simulate, sigmoid, steps, runs, sampleRuns, seed };
  if (typeof module !== 'undefined' && module.exports) module.exports = model;
  else root.BaselineBandit = model;
})(typeof window !== 'undefined' ? window : globalThis);
