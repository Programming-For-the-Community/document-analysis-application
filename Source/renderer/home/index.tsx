import { createRoot } from 'react-dom/client';
import { HomePage } from './HomePage';
import { getStoredTheme, applyTheme } from '../../utils/renderer/theme';

applyTheme(getStoredTheme());

createRoot(document.getElementById('root')!).render(<HomePage />);