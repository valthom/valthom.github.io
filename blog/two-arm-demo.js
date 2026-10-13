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
const twoArmStartInput = document.getElementById('two-arm-start');
const twoArmStartValue = document.getElementById('two-arm-start-value');
const twoArmRateInput = document.getElementById('two-arm-rate');
const twoArmRateValue = document.getElementById('two-arm-rate-value');
const twoArmReset = document.getElementById('two-arm-reset');
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
let twoArmRecomputeTimer = null;
const twoArmRates = { npg: 0.5, adam: 0.05 };

function formatTwoArmRate(value) {
  return Number(value.toFixed(3)).toString();
}

function showTwoArmParameters() {
  const initial = Number(twoArmStartInput.value);
  twoArmStartValue.textContent = `${initial}% blue · ${100 - initial}% red`;
  twoArmRateValue.textContent = formatTwoArmRate(twoArmRates[twoArmMethod]);
}

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
    const curves = twoArmData[kind];
    panel.lines.replaceChildren();
    for (const curve of curves.samples) addTwoArmLine(panel.lines, curve, 'two-arm-sample-line');
    addTwoArmLine(panel.lines, curves.mean, 'two-arm-mean-line');
  }
}

function showTwoArmStep() {
  const x = twoArmX(twoArmStep);
  for (const kind of ['low', 'high']) {
    const panel = twoArmPanels[kind];
    const curves = twoArmData[kind];
    const mean = curves.mean[twoArmStep];
    panel.clip.setAttribute('width', (x - 42 + 1).toFixed(2));
    panel.dot.setAttribute('cx', x.toFixed(2));
    panel.dot.setAttribute('cy', twoArmY(mean).toFixed(2));
    panel.readout.textContent = `Mean reward ${mean.toFixed(2)} · ${curves.belowPointOne[twoArmStep].toLocaleString('en-US')}/${twoArmData.runs.toLocaleString('en-US')} runs below 0.1`;
  }
  twoArmStepInput.value = twoArmStep;
  twoArmStepValue.textContent = `${twoArmStep} / ${twoArmData.steps}`;
}

function pauseTwoArm() {
  if (twoArmTimer !== null) {
    clearInterval(twoArmTimer);
    twoArmTimer = null;
  }
  twoArmPlay.textContent = twoArmData && twoArmStep === twoArmData.steps ? 'Replay' : 'Play';
}

function toggleTwoArm() {
  flushTwoArmParameters();
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
  }, Math.max(25, 8000 / twoArmData.steps));
}

function chooseTwoArmMethod(method) {
  pauseTwoArm();
  if (twoArmRecomputeTimer !== null) clearTimeout(twoArmRecomputeTimer);
  twoArmRecomputeTimer = null;
  twoArmMethod = method;
  for (const name of Object.keys(twoArmButtons)) {
    twoArmButtons[name].setAttribute('aria-pressed', String(name === method));
  }
  twoArmRateInput.min = method === 'npg' ? '0.01' : '0.001';
  twoArmRateInput.max = method === 'npg' ? '1' : '0.2';
  twoArmRateInput.step = method === 'npg' ? '0.01' : '0.001';
  twoArmRateInput.value = twoArmRates[method];
  recomputeTwoArm();
}

function recomputeTwoArm() {
  pauseTwoArm();
  twoArmRecomputeTimer = null;
  const initial = Number(twoArmStartInput.value);
  const rate = twoArmRates[twoArmMethod];
  twoArmData = BaselineBandit.simulate(twoArmMethod, initial / 100, rate);
  twoArmStep = twoArmData.steps;
  twoArmStepInput.max = twoArmData.steps;
  showTwoArmParameters();
  const adam = twoArmMethod === 'adam' ? ' · Adam β₁ = 0.9, β₂ = 0.999, ε = 10⁻⁸' : '';
  twoArmSettings.textContent = `Paired random draws${adam}`;
  twoArmCaption.textContent = 'Faint lines show 100 runs; thick lines average 1,000 runs per baseline. Each action is sampled on-policy. The sliders reuse the same paired random draws.';
  drawTwoArmCurves();
  showTwoArmStep();
  pauseTwoArm();
}

function scheduleTwoArmParameters() {
  pauseTwoArm();
  showTwoArmParameters();
  if (twoArmRecomputeTimer !== null) clearTimeout(twoArmRecomputeTimer);
  twoArmSettings.textContent = 'Updating the simulations…';
  twoArmRecomputeTimer = setTimeout(recomputeTwoArm, 100);
}

function flushTwoArmParameters() {
  if (twoArmRecomputeTimer !== null) {
    clearTimeout(twoArmRecomputeTimer);
    recomputeTwoArm();
  }
}

twoArmPlay.addEventListener('click', toggleTwoArm);
twoArmStepInput.addEventListener('input', () => {
  const requestedStep = Number(twoArmStepInput.value);
  flushTwoArmParameters();
  pauseTwoArm();
  twoArmStep = requestedStep;
  showTwoArmStep();
});
twoArmStartInput.addEventListener('input', scheduleTwoArmParameters);
twoArmRateInput.addEventListener('input', () => {
  twoArmRates[twoArmMethod] = Number(twoArmRateInput.value);
  scheduleTwoArmParameters();
});
twoArmStartInput.addEventListener('change', flushTwoArmParameters);
twoArmRateInput.addEventListener('change', flushTwoArmParameters);
twoArmReset.addEventListener('click', () => {
  twoArmStartInput.value = 15;
  twoArmRates.npg = 0.5;
  twoArmRates.adam = 0.05;
  chooseTwoArmMethod('adam');
});
for (const name of Object.keys(twoArmButtons)) {
  twoArmButtons[name].addEventListener('click', () => chooseTwoArmMethod(name));
}

if (typeof BaselineBandit !== 'undefined') {
  chooseTwoArmMethod('adam');
  twoArmStatic.hidden = true;
  twoArmFigure.hidden = false;
}
