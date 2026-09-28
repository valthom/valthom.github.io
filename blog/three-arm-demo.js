const controls = document.getElementById('three-arm-controls');
const methods = document.getElementById('three-arm-methods');
const methodButtons = {
  npg: document.getElementById('three-arm-method-npg'),
  adam: document.getElementById('three-arm-method-adam'),
};
const startButtons = {
  uniform: document.getElementById('three-arm-start-uniform'),
  orange: document.getElementById('three-arm-start-orange'),
};
const settings = document.getElementById('three-arm-settings');
const caption = document.getElementById('three-arm-caption');
const playButton = document.getElementById('three-arm-play');
const stepInput = document.getElementById('three-arm-step');
const stepValue = document.getElementById('three-arm-step-value');
const simplexDescription = document.getElementById('simplex-desc');
const startMarker = document.getElementById('simplex-start');
const sampleLayer = document.getElementById('simplex-samples');
const varianceKind = document.getElementById('variance-kind');
const varianceDescription = document.getElementById('variance-desc');
const varianceGrid = document.getElementById('variance-grid');
const varianceReadouts = {
  min: document.getElementById('variance-min-current'),
  value: document.getElementById('variance-value-current'),
};
const kinds = ['min', 'value'];
const panels = {
  min: document.getElementById('three-arm-min'),
  value: document.getElementById('three-arm-value'),
};
const trails = {
  min: document.getElementById('simplex-trail-min'),
  value: document.getElementById('simplex-trail-value'),
};
const markers = {
  min: document.getElementById('simplex-marker-min'),
  value: document.getElementById('simplex-marker-value'),
};
const variancePaths = {
  min: document.getElementById('variance-path-min'),
  value: document.getElementById('variance-path-value'),
};
const varianceMarkers = {
  min: document.getElementById('variance-marker-min'),
  value: document.getElementById('variance-marker-value'),
};
const concentrationPaths = {
  min: document.getElementById('concentration-path-min'),
  value: document.getElementById('concentration-path-value'),
};
const concentrationMarkers = {
  min: document.getElementById('concentration-marker-min'),
  value: document.getElementById('concentration-marker-value'),
};
const concentrationReadouts = {
  min: document.getElementById('concentration-min-current'),
  value: document.getElementById('concentration-value-current'),
};
let varianceAxis;
const svgNamespace = 'http://www.w3.org/2000/svg';

let data;
let method = 'adam';
let start = 'uniform';
let coordinates;
let sampleTrails = [];
let step = 0;
let timer = null;

function point(policy) {
  const [blue, orange, gray] = policy;
  return {
    x: 170 * blue + 42 * orange + 298 * gray,
    y: 38 * blue + 252 * orange + 252 * gray,
  };
}

function linePath(points, lastStep) {
  return points.slice(0, lastStep + 1)
    .map((position, index) => `${index === 0 ? 'M' : 'L'}${position.x.toFixed(2)} ${position.y.toFixed(2)}`)
    .join(' ');
}

function showTriangle() {
  startMarker.setAttribute('visibility', step === 0 ? 'visible' : 'hidden');
  for (const sample of sampleTrails) {
    sample.path.setAttribute('d', step === 0 ? '' : linePath(sample.points, step));
    sample.marker.setAttribute('visibility', step === 0 ? 'hidden' : 'visible');
    sample.marker.setAttribute('cx', sample.points[step].x.toFixed(2));
    sample.marker.setAttribute('cy', sample.points[step].y.toFixed(2));
  }
  for (const kind of kinds) {
    const current = coordinates[kind][step];
    markers[kind].setAttribute('visibility', step === 0 ? 'hidden' : 'visible');
    markers[kind].setAttribute('cx', current.x.toFixed(2));
    markers[kind].setAttribute('cy', current.y.toFixed(2));
    trails[kind].setAttribute('d', step === 0 ? '' : linePath(coordinates[kind], step));
  }
  const min = data.starts[start].methods[method].min[step].p;
  const value = data.starts[start].methods[method].value[step].p;
  simplexDescription.textContent = `Five faint trajectories per baseline, with bold pointwise averages. Step ${step}: mean minimum-variance policy gives blue ${Math.round(min[0] * 100)}% and orange ${Math.round(min[1] * 100)}%; mean value-baseline policy gives blue ${Math.round(value[0] * 100)}% and orange ${Math.round(value[1] * 100)}%.`;
}

