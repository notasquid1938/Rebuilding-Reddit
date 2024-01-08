import React, { useState, useEffect } from 'react';
import axios from 'axios';
import styles from '../styles/TopPage.module.css' // Import the CSS module

// ... (other imports)

const TopPosts = () => {
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

  const formatDateTime = (timestamp) => {
    const date = new Date(timestamp * 1000); 
    return date.toLocaleString(); 
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Reddit Rebuilt</h1>
      <ul className={styles.postList}>
        {posts.map((post) => (
          <li key={post._id.$oid} className={styles.post}>
            <p className={styles.postSubreddit}>{post.subreddit_name_prefixed} • {formatDateTime(post.created_utc)}</p>
            <p className={styles.postAuthor}>u/{post.author}</p>
            <h2 className={styles.postTitle}>{post.title}</h2>
            <p className={styles.postBody}>{post.body}</p>
            <p className={styles.postUrl}>URL: {post.url}</p>
            <p className={styles.postScore}>Score: {post.score}</p>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TopPosts;

