import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import styles from '../../styles/batch.module.css';
import ReactMarkdown from 'react-markdown';

const PostDetail = () => {
  const router = useRouter();
  const { batch } = router.query;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const postResponse = await fetch(`/api/Sitemap?batch=${batch}`);
        const postData = await postResponse.json();
        setPostData(postData);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };
  
    if (batch) {
      fetchData();
    }
  }, [batch]);
};

export default PostDetail;

