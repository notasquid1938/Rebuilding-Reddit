import React from 'react';
import { Helmet } from 'react-helmet';
import SearchBar from '@/components/SearchBar';
import Timeline from '@/components/Timeline';
import Submissions from '../components/Submissions';

function HomePage () {
  return (
    <div>
      <Helmet>
        <title>Reddit - Dive into anything</title>
      </Helmet>
      <Timeline />
      <SearchBar />
      <Submissions />
    </div>
  );
};

export default HomePage;
