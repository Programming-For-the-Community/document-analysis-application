import { useState, useEffect, useCallback } from 'react';

import { loadProjects } from '../../handlers/home/projects';
import { ProjectListItem } from '../../../interfaces/renderer/home';

export function useProjects() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { projects: data, error: err } = await loadProjects();
    if (err) { setError(err); setLoading(false); return; }
    setProjects(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return { projects, loading, error, reload };
}