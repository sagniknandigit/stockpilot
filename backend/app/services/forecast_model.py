"""Demand forecasting model: pure functions, no I/O, easy to unit-test.

Model: Holt's damped-trend exponential smoothing on weekday-deseasonalised demand.
    1. Weekday factors   f[w] = mean(demand on weekday w) / mean(demand)
    2. Deseasonalise     d_t  = y_t / f[w_t]
    3. Holt (damped)     level_t = a*d_t + (1-a)*(level + phi*trend)
                         trend_t = b*(level_t - level_{t-1}) + (1-b)*phi*trend
    4. Forecast          y_{t+h} = (level + (phi + ... + phi^h) * trend) * f[w_{t+h}]

Retail demand per SKU is small, noisy and weekly-seasonal; this captures the weekly
pattern and growth without overreacting to noise, and is fully explainable.

Accuracy is measured with WAPE (sum |error| / sum actual), which, unlike MAPE, is
well-defined on days with zero sales. The baseline is a seasonal-naive forecast
("same weekday last week"), the standard benchmark for daily retail demand.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass

ALPHA = 0.25  # level smoothing
BETA = 0.05  # trend smoothing
PHI = 0.9  # trend damping: growth fades out instead of extrapolating forever


def weekday_factors(series: Sequence[float], start_weekday: int) -> list[float]:
    sums = [0.0] * 7
    counts = [0] * 7
    for i, value in enumerate(series):
        weekday = (start_weekday + i) % 7
        sums[weekday] += value
        counts[weekday] += 1
    overall = sum(series) / len(series) if series else 0.0
    if overall <= 0:
        return [1.0] * 7
    factors = [(sums[w] / counts[w]) / overall if counts[w] else 1.0 for w in range(7)]
    # Guard against a weekday that never sells (factor 0 would divide by zero).
    return [max(f, 0.05) for f in factors]


def forecast(series: Sequence[float], start_weekday: int, horizon: int) -> list[float]:
    """Forecast the next `horizon` days. `start_weekday` is the weekday of series[0]."""
    if not series:
        return [0.0] * horizon
    factors = weekday_factors(series, start_weekday)
    deseasonalised = [v / factors[(start_weekday + i) % 7] for i, v in enumerate(series)]

    warmup = deseasonalised[: min(7, len(deseasonalised))]
    level = sum(warmup) / len(warmup)
    trend = 0.0
    for value in deseasonalised:
        previous = level
        level = ALPHA * value + (1 - ALPHA) * (level + PHI * trend)
        trend = BETA * (level - previous) + (1 - BETA) * PHI * trend

    n = len(series)
    out = []
    damping = 0.0
    for h in range(1, horizon + 1):
        damping += PHI**h
        weekday = (start_weekday + n + h - 1) % 7
        out.append(max(0.0, (level + damping * trend) * factors[weekday]))
    return out


def seasonal_naive(series: Sequence[float], horizon: int) -> list[float]:
    """Baseline: each day equals the same weekday in the last observed week."""
    if len(series) < 7:
        mean = sum(series) / len(series) if series else 0.0
        return [mean] * horizon
    last_week = list(series[-7:])
    return [last_week[h % 7] for h in range(horizon)]


@dataclass(frozen=True)
class Backtest:
    abs_error_model: float
    abs_error_baseline: float
    actual_total: float


def backtest(series: Sequence[float], start_weekday: int, holdout: int) -> Backtest | None:
    """Fit on all but the last `holdout` days and score both forecasts on them."""
    if len(series) < holdout + 14:
        return None
    train, test = series[:-holdout], series[-holdout:]
    model = forecast(train, start_weekday, holdout)
    baseline = seasonal_naive(train, holdout)
    return Backtest(
        abs_error_model=sum(abs(f - a) for f, a in zip(model, test, strict=True)),
        abs_error_baseline=sum(abs(f - a) for f, a in zip(baseline, test, strict=True)),
        actual_total=float(sum(test)),
    )


def wape(abs_error: float, actual_total: float) -> float | None:
    return abs_error / actual_total if actual_total > 0 else None


def std_dev(values: Sequence[float]) -> float:
    if len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    return math.sqrt(sum((v - mean) ** 2 for v in values) / (len(values) - 1))
