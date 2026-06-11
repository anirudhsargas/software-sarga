import React from 'react';

const Marquee = React.memo(function Marquee({ items = [], speed = 18 }) {
  const content = items.join(' \u00B7 ');
  const style = {
    '--marquee-duration': `${speed}s`
  };

  return (
    <div className="marquee" style={style}>
      <div className="marquee__inner" aria-hidden>
        <span className="marquee__text">{content}</span>
        <span className="marquee__text">{content}</span>
      </div>
    </div>
  );
});

export default Marquee;
