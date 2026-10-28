import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import SubredditIcon from '@/components/SubredditIcon';
import Markdown from '@/components/Markdown';
import PostMedia, { LinkThumbnail, LinkDomain } from '@/components/PostMedia';
import { PostTags } from '@/components/PostCard';
import { VoteButtons, CommentsButton, ShareButton, SaveButton } from '@/components/PostActions';
import CommentSection, { PAGE_SIZE as COMMENTS_PAGE_SIZE } from '@/components/Comments';
import { CommunityCard, SidebarFooter } from '@/components/Sidebar';
import { BackIcon } from '@/components/Icons';
import { addRecentCommunity } from '@/lib/hooks';
import { canGoBack } from '@/lib/navigation';
import { decodeEntities, timeAgo, fullDate, monthLabel } from '@/lib/format';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { threadStructuredData, commentStructuredData, jsonLd } from '@/lib/structuredData';
import styles from '@/styles/Thread.module.css';

const COMMENTS_WAIT_MS = 2000;

export async function getServerSideProps({ params, res }) {
  const { getPostById, getMissingPost, firstComments, ID_RE } = await import('@/lib/submissions');
  const id = String(params.id || '').toLowerCase();
  if (!ID_RE.test(id)) return { notFound: true };

  // No archive may have the post, but its comments may have survived
  const post = (await getPostById(id)) || (await getMissingPost(id));
  if (!post) return { notFound: true };

  // The first page of comments, in the HTML for crawlers and the structured
  // data, and the comment section's starting point. A slow lookup is left to
  // the browser rather than holding up the page, and keeps going to fill the
  // cache for the comment section's own request
  const firstPage = await Promise.race([
    firstComments(post, COMMENTS_PAGE_SIZE).catch(() => null),
    new Promise((resolve) => setTimeout(resolve, COMMENTS_WAIT_MS, null)),
  ]);

  res.setHeader('Cache-Control', 'public, s-maxage=86400');
  return { props: { post, firstPage, comments: commentStructuredData(firstPage?.comments) } };
}

function useCommunityInfo(name) {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (!name) return;
    let active = true;
    fetch(`/api/Subreddit?name=${encodeURIComponent(name)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => active && setInfo(data))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [name]);
  return info;
}

const removedText = (text) => ['[deleted]', '[removed]'].includes(text);

function useBack(subreddit) {
  const router = useRouter();
  return () => {
    if (canGoBack()) router.back();
    else router.push(subreddit ? `/r/${subreddit}` : '/');
  };
}

// A thread whose post isn't in any archive, shown for the comments that were
function MissingPostDetail({ post, firstPage }) {
  const info = useCommunityInfo(post.subreddit);
  const goBack = useBack(post.subreddit);
  const community = post.subreddit ? `r/${post.subreddit}` : 'Reddit';

  return (
    <Layout
      sidebar={
        post.subreddit && (
          <>
            <CommunityCard name={post.subreddit} info={info} showLink />
            <SidebarFooter />
          </>
        )
      }
    >
      <Head>
        <title>{`Unarchived post : ${community}`}</title>
        <meta name="description" content={`Comments on a ${community} post from ${monthLabel(post.month)} that wasn't archived`} />
        <meta name="robots" content="noindex" />
        <link rel="canonical" href={`${SITE_URL}/Thread/${post.id}`} />
      </Head>

      <article className={styles.post}>
        <div className={styles.metaRow}>
          <button type="button" className={styles.backButton} onClick={goBack} aria-label="Go back">
            <BackIcon size={16} />
          </button>
          {post.subreddit && (
            <Link href={`/r/${post.subreddit}`} aria-hidden="true" tabIndex={-1}>
              <SubredditIcon name={post.subreddit} size={32} />
            </Link>
          )}
          <div className={styles.metaText}>
            <div className={styles.metaTop}>
              {post.subreddit ? (
                <Link href={`/r/${post.subreddit}`} className={styles.community}>
                  r/{post.subreddit}
                </Link>
              ) : (
                <span className={styles.community}>Unknown community</span>
              )}
              <span className={styles.dot}>•</span>
              <span>{monthLabel(post.month)}</span>
            </div>
          </div>
        </div>

        <div className={styles.titleRow}>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>This post wasn&apos;t archived</h1>
          </div>
        </div>
        <p className={styles.removed}>
          None of the archives this site is built from has the post itself, but comments on it were saved. They&apos;re
          shown below.
        </p>

        <div className={styles.actions}>
          <ShareButton path={`/Thread/${post.id}`} />
        </div>
      </article>

      <CommentSection post={post} initial={firstPage} />
    </Layout>
  );
}

