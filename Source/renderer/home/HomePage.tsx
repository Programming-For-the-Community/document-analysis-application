import { Topbar } from '../components/Topbar';
import { ProjectsGrid } from '../components/home/ProjectsGrid';
import { RenameProjectModal } from '../components/home/modals/RenameProjectModal';
import { DeleteProjectModal } from '../components/home/modals/DeleteProjectModal';
import { NewProjectModal } from '../components/home/modals/NewProjectModal';
import { useTheme } from '../hooks/useTheme';
import { useUser } from '../hooks/useUser';
import { useProjects } from '../hooks/home/useProjects';
import { useRenameProject } from '../hooks/home/useRenameProject';
import { useDeleteProject } from '../hooks/home/useDeleteProject';
import { useNewProject } from '../hooks/home/useNewProject';

export function HomePage() {
  const { theme, toggleTheme } = useTheme();
  const { username }           = useUser();
  const { projects, loading, error, reload } = useProjects();
  const rename = useRenameProject(reload);
  const del    = useDeleteProject(reload);
  const create = useNewProject();

  return (
    <>
      <div className="layout">
        <Topbar
          username={username}
          theme={theme}
          onToggleTheme={toggleTheme}
          onLogout={() => void window.electron.auth.logout()}
        />
        <main className="main-content">
          <div className="page-header">
            <h1>Your Projects</h1>
            <button className="btn-primary" onClick={create.open}>+ New Project</button>
          </div>
          <ProjectsGrid
            projects={projects}
            loading={loading}
            error={error}
            onRetry={reload}
            onRename={rename.open}
            onDelete={del.open}
          />
        </main>
      </div>

      <RenameProjectModal
        isOpen={rename.isOpen}
        projectName={rename.projectName}
        submitting={rename.submitting}
        error={rename.error}
        onClose={rename.close}
        onSubmit={rename.submit}
      />
      <DeleteProjectModal
        isOpen={del.isOpen}
        projectName={del.projectName}
        confirming={del.confirming}
        error={del.error}
        onClose={del.close}
        onConfirm={del.confirm}
      />
      <NewProjectModal
        isOpen={create.isOpen}
        submitting={create.submitting}
        error={create.error}
        onClose={create.close}
        onSubmit={create.submit}
      />
    </>
  );
}