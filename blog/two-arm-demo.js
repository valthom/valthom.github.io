const twoArmFigure = document.getElementById('two-arm-interactive');
const twoArmStatic = document.getElementById('two-arm-static');
const twoArmButtons = {
  npg: document.getElementById('two-arm-method-npg'),
  adam: document.getElementById('two-arm-method-adam'),
};
const twoArmSettings = document.getElementById('two-arm-settings');
const twoArmCaption = document.getElementById('two-arm-caption');
const twoArmPlay = document.getElementById('two-arm-play');
const twoArmStepInput = document.getElementById('two-arm-step');
const twoArmStepValue = document.getElementById('two-arm-step-value');
const twoArmPanels = {
  low: {
    lines: document.getElementById('two-arm-lines-low'),
    clip: document.getElementById('two-arm-clip-rect-low'),
    dot: document.getElementById('two-arm-dot-low'),
    readout: document.getElementById('two-arm-readout-low'),
  },
  high: {
    lines: document.getElementById('two-arm-lines-high'),
    clip: document.getElementById('two-arm-clip-rect-high'),
    dot: document.getElementById('two-arm-dot-high'),
    readout: document.getElementById('two-arm-readout-high'),
  },
};
const twoArmSvgNamespace = 'http://www.w3.org/2000/svg';
let twoArmData;
let twoArmMethod = 'adam';
let twoArmStep = 0;
let twoArmTimer = null;

function twoArmX(step) {
  return 42 + 250 * step / twoArmData.steps;
}

function twoArmY(reward) {
  return 230 - 210 * reward;
}

function twoArmPoints(curve) {
  return curve.map((reward, step) => `${twoArmX(step).toFixed(2)},${twoArmY(reward).toFixed(2)}`).join(' ');
}

function addTwoArmLine(parent, curve, className) {
  const line = document.createElementNS(twoArmSvgNamespace, 'polyline');
  line.setAttribute('points', twoArmPoints(curve));
  line.setAttribute('class', className);
  parent.appendChild(line);
}

function drawTwoArmCurves() {
  for (const kind of ['low', 'high']) {
    const panel = twoArmPanels[kind];
    const curves = twoArmData.methods[twoArmMethod][kind];
    panel.lines.replaceChildren();
    for (const curve of curves.samples) addTwoArmLine(panel.lines, curve, 'two-arm-sample-line');
    addTwoArmLine(panel.lines, curves.mean, 'two-arm-mean-line');
  }
}

function showTwoArmStep() {
  const x = twoArmX(twoArmStep);
  for (const kind of ['low', 'high']) {
    const panel = twoArmPanels[kind];
    const curves = twoArmData.methods[twoArmMethod][kind];
    const mean = curves.mean[twoArmStep];
    panel.clip.setAttribute('width', (x - 42 + 1).toFixed(2));
    panel.dot.setAttribute('cx', x.toFixed(2));
    panel.dot.setAttribute('cy', twoArmY(mean).toFixed(2));
    panel.readout.textContent = `Mean reward ${mean.toFixed(2)} · ${curves.belowPointOne[twoArmStep].toLocaleString('en-US')}/1,000 runs below 0.1`;
  }
  twoArmStepInput.value = twoArmStep;
  twoArmStepValue.textContent = `${twoArmStep} / ${twoArmData.steps}`;
}

function pauseTwoArm() {
  if (twoArmTimer !== null) {
    clearInterval(twoArmTimer);
    twoArmTimer = null;
  }
  twoArmPlay.textContent = twoArmStep === twoArmData.steps ? 'Replay' : 'Play';
}

function toggleTwoArm() {
  if (twoArmTimer !== null) {
    pauseTwoArm();
    return;
  }
  if (twoArmStep === twoArmData.steps) twoArmStep = 0;
  showTwoArmStep();
  twoArmPlay.textContent = 'Pause';
  twoArmTimer = setInterval(() => {
    twoArmStep += 1;
    showTwoArmStep();
    if (twoArmStep === twoArmData.steps) pauseTwoArm();
  }, 100);
}

function chooseTwoArmMethod(method) {
  pauseTwoArm();
  twoArmMethod = method;
  twoArmStep = 0;
  for (const name of Object.keys(twoArmButtons)) {
    twoArmButtons[name].setAttribute('aria-pressed', String(name === method));
  }
  if (method === 'npg') {
    twoArmSettings.textContent = 'Starts with 50% blue · NPG step size 0.5 · paired random draws';
    twoArmCaption.textContent = 'Faint lines show 100 example runs; thick lines average 1,000 runs per baseline. Each run samples its next button from its current policy. With NPG, the low baseline leaves 87 of 1,000 runs below 0.1 expected reward at step 60; the higher baseline leaves none. This finite simulation starts at 50% blue and uses a step size of 0.5.';
  } else {
    twoArmSettings.textContent = 'Starts with 50% blue · policy gradient + Adam step size 0.04 · β₁ = 0.9 · β₂ = 0.999 · ε = 10⁻⁸';
    twoArmCaption.textContent = 'Faint lines show 100 example runs; thick lines average 1,000 runs per baseline. With Adam on the raw score-function gradient, the mean expected reward at step 60 is 0.88 for the low baseline versus 0.96 for the higher baseline. No sampled run is below 0.1 at step 60 in this setting: here the low baseline mainly slows improvement rather than producing a visible failure. Both runs start at 50% blue and use paired on-policy draws.';
  }
  drawTwoArmCurves();
  showTwoArmStep();
  twoArmPlay.textContent = 'Play';
}

twoArmPlay.addEventListener('click', toggleTwoArm);
twoArmStepInput.addEventListener('input', () => {
  pauseTwoArm();
  twoArmStep = Number(twoArmStepInput.value);
  showTwoArmStep();
});
for (const name of Object.keys(twoArmButtons)) {
  twoArmButtons[name].addEventListener('click', () => chooseTwoArmMethod(name));
}

fetch('two-arm-trajectories.json')
  .then(response => {
    if (!response.ok) throw new Error('Two-arm animation data unavailable');
    return response.json();
  })
  .then(payload => {
    twoArmData = payload;
    twoArmStepInput.max = payload.steps;
    chooseTwoArmMethod('adam');
    twoArmStatic.hidden = true;
    twoArmFigure.hidden = false;
  })
  .catch(() => {
    // Keep the static NPG figure available when animation data cannot load.
  });
