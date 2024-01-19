import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link'; 
import styles from '../styles/Submissions.module.css';
import UpvoteIcon from '../public/upvote.svg';
import DownvoteIcon from '../public/downvote.svg';

const Submissions = ({ dateRange, subreddit }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchPosts = async () => {
    try {
      const response = await axios.get(`/api/Posts?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}&subreddit=${subreddit}&page=${currentPage}`);
      setPosts(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchPosts();
  }, [dateRange, subreddit, currentPage]);

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  const formatDateTime = (timestamp) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Reddit Rebuilt</h1>
      {/* ... (other components) */}
      <ul className={styles.postList}>
        {loading ? (
          <p>Loading...</p>
        ) : (
          posts.map((post) => (
            <li key={post._id.$oid} className={styles.post}>
              <Link href={`/${post.id}`} passHref>
                <div>
                  <img
                    src={`/api/SubredditIcons?subreddit=${post.subreddit}`}
                    alt={`${post.subreddit} icon`}
                    className={styles.subredditImage}
                  />
                  <p className={styles.postSubreddit}>{post.subreddit_name_prefixed} • {formatDateTime(post.created_utc)}</p>
                  <p className={styles.postAuthor}>u/{post.author}</p>
                  <h2 className={styles.postTitle}>{post.title}</h2>
                  <p className={styles.postBody}>{post.body}</p>
                  <p className={styles.postUrl}>URL: {post.url}</p>
                  <div className={styles.postScoreContainer}>
                    <img
                      src={UpvoteIcon.src}
                      className={styles.upvoteIcon}
                      height={UpvoteIcon.height}
                      width={UpvoteIcon.width}
                      alt="Upvote Icon"
                    />
                    <p className={styles.postScore}>{post.score}</p>
                    <img
                      src={DownvoteIcon.src}
                      className={styles.downvoteIcon}
                      height={DownvoteIcon.height}
                      width={DownvoteIcon.width}
                      alt="Downvote Icon"
                    />
                  </div>
                </div>
              </Link>
            </li>
          ))
        )}
      </ul>
      <div className={styles.pagination}>
        <button disabled={currentPage === 1} onClick={() => handlePageChange(currentPage - 1)}>Previous</button>
        <span>{currentPage}</span>
        <button onClick={() => handlePageChange(currentPage + 1)}>Next</button>
      </div>
    </div>
  );
};

export default Submissions;
