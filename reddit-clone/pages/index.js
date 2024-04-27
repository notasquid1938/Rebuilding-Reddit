import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import Submissions from '../components/Submissions';
import Search from '@/components/Search';

function HomePage() {
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
  const [subreddit, setSubreddit] = useState('');
  const [pageNumber, setPageNumber] = useState(1);

  useEffect(() => {
    // Load data from local storage when component mounts
    const savedStartDate = localStorage.getItem('startDate');
    const savedEndDate = localStorage.getItem('endDate');
    const savedSubreddit = localStorage.getItem('subreddit');
    const savedPageNumber = localStorage.getItem('pageNumber');

    if (savedStartDate && savedEndDate && savedSubreddit && savedPageNumber) {
      setDateRange({ startDate: savedStartDate, endDate: savedEndDate });
      setSubreddit(savedSubreddit);
      setPageNumber(parseInt(savedPageNumber));
    } else {
      // If no data in local storage, set default values
      setDateRange({ startDate: '2008-12', endDate: '2008-12' });
      setSubreddit('all');
      setPageNumber(1);
      // Save default values to local storage
      localStorage.setItem('startDate', '2008-12');
      localStorage.setItem('endDate', '2008-12');
      localStorage.setItem('subreddit', 'all');
      localStorage.setItem('pageNumber', '1');
    }
  }, []); // Empty dependency array ensures this effect runs only once on mount

  const handleDateRangeChange = (startDate, endDate) => {
    setDateRange({ startDate, endDate });
    setPageNumber(1);
    // Save to local storage
    localStorage.setItem('startDate', startDate);
    localStorage.setItem('endDate', endDate);
    localStorage.setItem('pageNumber', '1');
  };

  const handleSubredditChange = (selectedSubreddit) => {
    setSubreddit(selectedSubreddit);
    setPageNumber(1);
    // Save to local storage
    localStorage.setItem('subreddit', selectedSubreddit);
    localStorage.setItem('pageNumber', '1');
  };

  const handlePageChange = (page) => {
    setPageNumber(page);
    // Save to local storage
    localStorage.setItem('pageNumber', page.toString());
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
