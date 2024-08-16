import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import HomePage from '../components/Home';
import Search from '@/components/Search';
import styles from '../styles/index.module.css';

function SearchPage() {
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
  const [subreddit, setSubreddit] = useState('');
  const [pageNumber, setPageNumber] = useState(1);

  useEffect(() => {
    sessionStorage.setItem('dateRange', JSON.stringify(dateRange));
  }, [dateRange]);

  useEffect(() => {
    sessionStorage.setItem('subreddit', subreddit);
  }, [subreddit]);

  useEffect(() => {
    sessionStorage.setItem('pageNumber', pageNumber.toString());
  }, [pageNumber]);

  useEffect(() => {
    const savedDateRange = JSON.parse(sessionStorage.getItem('dateRange'));
    const savedSubreddit = sessionStorage.getItem('subreddit');
    const savedPageNumber = parseInt(sessionStorage.getItem('pageNumber'), 10);
  
    if (savedDateRange) setDateRange(savedDateRange);
    if (savedSubreddit !== null) setSubreddit(savedSubreddit);
    if (!isNaN(savedPageNumber)) setPageNumber(savedPageNumber);
  }, []);  

  const handleDateRangeChange = (startDate, endDate) => {
    setDateRange({ startDate, endDate });
    setPageNumber(1);
  };

  const handleSubredditChange = (selectedSubreddit) => {
    setSubreddit(selectedSubreddit);
    setPageNumber(1);
  };

  const handlePageChange = (page) => {
    setPageNumber(page);
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
      <HomePage dateRange={dateRange} subreddit={subreddit} page={pageNumber} onPageChange={handlePageChange} />
    </div>
  );
}

export default SearchPage;
