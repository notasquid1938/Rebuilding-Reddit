import path from 'path';
import fs from 'fs';

export default async (req, res) => {
  const ImageID  = req.query.id;

  try {
    const iconsDir = path.join(process.cwd(), '../Data/imgur/images/');
    const supportedExtensions = ['png', 'jpeg', 'jpg', 'tiff'];
    
    let iconPath;

    // Check for supported extensions
    for (const ext of supportedExtensions) {
      const fullPath = path.join(iconsDir, `${ImageID}.${ext}`);
      if (fs.existsSync(fullPath)) {
        iconPath = fullPath;
        break;
      }
    }

    const defaultIconPath = path.join(iconsDir, 'default.png');

    if (iconPath) {
      const iconData = fs.readFileSync(iconPath);
      const ext = path.extname(iconPath).slice(1); // Extract the extension
      res.writeHead(200, { 'Content-Type': `image/${ext}` });
      res.end(iconData, 'binary');
    } else {
      const defaultIconData = fs.readFileSync(defaultIconPath);
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(defaultIconData, 'binary');
    }
  } catch (error) {
    console.error('Error fetching Image:', error);
    res.status(500).end('Internal Server Error');
  }
};
