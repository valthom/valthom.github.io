const controls = document.getElementById('three-arm-controls');
const playButton = document.getElementById('three-arm-play');
const stepInput = document.getElementById('three-arm-step');
const stepValue = document.getElementById('three-arm-step-value');
const simplexDescription = document.getElementById('simplex-desc');
const startMarker = document.getElementById('simplex-start');
const trails = {
  min: document.getElementById('simplex-trail-min'),
  gap: document.getElementById('simplex-trail-gap'),
};
const markers = {
  min: document.getElementById('simplex-marker-min'),
  gap: document.getElementById('simplex-marker-gap'),
};
const armNames = ['Blue', 'Orange', 'Gray'];
const armClasses = ['arm-best', 'arm-middle', 'arm-low'];
const panels = {
  min: document.getElementById('three-arm-min'),
  gap: document.getElementById('three-arm-gap'),
};

let data;
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

function showTriangle() {
  startMarker.setAttribute('visibility', step === 0 ? 'visible' : 'hidden');
  for (const kind of ['min', 'gap']) {
    const current = coordinates[kind][step];
    markers[kind].setAttribute('visibility', step === 0 ? 'hidden' : 'visible');
    markers[kind].setAttribute('cx', current.x.toFixed(2));
    markers[kind].setAttribute('cy', current.y.toFixed(2));
    const path = coordinates[kind].slice(0, step + 1)
      .map((position, index) => `${index === 0 ? 'M' : 'L'}${position.x.toFixed(2)} ${position.y.toFixed(2)}`)
      .join(' ');
    trails[kind].setAttribute('d', step === 0 ? '' : path);
  }
  const min = data.min[step].p;
  const gap = data.gap[step].p;
  simplexDescription.textContent = `Step ${step}: minimum variance gives blue ${Math.round(min[0] * 100)}% and orange ${Math.round(min[1] * 100)}%; gap baseline gives blue ${Math.round(gap[0] * 100)}% and orange ${Math.round(gap[1] * 100)}%.`;
}

function showPanel(panel, state) {
  const percentages = state.p.map(probability => Math.round(probability * 100));
  const numbers = panel.querySelectorAll('.three-arm-numbers b');
  state.p.forEach((_, index) => {
    numbers[index].textContent = `${percentages[index]}%`;
  });
  panel.querySelector('.baseline-value').textContent =
    panel === panels.min ? `b* = ${state.b.toFixed(2)}` : `b = ${state.b.toFixed(2)}`;
  const reward = state.p[0] + 0.7 * state.p[1];
  panel.querySelector('.three-arm-reward').textContent = reward.toFixed(2);
  const action = panel.querySelector('.three-arm-last-action');
  action.className = 'three-arm-last-action';
  if (state.lastAction === null) {
    action.textContent = 'Before the first choice';
  } else {
    action.textContent = `Just sampled ${armNames[state.lastAction].toLowerCase()}`;
    action.classList.add(armClasses[state.lastAction]);
  }
}

function render() {
  showPanel(panels.min, data.min[step]);
  showPanel(panels.gap, data.gap[step]);
  showTriangle();
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

playButton.addEventListener('click', togglePlayback);
stepInput.addEventListener('input', () => {
  pause();
  step = Number(stepInput.value);
  render();
});

fetch('three-arm-trajectories.json')
  .then(response => {
    if (!response.ok) throw new Error('Animation data unavailable');
    return response.json();
  })
  .then(payload => {
    data = payload;
    coordinates = {
      min: data.min.map(state => point(state.p)),
      gap: data.gap.map(state => point(state.p)),
    };
    stepInput.max = data.steps;
    controls.hidden = false;
    render();
  })
  .catch(() => {
    // The written example and math remain available if the data cannot load.
  });
