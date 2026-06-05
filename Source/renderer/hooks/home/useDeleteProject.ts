import { useState, useCallback } from 'react';

import { deleteProject } from '../../handlers/home/projects';

export function useDeleteProject(reload: () => void) {
  const [isOpen, setIsOpen]           = useState(false);
  const [projectId, setProjectId]     = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [confirming, setConfirming]   = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const open = useCallback((id: string, name: string) => {
    setProjectId(id);
    setProjectName(name);
    setError(null);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setProjectId(null);
    setError(null);
  }, []);

  const confirm = useCallback(async () => {
    if (!projectId) return;
    setConfirming(true);
    const { error: err } = await deleteProject(projectId);
    setConfirming(false);
    if (err) { setError(err); return; }
    close();
    reload();
  }, [projectId, close, reload]);

  return { isOpen, projectName, confirming, error, open, close, confirm };
}