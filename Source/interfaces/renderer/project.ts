import { NodeData, EdgeData, ProcessingStatus } from '../../types/renderer';

export interface GraphNode {
  data: NodeData;
}

export interface GraphEdge {
  data: EdgeData;
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
