import React from 'react';
import './PageContainer.css';

const PageContainer = ({ children, className = '', ...props }) => {
  return (
    <div className={`page-content ${className}`} {...props}>
      {children}
    </div>
  );
};

export default PageContainer;
