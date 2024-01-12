import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import styles from '../styles/id.module.css';
import ReactMarkdown from 'react-markdown';
import UpvoteIcon from '../public/upvote.svg';
import DownvoteIcon from '../public/downvote.svg';

const PostDetail = () => {
  const router = useRouter();
  const { id } = router.query;
  const [postData, setPostData] = useState(null);
  const [commentsData, setCommentsData] = useState(null);
  const [imgurImageData, setImgurImageData] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const postResponse = await fetch(`/api/ID?id=${id}`);
        const postData = await postResponse.json();
        setPostData(postData);
  
        if (postData.url.includes('imgur.com')) {
          const imgurId = postData.url.split('/').pop(); // Extract Imgur ID from the URL
          const imgurResponse = await fetch(`/api/ImgurImages?id=${imgurId}`);
          const imgurImageData = await imgurResponse.json();
          setImgurImageData(imgurImageData);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };
  
    const fetchComments = async () => {
      try {
        const commentsResponse = await fetch(`/api/Comments?id=${id}&page=${currentPage}`);
        const commentsData = await commentsResponse.json();
        const sortedComments = commentsData.sort((a, b) => b.score - a.score);
        setCommentsData(sortedComments);
      } catch (error) {
        console.error('Error fetching comments:', error);
      }
    };
  
    if (id) {
      fetchData();
      fetchComments(); 
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
          <div className={styles.postInfo}>
            <img
              src={`/api/SubredditIcons?subreddit=${postData.subreddit}`}
              alt={`${postData.subreddit} icon`}
              className={styles.subredditImage}
            />
            <div className={styles.postInfoText}>
              <p className={styles.postSubreddit}>{postData.subreddit_name_prefixed} • {formatDateTime(postData.created_utc)}</p>
              <p className={styles.postAuthor}>{postData.author}</p>
            </div>
          </div>
          <p className={styles.postTitle}>{postData.title}</p>
          <p>Link: <a className={styles.postLink} href={postData.url} target="_blank" rel="noopener noreferrer">{postData.url}</a></p>
          <div className={styles.commentScoreContainer}>
              <img
                src={UpvoteIcon.src}
                className={styles.upvoteIcon}
                height={UpvoteIcon.height}
                width={UpvoteIcon.width}
              />
              <p className={styles.commentScore}>{postData.score}</p>
              <img
                src={DownvoteIcon.src}
                className={styles.downvoteIcon}
                height={DownvoteIcon.height}
                width={DownvoteIcon.width}
              />
            </div>
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
              <p className={styles.commentAuthor}>{comment.author} • {formatDateTime(comment.created_utc)}</p>
              <div className={styles.commentBody}>
                <ReactMarkdown>{comment.body}</ReactMarkdown>
              </div>
              <div className={styles.commentScoreContainer}>
                <img
                  src={UpvoteIcon.src}
                  className={styles.upvoteIcon}
                  height={UpvoteIcon.height}
                  width={UpvoteIcon.width}
                />
                <p className={styles.commentScore}>{comment.score}</p>
                <img
                  src={DownvoteIcon.src}
                  className={styles.downvoteIcon}
                  height={DownvoteIcon.height}
                  width={DownvoteIcon.width}
                />
              </div>
            </li>
          ))}
          </ul>

          <div className={styles.pagination}>
            {currentPage > 1 && (
              <button onClick={() => handlePageChange(currentPage - 1)}>Previous</button>
            )}
            <span>Page {currentPage}</span>
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
