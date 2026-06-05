import { ProjectCard } from './ProjectCard';
import { ProjectsGridProps } from '../../../interfaces/renderer/home';

export function ProjectsGrid({ projects, loading, error, onRetry, onRename, onDelete }: ProjectsGridProps) {
  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner"></div>
        <p>Loading projects…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="20" stroke="#9ca3af" strokeWidth="2" />
          <path d="M24 14v12M24 32v2" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <p>{error}</p>
        <button className="btn-primary" onClick={onRetry}>Retry</button>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="empty-state">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect x="8" y="6" width="26" height="34" rx="3" stroke="#9ca3af" strokeWidth="2" />
          <path d="M14 16h14M14 22h10M14 28h14" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" />
          <circle cx="36" cy="36" r="8" fill="var(--primary)" />
          <path d="M33 36h6M36 33v6" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <p>No projects yet.</p>
        <p className="empty-sub">Create a project to start uploading and analysing documents.</p>
      </div>
    );
  }

  return (
    <div className="projects-grid">
      {projects.map(p => (
        <ProjectCard key={p.id} project={p} onRename={onRename} onDelete={onDelete} />
      ))}
    </div>
  );
}