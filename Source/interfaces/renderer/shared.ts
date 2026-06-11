import { Theme } from '../../types/renderer/shared';

export interface TopbarProps {
  username: string;
  theme: Theme;
  onToggleTheme: () => void;
  onLogout: () => void;
  projectName?: string;
  onBack?: () => void;
  onShare?: () => void;
}

