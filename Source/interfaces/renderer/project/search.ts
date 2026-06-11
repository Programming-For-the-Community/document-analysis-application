export interface SearchCitation {
    documentId: string;
    documentName: string;
    excerpt: string;
    score: number;
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
