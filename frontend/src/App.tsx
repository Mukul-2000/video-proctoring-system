import React from 'react';
import Proctor from './components/Proctor';

export default function App() {
  const sessionId = 'session-123';
  return (
    <div style={{ padding: 20, fontFamily: 'Arial, sans-serif' }}>
      <h1>Focus & Object Detection — Proctor</h1>
      <Proctor sessionId={sessionId} />
    </div>
  );
}
