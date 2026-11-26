"""Unit tests for the pure forecasting model, on synthetic demand with known structure."""

import random

import pytest

from app.services import forecast_model as fm
from app.services.analytics import abc_classes


def test_constant_demand_forecasts_constant() -> None:
    out = fm.forecast([5.0] * 42, start_weekday=0, horizon=7)
    assert out == pytest.approx([5.0] * 7, rel=1e-6)


def test_no_history_forecasts_zero() -> None:
    assert fm.forecast([], start_weekday=0, horizon=3) == [0.0, 0.0, 0.0]
    assert fm.forecast([0.0] * 28, start_weekday=0, horizon=3) == [0.0, 0.0, 0.0]


def test_weekly_seasonality_is_captured() -> None:
    weekly = [4, 4, 4, 4, 8, 12, 6]  # Mon..Sun, busy weekend
    series = [float(v) for v in weekly * 8]
    out = fm.forecast(series, start_weekday=0, horizon=7)
    assert out == pytest.approx([float(v) for v in weekly], rel=0.05)
    assert out[5] > 2.5 * out[0]  # Saturday forecast well above Monday


def test_forecast_is_never_negative() -> None:
    declining = [max(0.0, 20 - i) for i in range(42)]
    assert min(fm.forecast(declining, 0, 30)) >= 0


def test_model_beats_seasonal_naive_on_noisy_seasonal_growth() -> None:
    """The headline metric: on realistic noisy data the model has lower WAPE."""
    rng = random.Random(7)
    weekday = [0.8, 0.85, 0.9, 1.0, 1.25, 1.5, 1.2]
    model_err = base_err = actual = 0.0
    for sku in range(40):
        base = rng.uniform(1, 12)
        series = []
        for day in range(70):
            mean = base * weekday[day % 7] * (1 + 0.004 * day)
            series.append(float(max(0, round(rng.gauss(mean, mean**0.5)))))
        bt = fm.backtest(series, start_weekday=0, holdout=14)
        assert bt is not None, sku
        model_err += bt.abs_error_model
        base_err += bt.abs_error_baseline
        actual += bt.actual_total
    model_wape = fm.wape(model_err, actual)
    base_wape = fm.wape(base_err, actual)
    assert model_wape is not None and base_wape is not None
    assert model_wape < base_wape * 0.85  # at least 15% lower error


def test_backtest_needs_enough_history() -> None:
    assert fm.backtest([1.0] * 20, 0, holdout=14) is None


def test_wape_undefined_without_sales() -> None:
    assert fm.wape(3.0, 0.0) is None


def test_abc_classes_follow_pareto_cutoffs() -> None:
    from decimal import Decimal

    revenues = [Decimal(v) for v in (500, 300, 100, 60, 30, 10)]  # total 1000
    # cumulative share before each item: 0, .5, .8, .9, .96, .99
    assert abc_classes(revenues) == ["A", "A", "B", "B", "C", "C"]
