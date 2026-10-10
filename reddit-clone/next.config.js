/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Self-contained server bundle for the Docker image
  output: 'standalone',
  experimental: {
    // Restore feed scroll position when navigating back from a thread
    scrollRestoration: true,
  },
  // Accept Reddit-style URLs so a reddit.com link can be pasted with the domain swapped
  async rewrites() {
    return [
      { source: '/r/:subreddit/comments/:id', destination: '/Thread/:id' },
      { source: '/r/:subreddit/comments/:id/:slug*', destination: '/Thread/:id' },
      { source: '/comments/:id', destination: '/Thread/:id' },
      { source: '/comments/:id/:slug*', destination: '/Thread/:id' },
      { source: '/u/:name', destination: '/User/:name' },
      { source: '/user/:name', destination: '/User/:name' },
      { source: '/user/:name/:tab*', destination: '/User/:name' },
    ];
  },
};

module.exports = nextConfig;
