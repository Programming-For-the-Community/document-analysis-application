import { useState, useCallback } from 'react';

import { PROJECT_ERRORS } from '../../../constants/renderer/project/errors';

export function useDocumentText(projectId: string) {
  const [isOpen, setIsOpen] = useState(false);
  const [documentName, setDocumentName] = useState('');
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(
    async (documentId: string, name: string) => {
      setDocumentName(name);
      setText(null);
      setError(null);
      setLoading(true);
      setIsOpen(true);
      const result = await window.electron.documents.getText(projectId, documentId);
      setLoading(false);
      if (!result.success || !result.text) {
        setError(result.error ?? PROJECT_ERRORS.FULL_TEXT_UNAVIALABLE);
        return;
      }
      setText(result.text);
    },
    [projectId]
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setError(null);
  }, []);

  return { isOpen, documentName, text, loading, error, open, close };
}
