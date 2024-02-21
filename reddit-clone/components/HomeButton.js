import { useRouter } from 'next/router';
import React from 'react';

const HomeButton = () => {
  const router = useRouter();

  const redirectToBaseURL = () => {
    router.push('/');
  };

  return (
    <div>
      <button onClick={redirectToBaseURL}>Home</button>
    </div>
  );
};

export default HomeButton;
