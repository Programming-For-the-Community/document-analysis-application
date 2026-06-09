import { useState, useCallback } from 'react';
import { searchDocuments } from '../../handlers/project/search';

export function useSearch(projectId: string) {
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [citations, setCitations] = useState<SearchCitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async () => {
    if (!query.trim() || !projectId) return;
    setLoading(true);
    setError(null);
    const result = await searchDocuments(projectId, query.trim());
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setAnswer(result.answer ?? null);
    setCitations(result.citations ?? []);
  }, [query, projectId]);

  return { query, setQuery, answer, citations, loading, error, search };
}
