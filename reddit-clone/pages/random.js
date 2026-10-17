// /random (or /random?subreddit=name) redirects to a random archived thread
function Random() {
  return null;
}

export async function getServerSideProps({ query, res }) {
  const { randomPostId, resolveSubreddit, SUBREDDIT_RE } = await import('@/lib/submissions');
  res.setHeader('Cache-Control', 'no-store');
  let subreddit = typeof query.subreddit === 'string' ? query.subreddit : null;
  if (subreddit && !SUBREDDIT_RE.test(subreddit)) return { notFound: true };
  try {
    if (subreddit) subreddit = await resolveSubreddit(subreddit);
    const id = await randomPostId(subreddit);
    if (id) return { redirect: { destination: `/Thread/${id}`, permanent: false } };
  } catch (error) {
    console.error('Error picking a random post:', error.message);
  }
  return { redirect: { destination: subreddit ? `/r/${encodeURIComponent(subreddit)}` : '/', permanent: false } };
}

export default Random;
