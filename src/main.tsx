import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '../roles.css';
import '../styles.css';
import './host.css';
import './enterprise.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('AuditSphere React root element is missing.');
}

const reactRoot = (window as any).__auditSphereReactRoot ?? createRoot(rootElement);
(window as any).__auditSphereReactRoot = reactRoot;

reactRoot.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
