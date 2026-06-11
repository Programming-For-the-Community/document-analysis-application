import { EntityConnection } from '../../graph';
import { Theme } from '../../../types/renderer/shared';

export interface NodeDetailModalProps {
  isOpen: boolean;
  entityName: string;
  entityType: string;
  connections: EntityConnection[];
  documents: Array<{ documentId: string; documentName: string }>;
  loading: boolean;
  error: string | null;
  theme: Theme;
  onClose: () => void;
  onViewDocument: (documentId: string, documentName: string) => void;
}
