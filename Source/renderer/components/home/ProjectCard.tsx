import { PROJECT_ROLES } from '../../../constants/app';
import { ProjectCardProps } from '../../../interfaces/renderer/home';

export function ProjectCard({ project, onRename, onDelete }: ProjectCardProps) {
  const isOwner  = project.role === PROJECT_ROLES.OWNER;
  const docCount = project.documentCount === 1 ? '1 document' : `${project.documentCount} documents`;

  return (
    <div className="project-card" onClick={() => void window.electron.nav.openProject({ id: project.id, name: project.name })}>
      <div className="project-card-header">
        <div className="project-card-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="2" width="13" height="17" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M7 8h7M7 11h5M7 14h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <rect x="11" y="13" width="9" height="9" rx="2" fill="var(--bg)" stroke="currentColor" strokeWidth="1.5" />
            <path d="M14 17h3M15.5 15.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        {isOwner ? (
          <>
            <button className="btn-card-action" title={`Rename ${project.name}`} aria-label={`Rename ${project.name}`}
              onClick={e => { e.stopPropagation(); onRename(project.id, project.name); }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9.5 1.5a1.414 1.414 0 012 2L4 11H2v-2L9.5 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button className="btn-card-action btn-card-delete" title={`Delete ${project.name}`} aria-label={`Delete ${project.name}`}
              onClick={e => { e.stopPropagation(); onDelete(project.id, project.name); }}>
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path d="M5 1h5M1 3h13M6 6v5M9 6v5M2 3l1 10a1 1 0 001 1h7a1 1 0 001-1l1-10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        ) : (
          <span className={`project-role-badge project-role-${project.role.toLowerCase()}`}>
            {project.role === PROJECT_ROLES.EDIT ? 'Can edit' : 'View only'}
          </span>
        )}
      </div>
      <div className="project-card-body">
        <h3 className="project-card-name">{project.name}</h3>
        <p className="project-card-meta">{docCount} · Last modified {project.lastModified}</p>
      </div>
    </div>
  );
}