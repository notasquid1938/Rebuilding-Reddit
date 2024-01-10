import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import SearchBar from '@/components/SearchBar';
import Timeline from '@/components/Timeline';
import Submissions from '../components/Submissions';

function HomePage() {
  const [dateRange, setDateRange] = useState({ startDate: '2005-06', endDate: '2005-06' });

  const handleDateRangeChange = (startDate, endDate) => {
    setDateRange({ startDate, endDate });
  };

  return (
    <div>
      <Helmet>
        <title>Reddit - Dive into anything</title>
      </Helmet>
      <Timeline onDateRangeChange={handleDateRangeChange} />
      <SearchBar />
      <Submissions dateRange={dateRange} />
    </div>
  );
}

export default HomePage;
