import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link'; 
import styles from '../styles/Submissions.module.css';
import UpvoteIcon from '../public/upvote.svg';
import DownvoteIcon from '../public/downvote.svg';

const Submissions = ({ dateRange, subreddit, onPageChange }) => {
  const [posts, setPosts] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get(`/api/Posts?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}&subreddit=${subreddit}&page=${currentPage}`);
        setPosts(response.data);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
  }, [dateRange, subreddit, currentPage]);

  const formatDateTime = (timestamp) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  };

  const handleNextPage = () => {
    setCurrentPage(currentPage + 1);
    onPageChange(currentPage + 1);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
      onPageChange(currentPage - 1);
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Reddit Rebuilt</h1>
      <div className={styles.pagination}>
        <button onClick={handlePrevPage} disabled={currentPage === 1}>Previous Page</button>
        <p className={styles.pageNumber}>Page {currentPage}</p>
        <button onClick={handleNextPage}>Next Page</button>
      </div>
      <ul className={styles.postList}>
        {posts.map((post) => (
          <li key={post.id} className={styles.post}>
            <Link href={`/Thread/${post.id}`} passHref>
              <div>
                <img
                  src={`/api/SubredditIcons?subreddit=${post.subreddit}`}
                  alt={`${post.subreddit} icon`}
                  className={styles.subredditImage}
                />
                <div>
                  <p className={styles.postSubreddit}>r/{post.subreddit} • {formatDateTime(post.created_utc)}</p>
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
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <div className={styles.pagination}>
        <button onClick={handlePrevPage} disabled={currentPage === 1}>Previous Page</button>
        <p className={styles.pageNumber}>Page {currentPage}</p>
        <button onClick={handleNextPage}>Next Page</button>
      </div>
    </div>
  );
};

export default Submissions;
