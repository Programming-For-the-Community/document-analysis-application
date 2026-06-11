import { DocumentRecord, UploadFileInfo } from '../../document';
import { ProjectRole } from '../../../types/app';

export interface DocumentRowProps {
  doc: DocumentRecord;
  isDuplicate: boolean;
  canEdit: boolean;
  onDelete: (documentId: string, documentName: string) => void;
  onRetry: (documentId: string) => void;
  onViewText: (documentId: string, documentName: string) => void;
}

export interface DocumentsPanelProps {
  documents: DocumentRecord[];
  loading: boolean;
  uploadStatus: string | null;
  uploadError: string | null;
  role: ProjectRole;
  onUpload: (files: UploadFileInfo[]) => void;
  onDelete: (documentId: string, documentName: string) => void;
  onRetry: (documentId: string) => void;
  onViewText: (documentId: string, documentName: string) => void;
}

export interface DocumentTextModalProps {
  isOpen: boolean;
  documentName: string;
  text: string | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}
