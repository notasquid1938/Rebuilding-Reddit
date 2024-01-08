import React from 'react';
import { Helmet } from 'react-helmet';
import TopPosts from '../components/TopPosts';
import SearchBar from '@/components/SearchBar';

function HomePage () {
  return (
    <div>
      <Helmet>
        <title>Reddit - Dive into anything</title>
      </Helmet>
      <SearchBar />
      <TopPosts />
    </div>
  );
};

export default HomePage;
