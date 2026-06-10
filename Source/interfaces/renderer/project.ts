import { ProjectMember } from '../app';
import { Theme } from '../../types/renderer';
import { ProjectRole, MemberRole } from '../../types/app';
import { NodeData, EdgeData, ProcessingStatus } from '../../types/renderer';

export interface GraphNode {
  data: NodeData;
}

export interface GraphEdge {
  data: EdgeData;
}

export interface GraphExpandModalProps {
  isOpen: boolean;
  nodes: GraphNode[];
  edges: GraphEdge[];
  layout: string;
  minDocs: number;
  hiddenTypes: Set<string>;
  theme: Theme;
  onClose: () => void;
  onLayoutChange: (layout: string) => void;
  onMinDocsChange: (value: number) => void;
  onToggleHiddenType: (type: string) => void;
  onNodeClick: (entityName: string, entityType: string) => void;
}

export interface CyEvent {
  target: CyElement;
  renderedPosition?: { x: number; y: number };
}

export interface CyElement {
  data(key: string): string | number;
  connectedEdges(): CyCollection;
  neighborhood(): CyCollection;
  addClass(classes: string): CyElement;
  removeClass(classes: string): CyElement;
  hidden(): boolean;
  hide(): CyElement;
  show(): CyElement;
  source(): CyElement;
  target(): CyElement;
}

export interface CyCollection {
  not(selector: string | CyElement | CyCollection): CyCollection;
  filter(fn: (el: CyElement, i: number) => boolean): CyCollection;
  forEach(fn: (el: CyElement, i: number) => void): void;
  has(el: CyElement): boolean;
  union(other: CyCollection | CyElement): CyCollection;
  components(): CyCollection[];
  edges(): CyCollection;
  connectedEdges(): CyCollection;
  addClass(classes: string): CyCollection;
  removeClass(classes: string): CyCollection;
  hide(): CyCollection;
  show(): CyCollection;
  length: number;
}

export interface CyInstance {
  destroy(): void;
  layout(opts: Record<string, unknown>): { run(): void };
  style(styles: unknown[]): void;
  on(event: string, selector: string, handler: (e: CyEvent) => void): void;
  on(event: string, handler: (e: CyEvent) => void): void;
  fit(padding?: number): void;
  resize(): void;
  pan(): { x: number; y: number };
  pan(position: { x: number; y: number }): void;
  zoom(): number;
  elements(): CyCollection;
  nodes(selector?: string): CyCollection;
  edges(): CyCollection;
}

export interface SearchCitation {
    documentId: string;
    documentName: string;
    excerpt: string;
    score: number;
}

export interface DocumentRecord {
    documentId: string;
    projectId: string;
    ownerSub: string;
    documentName: string;
    s3Key: string;
    fileSize: number;
    uploadedAt: string;
    processingStatus: ProcessingStatus;
    queuedAt?: string;
    textractJobId?: string;
    statusUpdatedAt?: string;
}

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
  onUpload: (files: Array<{ name: string; path: string; size: number }>) => void;
  onDelete: (documentId: string, documentName: string) => void;
  onRetry: (documentId: string) => void;
  onViewText: (documentId: string, documentName: string) => void;
}

export interface GraphPanelProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  loading: boolean;
  hasSyncedData: boolean;
  layout: string;
  minDocs: number;
  hiddenTypes: Set<string>;
  theme: Theme;
  onLayoutChange: (layout: string) => void;
  onMinDocsChange: (value: number) => void;
  onToggleHiddenType: (type: string) => void;
  onNodeClick: (entityName: string, entityType: string) => void;
  onExpand: () => void;
}

export interface SearchPanelProps {
  query: string;
  answer: string | null;
  citations: SearchCitation[];
  loading: boolean;
  error: string | null;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onViewDocument: (documentId: string, documentName: string) => void;
}

export interface ShareModalProps {
  isOpen: boolean;
  members: ProjectMember[];
  membersLoading: boolean;
  shareUsername: string;
  shareRole: MemberRole;
  sharing: boolean;
  error: string | null;
  suggestions: string[];
  callerRole: ProjectRole;
  onClose: () => void;
  onShare: () => void;
  onRemoveMember: (userSub: string) => void;
  onUpdateRole: (userSub: string, newRole: MemberRole) => void;
  onUsernameInput: (value: string) => void;
  onShareRoleChange: (role: MemberRole) => void;
  onSelectSuggestion: (username: string) => void;
}

export interface NodeDetailModalProps {
  isOpen: boolean;
  entityName: string;
  entityType: string;
  connections: Array<{ relType: string; otherName: string; otherType: string; direction: 'out' | 'in' }>;
  documents: Array<{ documentId: string; documentName: string }>;
  loading: boolean;
  error: string | null;
  theme: Theme;
  onClose: () => void;
  onViewDocument: (documentId: string, documentName: string) => void;
}

export interface DocumentTextModalProps {
  isOpen: boolean;
  documentName: string;
  text: string | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}
