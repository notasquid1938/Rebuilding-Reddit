import React, { useState, useEffect } from 'react';
import axios from 'axios';

const HomePage = () => {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get('/api/Posts'); // Assuming your API endpoint is /api/posts
        setPosts(response.data);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
  }, []);

  return (
    <div>
      <h1>Posts from Database</h1>
      <ul>
        {posts.map((post) => (
          <li key={post._id.$oid}>
            <h2>{post.title}</h2>
            <p>{post.url}</p>
            {/* Add more fields as needed */}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default HomePage;
