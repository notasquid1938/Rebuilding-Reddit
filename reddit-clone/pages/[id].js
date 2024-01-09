import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import styles from '../styles/id.module.css'

const PostDetail = () => {
    const router = useRouter();
    const { id } = router.query;
    const [postData, setPostData] = useState(null);
  
    useEffect(() => {
      const fetchPostData = async () => {
        try {
          const response = await fetch(`/api/Comments?id=${id}`);
          const data = await response.json();
          setPostData(data);
        } catch (error) {
          console.error('Error fetching post data:', error);
        }
      };
  
      if (id) {
        fetchPostData();
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
      </div>
    );
  };
  
  export default PostDetail;
  
