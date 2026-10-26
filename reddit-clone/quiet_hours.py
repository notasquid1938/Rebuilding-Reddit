"""
Quiet hours: LOADER_QUIET_HOURS="23-8" keeps the loader off the disks from
23:00 to 08:00 local time (TZ), e.g. for a hard disk within earshot of a
bedroom. The website keeps serving. The loader checks between pieces of work:
a load pauses between chunks, and a step that runs long inside Postgres
(indexing a month, refreshing its lookup rows) only starts if its estimated
time ends before quiet hours begin. Unset or empty: no quiet hours.

Usage from the shell: python3 quiet_hours.py [minutes needed] [label]
"""
import os
import sys
import time
from datetime import datetime, timedelta


def window(value=None):
    """(start hour, end hour) of the quiet hours, or None."""
    value = (os.getenv('LOADER_QUIET_HOURS', '') if value is None else value).strip()
    if not value:
        return None
    start, end = (int(part) for part in value.split('-'))
    if not (0 <= start < 24 and 0 <= end < 24):
        raise ValueError(f'LOADER_QUIET_HOURS hours must be 0-23, got {value!r}')
    return None if start == end else (start, end)


def _at(moment, hour):
    return moment.replace(hour=hour, minute=0, second=0, microsecond=0)


def seconds_to_wait(minutes_needed=0, now=None, hours=None):
    """How long to wait before starting work that takes `minutes_needed`."""
    hours = window() if hours is None else hours
    if not hours:
        return 0
    start, end = hours
    now = now or datetime.now()
    # The quiet period in progress or the next one to begin
    begins = _at(now, start)
    if begins > now:
        begins -= timedelta(days=1)
    ends = _at(begins, end)
    if ends <= begins:
        ends += timedelta(days=1)
    if ends <= now:
        begins += timedelta(days=1)
        ends += timedelta(days=1)
    if now >= begins or now + timedelta(minutes=minutes_needed) > begins:
        return (ends - now).total_seconds()
    return 0


def wait(label, minutes_needed=0):
    """Sleeps through quiet hours, or until after them if the work wouldn't finish first."""
    seconds = seconds_to_wait(minutes_needed)
    if seconds <= 0:
        return
    resume = datetime.now() + timedelta(seconds=seconds)
    print(f'[{label}] quiet hours: waiting until {resume:%a %H:%M}', flush=True)
    while seconds > 0:
        time.sleep(seconds)
        seconds = seconds_to_wait(minutes_needed)


if __name__ == '__main__':
    wait(sys.argv[2] if len(sys.argv) > 2 else 'loader', float(sys.argv[1]) if len(sys.argv) > 1 else 0)
