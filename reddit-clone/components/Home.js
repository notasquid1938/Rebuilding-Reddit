import React from 'react';
import HomeSubmissions from "./Home-Submissions";
import Stats from "./Stats";
import styles from '@/styles/Home.module.css';

const HomePage = ({ dateRange, subreddit, page, onPageChange }) => {
    return (
        <div className={styles.container}>
            <div className={styles.stats}>
                <Stats 
                    dateRange={dateRange}
                    subreddit={subreddit}
                />
            </div>
            <div className={styles.submissions}>
                <HomeSubmissions 
                    dateRange={dateRange}
                    subreddit={subreddit}
                    page={page}
                    onPageChange={onPageChange}
                />
            </div>
        </div>
    );
};

export default HomePage;
