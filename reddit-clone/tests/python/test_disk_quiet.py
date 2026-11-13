"""Night-time disk cap (scripts/disk_quiet.sh), against a fake cgroup and docker."""
import os
import subprocess

import pytest

from conftest import ROOT

SCRIPT = os.path.join(ROOT, 'scripts', 'disk_quiet.sh')
CONTAINER_ID = 'abc123'
NIGHT = 'riops=50 wiops=50 rbps=20971520 wbps=20971520'
DAY = 'riops=max wiops=max rbps=max wbps=max'


@pytest.fixture
def host(tmp_path):
    bin_dir = tmp_path / 'bin'
    bin_dir.mkdir()
    docker = bin_dir / 'docker'
    docker.write_text(f'#!/bin/sh\necho {CONTAINER_ID}\n')
    docker.chmod(0o755)
    scope = tmp_path / 'cgroup' / f'docker-{CONTAINER_ID}.scope'
    scope.mkdir(parents=True)
    io_max = scope / 'io.max'
    io_max.write_text('')
    return tmp_path, io_max


def run(host, hour, quiet_hours='23-8'):
    tmp_path, io_max = host
    env = dict(os.environ, PATH=f"{tmp_path / 'bin'}:{os.environ['PATH']}", CGROUP_ROOT=str(tmp_path / 'cgroup'),
               DEVICE='8:16', HOUR=str(hour), QUIET_HOURS=quiet_hours)
    result = subprocess.run(['sh', SCRIPT], env=env, capture_output=True, text=True, check=True)
    return io_max.read_text().strip(), result.stdout.strip()


@pytest.mark.parametrize('hour', [23, 0, 3, 7])
def test_caps_the_disk_overnight(host, hour):
    assert run(host, hour)[0] == f'8:16 {NIGHT}'


@pytest.mark.parametrize('hour', [8, 12, 22])
def test_lifts_the_cap_by_day(host, hour):
    assert run(host, hour)[0] == f'8:16 {DAY}'


def test_handles_quiet_hours_within_one_day(host):
    assert run(host, 3, '1-5')[0] == f'8:16 {NIGHT}'
    assert run(host, 5, '1-5')[0] == f'8:16 {DAY}'


def test_logs_only_when_the_cap_changes(host):
    assert run(host, 23)[1] == f'reddit-rebuilt-db on 8:16: {NIGHT}'
    assert run(host, 0)[1] == ''
    assert run(host, 8)[1] == f'reddit-rebuilt-db on 8:16: {DAY}'
