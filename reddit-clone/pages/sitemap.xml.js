import axios from 'axios';

function generateSiteMap(posts) {
  return `<?xml version="1.0" encoding="UTF-8"?>
   <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
     ${posts
       .map(({ id }) => {
         return `
       <url>
           <loc>${`/api/Sitemap/${id}`}</loc>
       </url>
     `;
       })
       .join('')}
   </urlset>
 `;
}

function SiteMap() {
  // getServerSideProps will do the heavy lifting
}

export async function getServerSideProps({ res }) {
  try {
    //USE THIS FOR DEV
    const response = await fetch("http://localhost:3000/api/Sitemap")
    const posts = await response.json()

    //USE THIS FOR PRODUCTION
    //const response = await axios.get('/api/Sitemap');
    //const posts = response.data;


    const sitemap = generateSiteMap(posts);

    res.setHeader('Content-Type', 'text/xml');
    res.write(sitemap);
    res.end();

    return {
      props: {},
    };
  } catch (error) {
    console.error('Error fetching data:', error);
    return {
      props: {},
    };
  }
}

export default SiteMap;
