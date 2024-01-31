import axios from 'axios';

function generateSiteMap(posts) {
    return `<?xml version="1.0" encoding="UTF-8"?>
     <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
       ${posts
         .map((id) => {
           return `
         <url>
             <loc>${`https://redditrebuilt.com/Thread/${id}`}</loc>
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

export async function getServerSideProps({ res, query }) {
  try {
    const { batch } = query; // Extract batch number from URL query

    // You might want to validate the batch number here

    // Fetch posts based on the batch number
    const response = await axios.get(`/api/Sitemap?batch=${batch}`);
    const posts = response.data;
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
