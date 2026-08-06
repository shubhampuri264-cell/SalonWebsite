import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from '@dr.pogodin/react-helmet';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { initSentry } from './sentry';
import './index.css';

// Initialize Sentry BEFORE rendering so the SDK can attach global error/
// unhandledrejection handlers in time to catch boot-time failures.
initSentry();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HelmetProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </HelmetProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
