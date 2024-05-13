import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import Submissions from '../components/Submissions';
import Search from '@/components/Search';
import styles from '../styles/index.module.css'

function HomePage() {
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
  const [subreddit, setSubreddit] = useState('');
  const [pageNumber, setPageNumber] = useState(1);

  useEffect(() => {
    const savedStartDate = localStorage.getItem('startDate');
    const savedEndDate = localStorage.getItem('endDate');
    const savedSubreddit = localStorage.getItem('subreddit');
    const savedPageNumber = localStorage.getItem('pageNumber');

    if (savedStartDate && savedEndDate && savedSubreddit && savedPageNumber) {
      setDateRange({ startDate: savedStartDate, endDate: savedEndDate });
      setSubreddit(savedSubreddit);
      setPageNumber(parseInt(savedPageNumber));
    } else {
      setDateRange({ startDate: '2008-12', endDate: '2008-12' });
      setSubreddit('all');
      setPageNumber(1);
      localStorage.setItem('startDate', '2008-12');
      localStorage.setItem('endDate', '2008-12');
      localStorage.setItem('subreddit', 'all');
      localStorage.setItem('pageNumber', '1');
    }
  }, []); 

  const handleDateRangeChange = (startDate, endDate) => {
    setDateRange({ startDate, endDate });
    setPageNumber(1);
    localStorage.setItem('startDate', startDate);
    localStorage.setItem('endDate', endDate);
    localStorage.setItem('pageNumber', '1');
  };

  const handleSubredditChange = (selectedSubreddit) => {
    setSubreddit(selectedSubreddit);
    setPageNumber(1);
    localStorage.setItem('subreddit', selectedSubreddit);
    localStorage.setItem('pageNumber', '1');
  };

  const handlePageChange = (page) => {
    setPageNumber(page);
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
      <p className={styles.Title}>Reddit Rebuilt</p>
      <Search onDateRangeChange={handleDateRangeChange} onSubredditChange={handleSubredditChange} />
      <Submissions dateRange={dateRange} subreddit={subreddit} page={pageNumber} onPageChange={handlePageChange} />
    </div>
  );
}

export default HomePage;