function showPanel(panel, state) {
  const percentages = state.p.map(probability => Math.round(probability * 100));
  panel.querySelectorAll('.three-arm-numbers b').forEach((number, index) => {
    number.textContent = `${percentages[index]}%`;
  });
  panel.querySelector('.baseline-value').textContent =
    panel === panels.min ? `Mean b* = ${state.b.toFixed(2)}` : `Mean V = ${state.b.toFixed(2)}`;
  panel.querySelector('.three-arm-reward').textContent =
    (state.p[0] + 0.7 * state.p[1]).toFixed(2);
  panel.querySelector('.three-arm-last-action').textContent = 'Average of 5 runs';
}

function varianceY(value) {
  const axis = varianceAxis;
  const clamped = Math.max(axis.min, Math.min(axis.max, value));
  return 172 - 150 * (Math.log10(clamped) - Math.log10(axis.min)) /
    (Math.log10(axis.max) - Math.log10(axis.min));
}

function formatVariance(value) {
  if (value >= 1000000) return value.toExponential(2);
  if (value >= 1000) return Math.round(value).toLocaleString('en-US');
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  return value.toPrecision(2);
}

function buildVarianceGrid() {
  varianceGrid.replaceChildren();
  const runs = data.starts[start].methods[method];
  const values = kinds.flatMap(kind => runs[kind].map(state => state.variance));
  const low = Math.floor(Math.log10(Math.min(...values)));
  const high = Math.max(low + 1, Math.ceil(Math.log10(Math.max(...values))));
  const stride = Math.max(1, Math.ceil((high - low) / 5));
  const ticks = [];
  for (let exponent = low; exponent < high; exponent += stride) ticks.push(10 ** exponent);
  ticks.push(10 ** high);
  varianceAxis = { min: 10 ** low, max: 10 ** high, ticks };
  for (const tick of ticks) {
    const y = varianceY(tick);
    const line = document.createElementNS(svgNamespace, 'line');
    line.setAttribute('x1', '50');
    line.setAttribute('x2', '500');
    line.setAttribute('y1', y.toFixed(2));
    line.setAttribute('y2', y.toFixed(2));
    line.setAttribute('class', 'variance-grid-line');
    varianceGrid.appendChild(line);
    const label = document.createElementNS(svgNamespace, 'text');
    label.setAttribute('x', '43');
    label.setAttribute('y', (y + 4).toFixed(2));
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('class', 'variance-axis-label');
    label.textContent = tick >= 1000000 ? tick.toExponential(0).replace('+', '') : tick >= 1000 ? `${tick / 1000}k` : String(tick);
    varianceGrid.appendChild(label);
  }
}

function showVariance() {
  const runs = data.starts[start].methods[method];
  for (const kind of kinds) {
    const states = runs[kind];
    const positions = states.map((state, index) => ({
      x: 50 + 450 * index / data.steps,
      y: varianceY(state.variance),
    }));
    variancePaths[kind].setAttribute('d', linePath(positions, step));
    varianceMarkers[kind].setAttribute('cx', positions[step].x.toFixed(2));
    varianceMarkers[kind].setAttribute('cy', positions[step].y.toFixed(2));
    varianceReadouts[kind].textContent = formatVariance(states[step].variance);
  }
  varianceDescription.textContent = `At step ${step}, mean one-step gradient variance across five runs is ${formatVariance(runs.min[step].variance)} for minimum variance and ${formatVariance(runs.value[step].variance)} for the value baseline. Logarithmic vertical scale.`;
}

function render() {
  const runs = data.starts[start].methods[method];
  showPanel(panels.min, runs.min[step]);
  showPanel(panels.value, runs.value[step]);
  showTriangle();
  showVariance();
  showConcentration();
  stepInput.value = step;
  stepValue.textContent = `${step} / ${data.steps}`;
}

function showConcentration() {
  const counts = data.starts[start].methods[method].cohortMiddleOver95ByStep;
  for (const kind of kinds) {
    const positions = counts[kind].map((count, index) => ({
      x: 50 + 450 * index / data.steps,
      y: 172 - 150 * count / data.cohortSize,
    }));
    concentrationPaths[kind].setAttribute('d', linePath(positions, step));
    concentrationMarkers[kind].setAttribute('cx', positions[step].x.toFixed(2));
    concentrationMarkers[kind].setAttribute('cy', positions[step].y.toFixed(2));
    const count = counts[kind][step];
    concentrationReadouts[kind].textContent = `${(100 * count / data.cohortSize).toFixed(1)}% (${count}/${data.cohortSize.toLocaleString('en-US')})`;
  }
  document.getElementById('concentration-desc').textContent = `Step ${step}: ${counts.min[step]} of ${data.cohortSize} minimum-variance seeds and ${counts.value[step]} value-baseline seeds assign over 95% probability to the suboptimal orange arm.`;
}

