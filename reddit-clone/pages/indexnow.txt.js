// IndexNow key: search engines fetch it to confirm that submissions from
// indexnow.py come from this site. Not found until INDEXNOW_KEY is set
const KEY_RE = /^[A-Za-z0-9-]{8,128}$/;

function IndexNowKey() {
  // getServerSideProps writes the response
}

export async function getServerSideProps({ res }) {
  const key = process.env.INDEXNOW_KEY || '';
  if (!KEY_RE.test(key)) return { notFound: true };
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.write(key);
  res.end();
  return { props: {} };
}

export default IndexNowKey;
