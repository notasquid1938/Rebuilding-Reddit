import React from 'react';
import { Helmet } from 'react-helmet';
import HomePage from '../components/HomePage';
import styles from '../styles/index.module.css'

const IndexPage = () => {
  return (
    <div className={styles.container}>
      <Helmet>
        <title>Reddit - Dive into anything</title>
      </Helmet>
      <HomePage />
    </div>
  );
};

export default IndexPage;
