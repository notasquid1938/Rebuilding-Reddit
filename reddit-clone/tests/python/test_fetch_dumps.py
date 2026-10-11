from fetch_dumps import parse_sources, month_range

H1 = 'a' * 40
H2 = 'b' * 40
H3 = 'c' * 40
H4 = 'd' * 40

DOWNLOAD_LINKS = f"""
# Download links

| Month | zst | other |
| --- | --- | --- |
| 2005-06 - 2024-12 | [torrent](https://academictorrents.com/details/{H1}) | x |
| 2025-01 | ~~[torrent](https://academictorrents.com/details/{H2})~~ superseded | x |
| 2025-01 | [torrent](https://academictorrents.com/details/{H3}) | x |
| 2025-02 | not yet | [other](https://academictorrents.com/details/{H2}) |

2005-06 - 2025-12 magnet link: `magnet:?xt=urn:btih:{H4}&dn=reddit`
"""


def test_parse_sources():
    assert parse_sources(DOWNLOAD_LINKS) == [
        ('2005-06', '2024-12', H1),
        ('2025-01', '2025-01', H3),
        ('2005-06', '2025-12', H4),
    ]


def test_struck_out_rows_are_ignored():
    assert all(h != H2 for _, _, h in parse_sources(DOWNLOAD_LINKS))


def test_hash_only_read_from_zst_column():
    # 2025-02's only link is in another column
    assert not any(first == '2025-02' for first, _, _ in parse_sources(DOWNLOAD_LINKS))


def test_parse_sources_empty():
    assert parse_sources('nothing here') == []


def test_month_range_crosses_years():
    assert list(month_range('2005-11', '2006-02')) == ['2005-11', '2005-12', '2006-01', '2006-02']
    assert list(month_range('2006-01', '2006-01')) == ['2006-01']
    assert list(month_range('2006-02', '2006-01')) == []
