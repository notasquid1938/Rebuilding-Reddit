import dump_loader
from dump_loader import encode_value, encode_row, parse, choose_columns, FILE_RE, KINDS


class TestEncodeValue:
    def test_null(self):
        assert encode_value(None, False) == '\\N'
        assert encode_value(None, True) == '\\N'

    def test_numbers(self):
        assert encode_value(42, True) == '42'
        assert encode_value(1.5, True) == '1.5'
        assert encode_value('150', True) == '150'
        assert encode_value(' 1134000000.0 ', True) == '1134000000.0'

    def test_unusable_numbers_become_null(self):
        assert encode_value(True, True) == '\\N'
        assert encode_value(float('nan'), True) == '\\N'
        assert encode_value(float('inf'), True) == '\\N'
        assert encode_value('NaN', True) == '\\N'
        assert encode_value('abc', True) == '\\N'

    def test_copy_escapes(self):
        assert encode_value('a\tb\nc\rd\\e', False) == 'a\\tb\\nc\\rd\\\\e'

    def test_nul_bytes_removed(self):
        assert encode_value('a\x00b', False) == 'ab'

    def test_booleans_match_python_str(self):
        # The site compares against 'true' case-insensitively
        assert encode_value(True, False) == 'True'
        assert encode_value(False, False) == 'False'

    def test_nested_values_become_json(self):
        assert encode_value({'a': [1, 'é']}, False) == '{"a": [1, "é"]}'
        assert encode_value([1, 2], False) == '[1, 2]'

    def test_other_types_stringified(self):
        assert encode_value(12, False) == '12'


def test_encode_row_orders_columns_and_fills_missing():
    row = encode_row({'id': 'x', 'score': 5}, ['id', 'title', 'score'], [False, False, True])
    assert row == 'x\t\\N\t5\n'


class TestParse:
    def test_object(self):
        assert parse(b'{"id": "a"}') == {'id': 'a'}

    def test_invalid_json(self):
        assert parse(b'{not json') is None

    def test_non_object(self):
        assert parse(b'[1, 2]') is None
        assert parse(b'"text"') is None

    def test_raw_nul_bytes_stripped(self):
        assert parse(b'{"id": "a\x00b"}') == {'id': 'ab'}


class TestChooseColumns:
    def test_site_mode_uses_fixed_columns(self, monkeypatch):
        monkeypatch.setattr(dump_loader, 'COLUMN_MODE', 'site')
        columns = choose_columns('submissions', [{'id': 'a', 'extra': 1}])
        assert columns == KINDS['submissions']['site_columns']

    def test_all_mode_adds_sampled_keys_once(self, monkeypatch):
        monkeypatch.setattr(dump_loader, 'COLUMN_MODE', 'all')
        sample = [{'id': 'a', 'extra': 1}, {'extra': 2, 'other': 3}, {'x' * 61: 1}]
        columns = choose_columns('submissions', sample)
        assert columns[:len(KINDS['submissions']['site_columns'])] == KINDS['submissions']['site_columns']
        assert columns.count('extra') == 1
        assert 'other' in columns
        assert 'x' * 61 not in columns  # over-long keys are not valid identifiers


def test_file_names():
    assert FILE_RE.match('RS_2005-06.zst').groups() == ('RS', '2005', '06')
    assert FILE_RE.match('RC_2024-12.zst')
    for name in ('RS_2005-6.zst', 'RS_2005-06.zst.part', 'XX_2005-06.zst', 'RS_2005-06.json'):
        assert not FILE_RE.match(name)


def test_site_columns_cover_what_the_website_reads():
    with open(dump_loader.os.path.join(dump_loader.os.path.dirname(dump_loader.__file__), 'lib', 'submissions.js')) as f:
        source = f.read()
    for column in ('title', 'selftext', 'url', 'score', 'created_utc', 'num_comments', 'over_18', 'link_flair_text'):
        assert f"'{column}'" in source
        assert column in KINDS['submissions']['site_columns']


class TestDiskBudget:
    """LOADER_MIN_FREE_GB: a month only loads if the disk keeps the reserve free."""

    def prepare(self, monkeypatch, tmp_path, free, reserved=0.0, min_free=100e9):
        import multiprocessing
        dump = tmp_path / 'RC_2010-01.zst'
        dump.write_bytes(b'x' * 1000)
        monkeypatch.setattr(dump_loader, 'MIN_FREE', min_free)
        monkeypatch.setattr(dump_loader.shutil, 'disk_usage', lambda _: type('U', (), {'free': free})())
        monkeypatch.setattr(dump_loader, 'SPACE_POLL_SECONDS', 0)
        dump_loader.init_worker(multiprocessing.Value('d', reserved, lock=False), multiprocessing.Lock())
        return str(dump)

    def test_disabled_without_a_reserve(self, monkeypatch, tmp_path):
        path = self.prepare(monkeypatch, tmp_path, free=0, min_free=0)
        assert dump_loader.claim_space('comments', path) == 0

    def test_reserves_the_peak_when_it_fits(self, monkeypatch, tmp_path):
        path = self.prepare(monkeypatch, tmp_path, free=100e9 + 5000)
        need = KINDS['comments']['peak_space'] * 1000
        assert dump_loader.claim_space('comments', path) == need
        assert dump_loader._reserved.value == need
        dump_loader.release_space(need)
        assert dump_loader._reserved.value == 0

    def test_skipped_when_it_cannot_fit_with_nothing_else_loading(self, monkeypatch, tmp_path):
        path = self.prepare(monkeypatch, tmp_path, free=100e9 + 4999)
        assert dump_loader.claim_space('comments', path) is None

    def test_waits_for_other_loads_to_finish(self, monkeypatch, tmp_path):
        path = self.prepare(monkeypatch, tmp_path, free=100e9 + 5000, reserved=1.0)
        sleeps = []

        def finish_other_load(_):
            sleeps.append(1)
            dump_loader._reserved.value = 0.0
        monkeypatch.setattr(dump_loader.time, 'sleep', finish_other_load)
        assert dump_loader.claim_space('comments', path) == 5000
        assert sleeps == [1]

    def test_no_space_is_not_a_failure(self, monkeypatch, tmp_path):
        self.prepare(monkeypatch, tmp_path, free=0)
        monkeypatch.setattr(dump_loader, 'DATA_DIR', str(tmp_path))
        assert dump_loader.load_file(('comments', 'RC_2010-01.zst')) == ('RC_2010-01.zst', None, 'no space')
