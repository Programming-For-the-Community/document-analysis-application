export interface TopbarProps {
  username: string;
  theme: 'parchment' | 'slate';
  onToggleTheme: () => void;
  onLogout: () => void;
  projectName?: string;
  onBack?: () => void;
  onShare?: () => void;
}

