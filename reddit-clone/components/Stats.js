import React, { useState, useEffect } from 'react';
import axios from "axios";
import styles from '@/styles/Stats.module.css'
import LoadingSpinner from "./LoadingSpinner";

const Stats = ({ dateRange, subreddit }) => {
    const [isLoading, setIsLoading] = useState(false); 
    const [stats, setStats] = useState([]);
    
    useEffect(() => {
        const fetchStats = async () => {
          setIsLoading(true); 
          try {
            const response = await axios.get(`/api/Stats?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}&subreddit=${subreddit}`);
            setPosts(response.data);
          } catch (error) {
            console.error('Error fetching data:', error);
          } finally {
            setIsLoading(false); 
          }
        };
    
        fetchStats();
      }, [dateRange, subreddit]);

    return (
        <div>
            <p className={styles.Title}>Stats</p>
        </div>
    )
} 

export default Stats;