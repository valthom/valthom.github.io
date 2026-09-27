const controls = document.getElementById('three-arm-controls');
const playButton = document.getElementById('three-arm-play');
const stepInput = document.getElementById('three-arm-step');
const stepValue = document.getElementById('three-arm-step-value');
const armNames = ['Blue', 'Orange', 'Gray'];
const armClasses = ['arm-best', 'arm-middle', 'arm-low'];
const panels = {
  min: document.getElementById('three-arm-min'),
  gap: document.getElementById('three-arm-gap'),
};

let data;
let step = 0;
let timer = null;

function showPanel(panel, state) {
  const percentages = state.p.map(probability => Math.round(probability * 100));
  const segments = panel.querySelectorAll('.three-arm-stack span');
  const numbers = panel.querySelectorAll('.three-arm-numbers b');
  state.p.forEach((probability, index) => {
    segments[index].style.width = `${probability * 100}%`;
    numbers[index].textContent = `${percentages[index]}%`;
  });
  panel.querySelector('.three-arm-stack').setAttribute(
    'aria-label', armNames.map((name, index) => `${name} ${percentages[index]}%`).join(', ')
  );
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
    stepInput.max = data.steps;
    controls.hidden = false;
    render();
  })
  .catch(() => {
    // The written example and math remain available if the data cannot load.
  });
