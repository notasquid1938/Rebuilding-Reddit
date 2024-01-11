import path from 'path';
import fs from 'fs';

export default async (req, res) => {
  const { subreddit } = req.query;

  try {
    const iconsDir = path.join(process.cwd(), '../Data/reddit/icons/');
    const iconPath = path.join(iconsDir, `${subreddit}.png`);

    if (fs.existsSync(iconPath)) {
      const iconData = fs.readFileSync(iconPath);
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(iconData, 'binary');
    } else {
      res.status(404).end('Icon not found');
    }
  } catch (error) {
    console.error('Error fetching subreddit icon:', error);
    res.status(500).end('Internal Server Error');
  }
};
