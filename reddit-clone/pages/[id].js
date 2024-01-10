// PostDetail.js
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import styles from '../styles/id.module.css';

const PostDetail = () => {
  const router = useRouter();
  const { id } = router.query;
  const [postData, setPostData] = useState(null);
  const [commentsData, setCommentsData] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch post data
        const postResponse = await fetch(`/api/ID?id=${id}`);
        const postData = await postResponse.json();
        setPostData(postData);
  
        // Fetch comments data with highest to lowest score order
        const commentsResponse = await fetch(`/api/Comments?id=${id}&page=${currentPage}`);
        const commentsData = await commentsResponse.json();
        const sortedComments = commentsData.sort((a, b) => b.score - a.score); // Sort comments by score in descending order
        setCommentsData(sortedComments);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };
  
    if (id) {
      fetchData();
    }
  }, [id, currentPage]);  

  const formatDateTime = (timestamp) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  return (
    <div className={styles.postContainer}>
      {postData ? (
        <>
          <p className={styles.postTitle}>{postData.title}</p>
          <p className={styles.postAuthor}>u/{postData.author}</p>
          <p className={styles.postSubreddit}>{postData.subreddit_name_prefixed} • {formatDateTime(postData.created_utc)}</p>
          <p>Link: <a className={styles.postLink} href={postData.url} target="_blank" rel="noopener noreferrer">{postData.url}</a></p>
        </>
      ) : (
        <p>Loading...</p>
      )}

      {commentsData ? (
        <div className={styles.commentsContainer}>
          <h2>Comments</h2>
          <ul>
            {commentsData.map((comment, index) => (
              <li key={index} className={styles.comment}>
                <p className={styles.commentAuthor}>u/{comment.author} • {formatDateTime(comment.created_utc)}</p>
                <p className={styles.commentBody}>{comment.body}</p>
                <p className={styles.commentScore}>Score: {comment.score}</p>
              </li>
            ))}
          </ul>

          <div className={styles.pagination}>
            {currentPage > 1 && (
              <button onClick={() => handlePageChange(currentPage - 1)}>Previous</button>
            )}
            <span>Page {currentPage}</span>
            {/* You can add logic to determine whether there are more pages */}
            <button onClick={() => handlePageChange(currentPage + 1)}>Next</button>
          </div>
        </div>
      ) : (
        <p>Loading comments...</p>
      )}
    </div>
  );
};

export default PostDetail;
