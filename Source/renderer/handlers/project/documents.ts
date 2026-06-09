import { PROJECT_ERRORS } from '../../../constants/renderer/project';
import { DocumentRecord } from '../../../interfaces/renderer/project';

export async function loadDocuments(
  projectId: string
): Promise<{ documents?: DocumentRecord[]; error: string | null }> {
  const result = await window.electron.documents.list(projectId);
  if (!result.success || !result.documents)
    return { error: result.error ?? PROJECT_ERRORS.DOC_LOAD_FAILURE };
  return { documents: result.documents, error: null };
}

export async function uploadFiles(
  projectId: string,
  files: Array<{ name: string; path: string; size: number }>
): Promise<{ error: string | null; partialErrors: string[] }> {
  const result = await window.electron.documents.upload(projectId, files);
  if (!result.success) return { error: result.error ?? PROJECT_ERRORS.DOC_UPLOAD_FAILURE, partialErrors: [] };

  const partialErrors: string[] = [];
  if (result.failed && result.failed.length > 0) {
    const byError = new Map<string, string[]>();
    for (const f of result.failed) {
      const group = byError.get(f.error) ?? [];
      group.push(f.name);
      byError.set(f.error, group);
    }
    for (const [error, names] of byError) {
      const nameList =
        names.length > 3
          ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
          : names.join(', ');
      partialErrors.push(`Could not upload ${nameList}: ${error}`);
    }
  }
  return { error: null, partialErrors };
}

export async function deleteDocument(
  projectId: string,
  documentId: string
): Promise<{ error: string | null }> {
  const result = await window.electron.documents.delete(projectId, documentId);
  return result.success ? { error: null } : { error: result.error ?? PROJECT_ERRORS.DOC_DELETE_FAILURE };
}

export async function retryGraph(
  projectId: string,
  documentId: string
): Promise<{ error: string | null }> {
  const result = await window.electron.documents.retryGraph(projectId, documentId);
  return result.success ? { error: null } : { error: result.error ?? PROJECT_ERRORS.GRAPH_RETRY_FAILURE };
}
