import React, { useState, useEffect } from 'react';
import axios from 'axios';
import styles from '../styles/HomePage.module.css' // Import the CSS module

const HomePage = () => {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get('/api/Posts');
        setPosts(response.data);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
  }, []);

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Reddit Rebuilt</h1>
      <ul className={styles.postList}>
        {posts.map((post) => (
          <li key={post._id.$oid} className={styles.post}>
            <h2 className={styles.postTitle}>{post.title}</h2>
            <p className={styles.postUrl}>{post.url}</p>
            {/* Add more fields as needed */}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default HomePage;