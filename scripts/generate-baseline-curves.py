"""Generate the on-policy two-arm bandit plot for the baseline blog post."""

from __future__ import annotations

import math
import random
from pathlib import Path
from xml.sax.saxutils import escape


SEED = 2026
RUNS = 1000
STEPS = 60
STEP_SIZE = 0.5
BASELINES = [(-0.4, "Low baseline −0.4", "#c15b4a"), (0.4, "Higher baseline +0.4", "#167b80")]
OUTPUT = Path(__file__).resolve().parents[1] / "blog" / "baseline-learning-curves.svg"


def sigmoid(log_odds: float) -> float:
    if log_odds >= 0:
        return 1 / (1 + math.exp(-log_odds))
    exp_odds = math.exp(log_odds)
    return exp_odds / (1 + exp_odds)


def run_bandit(baseline: float, uniforms: list[list[float]]) -> list[list[float]]:
    """Sample each action from the current policy, then take a stochastic NPG step."""
    curves = []
    for draws in uniforms:
        log_odds = 0.0
        curve = []
        for t in range(STEPS + 1):
            p_blue = sigmoid(log_odds)
            curve.append(p_blue)  # Expected next reward: blue pays 1, red pays 0.
            if t == STEPS:
                break
            blue = draws[t] < p_blue
            action_probability = p_blue if blue else 1 - p_blue
            advantage = (1 if blue else 0) - baseline
            log_odds += STEP_SIZE * advantage / action_probability * (1 if blue else -1)
        curves.append(curve)
    return curves


def polyline(values: list[float], left: float, top: float, width: float, height: float, stride: int = 1) -> str:
    return " ".join(
        f"{left + width * t / STEPS:.1f},{top + height * (1 - values[t]):.1f}"
        for t in range(0, len(values), stride)
    )


def panel(curves: list[list[float]], baseline: float, label: str, color: str, index: int) -> str:
    panel_left = 58 + index * 423
    plot_left = panel_left + 33
    plot_top = 91
    plot_width = 328
    plot_height = 253
    mean = [sum(curve[t] for curve in curves) / RUNS for t in range(STEPS + 1)]
    trapped = sum(curve[-1] < 0.1 for curve in curves)
    parts = [
        f'<rect x="{panel_left}" y="46" width="395" height="350" rx="14" fill="#ffffff" stroke="#dce8e4"/>',
        f'<text x="{panel_left + 20}" y="73" class="panel-title" fill="{color}">{escape(label)}</text>',
    ]
    for value in (0, 0.5, 1):
        y = plot_top + plot_height * (1 - value)
        parts.append(f'<path d="M{plot_left} {y:.1f}h{plot_width}" stroke="#e4eeeb"/>')
        parts.append(f'<text x="{plot_left - 9}" y="{y + 4:.1f}" class="tick" text-anchor="end">{value:g}</text>')
    for t in (0, 20, 40, 60):
        x = plot_left + plot_width * t / STEPS
        parts.append(f'<text x="{x:.1f}" y="365" class="tick" text-anchor="middle">{t}</text>')
    parts.append(f'<g clip-path="url(#clip-{index})">')
    for curve in curves[:100]:
        parts.append(
            f'<polyline points="{polyline(curve, plot_left, plot_top, plot_width, plot_height, stride=2)}" '
            f'fill="none" stroke="{color}" stroke-width="1.2" opacity=".09"/>'
        )
    parts.append(
        f'<polyline points="{polyline(mean, plot_left, plot_top, plot_width, plot_height)}" '
        f'fill="none" stroke="{color}" stroke-width="3.7" stroke-linejoin="round" stroke-linecap="round"/>'
    )
    parts.append('</g>')
    parts.append(f'<circle cx="{plot_left + plot_width}" cy="{plot_top + plot_height * (1 - mean[-1]):.1f}" r="4.4" fill="{color}"/>')
    parts.append(
        f'<text x="{panel_left + 20}" y="385" class="foot">'
        f'At step 60: mean {mean[-1]:.2f}; {trapped}/{RUNS} runs below 0.1</text>'
    )
    print(f"b={baseline:+.1f}: mean={mean[-1]:.3f}, runs below 0.1={trapped}/{RUNS}")
    return "\n".join(parts)


def main() -> None:
    rng = random.Random(SEED)
    uniforms = [[rng.random() for _ in range(STEPS)] for _ in range(RUNS)]
    results = [run_bandit(baseline, uniforms) for baseline, _, _ in BASELINES]
    panels = [panel(results[i], *BASELINES[i], i) for i in range(2)]
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 904 431" role="img" aria-labelledby="title desc">
<title id="title">Expected reward across on-policy learning runs with two baselines</title>
<desc id="desc">Both sets of policies begin with an expected reward of 0.5. Over 60 steps, the mean reaches about 0.9 with baseline minus 0.4 and almost 1 with baseline plus 0.4. Faint lines show individual runs, some of which remain near zero under the lower baseline.</desc>
<style>
  .heading {{ font: 700 18px Arial, sans-serif; fill: #173842; }}
  .panel-title {{ font: 700 16px Arial, sans-serif; }}
  .axis-label {{ font: 13px Arial, sans-serif; fill: #50666b; }}
  .tick {{ font: 11px Arial, sans-serif; fill: #62777a; }}
  .foot {{ font: 11px Arial, sans-serif; fill: #50666b; }}
</style>
<defs>
  <clipPath id="clip-0"><rect x="91" y="91" width="328" height="253"/></clipPath>
  <clipPath id="clip-1"><rect x="514" y="91" width="328" height="253"/></clipPath>
</defs>
<rect width="904" height="431" rx="16" fill="#f7faf8"/>
<text x="58" y="28" class="heading">Can a baseline change where learning ends up?</text>
{panels[0]}
{panels[1]}
<text x="452" y="417" class="axis-label" text-anchor="middle">Learning steps</text>
<text x="15" y="219" class="axis-label" text-anchor="middle" transform="rotate(-90 15 219)">Expected reward</text>
</svg>
'''
    OUTPUT.write_text(svg, encoding="utf-8")


if __name__ == "__main__":
    main()
