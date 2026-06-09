import { useEffect } from 'react';
import { Topbar } from '../components/Topbar';
import { DocumentsPanel } from '../components/project/DocumentsPanel';
import { GraphPanel } from '../components/project/GraphPanel';
import { GraphExpandModal } from '../components/project/GraphExpandModal';
import { SearchPanel } from '../components/project/SearchPanel';
import { NodeDetailModal } from '../components/project/modals/NodeDetailModal';
import { DocumentTextModal } from '../components/project/modals/DocumentTextModal';
import { ShareModal } from '../components/project/modals/ShareModal';
import { useTheme } from '../hooks/useTheme';
import { useUser } from '../hooks/useUser';
import { useProjectInit } from '../hooks/project/useProjectInit';
import { useDocuments } from '../hooks/project/useDocuments';
import { useGraph } from '../hooks/project/useGraph';
import { useSearch } from '../hooks/project/useSearch';
import { useNodeDetail } from '../hooks/project/useNodeDetail';
import { useDocumentText } from '../hooks/project/useDocumentText';
import { useShareProject } from '../hooks/project/useShareProject';
import { PROCESSING_STATUS } from '../../constants/renderer/project';
import { PROJECT_ROLES } from '../../constants/app';

export function ProjectPage() {
  const { theme, toggleTheme }                            = useTheme();
  const { username }                                      = useUser();
  const { projectId, projectName, role, minDocFilter }    = useProjectInit();
  const documents                                         = useDocuments(projectId);
  const graph                                             = useGraph(projectId, minDocFilter);
  const search                                            = useSearch(projectId);
  const nodeDetail                                        = useNodeDetail(projectId);
  const docText                                           = useDocumentText(projectId);
  const share                                             = useShareProject(projectId, role);

  // Reload graph when a document finishes processing
  useEffect(() => {
    window.electron.documents.onStatusUpdate((update) => {
      if (update.projectId === projectId && update.status === PROCESSING_STATUS.COMPLETE) {
        void graph.loadGraph();
      }
    });
  }, [projectId, graph.loadGraph]);

  // Dismiss all modals on Escape
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      docText.close();
      nodeDetail.close();
      graph.setIsExpanded(false);
      share.close();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [docText.close, nodeDetail.close, graph.setIsExpanded, share.close]);

  return (
    <>
      <div className="layout">
        <Topbar
          username={username}
          theme={theme}
          onToggleTheme={toggleTheme}
          onLogout={() => void window.electron.auth.logout()}
          projectName={projectName}
          onBack={() => void window.electron.nav.goHome()}
          onShare={role !== PROJECT_ROLES.VIEW ? share.open : undefined}
        />
        <main className="project-content">
          <div className="project-panels">
            <DocumentsPanel
              documents={documents.documents}
              loading={documents.loading}
              uploadStatus={documents.uploadStatus}
              uploadError={documents.uploadError}
              role={role}
              onUpload={documents.upload}
              onDelete={documents.remove}
              onRetry={documents.retry}
              onViewText={docText.open}
            />
            <GraphPanel
              nodes={graph.nodes}
              edges={graph.edges}
              loading={graph.loading}
              hasSyncedData={graph.hasSyncedData}
              layout={graph.layout}
              minDocs={graph.minDocs}
              hiddenTypes={graph.hiddenTypes}
              theme={theme}
              onLayoutChange={graph.setLayout}
              onMinDocsChange={graph.handleMinDocsChange}
              onToggleHiddenType={graph.toggleHiddenType}
              onNodeClick={nodeDetail.open}
              onExpand={() => graph.setIsExpanded(true)}
            />
            <SearchPanel
              query={search.query}
              answer={search.answer}
              citations={search.citations}
              loading={search.loading}
              error={search.error}
              onQueryChange={search.setQuery}
              onSearch={search.search}
              onViewDocument={docText.open}
            />
          </div>
        </main>
      </div>

      <GraphExpandModal
        isOpen={graph.isExpanded}
        nodes={graph.nodes}
        edges={graph.edges}
        layout={graph.layout}
        minDocs={graph.minDocs}
        hiddenTypes={graph.hiddenTypes}
        theme={theme}
        onClose={() => graph.setIsExpanded(false)}
        onLayoutChange={graph.setLayout}
        onMinDocsChange={graph.handleMinDocsChange}
        onToggleHiddenType={graph.toggleHiddenType}
        onNodeClick={nodeDetail.open}
      />
      <NodeDetailModal
        isOpen={nodeDetail.isOpen}
        entityName={nodeDetail.entityName}
        entityType={nodeDetail.entityType}
        connections={nodeDetail.connections}
        documents={nodeDetail.documents}
        loading={nodeDetail.loading}
        error={nodeDetail.error}
        theme={theme}
        onClose={nodeDetail.close}
        onViewDocument={docText.open}
      />
      <DocumentTextModal
        isOpen={docText.isOpen}
        documentName={docText.documentName}
        text={docText.text}
        loading={docText.loading}
        error={docText.error}
        onClose={docText.close}
      />
      <ShareModal
        isOpen={share.isOpen}
        members={share.members}
        membersLoading={share.membersLoading}
        shareUsername={share.shareUsername}
        shareRole={share.shareRole}
        sharing={share.sharing}
        error={share.error}
        suggestions={share.suggestions}
        callerRole={role}
        onClose={share.close}
        onShare={share.share}
        onRemoveMember={share.removeMember}
        onUpdateRole={share.updateRole}
        onUsernameInput={share.handleUsernameInput}
        onShareRoleChange={share.setShareRole}
        onSelectSuggestion={u => { share.handleUsernameInput(u || ''); share.setSuggestions([]); }}
      />
    </>
  );
}