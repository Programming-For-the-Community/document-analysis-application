import { useState, useCallback } from 'react';
import { createProject } from '../../handlers/home/projects';
import { HOME_ERRORS } from '../../../constants/renderer/home';

export function useNewProject() {
  const [isOpen, setIsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(() => {
    setError(null);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => {
    setIsOpen(false);
    setError(null);
  }, []);

  const submit = useCallback(
    async (name: string) => {
      if (!name.trim()) {
        setError(HOME_ERRORS.PROJECT_NAME_MISSING);
        return;
      }
      setSubmitting(true);
      const { project, error: err } = await createProject(name.trim());
      setSubmitting(false);
      if (err || !project) {
        setError(err ?? HOME_ERRORS.PROJECT_CREATION_FAILURE);
        return;
      }
      close();
      void window.electron.nav.openProject({ id: project.id, name: project.name });
    },
    [close]
  );

  return { isOpen, submitting, error, open, close, submit };
}