function pause() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  playButton.textContent = step === data.steps ? 'Replay' : 'Play';
}

function togglePlayback() {
  if (timer !== null) {
    pause();
    return;
  }
  if (step === data.steps) step = 0;
  render();
  playButton.textContent = 'Pause';
  timer = setInterval(() => {
    step += 1;
    render();
    if (step === data.steps) pause();
  }, Math.max(25, 8000 / data.steps));
}

function chooseScenario(nextStart, nextMethod) {
  pause();
  start = nextStart;
  method = nextMethod;
  step = 0;
  const startPoint = point(data.starts[start].policy);
  startMarker.setAttribute('cx', startPoint.x.toFixed(2));
  startMarker.setAttribute('cy', startPoint.y.toFixed(2));
  coordinates = {
    min: data.starts[start].methods[method].min.map(state => point(state.p)),
    value: data.starts[start].methods[method].value.map(state => point(state.p)),
  };
  sampleLayer.replaceChildren();
  sampleTrails = [];
  for (const kind of kinds) {
    for (const policies of data.starts[start].methods[method].samples[kind]) {
      const path = document.createElementNS(svgNamespace, 'path');
      path.setAttribute('class', `simplex-sample simplex-sample-${kind}`);
      const marker = document.createElementNS(svgNamespace, 'circle');
      marker.setAttribute('class', `simplex-sample-dot simplex-sample-dot-${kind}`);
      marker.setAttribute('r', '3');
      sampleLayer.appendChild(path);
      sampleLayer.appendChild(marker);
      sampleTrails.push({ path, marker, points: policies.map(policy => point(policy)) });
    }
  }
  for (const name of Object.keys(methodButtons)) {
    methodButtons[name].setAttribute('aria-pressed', String(name === method));
  }
  for (const name of Object.keys(startButtons)) {
    startButtons[name].setAttribute('aria-pressed', String(name === start));
  }
  buildVarianceGrid();
  const initial = start === 'uniform' ? 'uniformly (33% per arm)' : 'favoring orange (10% blue, 80% orange, 10% gray)';
  if (method === 'npg') {
    settings.textContent = `Starts ${initial} · NPG step size 0.15 · paired random draws`;
    varianceKind.textContent = 'Exact one-step natural-gradient variance at each learner’s policy, averaged across the five displayed runs; log scale.';
  } else {
    settings.textContent = `Starts ${initial} · policy gradient + Adam step size 0.04 · β₁ = 0.9 · β₂ = 0.999 · ε = 10⁻⁸`;
    varianceKind.textContent = 'Exact one-step variance of the raw policy gradient before Adam’s moment updates, averaged across the five displayed runs; log scale.';
  }
  const runs = data.starts[start].methods[method];
  const minBlue = Math.round(runs.min[data.steps].p[0] * 100);
  const valueBlue = Math.round(runs.value[data.steps].p[0] * 100);
  const counts = runs.cohortMiddleOver95;
  caption.textContent = `Faint curves show five paired on-policy runs (seeds ${data.sampleSeeds[0]}–${data.sampleSeeds[data.sampleSeeds.length - 1]}). Bold curves and readouts average those same five runs at each step; this average need not be the path of any individual learner. At step ${data.steps}, the mean policies put ${minBlue}% on blue with minimum variance and ${valueBlue}% with the value baseline. In a separate 1,000-seed cohort, ${counts.min} minimum-variance runs versus ${counts.value} value-baseline runs put over 95% on orange at step ${data.steps}. These are finite-run results, not eventual-convergence claims.`;
  render();
  playButton.textContent = 'Play';
}

playButton.addEventListener('click', togglePlayback);
stepInput.addEventListener('input', () => {
  pause();
  step = Number(stepInput.value);
  render();
});
for (const name of Object.keys(methodButtons)) {
  methodButtons[name].addEventListener('click', () => chooseScenario(start, name));
}
for (const name of Object.keys(startButtons)) {
  startButtons[name].addEventListener('click', () => chooseScenario(name, method));
}

fetch('three-arm-trajectories.json?v=500-steps')
  .then(response => {
    if (!response.ok) throw new Error('Animation data unavailable');
    return response.json();
  })
  .then(payload => {
    data = payload;
    stepInput.max = data.steps;
    methods.hidden = false;
    document.getElementById('three-arm-starts').hidden = false;
    controls.hidden = false;
    chooseScenario('uniform', 'adam');
  })
  .catch(() => {
    // The written explanation and static figure remain available.
  });
