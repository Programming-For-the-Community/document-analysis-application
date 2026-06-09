import { useState, useCallback } from 'react';
import { renameProject } from '../../handlers/home/projects';
import { HOME_ERRORS } from '../../../constants/renderer/home';

export function useRenameProject(reload: () => void) {
  const [isOpen, setIsOpen] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const submit = useCallback(
    async (newName: string) => {
      if (!projectId) return;
      if (!newName.trim()) {
        setError(HOME_ERRORS.PROJECT_NAME_MISSING);
        return;
      }
      setSubmitting(true);
      const { error: err } = await renameProject(projectId, newName.trim());
      setSubmitting(false);
      if (err) {
        setError(err);
        return;
      }
      close();
      reload();
    },
    [projectId, close, reload]
  );

  return { isOpen, projectName, submitting, error, open, close, submit };
}
