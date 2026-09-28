"""Generate on-policy NPG and policy-gradient-plus-Adam comparison data."""

from __future__ import annotations

import json
import math
import random
from pathlib import Path


REWARDS = (1.0, 0.7, 0.0)
STEPS = 300
EXAMPLE_SEED = 109
SAMPLE_SEEDS = tuple(range(EXAMPLE_SEED, EXAMPLE_SEED + 5))
COHORT_SIZE = 1000
CONFIG = {
    "npg": {"stepSize": 0.15},
    "adam": {"stepSize": 0.04, "beta1": 0.9, "beta2": 0.999, "epsilon": 1e-8},
}
STARTS = {
    "uniform": (1 / 3, 1 / 3, 1 / 3),
    "orange": (0.1, 0.8, 0.1),
}
OUTPUT = Path(__file__).resolve().parents[1] / "blog" / "three-arm-trajectories.json"


def softmax(theta: list[float]) -> list[float]:
    largest = max(theta)
    weights = [math.exp(max(value - largest, -700)) for value in theta]
    total = sum(weights)
    return [weight / total for weight in weights]


def direction(policy: list[float], arm: int, method: str) -> list[float]:
    if method == "npg":
        # Minimum-norm solution of F x = ∇ log π(arm), with F=diag(π)-ππᵀ.
        return [(float(arm == j) - 1 / 3) / policy[arm] for j in range(3)]
    # Score-function policy gradient: ∇ log π(arm) = e_arm - π.
    return [float(arm == j) - policy[j] for j in range(3)]


def minimum_variance_baseline(policy: list[float], method: str) -> float:
    if method == "npg":
        # ||x_i||² = 2/(3π_i²), so π_i ||x_i||² ∝ 1/π_i.
        weights = [1 / probability for probability in policy]
    else:
        squared_norms = [sum(x * x for x in direction(policy, arm, method)) for arm in range(3)]
        weights = [policy[arm] * squared_norms[arm] for arm in range(3)]
    return sum(REWARDS[arm] * weights[arm] for arm in range(3)) / sum(weights)


def baseline_for(policy: list[float], method: str, baseline_kind: str) -> float:
    if baseline_kind == "min":
        return minimum_variance_baseline(policy, method)
    return sum(REWARDS[arm] * policy[arm] for arm in range(3))


def gradient_variance(policy: list[float], method: str, baseline: float) -> float:
    """Trace covariance of the one-sample gradient, enumerating the three arms."""
    vectors = [
        [(REWARDS[arm] - baseline) * x for x in direction(policy, arm, method)]
        for arm in range(3)
    ]
    # Pairwise form avoids cancellation between large second-moment terms.
    return sum(
        policy[i] * policy[j] * sum((vectors[i][k] - vectors[j][k]) ** 2 for k in range(3))
        for i in range(3) for j in range(i + 1, 3)
    )


def simulate(seed: int, method: str, baseline_kind: str, start: tuple[float, ...],
             record: bool = True) -> list[dict] | list[float]:
    rng = random.Random(seed)
    theta = [math.log(probability) for probability in start]
    first_moment = [0.0, 0.0, 0.0]
    second_moment = [0.0, 0.0, 0.0]
    states = []
    last_action = None
    for step in range(STEPS + 1):
        policy = softmax(theta)
        baseline = baseline_for(policy, method, baseline_kind)
        if record:
            states.append({
                "p": [round(probability, 6) for probability in policy],
                "b": round(baseline, 6),
                "variance": round(gradient_variance(policy, method, baseline), 6),
                "lastAction": last_action,
            })
        if step == STEPS:
            break
        # The same seed provides paired uniform draws. Each policy maps the
        # draw through its own current probabilities, so samples are on-policy.
        draw = rng.random()
        action = 0 if draw < policy[0] else 1 if draw < policy[0] + policy[1] else 2
        if method == "npg":
            theta[action] += CONFIG[method]["stepSize"] * (REWARDS[action] - baseline) / policy[action]
        else:
            gradient = [(REWARDS[action] - baseline) * x for x in direction(policy, action, method)]
            beta1 = CONFIG[method]["beta1"]
            beta2 = CONFIG[method]["beta2"]
            for j in range(3):
                first_moment[j] = beta1 * first_moment[j] + (1 - beta1) * gradient[j]
                second_moment[j] = beta2 * second_moment[j] + (1 - beta2) * gradient[j] ** 2
                corrected_first = first_moment[j] / (1 - beta1 ** (step + 1))
                corrected_second = second_moment[j] / (1 - beta2 ** (step + 1))
                theta[j] += CONFIG[method]["stepSize"] * corrected_first / (
                    math.sqrt(corrected_second) + CONFIG[method]["epsilon"]
                )
        last_action = action
    return states if record else policy


def main() -> None:
    uniform = list(STARTS["uniform"])
    for method in CONFIG:
        assert math.isclose(minimum_variance_baseline(uniform, method), 1.7 / 3)
        assert math.isclose(gradient_variance(uniform, method, baseline_for(uniform, method, "min")),
                            gradient_variance(uniform, method, baseline_for(uniform, method, "value")))

    payload = {"rewards": REWARDS, "steps": STEPS, "sampleSeeds": SAMPLE_SEEDS,
               "cohortSize": COHORT_SIZE, "starts": {}}
    for start_name, start in STARTS.items():
        start_payload = {"policy": start, "methods": {}}
        for method, settings in CONFIG.items():
            samples = {
                kind: [simulate(seed, method, kind, start) for seed in SAMPLE_SEEDS]
                for kind in ("min", "value")
            }
            means = {
                kind: [{
                    "p": [round(sum(run[t]["p"][i] for run in runs) / len(runs), 6) for i in range(3)],
                    "b": round(sum(run[t]["b"] for run in runs) / len(runs), 6),
                    "variance": sum(run[t]["variance"] for run in runs) / len(runs),
                } for t in range(STEPS + 1)]
                for kind, runs in samples.items()
            }
            cohort = {"min": 0, "value": 0}
            for seed in range(COHORT_SIZE):
                for kind in cohort:
                    policy = simulate(seed, method, kind, start, record=False)
                    if policy[1] > 0.95:
                        cohort[kind] += 1
            start_payload["methods"][method] = {
                "settings": settings,
                "cohortMiddleOver95": cohort,
                "min": means["min"],
                "value": means["value"],
                "samples": {kind: [[state["p"] for state in run] for run in runs]
                            for kind, runs in samples.items()},
            }
            print(f"{start_name} {method}: middle-arm >95% at step {STEPS}: {cohort}")
            print(f"{start_name} {method}: five-run mean final policies: "
                  f"min={means['min'][-1]['p']}, value={means['value'][-1]['p']}")
        payload["starts"][start_name] = start_payload

    assert payload["starts"]["uniform"]["methods"]["npg"]["samples"]["min"][0][-1][1] > 0.95
    assert payload["starts"]["uniform"]["methods"]["npg"]["value"][-1]["p"][0] > 0.95
    OUTPUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
