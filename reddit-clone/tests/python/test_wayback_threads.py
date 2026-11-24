"""Parsing saved thread pages (wayback_threads.py); no database or network."""
from wayback_pages import BAN_NOTICE, comment, thread_page

import wayback_threads as w

CREATED = '2015-04-02T10:17:26-07:00'  # 17:17:26 UTC
CREATED_UTC = 1427995046


def self_thread(**extra):
    replies = [comment('c3', 'dana', '2015-04-02T12:30:00+00:00', '<p>Nested <em>reply</em></p>', score=2)]
    comments = [
        comment('c1', 'carl', '2015-04-02T12:00:00+00:00', '<p>First comment</p>', score=28, replies=replies,
                flair='Regular'),
        comment('c2', None, '2015-04-02T13:00:00+00:00', '', deleted=True, more=True),
        comment('c4', 'erin', '2015-04-02T14:00:00+00:00', '<p>Hidden score</p>', score=None,
                distinguished='moderator', edited='2015-04-02T15:00:00+00:00'),
    ]
    html = ('<p>Line with <strong>bold</strong> and a <a href="https://example.com/x">link</a>.</p>\n'
            '<blockquote>\n<p>Quoted</p>\n</blockquote>\n<ul>\n<li>one</li>\n<li>two</li>\n</ul>\n'
            '<pre><code>code line\n  indented\n</code></pre>\n<p>Line one<br/>\nline two &amp; more</p>')
    return thread_page('abc12', 'SomeSub', 'A title & more', 'alice', CREATED, comments=comments, self_html=html,
                       flair='Discussion', author_flair='Veteran', **extra)


def test_reads_the_post():
    post, _ = w.parse_thread(self_thread(), 'abc12', 'somesub')
    assert post['title'] == 'A title & more'
    assert post['author'] == 'alice'
    assert post['subreddit'] == 'SomeSub'  # the page's own spelling wins
    assert post['created_utc'] == CREATED_UTC
    assert post['score'] == 78
    assert post['num_comments'] == 3
    assert post['is_self'] is True
    assert post['domain'] == 'self.SomeSub'
    assert post['permalink'] == '/r/SomeSub/comments/abc12/a_thread/'
    assert post['url'] == 'https://www.reddit.com/r/SomeSub/comments/abc12/a_thread/'
    assert post['link_flair_text'] == 'Discussion'
    assert post['author_flair_text'] == 'Veteran'
    assert post['thumbnail'] == 'self'
    assert post['over_18'] is False and post['stickied'] is False and post['edited'] is False


def test_turns_the_body_back_into_markdown():
    post, _ = w.parse_thread(self_thread(), 'abc12')
    assert post['selftext'] == (
        'Line with **bold** and a [link](https://example.com/x).\n\n> Quoted\n\n* one\n* two\n\n'
        '    code line\n      indented\n\nLine one  \n line two & more')


def test_reads_comments_with_their_parents():
    _, comments = w.parse_thread(self_thread(), 'abc12')
    by_id = {c['id']: c for c in comments}
    assert list(by_id) == ['c1', 'c3', 'c2', 'c4']  # "load more" placeholders are skipped
    assert by_id['c1'] == {
        'id': 'c1', 'parent_id': 't3_abc12', 'link_id': 't3_abc12', 'author': 'carl', 'body': 'First comment',
        'subreddit': 'SomeSub', 'score': 28, 'created_utc': 1427976000, 'distinguished': None, 'edited': False,
        'stickied': False, 'author_flair_text': 'Regular', 'controversiality': 0}
    assert by_id['c3']['parent_id'] == 't1_c1'
    assert by_id['c3']['body'] == 'Nested *reply*'
    assert (by_id['c2']['author'], by_id['c2']['body']) == ('[deleted]', '[deleted]')
    assert by_id['c4']['score'] is None
    assert by_id['c4']['distinguished'] == 'moderator'
    assert by_id['c4']['edited'] == 1427986800


def test_link_posts():
    page = thread_page('lnk1', 'pics', 'A picture', 'bob', CREATED, url='https://i.imgur.com/x.jpg',
                       classes='over18 stickied locked')
    post, comments = w.parse_thread(page, 'lnk1')
    assert post['is_self'] is False
    assert post['url'] == 'https://i.imgur.com/x.jpg'
    assert post['domain'] == 'i.imgur.com'
    assert post['selftext'] == ''
    assert post['thumbnail'] == 'https://b.thumbs.redditmedia.com/lnk1.jpg'
    assert (post['over_18'], post['stickied'], post['locked']) == (True, True, True)
    assert comments == []


def test_pages_without_the_post_are_unusable():
    assert w.parse_thread(BAN_NOTICE, 'abc12') is None
    assert w.parse_thread(self_thread(), 'other') is None
    assert w.parse_thread('', 'abc12') is None


def test_groups_captures_by_post_newest_first():
    lines = [
        '20150101000000 http://www.reddit.com/r/Sub/comments/ABC12/title/ 200',
        '20150301000000 https://www.reddit.com/r/sub/comments/abc12/ 200',
        '20150201000000 http://np.reddit.com/r/sub/comments/abc12/title/?sort=new 200',
        '20150201000000 http://www.reddit.com/r/sub/comments/def34 200',
        '20150201000000 http://www.reddit.com/r/sub/wiki/index 200',
        'not a line',
    ]
    captures = w.thread_ids(lines)
    assert sorted(captures) == ['abc12', 'def34']
    assert [ts for ts, _ in captures['abc12']] == ['20150301000000', '20150201000000', '20150101000000']


def test_splits_the_resume_key_off_index_replies():
    assert w.split_resume_key('1 a 200\n2 b 200\n\nKEY123\n') == (['1 a 200', '2 b 200'], 'KEY123')
    assert w.split_resume_key('1 a 200\n2 b 200\n') == (['1 a 200', '2 b 200'], None)
    assert w.split_resume_key('') == ([], None)
