import { checkRateLimit, getClientIp } from '../../middleware/rateLimit';
import { getPostById, ID_RE } from '@/lib/submissions';

export default async function handler(req, res) {
  // Rate limiting
  const ip = getClientIp(req);
  if (!checkRateLimit(req, ip, 100, 60000)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'Missing post ID' });
    }

    if (!ID_RE.test(id)) {
      return res.status(400).json({ error: 'Invalid post ID format' });
    }

    const post = await getPostById(id.toLowerCase());
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).json(post);
  } catch (error) {
    console.error('Error fetching post data:', error.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
