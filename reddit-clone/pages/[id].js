import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import styles from '../styles/id.module.css';

const PostDetail = () => {
  const router = useRouter();
  const { id } = router.query;
  const [postData, setPostData] = useState(null);
  const [commentsData, setCommentsData] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch post data
        const postResponse = await fetch(`/api/ID?id=${id}`);
        const postData = await postResponse.json();
        setPostData(postData);

        // Fetch comments data
        const commentsResponse = await fetch(`/api/Comments?id=${id}`);
        const commentsData = await commentsResponse.json();
        setCommentsData(commentsData);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    if (id) {
      fetchData();
    }
  }, [id]);

  const formatDateTime = (timestamp) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
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
              <li key={index}>
                <p>{comment.body}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p>Loading comments...</p>
      )}
    </div>
  );
};

export default PostDetail;
