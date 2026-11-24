"""
Thread pages in old Reddit's markup (as the Wayback Machine saved them in
2013-2017), for the wayback_threads.py tests. The structure follows a real
2015 capture; only the content is made up.
"""
from html import escape


def tagline(author, created, score=None, edited=None, flair=None, kind='comment', distinguished=None):
    who = (f'<a href="http://www.reddit.com/user/{author}" class="author may-blank'
           f'{" " + distinguished if distinguished else ""}" >{author}</a>' if author
           else '<em>[deleted]</em>')
    flair_html = f'<span class="flair " title="{escape(flair)}">{escape(flair)}</span>' if flair else ''
    score_html = ''
    if kind == 'comment':
        score_html = ('<span class="score unvoted">[score hidden]</span>' if score is None else
                      f'<span class="score dislikes">{score - 1} points</span><span class="score unvoted">{score} '
                      f'points</span><span class="score likes">{score + 1} points</span>')
    edited_html = (f'<time title="edited" datetime="{edited}" class="edited-timestamp">*</time>' if edited else '')
    prefix = 'submitted&#32;' if kind == 'post' else '<a href="javascript:void(0)" class="expand">[–]</a>'
    time_html = f'<time title="x" datetime="{created}" class="live-timestamp">1 year ago</time>'
    if kind == 'post':
        return f'<p class="tagline">{prefix}{time_html}{edited_html}&#32;by&#32;{who}{flair_html}</p>'
    return (f'<p class="tagline">{prefix}{who}{flair_html}<span class="userattrs"></span>&#32;{score_html}&#32;'
            f'{time_html}{edited_html}<div class="unvotable-message">sorry, archived</div></p>')


def comment(cid, author, created, body_html, score=1, replies=(), deleted=False, more=False, **extra):
    classes = 'thing id-t1_%s noncollapsed &#32; comment %s' % (cid, 'deleted' if deleted else '')
    body = '' if deleted else (f'<form action="#" class="usertext"><div class="usertext-body may-blank-within '
                               f'md-container"><div class="md">{body_html}</div>\n</div></form>')
    children = ''.join(replies)
    if more:
        children += ('<div class=" thing id-t1_zzmore morechildren" data-fullname="t1_zzmore"><span>load more '
                     'comments</span></div>')
    return (f'<div class=" {classes}" onclick="click_thing(this)" data-fullname="t1_{cid}" ><p class="parent">'
            f'<a name="{cid}"></a></p><div class="midcol unvoted" ></div><div class="entry unvoted">'
            f'{tagline(None if deleted else author, created, score, **extra)}{body}<ul class="flat-list buttons">'
            f'<li class="first"><a href="#" class="bylink">permalink</a></li></ul></div><div class="child">'
            f'<div id="siteTable_t1_{cid}" class="sitetable listing">{children}</div></div></div>')


def thread_page(pid, subreddit, title, author, created, comments=(), self_html=None, url=None, score=78,
                num_comments=None, classes='', flair=None, author_flair=None, edited=None, slug='a_thread'):
    kind = 'self' if self_html is not None else ''
    permalink = f'http://www.reddit.com/r/{subreddit}/comments/{pid}/{slug}/'
    href = permalink.replace('http://www.reddit.com', '') if self_html is not None else url
    domain = f'self.{subreddit}' if self_html is not None else url.split('/')[2]
    expando = (f'<div class="expando" ><form action="#" class="usertext"><div class="usertext-body '
               f'may-blank-within md-container"><div class="md">{self_html}</div>\n</div></form></div>'
               if self_html is not None else '')
    thumb = ('<a class="thumbnail self may-blank " href="#"></a>' if self_html is not None else
             f'<a class="thumbnail may-blank " href="{url}"><img src="//b.thumbs.redditmedia.com/{pid}.jpg" '
             'width="70" height="52" alt=""></a>')
    count = len(comments) if num_comments is None else num_comments
    link_flair = f'<span class="linkflairlabel" title="{flair}">{flair}</span>' if flair else ''
    return f'''<!doctype html><html><head><title>{escape(title)} : {subreddit}</title>
<style>body > .content .link .midcol {{ width: 3.1ex }}</style></head><body>
<div id="header"><span class="hover pagename redditname"><a href="http://www.reddit.com/r/{subreddit}/" >{subreddit}</a></span></div>
<div class="content" role="main"><div id="siteTable" class="sitetable linklisting">
<div class=" thing id-t3_{pid} odd&#32; link {kind} {classes}" onclick="click_thing(this)" data-fullname="t3_{pid}" data-cid="" >
<p class="parent"></p><span class="rank"></span><div class="midcol unvoted" ><div class="score dislikes">{score - 1}</div>
<div class="score unvoted">{score}</div><div class="score likes">{score + 1}</div></div>{thumb}
<div class="entry unvoted"><p class="title">{link_flair}<a class="title may-blank " href="{href}" tabindex="1" >{escape(title)}</a>&#32;
<span class="domain">(<a href="/r/{subreddit}/">{domain}</a>)</span></p>
{tagline(author, created, kind='post', edited=edited, flair=author_flair)}{expando}
<ul class="flat-list buttons"><li class="first"><a href="{permalink}" class="comments may-blank" >{count} comments</a></li></ul>
</div><div class="child" ></div><div class="clearleft"></div></div></div>
<div class='commentarea'><div class="panestack-title"><span class="title">all {count} comments</span></div>
<div id="siteTable_t3_{pid}" class="sitetable nestedlisting">{''.join(comments)}</div></div></div></body></html>'''


BAN_NOTICE = '''<!doctype html><html><head><title>r/gone has been banned</title></head><body>
<div class="content"><div class="interstitial"><h3>r/gone has been banned</h3>
<p>This subreddit was banned due to a violation of Reddit's rules.</p></div></div></body></html>'''
