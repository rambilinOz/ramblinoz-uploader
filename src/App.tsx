import React, { useEffect } from 'react';
import { VaultDashboard } from './components/VaultDashboard';

function App() {
  useEffect(() => {
    // Catch the secure tokens passed via the iframe URL
    const params = new URLSearchParams(window.location.search);
    const api = params.get('api');
    const token = params.get('token');

    // Save them to the iframe's isolated localStorage
    if (api) localStorage.setItem('oz_api', decodeURIComponent(api));
    if (token) localStorage.setItem('oz_token', decodeURIComponent(token));
  }, []);

  return (
    <main
      style={{
        backgroundColor: '#f4f7f6',
        minHeight: '100vh',
        padding: '0',
        margin: '0',
      }}
    >
      <VaultDashboard />
    </main>
  );
}

export default App;
