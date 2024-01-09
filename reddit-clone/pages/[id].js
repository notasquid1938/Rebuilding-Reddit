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
  
    return (
      <div>
        <h1>Post</h1>
        {postData ? (
          <>
            <p>Title: {postData.title}</p>
            <p>Link: <a href={postData.url} target="_blank" rel="noopener noreferrer">{postData.url}</a></p>
            <p>Author: {postData.author}</p>
            <p>UTC Time: {new Date(postData.created_utc * 1000).toUTCString()}</p>
            {/* Render other post details based on postData */}
          </>
        ) : (
          <p>Loading...</p>
        )}
      </div>
    );
  };
  
  export default PostDetail;
  
