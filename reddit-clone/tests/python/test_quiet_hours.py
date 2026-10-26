from datetime import datetime

import pytest

import quiet_hours
from quiet_hours import seconds_to_wait, window

NIGHT = (23, 8)


def at(hour, minute=0, day=10):
    return datetime(2026, 10, day, hour, minute)


def hours_to_wait(now, minutes_needed=0, hours=NIGHT):
    return seconds_to_wait(minutes_needed, now=now, hours=hours) / 3600


def test_parses_the_setting():
    assert window('23-8') == (23, 8)
    assert window(' 1-5 ') == (1, 5)
    assert window('') is None
    assert window('8-8') is None
    with pytest.raises(ValueError):
        window('23-24')
    with pytest.raises(ValueError):
        window('night')


def test_reads_the_environment(monkeypatch):
    monkeypatch.setenv('LOADER_QUIET_HOURS', '23-8')
    assert window() == (23, 8)
    monkeypatch.delenv('LOADER_QUIET_HOURS')
    assert window() is None
    assert seconds_to_wait(600, now=at(23)) == 0


def test_works_outside_quiet_hours():
    assert hours_to_wait(at(8)) == 0
    assert hours_to_wait(at(14)) == 0
    assert hours_to_wait(at(22, 59)) == 0


def test_waits_until_quiet_hours_end():
    assert hours_to_wait(at(23)) == 9
    assert hours_to_wait(at(2)) == 6
    assert hours_to_wait(at(7, 30)) == 0.5


def test_long_work_waits_unless_it_finishes_first():
    assert hours_to_wait(at(20), minutes_needed=180) == 0
    assert hours_to_wait(at(20), minutes_needed=181) == 12
    assert hours_to_wait(at(10), minutes_needed=13 * 60 + 1) == 22


def test_quiet_hours_within_a_day():
    hours = (9, 17)
    assert hours_to_wait(at(12), hours=hours) == 5
    assert hours_to_wait(at(18), hours=hours) == 0
    assert hours_to_wait(at(8), minutes_needed=90, hours=hours) == 9


def test_wait_sleeps_through_quiet_hours(monkeypatch):
    remaining = [3600, 0]
    slept = []
    monkeypatch.setattr(quiet_hours, 'seconds_to_wait', lambda minutes_needed=0: remaining.pop(0))
    monkeypatch.setattr(quiet_hours.time, 'sleep', slept.append)
    quiet_hours.wait('test', 30)
    assert slept == [3600]
