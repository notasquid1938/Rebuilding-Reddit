import React from 'react';
import { Helmet } from 'react-helmet';
import HomePage from '../components/HomePage';

const IndexPage = () => {
  return (
    <div>
      <Helmet>
        <title>Reddit - Dive into anything</title>
      </Helmet>
      <HomePage />
    </div>
  );
};

export default IndexPage;
