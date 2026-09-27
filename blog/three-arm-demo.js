const controls = document.getElementById('three-arm-controls');
const methods = document.getElementById('three-arm-methods');
const methodButtons = {
  npg: document.getElementById('three-arm-method-npg'),
  adam: document.getElementById('three-arm-method-adam'),
};
const settings = document.getElementById('three-arm-settings');
const caption = document.getElementById('three-arm-caption');
const playButton = document.getElementById('three-arm-play');
const stepInput = document.getElementById('three-arm-step');
const stepValue = document.getElementById('three-arm-step-value');
const simplexDescription = document.getElementById('simplex-desc');
const startMarker = document.getElementById('simplex-start');
const varianceKind = document.getElementById('variance-kind');
const varianceDescription = document.getElementById('variance-desc');
const varianceGrid = document.getElementById('variance-grid');
const varianceReadouts = {
  min: document.getElementById('variance-min-current'),
  value: document.getElementById('variance-value-current'),
};
const armNames = ['Blue', 'Orange', 'Gray'];
const armClasses = ['arm-best', 'arm-middle', 'arm-low'];
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
const varianceAxes = {
  npg: { min: 0.1, max: 10000, ticks: [0.1, 1, 10, 100, 1000, 10000] },
  adam: { min: 0.01, max: 0.1, ticks: [0.01, 0.02, 0.05, 0.1] },
};
const svgNamespace = 'http://www.w3.org/2000/svg';

let data;
let method = 'npg';
let coordinates;
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
  for (const kind of kinds) {
    const current = coordinates[kind][step];
    markers[kind].setAttribute('visibility', step === 0 ? 'hidden' : 'visible');
    markers[kind].setAttribute('cx', current.x.toFixed(2));
    markers[kind].setAttribute('cy', current.y.toFixed(2));
    trails[kind].setAttribute('d', step === 0 ? '' : linePath(coordinates[kind], step));
  }
  const min = data.methods[method].min[step].p;
  const value = data.methods[method].value[step].p;
  simplexDescription.textContent = `Step ${step}: minimum variance gives blue ${Math.round(min[0] * 100)}% and orange ${Math.round(min[1] * 100)}%; value baseline gives blue ${Math.round(value[0] * 100)}% and orange ${Math.round(value[1] * 100)}%.`;
}

function showPanel(panel, state) {
  const percentages = state.p.map(probability => Math.round(probability * 100));
  panel.querySelectorAll('.three-arm-numbers b').forEach((number, index) => {
    number.textContent = `${percentages[index]}%`;
  });
  panel.querySelector('.baseline-value').textContent =
    panel === panels.min ? `b* = ${state.b.toFixed(2)}` : `V = ${state.b.toFixed(2)}`;
  panel.querySelector('.three-arm-reward').textContent =
    (state.p[0] + 0.7 * state.p[1]).toFixed(2);
  const action = panel.querySelector('.three-arm-last-action');
  action.className = 'three-arm-last-action';
  if (state.lastAction === null) {
    action.textContent = 'Before the first choice';
  } else {
    action.textContent = `Just sampled ${armNames[state.lastAction].toLowerCase()}`;
    action.classList.add(armClasses[state.lastAction]);
  }
}

function varianceY(value) {
  const axis = varianceAxes[method];
  const clamped = Math.max(axis.min, Math.min(axis.max, value));
  return 172 - 150 * (Math.log10(clamped) - Math.log10(axis.min)) /
    (Math.log10(axis.max) - Math.log10(axis.min));
}

function formatVariance(value) {
  if (value >= 1000) return Math.round(value).toLocaleString('en-US');
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  return value.toPrecision(2);
}

function buildVarianceGrid() {
  varianceGrid.replaceChildren();
  for (const tick of varianceAxes[method].ticks) {
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
    label.textContent = tick >= 1000 ? `${tick / 1000}k` : String(tick);
    varianceGrid.appendChild(label);
  }
}

function showVariance() {
  const runs = data.methods[method];
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
  varianceDescription.textContent = `At step ${step}, the one-step gradient variance is ${formatVariance(runs.min[step].variance)} for minimum variance and ${formatVariance(runs.value[step].variance)} for the value baseline. Logarithmic vertical scale.`;
}

function render() {
  const runs = data.methods[method];
  showPanel(panels.min, runs.min[step]);
  showPanel(panels.value, runs.value[step]);
  showTriangle();
  showVariance();
  stepInput.value = step;
  stepValue.textContent = `${step} / ${data.steps}`;
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
  }, 80);
}

function chooseMethod(nextMethod) {
  pause();
  method = nextMethod;
  step = 0;
  coordinates = {
    min: data.methods[method].min.map(state => point(state.p)),
    value: data.methods[method].value.map(state => point(state.p)),
  };
  for (const name of Object.keys(methodButtons)) {
    methodButtons[name].setAttribute('aria-pressed', String(name === method));
  }
  buildVarianceGrid();
  if (method === 'npg') {
    settings.textContent = 'NPG · step size 0.15 · same random draws in both runs';
    varianceKind.textContent = 'Exact one-step natural-gradient variance at each policy, shown on a log scale.';
    caption.textContent = 'This selected on-policy NPG run starts uniformly. By step 120, the minimum-variance policy almost always picks orange (expected reward 0.70), while the value-baseline policy nearly always picks blue (about 1.00). Among 1,000 simulated runs, 103 minimum-variance runs and no value-baseline runs put over 95% probability on orange at step 120. The paper proves a nonzero chance of true suboptimal convergence from a uniform start; these finite runs illustrate it.';
  } else {
    settings.textContent = 'Vanilla policy gradient + Adam · step size 0.04 · β₁ = 0.9 · β₂ = 0.999 · ε = 10⁻⁸';
    varianceKind.textContent = 'Exact one-step variance of the raw policy gradient fed into Adam, before its moment updates; log scale.';
    caption.textContent = 'The Adam view uses the same uniform start and random-number seed. At step 120, both illustrated policies favor blue (about 92–93%); neither settles on orange. Among 1,000 simulated runs with these Adam settings, neither baseline put over 95% probability on orange at step 120. This is a separate empirical comparison, not the NPG convergence theorem.';
  }
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
  methodButtons[name].addEventListener('click', () => chooseMethod(name));
}

fetch('three-arm-trajectories.json')
  .then(response => {
    if (!response.ok) throw new Error('Animation data unavailable');
    return response.json();
  })
  .then(payload => {
    data = payload;
    stepInput.max = data.steps;
    methods.hidden = false;
    controls.hidden = false;
    chooseMethod('npg');
  })
  .catch(() => {
    // The written explanation and static figure remain available.
  });
