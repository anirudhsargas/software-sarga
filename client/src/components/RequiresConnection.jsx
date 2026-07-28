import React from 'react';
import NoInternetState from './NoInternetState';

const RequiresConnection = ({ children, feature = 'This feature' }) => {
  return (
    <NoInternetState
      variant="fullPage"
      title="Requires Internet Connection"
      message={`${feature} needs a live server connection to load data.`}
      suggestion="Please check your connection and try again."
    >
      {children}
    </NoInternetState>
  );
};

export default RequiresConnection;
