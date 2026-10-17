import io
import os
import zipfile

import supplements_loader as sl


def test_normalize_keeps_site_columns_and_derives_the_rest():
    post = sl.normalize({'id': 't3_AbC1', 'title': 'Hi', 'created_utc': '1136505600', 'permalink': '/r/Sub/comments/abc1/x/',
                         'url': 'https://www.example.com/x', 'ups': 5, 'score': '3', 'selftext': ''})
    assert post['id'] == 'abc1'
    assert post['subreddit'] == 'Sub'
    assert post['domain'] == 'www.example.com'
    assert 'ups' not in post and 'selftext' not in post
    assert post['score'] == '3'


def test_normalize_rejects_unusable_records():
    assert sl.normalize({'id': 'abc', 'created_utc': 1}) is None  # no title
    assert sl.normalize({'id': 'not an id!', 'title': 'x', 'created_utc': 1}) is None
    assert sl.normalize({'id': 'abc', 'title': 'x', 'created_utc': 'never'}) is None


def test_normalize_uses_the_default_subreddit_last():
    assert sl.normalize({'id': 'a1', 'title': 't', 'created_utc': 1}, 'fromPath')['subreddit'] == 'fromPath'
    assert sl.normalize({'id': 'a1', 'title': 't', 'created_utc': 1, 'subreddit': 'own'}, 'fromPath')['subreddit'] == 'own'


def test_json_posts_finds_listing_children_and_plain_objects():
    listing = {'data': {'children': [{'kind': 't3', 'data': {'id': 'a1', 'title': 'one'}},
                                     {'kind': 't1', 'data': {'id': 'c1', 'body': 'comment'}}]}}
    assert [p['id'] for p in sl.json_posts(listing)] == ['a1']
    assert [p['id'] for p in sl.json_posts([{'id': 'b2', 'title': 'two'}])] == ['b2']


def test_json_lines_reads_documents_and_lines():
    assert [p['id'] for p in sl.json_lines(io.BytesIO(b'[{"id": "a1", "title": "x"}]'))] == ['a1']
    stream = io.BytesIO(b'{"id": "a1", "title": "x"}\nnot json\n{"id": "b2", "title": "y"}\n')
    assert [p['id'] for p in sl.json_lines(stream)] == ['a1', 'b2']


def test_csv_posts_needs_an_id_and_a_title():
    assert list(sl.csv_posts('id,title\nab1,Hello\n')) == [{'id': 'ab1', 'title': 'Hello'}]
    assert list(sl.csv_posts('author,body,id\nx,y,z\n')) == []  # a comments file


PAGE = '''<main><div class="submission pt-3" data-id="9pcnje">
        <h3 class="title"><a href="https://i.redd.it/x.jpg">Band &amp; AIDS</a></h3>
        <p><span class="badge badge-primary">12</span>&nbsp;&nbsp;2018-10-18 by <a class="author" href="u.html">Rasta</a></p>
      </div><div class="comments"><h5>20 comments</h5></div></main>'''


def test_html_post_from_an_archiver_page():
    post = sl.html_post('r/stonetoss/comments/9/p/c/n/j/e/bandaids.html', PAGE)
    assert post == {'id': '9pcnje', 'title': 'Band & AIDS', 'url': 'https://i.redd.it/x.jpg', 'score': 12,
                    'created_utc': 1539864000, 'author': 'Rasta', 'subreddit': 'stonetoss', 'num_comments': 20}


def test_html_post_self_post_and_non_post_pages():
    page = PAGE.replace('<a href="https://i.redd.it/x.jpg">Band &amp; AIDS</a>', 'Self').replace(
        '</p>\n      </div>', '</p>\n<div class="md"><p>Hello <b>there</b></p>\n</div>\n      </div>')
    post = sl.html_post('r/s/comments/9/p/c/n/j/e/x.html', page)
    assert post['selftext'] == 'Hello there' and post['is_self'] is True and post['url'] is None
    assert sl.html_post('r/s/index.html', PAGE) is None
    assert sl.html_post('r/s/comments/9/p/c/n/j/e/x.html', '<html></html>') is None


def test_directory_posts_prefers_structured_data(tmp_path):
    (tmp_path / 'data' / 'Sub' / '2020').mkdir(parents=True)
    (tmp_path / 'data' / 'Sub' / '2020' / 'links.csv').write_text('id,title,created_utc\na1,From CSV,1600000000\n')
    page_dir = tmp_path / 'r' / 'Sub' / 'comments' / '9' / 'p' / 'c' / 'n' / 'j' / 'e'
    page_dir.mkdir(parents=True)
    (page_dir / 'x.html').write_text(PAGE)
    found = list(sl.directory_posts(str(tmp_path)))
    assert found == [({'id': 'a1', 'title': 'From CSV', 'created_utc': '1600000000'}, 'Sub')]
    (tmp_path / 'data' / 'Sub' / '2020' / 'links.csv').unlink()
    assert [r['id'] for r, _ in sl.directory_posts(str(tmp_path))] == ['9pcnje']


def test_unpack_never_writes_outside_the_destination(tmp_path):
    archive = tmp_path / 'evil.zip'
    with zipfile.ZipFile(archive, 'w') as z:
        z.writestr('../escaped.txt', 'x')
        z.writestr('inside/ok.txt', 'y')
    dest = tmp_path / 'out'
    dest.mkdir()
    sl.unpack(str(archive), str(dest))
    assert (dest / 'inside' / 'ok.txt').read_text() == 'y'
    assert not os.path.exists(tmp_path / 'escaped.txt')
