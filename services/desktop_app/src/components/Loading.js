import React from "react";
import Spinner from 'react-bootstrap/Spinner';

export default function Loading({isActive, text, fullScreen = true }) {
  return (
    <div className={`loading-overlay ${fullScreen && 'loading-overlay--fullscreen'} ${isActive && "is-active"}`}>
      <Spinner as='span' size='md' variant="light" animation="border" className='mx-2'/>
      <p>{text}</p>
    </div>
  );
}