function PostDetail({ post, firstPage, comments }) {
  if (post.missing) return <MissingPostDetail post={post} firstPage={firstPage} />;
  return <ArchivedPostDetail post={post} firstPage={firstPage} comments={comments} />;
}

function ArchivedPostDetail({ post, firstPage, comments }) {
  const info = useCommunityInfo(post.subreddit);
  const title = decodeEntities(post.title);
  const hasBody = post.is_self && post.selftext && !removedText(post.selftext);

  useEffect(() => {
    if (post.subreddit) addRecentCommunity(post.subreddit);
  }, [post.subreddit]);

  const goBack = useBack(post.subreddit);

  const description = hasBody
    ? decodeEntities(post.selftext).replace(/\s+/g, ' ').slice(0, 160)
    : `Posted in r/${post.subreddit} by u/${post.author} on ${fullDate(post.created_utc)}`;

  return (
    <Layout
      sidebar={
        post.subreddit && (
          <>
            <CommunityCard name={post.subreddit} info={info} showLink />
            <SidebarFooter />
          </>
        )
      }
    >
      <Head>
        <title>{post.subreddit ? `${title} : r/${post.subreddit}` : `${title} - ${SITE_NAME}`}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={`${SITE_URL}/Thread/${post.id}`} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:site_name" content={SITE_NAME} />
        {post.over_18 && <meta name="rating" content="adult" />}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(threadStructuredData(post, comments)) }} />
      </Head>

      <article className={styles.post}>
        <div className={styles.metaRow}>
          <button type="button" className={styles.backButton} onClick={goBack} aria-label="Go back">
            <BackIcon size={16} />
          </button>
          {post.subreddit && (
            <Link href={`/r/${post.subreddit}`} aria-hidden="true" tabIndex={-1}>
              <SubredditIcon name={post.subreddit} size={32} />
            </Link>
          )}
          <div className={styles.metaText}>
            <div className={styles.metaTop}>
              {post.subreddit ? (
                <Link href={`/r/${post.subreddit}`} className={styles.community}>
                  r/{post.subreddit}
                </Link>
              ) : (
                <span className={styles.community}>Unknown community</span>
              )}
              <span className={styles.dot}>•</span>
              <time title={fullDate(post.created_utc)} suppressHydrationWarning>
                {timeAgo(post.created_utc)}
              </time>
            </div>
            {post.author === '[deleted]' ? (
              <span className={styles.author}>[deleted]</span>
            ) : (
              <Link href={`/User/${post.author}`} className={styles.author}>
                {post.author}
              </Link>
            )}
          </div>
        </div>

        <div className={styles.titleRow}>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>{title}</h1>
            <PostTags post={post} />
            <LinkDomain post={post} />
          </div>
          <LinkThumbnail post={post} />
        </div>

        {hasBody && <Markdown className={styles.body}>{post.selftext}</Markdown>}
        {post.is_self && removedText(post.selftext) && <p className={styles.removed}>{post.selftext}</p>}

        <PostMedia post={post} />

        <p className={styles.archivedNote}>
          Posted {fullDate(post.created_utc)}
          {post.edited ? ' · edited' : ''}
          {post.locked ? ' · locked' : ''}
        </p>

        <div className={styles.actions}>
          <VoteButtons score={post.score} />
          <CommentsButton count={post.num_comments} />
          <ShareButton path={`/Thread/${post.id}`} />
          <SaveButton post={post} />
        </div>
      </article>

      <CommentSection post={post} initial={firstPage} />
    </Layout>
  );
}

export default PostDetail;
