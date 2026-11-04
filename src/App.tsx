import { useEffect, useState } from 'react';
import { auth } from './lib/firebase';

function App() {
  const [theme, setTheme] = useState(localStorage.getItem('talep-theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('talep-theme', theme);
  }, [theme]);

  return (
    <div style={{ padding: 40 }}>
      <h1>Talep <em>Notları</em></h1>
      <p style={{ color: 'var(--t2)', marginTop: 8 }}>
        Firebase bağlandı: {auth.app.options.projectId}
      </p>
      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        style={{ marginTop: 20, padding: '10px 18px', background: 'var(--hi)', color: 'var(--c0)', border: 'none', fontWeight: 700, cursor: 'pointer' }}
      >
        Temayı Değiştir
      </button>
    </div>
  );
}

export default App;