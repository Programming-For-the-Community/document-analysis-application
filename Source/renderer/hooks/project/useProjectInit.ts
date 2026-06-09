import { useState, useEffect } from 'react';

import { ProjectRole } from '../../../types/app';
import { ProjectInfo } from '../../../interfaces/app';
import { PROJECT_ROLES } from '../../../constants/app';

export function useProjectInit(): ProjectInfo {
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get('id') ?? '';
  const projectName = params.get('name') ?? 'Project';

  const [role, setRole] = useState<ProjectRole>(PROJECT_ROLES.VIEW);
  const [minDocFilter, setMinDocFilter] = useState(2);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    document.title = `${projectName} — Document Analysis`;

    void Promise.all([
      window.electron.projects.getRole(projectId),
      window.electron.projects.getSettings(projectId),
    ]).then(([roleResult, settingsResult]) => {
      setRole((roleResult.role as ProjectRole | undefined) ?? PROJECT_ROLES.VIEW);
      if (settingsResult.success && settingsResult.minDocFilter !== undefined) {
        setMinDocFilter(settingsResult.minDocFilter);
      }
      setLoading(false);
    });
  }, [projectId, projectName]);

  return { projectId, projectName, role, minDocFilter, loading };
}
