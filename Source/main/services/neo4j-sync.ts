import { AWS_DYNAMODB } from '../../classes/aws/dynamodb';
import { AWS_S3 } from '../../classes/aws/s3';
import { Neo4J } from '../../classes/neo4j';
import { RelationshipGraph } from '../../interfaces/bedrock';
import { AppConfig } from '../../interfaces/config';
import { Logger } from '../../utils/logger';

export async function syncNeo4jForUser(userSub: string, config: AppConfig): Promise<void> {
  Logger.info(`Neo4j sync: starting full sync for user ${userSub}`);

  try {
    const projects = await AWS_DYNAMODB.listProjectsForUser(userSub, config.dynamoDB);
    Logger.info(`Neo4j sync: ${projects.length} project(s) found`);

    for (const project of projects) {
      try {
        const documents = await AWS_DYNAMODB.listDocuments(project.id, config.dynamoDB);
        const complete = documents.filter((d) => d.processingStatus === 'COMPLETE');
        if (complete.length === 0) continue;

        const missing = await Neo4J.findMissingDocuments(complete.map((d) => d.documentId));
        if (missing.length === 0) {
          Logger.debug(
            `Neo4j sync: project "${project.name}" — all ${complete.length} document(s) already in graph`
          );
          continue;
        }

        Logger.info(
          `Neo4j sync: project "${project.name}" — loading ${missing.length}/${complete.length} missing document(s)`
        );
        const missingSet = new Set(missing);

        await Promise.all(
          complete
            .filter((d) => missingSet.has(d.documentId))
            .map(async (doc) => {
              const analysisKey = `${doc.ownerSub}/${doc.projectId}/analysis/${doc.documentId}.json`;
              try {
                const text = await AWS_S3.getObjectText(analysisKey, config.s3);
                const graph = JSON.parse(text) as RelationshipGraph;
                await Neo4J.loadGraph(graph);
                Logger.debug(`Neo4j sync: loaded "${doc.documentName}" (${doc.documentId})`);
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                Logger.error(
                  `Neo4j sync: failed to load "${doc.documentName}" (${doc.documentId}): ${message}`
                );
              }
            })
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        Logger.error(
          `Neo4j sync: error processing project "${project.name}" (${project.id}): ${message}`
        );
      }
    }

    Logger.info(`Neo4j sync: full sync complete for user ${userSub}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Logger.error(`Neo4j sync: failed: ${message}`);
  }
}
