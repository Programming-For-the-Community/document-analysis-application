import { PROJECT_ERRORS } from '../../../constants/renderer/project';
import { SearchCitation } from '../../../interfaces/renderer/project';

export async function searchDocuments(
  projectId: string,
  query: string
): Promise<{ answer?: string; citations?: SearchCitation[]; error: string | null }> {
  try {
    const result = await window.electron.search.query(projectId, query);
    if (!result.success || !result.answer) return { error: result.error ?? PROJECT_ERRORS.SEARCH_FAILURE };
    return { answer: result.answer, citations: result.citations ?? [], error: null };
  } catch {
    return { error: PROJECT_ERRORS.UNEXPECTED_ERROR };
  }
}
