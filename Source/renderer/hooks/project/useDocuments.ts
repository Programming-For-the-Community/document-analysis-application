import { useState, useEffect, useCallback } from 'react';
import {
  loadDocuments,
  uploadFiles,
  deleteDocument,
  retryGraph,
} from '../../handlers/project/documents';
import { DocumentRecord, UploadFileInfo } from '../../../interfaces/document';

function withStatus(
  docs: DocumentRecord[],
  documentId: string,
  status: DocumentRecord['processingStatus']
): DocumentRecord[] {
  return docs.map((doc) =>
    doc.documentId === documentId ? { ...doc, processingStatus: status } : doc
  );
}

function withoutDocument(docs: DocumentRecord[], documentId: string): DocumentRecord[] {
  return docs.filter((d) => d.documentId !== documentId);
}

export function useDocuments(projectId: string) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const { documents: docs } = await loadDocuments(projectId);
    setDocuments(docs ?? []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!projectId) return;

    const unsubscribers = [
      window.electron.documents.onStatusUpdate((update) => {
        if (update.projectId !== projectId) return;
        setDocuments((prev) => withStatus(prev, update.documentId, update.status));
      }),

      // Full reload rather than appending `doc` directly — it comes from the
      // project-poller's periodic snapshot and may race with an in-flight
      // upload's own reload, so re-fetching avoids duplicates/stale ordering.
      window.electron.documents.onDocumentAdded((doc) => {
        if (doc.projectId !== projectId) return;
        void reload();
      }),

      window.electron.documents.onDocumentRemoved((data) => {
        if (data.projectId !== projectId) return;
        setDocuments((prev) => withoutDocument(prev, data.documentId));
      }),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [projectId, reload]);

  const upload = useCallback(
    async (files: UploadFileInfo[]) => {
      if (!files.length) return;
      setUploadStatus(`Uploading ${files.length} file${files.length !== 1 ? 's' : ''}…`);
      setUploadError(null);
      const { error, partialErrors } = await uploadFiles(projectId, files);
      setUploadStatus(null);
      if (error) {
        setUploadError(error);
      } else if (partialErrors.length > 0) {
        setUploadError(partialErrors.join('\n'));
      }
      void reload();
    },
    [projectId, reload]
  );

  const remove = useCallback(
    async (documentId: string): Promise<boolean> => {
      const { error } = await deleteDocument(projectId, documentId);
      if (error) {
        setUploadError(error);
        return false;
      }
      setDocuments((prev) => withoutDocument(prev, documentId));
      return true;
    },
    [projectId]
  );

  const retry = useCallback(
    async (documentId: string): Promise<boolean> => {
      const { error } = await retryGraph(projectId, documentId);
      if (error) {
        setUploadError(error);
        return false;
      }
      return true;
    },
    [projectId]
  );

  const clearUploadError = useCallback(() => setUploadError(null), []);

  return {
    documents,
    loading,
    uploadStatus,
    uploadError,
    reload,
    upload,
    remove,
    retry,
    clearUploadError,
  };
}
