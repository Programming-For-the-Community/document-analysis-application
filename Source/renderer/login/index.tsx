import { createRoot } from 'react-dom/client';
import { LoginPage } from './LoginPage';

if (localStorage.getItem('doc-analysis-theme') === 'parchment') {
  document.documentElement.dataset['theme'] = 'parchment';
}

createRoot(document.getElementById('root')!).render(<LoginPage />);