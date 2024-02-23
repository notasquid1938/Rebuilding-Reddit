import { useRouter } from 'next/router';
import React from 'react';
import styles from "@/styles/HomeButton.module.css"

const HomeButton = () => {
  const router = useRouter();

  const redirectToBaseURL = () => {
    router.push('/');
  };

  return (
    <div className={styles.buttonContainer}>
      <button className={styles.button} onClick={redirectToBaseURL}>Home</button>
    </div>
  );
};

export default HomeButton;
