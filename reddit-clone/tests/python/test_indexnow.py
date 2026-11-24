"""IndexNow submissions (indexnow.py); no network."""
import io
import json
import urllib.error

import pytest

import indexnow

SITE = 'https://redditrebuilt.com'


def test_joins_paths_to_the_site_and_drops_blanks_and_repeats():
    lines = ['/r/AskReddit\n', '\n', 'https://redditrebuilt.com/Thread/abc12\n', '/r/AskReddit\n', SITE]
    assert indexnow.to_urls(lines, SITE) == [
        'https://redditrebuilt.com/r/AskReddit',
        'https://redditrebuilt.com/Thread/abc12',
        'https://redditrebuilt.com',
    ]


@pytest.mark.parametrize('line', ['https://www.reddit.com/r/AskReddit', 'https://redditrebuilt.com.evil.example/x', 'r/AskReddit'])
def test_refuses_anything_off_the_site(line):
    with pytest.raises(ValueError):
        indexnow.to_urls([line], SITE)


def test_splits_into_batches_the_engines_accept():
    urls = [f'{SITE}/Thread/{i}' for i in range(indexnow.BATCH_SIZE + 5)]
    batches = list(indexnow.payloads(urls, 'abcd1234', SITE))
    assert [len(b['urlList']) for b in batches] == [indexnow.BATCH_SIZE, 5]
    assert batches[0]['host'] == 'redditrebuilt.com'
    assert batches[0]['key'] == 'abcd1234'
    assert batches[0]['keyLocation'] == 'https://redditrebuilt.com/indexnow.txt'
    assert batches[1]['urlList'] == urls[-5:]


class Response(io.BytesIO):
    status = 202


def test_posts_the_batch_as_json():
    sent = {}

    def opener(request, timeout):
        sent.update(url=request.full_url, method=request.get_method(), body=json.loads(request.data),
                    type=request.get_header('Content-type'))
        return Response()

    payload = next(indexnow.payloads([f'{SITE}/r/pics'], 'abcd1234', SITE))
    assert indexnow.submit(payload, 'https://api.indexnow.org/indexnow', opener) == 202
    assert sent == {'url': 'https://api.indexnow.org/indexnow', 'method': 'POST', 'body': payload,
                    'type': 'application/json; charset=utf-8'}


def test_reports_a_rejected_batch():
    def opener(request, timeout):
        raise urllib.error.HTTPError(request.full_url, 403, 'Forbidden', {}, io.BytesIO())

    payload = next(indexnow.payloads([f'{SITE}/r/pics'], 'abcd1234', SITE))
    assert indexnow.submit(payload, 'https://api.indexnow.org/indexnow', opener) == 403
