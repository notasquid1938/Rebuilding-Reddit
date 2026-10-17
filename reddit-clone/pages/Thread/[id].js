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
import CommentSection from '@/components/Comments';
import { CommunityCard, SidebarFooter } from '@/components/Sidebar';
import { BackIcon } from '@/components/Icons';
import { addRecentCommunity } from '@/lib/hooks';
import { canGoBack } from '@/lib/navigation';
import { decodeEntities, timeAgo, fullDate } from '@/lib/format';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import styles from '@/styles/Thread.module.css';

export async function getServerSideProps({ params, res }) {
  const { getPostById, ID_RE } = await import('@/lib/submissions');
  const id = String(params.id || '').toLowerCase();
  if (!ID_RE.test(id)) return { notFound: true };

  const post = await getPostById(id);
  if (!post) return { notFound: true };

  res.setHeader('Cache-Control', 'public, s-maxage=86400');
  return { props: { post } };
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

function PostDetail({ post }) {
  const router = useRouter();
  const info = useCommunityInfo(post.subreddit);
  const title = decodeEntities(post.title);
  const hasBody = post.is_self && post.selftext && !removedText(post.selftext);

  useEffect(() => {
    if (post.subreddit) addRecentCommunity(post.subreddit);
  }, [post.subreddit]);

  const goBack = () => {
    if (canGoBack()) router.back();
    else router.push(post.subreddit ? `/r/${post.subreddit}` : '/');
  };

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

      <CommentSection post={post} />
    </Layout>
  );
}

export default PostDetail;
