import { useState, useCallback } from 'react';
import { fetchNodeDetail } from '../../handlers/project/graph';
import { EntityConnection } from '../../../interfaces/graph';

export function useNodeDetail(projectId: string) {
  const [isOpen, setIsOpen] = useState(false);
  const [entityName, setEntityName] = useState('');
  const [entityType, setEntityType] = useState('');
  const [connections, setConnections] = useState<EntityConnection[]>([]);
  const [documents, setDocuments] = useState<Array<{ documentId: string; documentName: string }>>(
    []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(
    async (name: string, type: string) => {
      setEntityName(name);
      setEntityType(type);
      setConnections([]);
      setDocuments([]);
      setError(null);
      setLoading(true);
      setIsOpen(true);
      const result = await fetchNodeDetail(projectId, name, type);
      setLoading(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      setConnections(result.connections ?? []);
      setDocuments(result.documents ?? []);
    },
    [projectId]
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setError(null);
  }, []);

  return { isOpen, entityName, entityType, connections, documents, loading, error, open, close };
}
