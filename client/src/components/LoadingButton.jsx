import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * LoadingButton Component
 * A consistent button component that handles loading states with a spinner.
 */
const LoadingButton = ({ 
  loading, 
  children, 
  loadingText, 
  className = '', 
  disabled, 
  icon: Icon,
  ...props 
}) => {
  return (
    <button 
      {...props} 
      className={`${className} ${loading ? 'loading' : ''}`}
      disabled={loading || disabled}
    >
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        gap: '8px',
        visibility: loading && !loadingText ? 'hidden' : 'visible'
      }}>
        {loading ? (
          <Loader2 className="animate-spin" size={18} />
        ) : (
          Icon && <Icon size={18} />
        )}
        
        <span>
          {loading ? (loadingText || children) : children}
        </span>
      </div>
      
      {loading && !loadingText && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Loader2 className="animate-spin" size={18} />
        </div>
      )}
    </button>
  );
};

export default LoadingButton;
