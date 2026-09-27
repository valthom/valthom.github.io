"""Build the reproducible on-policy data for the three-arm blog animation."""

from __future__ import annotations

import json
import math
import random
from pathlib import Path


REWARDS = (1.0, 0.7, 0.0)
STEP_SIZE = 0.15
STEPS = 120
EXAMPLE_SEED = 109
COHORT_SIZE = 1000
GAP_BASELINE = 0.85
OUTPUT = Path(__file__).resolve().parents[1] / "blog" / "three-arm-trajectories.json"


def softmax(theta: list[float]) -> list[float]:
    largest = max(theta)
    weights = [math.exp(max(value - largest, -700)) for value in theta]
    total = sum(weights)
    return [weight / total for weight in weights]


def minimum_variance_baseline(policy: list[float]) -> float:
    # For the minimum-norm natural gradient x_i, ||x_i||² = 2/(3π_i²).
    # Hence b* = Σ π_i r_i ||x_i||² / Σ π_i ||x_i||².
    inverse = [1 / probability for probability in policy]
    return sum(reward * weight for reward, weight in zip(REWARDS, inverse)) / sum(inverse)


def simulate(seed: int, use_minimum_variance: bool) -> list[dict]:
    rng = random.Random(seed)
    theta = [0.0, 0.0, 0.0]
    states = []
    last_action = None
    for step in range(STEPS + 1):
        policy = softmax(theta)
        baseline = minimum_variance_baseline(policy) if use_minimum_variance else GAP_BASELINE
        states.append({
            "p": [round(probability, 6) for probability in policy],
            "b": round(baseline, 6),
            "lastAction": last_action,
        })
        if step == STEPS:
            break
        # Both algorithms receive the same exogenous uniform draw, but each
        # maps it through its *own current policy*. Each action is on-policy.
        draw = rng.random()
        action = 0 if draw < policy[0] else 1 if draw < policy[0] + policy[1] else 2
        theta[action] += STEP_SIZE * (REWARDS[action] - baseline) / policy[action]
        last_action = action
    return states


def main() -> None:
    example_min = simulate(EXAMPLE_SEED, True)
    example_gap = simulate(EXAMPLE_SEED, False)
    cohort_min_middle = 0
    cohort_gap_middle = 0
    for seed in range(COHORT_SIZE):
        if simulate(seed, True)[-1]["p"][1] > 0.95:
            cohort_min_middle += 1
        if simulate(seed, False)[-1]["p"][1] > 0.95:
            cohort_gap_middle += 1

    assert example_min[-1]["p"][1] > 0.95
    assert example_gap[-1]["p"][0] > 0.95
    assert math.isclose(minimum_variance_baseline([1 / 3] * 3), 1.7 / 3)
    payload = {
        "rewards": REWARDS,
        "stepSize": STEP_SIZE,
        "steps": STEPS,
        "exampleSeed": EXAMPLE_SEED,
        "gapBaseline": GAP_BASELINE,
        "cohortSize": COHORT_SIZE,
        "cohortMiddleOver95": {"min": cohort_min_middle, "gap": cohort_gap_middle},
        "min": example_min,
        "gap": example_gap,
    }
    OUTPUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(
        f"Example expected reward: min={sum(a * b for a, b in zip(example_min[-1]['p'], REWARDS)):.3f}, "
        f"gap={sum(a * b for a, b in zip(example_gap[-1]['p'], REWARDS)):.3f}"
    )
    print(f"Middle arm >95% at step {STEPS}: min={cohort_min_middle}, gap={cohort_gap_middle} of {COHORT_SIZE}")


if __name__ == "__main__":
    main()
