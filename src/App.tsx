import React, { useEffect, useState, lazy, Suspense } from 'react';

// 1. Dynamic Import (Code-Splitting)
// We map the named export 'VaultDashboard' to 'default' for React.lazy
const VaultDashboard = lazy(() => 
  import('./components/VaultDashboard').then(module => ({ default: module.VaultDashboard }))
);

// 2. Standardized Fallback UI
const LoadingOverlay = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#666' }}>
    <p>Hydrating Vault Environment...</p>
  </div>
);

function App() {
  // 3. Hydration State
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Catch the secure tokens passed via the iframe URL
    const params = new URLSearchParams(window.location.search);
    const api = params.get('api');
    const token = params.get('token');

    // Save them to the iframe's isolated localStorage
    if (api) localStorage.setItem('oz_api', decodeURIComponent(api));
    if (token) localStorage.setItem('oz_token', decodeURIComponent(token));
    
    // Signal that the security handshake is complete
    setIsHydrated(true);
  }, []);

  // Block the heavy component from rendering (or downloading) until tokens are secure
  if (!isHydrated) return <LoadingOverlay />;

  return (
    <main
      style={{
        backgroundColor: '#f4f7f6',
        minHeight: '100vh',
        padding: '0',
        margin: '0',
      }}
    >
      {/* 4. Suspense Wrapper catches the lazy component while the network fetches it */}
      <Suspense fallback={<LoadingOverlay />}>
        <VaultDashboard />
      </Suspense>
    </main>
  );
}

export default App;