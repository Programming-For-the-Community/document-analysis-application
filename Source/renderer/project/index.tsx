import { createRoot } from 'react-dom/client';
import { ProjectPage } from './ProjectPage';
import { getStoredTheme, applyTheme } from '../../utils/renderer/theme';

applyTheme(getStoredTheme());

createRoot(document.getElementById('root')!).render(<ProjectPage />);