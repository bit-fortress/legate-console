import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import App from './App';
import AuthGateway from './AuthGateway';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthGateway>
      {({ admin, authConfig, onLogout }) => (
        <App currentAdmin={admin} authConfig={authConfig} onLogout={onLogout} />
      )}
    </AuthGateway>
  </React.StrictMode>
);
