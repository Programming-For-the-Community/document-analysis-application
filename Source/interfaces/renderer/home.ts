import { ProjectListItem } from '../app';

export interface ProjectsGridProps {
  projects: ProjectListItem[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string, name: string) => void;
}

export interface ProjectCardProps {
  project: ProjectListItem;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string, name: string) => void;
}

export interface RenameProjectModalProps {
  isOpen: boolean;
  projectName: string;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (newName: string) => void;
}

export interface NewProjectModalProps {
  isOpen: boolean;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (name: string) => void;
}

export interface DeleteProjectModalProps {
  isOpen: boolean;
  projectName: string;
  confirming: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}
