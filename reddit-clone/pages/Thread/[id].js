import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import styles from '../../styles/id.module.css';
import ReactMarkdown from 'react-markdown';
import UpvoteIcon from '../../public/upvote.svg';
import DownvoteIcon from '../../public/downvote.svg';
import HomeButton from '@/components/HomeButton';

const formatDateTime = (timestamp) => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString();
};

const Comment = ({ comment }) => {
  const [showReplies, setShowReplies] = useState(false);

  return (
    <li className={styles.comment}>
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
      {comment.replies && comment.replies.length > 0 && (
        <div>
          <button onClick={() => setShowReplies(!showReplies)}>
            {showReplies ? "Hide Replies" : "Show Replies"}
          </button>
          {showReplies && (
            <ul>
              {comment.replies.map((reply, index) => (
                <Comment key={index} comment={reply} />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
};

const PostDetail = () => {
  const router = useRouter();
  const { id } = router.query;
  const [postData, setPostData] = useState(null);
  const [commentsData, setCommentsData] = useState(null);
  const [commentCount, setCommentCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const postResponse = await fetch(`/api/ID?id=${id}`);
        const postData = await postResponse.json();
        setPostData(postData);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    const fetchCommentCount = async () => {
      try {
        const commentCountResponse = await fetch(`/api/CommentCount?id=${id}`);
        const commentCount = await commentCountResponse.json();
        setCommentCount(commentCount)
        console.log("Comment Count: ", commentCount)
      } catch (error) {
        console.error('Error fetching comments:', error);
      }
    }
  
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
      fetchCommentCount();
      fetchComments(); 
    }
  }, [id, currentPage]);

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  return (
    <div>
      <HomeButton/>
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
            <p className={styles.postText}>{postData.selftext}</p>
            {postData.url.includes('imgur.com') ? (
              <img
              src={`/api/ImgurImages?id=${postData.url.split('/').pop()}`}
                alt="Imgur"
                className={styles.imgurImage}
              />
            ) : (
              <p>Link: <a className={styles.postLink} href={postData.url} target="_blank" rel="noopener noreferrer">{postData.url}</a></p>
            )}      
            <div className={styles.commentCount}>
              <p>Total Comments: {commentCount.totalComments}</p>
            </div>
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
                <Comment key={index} comment={comment} />
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
    </div>
  );
};

export default PostDetail;
