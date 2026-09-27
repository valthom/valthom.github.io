// A fixed sequence of red presses isolates the effect of the baseline.
// For a two-arm softmax policy, stochastic natural policy gradient updates
// blue log-odds by alpha * baseline / (1 - pBlue) after sampling red.
const learningRate = 0.25;
const totalPresses = 4;

function afterRedPress(pBlue, baseline) {
  const logOdds = Math.log(pBlue / (1 - pBlue));
  const nextLogOdds = logOdds + learningRate * baseline / (1 - pBlue);
  return 1 / (1 + Math.exp(-nextLogOdds));
}

const states = [{ low: 0.5, high: 0.5 }];
for (let press = 0; press < totalPresses; press += 1) {
  const previous = states[states.length - 1];
  states.push({
    low: afterRedPress(previous.low, -0.4),
    high: afterRedPress(previous.high, 0.4),
  });
}

const controls = document.getElementById('baseline-controls');
const previousButton = document.getElementById('baseline-prev');
const nextButton = document.getElementById('baseline-next');
const resetButton = document.getElementById('baseline-reset');
const status = document.getElementById('baseline-status');
const lowValue = document.getElementById('blue-low-value');
const highValue = document.getElementById('blue-high-value');
const lowBar = document.getElementById('blue-low-bar');
const highBar = document.getElementById('blue-high-bar');
const presses = document.querySelectorAll('.red-press');
let step = 0;

function render() {
  const current = states[step];
  const lowPercent = Math.round(current.low * 100);
  const highPercent = Math.round(current.high * 100);

  lowValue.textContent = `${lowPercent}%`;
  highValue.textContent = `${highPercent}%`;
  lowBar.style.width = `${current.low * 100}%`;
  highBar.style.width = `${current.high * 100}%`;
  presses.forEach((press, index) => press.classList.toggle('is-active', index < step));

  status.textContent = step === 0
    ? 'Before any press, both policies have a 50% chance of trying blue.'
    : `After ${step} red ${step === 1 ? 'press' : 'presses'}, blue has a ${lowPercent}% chance with the low baseline and a ${highPercent}% chance with the higher baseline.`;

  previousButton.disabled = step === 0;
  resetButton.disabled = step === 0;
  nextButton.disabled = step === totalPresses;
}

previousButton.addEventListener('click', () => { step -= 1; render(); });
nextButton.addEventListener('click', () => { step += 1; render(); });
resetButton.addEventListener('click', () => { step = 0; render(); });

controls.hidden = false;
render();
