import bz2
import hashlib

import pytest

import gapfill_loader as g


@pytest.mark.parametrize('line, expected', [
    (b'{"id": "abc12", "title": "x"}', 'abc12'),
    (b'{"title":"x","id":"3g1jfi"}', '3g1jfi'),
    # subreddit_id / link ids aren't the post's id
    (b'{"subreddit_id": "t5_2qh1i", "id": "zz"}', 'zz'),
    # A nested object with its own id: ambiguous, needs a full parse
    (b'{"media": {"oembed": {"id": "b001"}}, "id": "b0ab"}', None),
    (b'{"title": "no id"}', None),
    (b'{"id": "Not-Base36"}', None),
])
def test_candidate_id(line, expected):
    assert g.candidate_id(line) == expected


@pytest.mark.parametrize('created, expected', [
    (1136505600, '2006_01'),
    ('1136505600.0', '2006_01'),
    (1136073599, '2005_12'),  # the last second of 2005 (UTC)
    (1440979200.5, '2015_08'),
    (None, None),
    ('soon', None),
    (1e20, None),
])
def test_month_of(created, expected):
    assert g.month_of(created) == expected


def test_id_set_membership():
    ids = g.IdSet([5, 1, 9, 5, 2 ** 40])
    assert len(ids) == 4
    assert ids.contains([1, 2, 5, 9, 10, 0, 2 ** 40]).tolist() == [True, False, True, True, False, False, True]
    assert g.IdSet([]).contains([1]).tolist() == [False]


@pytest.mark.parametrize('tool', ['system', 'python'])
def test_open_corpus_streams_lines(tmp_path, monkeypatch, tool):
    path = tmp_path / 'corpus.bz2'
    path.write_bytes(bz2.compress(b'{"id": "a"}\n{"id": "b"}\n'))
    if tool == 'python':
        monkeypatch.setattr(g.shutil, 'which', lambda name: None)
    assert list(g.open_corpus(str(path))) == [b'{"id": "a"}\n', b'{"id": "b"}\n']


def test_checksum_is_verified_once(tmp_path, monkeypatch):
    path = tmp_path / 'RS_full_corpus.bz2'
    path.write_bytes(b'corpus')
    monkeypatch.setattr(g, 'PATH', str(path))
    monkeypatch.setattr(g, 'SHA256', hashlib.sha256(b'corpus').hexdigest())
    assert g.verified(str(path))
    assert (tmp_path / 'RS_full_corpus.bz2.sha256-ok').exists()
    path.write_bytes(b'changed')
    assert g.verified(str(path))  # the marker skips re-hashing 42 GB each cycle


def test_bad_download_is_discarded(tmp_path, monkeypatch):
    path = tmp_path / 'RS_full_corpus.bz2.part'
    path.write_bytes(b'truncated')
    monkeypatch.setattr(g, 'PATH', str(tmp_path / 'RS_full_corpus.bz2'))
    monkeypatch.setattr(g, 'SHA256', hashlib.sha256(b'corpus').hexdigest())
    assert not g.verified(str(path))
    assert not path.exists()
