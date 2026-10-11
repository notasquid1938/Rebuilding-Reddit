from subreddits_loader import record_row, FILE_RE


def test_profile_subreddits_skipped():
    assert record_row({'display_name': 'u_someone'}) is None
    assert record_row({'display_name': 'U_Someone'}) is None
    assert record_row({'display_name': ''}) is None
    assert record_row({}) is None


def test_fields_mapped():
    row = record_row({
        'display_name': 'programming', 'id': 'abc', 'title': 'Programming', 'subscribers': '1500',
        'created_utc': 1141171200.0, 'over18': 'True', 'subreddit_type': 'public',
        'community_icon': 'https://x/icon.png?a=1&amp;b=2', 'banner_img': 'https://x/banner.png',
        'key_color': '#ffffff', 'retrieved_on': 1700000000,
    })
    assert row['name'] == 'programming'
    assert row['subscribers'] == 1500
    assert row['created_utc'] == 1141171200
    assert row['over18'] is True
    assert row['icon_url'] == 'https://x/icon.png?a=1&b=2'  # HTML entities decoded
    assert row['banner_url'] == 'https://x/banner.png'


def test_icon_falls_back_to_legacy_field():
    row = record_row({'display_name': 'pics', 'community_icon': '', 'icon_img': 'https://x/legacy.png'})
    assert row['icon_url'] == 'https://x/legacy.png'


def test_blank_values_are_null():
    row = record_row({'display_name': 'pics', 'title': '', 'subscribers': None, 'over18': None, 'key_color': 'None'})
    assert row['title'] is None
    assert row['subscribers'] is None
    assert row['over18'] is None
    assert row['key_color'] is None


def test_snapshot_file_names():
    assert FILE_RE.match('subreddits_2025-01.zst')
    assert FILE_RE.match('subreddits_meta_only_2025-01.zst')
    assert not FILE_RE.match('subreddits_2025-01.zst.part')
    assert not FILE_RE.match('subreddit_rules_2025-01.zst')
