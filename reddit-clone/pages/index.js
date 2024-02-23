import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import Submissions from '../components/Submissions';
import Search from '@/components/Search';

function HomePage() {
  const [dateRange, setDateRange] = useState({ startDate: '2008-12', endDate: '2008-12'});
  const [subreddit, setSubreddit] = useState('all');
  const [pageNumber, setPageNumber] = useState(1); // Add state for the page number

  const handleDateRangeChange = (startDate, endDate) => {
    setDateRange({ startDate, endDate });
    setPageNumber(1); // Reset page number when date range changes
  };

  const handleSubredditChange = (subreddit) => {
    setSubreddit(subreddit);
    setPageNumber(1); // Reset page number when subreddit changes
  };

  const handlePageChange = (page) => {
    setPageNumber(page); // Update page number when page changes
  };

  return (
    <div>
      <Helmet htmlAttributes={{ lang: 'en' }}>
        <title>Reddit - Dive into anything</title>
        <meta name="description" content="A website for archiving old Reddit Posts" />
        <link rel="icon" type="image/png" href="../favicon.png"></link>
        <link rel="sitemap" type="application/xml" title="Sitemap" href="/sitemap.xml" />
      </Helmet>
      <Search onDateRangeChange={handleDateRangeChange} onSubredditChange={handleSubredditChange} />
      <Submissions dateRange={dateRange} subreddit={subreddit} page={pageNumber} onPageChange={handlePageChange} />
    </div>
  );
}

export default HomePage;
