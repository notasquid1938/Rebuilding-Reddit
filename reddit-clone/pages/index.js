import React from 'react';
import { Helmet } from 'react-helmet';
import TopPosts from '../components/TopPosts';
import SearchBar from '@/components/SearchBar';
import Timeline from '@/components/Timeline';

function HomePage () {
  return (
    <div>
      <Helmet>
        <title>Reddit - Dive into anything</title>
      </Helmet>
      <Timeline />
      <SearchBar />
      <TopPosts />
    </div>
  );
};

export default HomePage;
