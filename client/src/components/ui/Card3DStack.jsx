import React from 'react';
import useTilt from '../../hooks/useTilt';
import './card3dstack.css';

const Card3DStack = React.memo(function Card3DStack() {
  const { ref } = useTilt();

  return (
    <div className="card3d-wrap" ref={ref}>
      <div className="card3d-stack">
        <div className="card card--bottom">SP</div>
        <div className="card card--middle">Annual Report<div className="rule"/></div>
        <div className="card card--top">Sarga</div>
      </div>
      <div className="card3d-badge">Turnaround — 24 hrs ⚡</div>
    </div>
  );
});

export default Card3DStack;
