import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';

console.log('=== PHOTONIC FRONTEND STARTING ===');
console.log('React version:', React.version);
console.log('Root element:', document.getElementById('root'));

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Root element not found!');
  }

  console.log('Creating React root...');
  const root = ReactDOM.createRoot(rootElement);

  console.log('Rendering App...');
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  console.log('=== APP RENDERED SUCCESSFULLY ===');
} catch (error) {
  console.error('=== FATAL ERROR ===', error);
  document.body.innerHTML = `
    <div style="padding: 2rem; background: red; color: white; font-family: monospace;">
      <h1>FATAL ERROR</h1>
      <pre>${error instanceof Error ? error.message : String(error)}</pre>
      <pre>${error instanceof Error ? error.stack : ''}</pre>
    </div>
  `;
}
