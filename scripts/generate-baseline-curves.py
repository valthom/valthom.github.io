"""Generate responsive on-policy two-arm plots for the baseline blog post."""

from __future__ import annotations

import math
import random
import json
from pathlib import Path
from xml.sax.saxutils import escape


SEED = 2026
RUNS = 1000
STEPS = 60
STEP_SIZE = 0.5
BASELINES = [
    (-0.4, "Low baseline −0.4", "#bf604d", "baseline-learning-low.svg"),
    (0.4, "Higher baseline +0.4", "#167b80", "baseline-learning-high.svg"),
]
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "blog"
ADAM_STEP_SIZE = 0.04


def sigmoid(log_odds: float) -> float:
    if log_odds >= 0:
        return 1 / (1 + math.exp(-log_odds))
    exp_odds = math.exp(log_odds)
    return exp_odds / (1 + exp_odds)


def run_bandit(baseline: float, uniforms: list[list[float]]) -> list[list[float]]:
    """Draw each action from the current policy and take a stochastic NPG step."""
    curves = []
    for draws in uniforms:
        log_odds = 0.0
        curve = []
        for t in range(STEPS + 1):
            p_blue = sigmoid(log_odds)
            curve.append(p_blue)  # Expected reward: blue pays 1, red pays 0.
            if t == STEPS:
                break
            blue = draws[t] < p_blue
            action_probability = p_blue if blue else 1 - p_blue
            advantage = (1 if blue else 0) - baseline
            log_odds += STEP_SIZE * advantage / action_probability * (1 if blue else -1)
        curves.append(curve)
    return curves


def run_adam(baseline: float, uniforms: list[list[float]]) -> list[list[float]]:
    """On-policy score-function gradient, then standard bias-corrected Adam ascent."""
    curves = []
    for draws in uniforms:
        theta = [0.0, 0.0]
        first = [0.0, 0.0]
        second = [0.0, 0.0]
        curve = []
        for t in range(STEPS + 1):
            p_blue = sigmoid(theta[0] - theta[1])
            curve.append(p_blue)
            if t == STEPS:
                break
            arm = 0 if draws[t] < p_blue else 1
            advantage = float(arm == 0) - baseline
            probabilities = (p_blue, 1 - p_blue)
            for j in range(2):
                gradient = advantage * (float(arm == j) - probabilities[j])
                first[j] = 0.9 * first[j] + 0.1 * gradient
                second[j] = 0.999 * second[j] + 0.001 * gradient * gradient
                corrected_first = first[j] / (1 - 0.9 ** (t + 1))
                corrected_second = second[j] / (1 - 0.999 ** (t + 1))
                theta[j] += ADAM_STEP_SIZE * corrected_first / (math.sqrt(corrected_second) + 1e-8)
        curves.append(curve)
    return curves


def summarize(curves: list[list[float]]) -> dict:
    return {
        "mean": [round(sum(curve[t] for curve in curves) / RUNS, 6) for t in range(STEPS + 1)],
        "samples": [[round(value, 6) for value in curve] for curve in curves[:100]],
        "belowPointOne": [sum(curve[t] < 0.1 for curve in curves) for t in range(STEPS + 1)],
    }


def points(values: list[float], stride: int = 1) -> str:
    return " ".join(
        f"{45 + 253 * t / STEPS:.1f},{89 + 219 * (1 - values[t]):.1f}"
        for t in range(0, STEPS + 1, stride)
    )


def write_panel(curves: list[list[float]], baseline: float, label: str, color: str, filename: str) -> None:
    mean = [sum(curve[t] for curve in curves) / RUNS for t in range(STEPS + 1)]
    trapped = sum(curve[-1] < 0.1 for curve in curves)
    grid = []
    for value in (0, 0.5, 1):
        y = 89 + 219 * (1 - value)
        grid.append(f'<path d="M45 {y:.1f}h253" stroke="#e3ece9"/>')
        grid.append(f'<text x="39" y="{y + 4:.1f}" class="tick" text-anchor="end">{value:g}</text>')
    for t in (0, 20, 40, 60):
        x = 45 + 253 * t / STEPS
        grid.append(f'<text x="{x:.1f}" y="327" class="tick" text-anchor="middle">{t}</text>')
    sample_lines = "\n".join(
        f'<polyline points="{points(curve, stride=2)}" fill="none" stroke="{color}" stroke-width="1.1" opacity=".10"/>'
        for curve in curves[:100]
    )
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 380" role="img" aria-labelledby="title desc">
<title id="title">{escape(label)}: expected reward during on-policy learning</title>
<desc id="desc">One hundred faint sample runs and the mean over one thousand runs. The mean expected reward at step 60 is {mean[-1]:.2f}; {trapped} of one thousand runs have expected reward below 0.1.</desc>
<style>
  .title {{ font: 700 17px Arial, sans-serif; fill: {color}; }}
  .label {{ font: 12px Arial, sans-serif; fill: #465f64; }}
  .tick {{ font: 11px Arial, sans-serif; fill: #5b7377; }}
  .foot {{ font: 12px Arial, sans-serif; fill: #334f55; }}
</style>
<defs><clipPath id="clip"><rect x="45" y="89" width="253" height="219"/></clipPath></defs>
<rect x="1" y="1" width="318" height="378" rx="14" fill="#fff" stroke="#dce8e4"/>
<text x="18" y="30" class="title">{escape(label)}</text>
<text x="18" y="52" class="label">Expected reward as learning unfolds</text>
{''.join(grid)}
<g clip-path="url(#clip)">{sample_lines}
<polyline points="{points(mean)}" fill="none" stroke="{color}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/></g>
<circle cx="298" cy="{89 + 219 * (1 - mean[-1]):.1f}" r="4" fill="{color}"/>
<text x="170" y="347" class="label" text-anchor="middle">Learning steps</text>
<text x="18" y="370" class="foot">Mean {mean[-1]:.2f} · {trapped}/1000 runs below 0.1 at step 60</text>
</svg>
'''
    (OUTPUT_DIR / filename).write_text(svg, encoding="utf-8")
    print(f"b={baseline:+.1f}: mean={mean[-1]:.3f}, runs below 0.1={trapped}/{RUNS}")


def main() -> None:
    rng = random.Random(SEED)
    uniforms = [[rng.random() for _ in range(STEPS)] for _ in range(RUNS)]
    payload = {"steps": STEPS, "runs": RUNS, "sampleRuns": 100, "seed": SEED, "methods": {}}
    for method, simulate in (("npg", run_bandit), ("adam", run_adam)):
        payload["methods"][method] = {"settings": {"stepSize": STEP_SIZE if method == "npg" else ADAM_STEP_SIZE}}
        for kind, (baseline, label, color, filename) in zip(("low", "high"), BASELINES):
            curves = simulate(baseline, uniforms)
            payload["methods"][method][kind] = summarize(curves)
            output_name = filename if method == "npg" else filename.replace(".svg", "-adam.svg")
            write_panel(curves, baseline, label, color, output_name)
    (OUTPUT_DIR / "two-arm-trajectories.json").write_text(
        json.dumps(payload, separators=(",", ":")), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
