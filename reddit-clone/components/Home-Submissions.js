import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link'; 
import styles from '../styles/Submissions.module.css';
import UpvoteIcon from '../public/upvote.svg';
import DownvoteIcon from '../public/downvote.svg';
import LoadingSpinner from './LoadingSpinner'; 

const HomeSubmissions = ({ dateRange, subreddit, page, onPageChange }) => {
  const [posts, setPosts] = useState([]);
  const [currentPage, setCurrentPage] = useState(page);
  const [isLoading, setIsLoading] = useState(false); 

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true); 
      try {
        const response = await axios.get(`/api/Posts?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}&subreddit=${subreddit}&page=${currentPage}`);
        setPosts(response.data);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false); 
      }
    };

    fetchData();
  }, [dateRange, subreddit, currentPage]);

  useEffect(() => {
    setCurrentPage(page);
  }, [page]);

  const formatDateTime = (timestamp) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  };

  const handleNextPage = () => {
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    onPageChange(nextPage);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      const prevPage = currentPage - 1;
      setCurrentPage(prevPage);
      onPageChange(prevPage);
    }
  };

  const renderPostBody = (post) => {
    if (post.url.includes('imgur.com')) {
      return <img src={post.url} alt="Imgur Image" className={styles.postImage} />;
    } else {
      return <a href={post.url}>{post.url}</a>;
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.pagination}>
        <button onClick={handlePrevPage} disabled={currentPage === 1}>Previous Page</button>
        <p className={styles.pageNumber}>Page {currentPage}</p>
        <button onClick={handleNextPage}>Next Page</button>
      </div>
      {isLoading && <LoadingSpinner />}
      {!isLoading && ( 
        <div>
          {posts.length === 0 ? (
            <p>No posts found</p>
          ) : (
            <ul className={styles.postList}>
              {posts.map((post) => (
                <li key={post.id} className={styles.post}>
                  <Link href={`/Thread/${post.id}`} passHref>
                    <div>
                      <div className={styles.postContainer}>
                        <div className={styles.postTop}>
                          <img
                            src={`/api/SubredditIcons?subreddit=${post.subreddit}`}
                            alt={`${post.subreddit} icon`}
                            className={styles.subredditImage}
                          />
                          <p className={styles.postSubreddit}>r/{post.subreddit} • {formatDateTime(post.created_utc)}</p>
                        </div>
                        <p className={styles.postAuthor}>u/{post.author}</p>
                        <h2 className={styles.postTitle}>{post.title}</h2>
                        <div className={styles.postBody}>
                          {renderPostBody(post)}
                        </div>
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
          )}
        </div>
      )}
      <div className={styles.pagination}>
        <button onClick={handlePrevPage} disabled={currentPage === 1}>Previous Page</button>
        <p className={styles.pageNumber}>Page {currentPage}</p>
        <button onClick={handleNextPage}>Next Page</button>
      </div>
    </div>
  );
  
};

export default HomeSubmissions;
