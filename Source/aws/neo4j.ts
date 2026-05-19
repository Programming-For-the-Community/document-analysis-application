import neo4j, { Driver, Integer, ManagedTransaction } from 'neo4j-driver';

import { RelationshipGraph } from './bedrock';
import { Neo4JConfig } from '../interfaces/app';
import { Logger } from '../utils/logger';

const VALID_ENTITY_TYPES = new Set([
  'Person', 'Organization', 'Date', 'Amount', 'Location', 'Product', 'Role', 'Account',
]);

const VALID_REL_TYPES = new Set([
  'EMPLOYED_BY', 'MANAGES', 'PAID_BY', 'SHIPS_TO', 'SHIPS_FROM',
  'ORDERED_FROM', 'INVOICED_BY', 'INVOICED_TO', 'REFERENCES', 'DATED',
  'LOCATED_AT', 'HAS_ROLE',
]);

export class Neo4J {
  private static driver: Driver;

  public static init(config: Neo4JConfig): void {
    this.driver = neo4j.driver(config.uri, neo4j.auth.basic(config.user, config.password));
    Logger.debug(`Neo4j driver initialized (uri: ${config.uri})`);
  }

  public static async close(): Promise<void> {
    await this.driver?.close();
  }

  public static async getProjectGraph(projectId: string, minDocCount: number): Promise<{
    nodes: Array<{ data: { id: string; label: string; type: string; docCount: number } }>;
    edges: Array<{ data: { id: string; source: string; target: string; label: string } }>;
  }> {
    const session = this.driver.session();
    try {
      // Deduplicate entities by name+type; filter to those appearing in >= minDocCount documents
      const nodeResult = await session.run(
        `MATCH (e:Entity {projectId: $projectId})
         WITH e.name AS name, e.type AS type, count(DISTINCT e.documentId) AS docCount
         WHERE docCount >= $minDocCount
         RETURN name + ':' + type AS id, name AS label, type, docCount`,
        { projectId, minDocCount }
      );

      const nodeIds = new Set(nodeResult.records.map((r) => r.get('id') as string));

      const nodes = nodeResult.records.map((r) => ({
        data: {
          id:       r.get('id')    as string,
          label:    r.get('label') as string,
          type:     r.get('type')  as string,
          docCount: (r.get('docCount') as Integer).toNumber(),
        },
      }));

      // Get edges between deduplicated nodes; skip edges where either endpoint was filtered out
      const edgeResult = await session.run(
        `MATCH (a:Entity {projectId: $projectId})-[r]->(b:Entity {projectId: $projectId})
         RETURN a.name + ':' + a.type AS source, b.name + ':' + b.type AS target, type(r) AS label`,
        { projectId }
      );

      const seen = new Set<string>();
      const edges: Array<{ data: { id: string; source: string; target: string; label: string } }> = [];
      for (const r of edgeResult.records) {
        const source = r.get('source') as string;
        const target = r.get('target') as string;
        const label  = r.get('label')  as string;
        if (!nodeIds.has(source) || !nodeIds.has(target)) continue;
        const key = `${source}→${label}→${target}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({ data: { id: key, source, target, label } });
        }
      }

      Logger.debug(
        `Neo4j graph for project ${projectId} (minDocCount=${minDocCount}): ` +
        `${nodes.length} node(s), ${edges.length} edge(s)`
      );
      return { nodes, edges };
    } finally {
      await session.close();
    }
  }

  public static async deleteDocument(documentId: string): Promise<void> {
    const session = this.driver.session();
    try {
      await session.executeWrite(async (tx: ManagedTransaction) => {
        await tx.run(`MATCH (n:Entity {documentId: $documentId}) DETACH DELETE n`, { documentId });
        await tx.run(`MATCH (d:Document {id: $documentId}) DETACH DELETE d`, { documentId });
      });
      Logger.info(`Neo4j: deleted document ${documentId} and its entities`);
    } finally {
      await session.close();
    }
  }

  public static async deleteProject(projectId: string): Promise<void> {
    const session = this.driver.session();
    try {
      await session.executeWrite(async (tx: ManagedTransaction) => {
        await tx.run(`MATCH (n:Entity {projectId: $projectId}) DETACH DELETE n`, { projectId });
        await tx.run(`MATCH (d:Document {projectId: $projectId}) DETACH DELETE d`, { projectId });
      });
      Logger.info(`Neo4j: deleted all nodes for project ${projectId}`);
    } finally {
      await session.close();
    }
  }

  public static async getNodeDetail(
    projectId: string,
    entityName: string,
    entityType: string
  ): Promise<{
    connections: Array<{ relType: string; otherName: string; otherType: string; direction: 'out' | 'in' }>;
    documentIds: string[];
  }> {
    const session = this.driver.session();
    try {
      const connResult = await session.run(
        `MATCH (e:Entity {projectId: $projectId, name: $entityName, type: $entityType})-[r]->(other:Entity {projectId: $projectId})
         RETURN other.name AS otherName, other.type AS otherType, type(r) AS relType, 'out' AS direction
         UNION
         MATCH (other:Entity {projectId: $projectId})-[r]->(e:Entity {projectId: $projectId, name: $entityName, type: $entityType})
         RETURN other.name AS otherName, other.type AS otherType, type(r) AS relType, 'in' AS direction`,
        { projectId, entityName, entityType }
      );

      const connections = connResult.records.map((r) => ({
        otherName:  r.get('otherName')  as string,
        otherType:  r.get('otherType')  as string,
        relType:    r.get('relType')    as string,
        direction:  r.get('direction')  as 'out' | 'in',
      }));

      const docResult = await session.run(
        `MATCH (d:Document {projectId: $projectId})-[:MENTIONS]->(e:Entity {projectId: $projectId, name: $entityName, type: $entityType})
         RETURN DISTINCT d.id AS documentId`,
        { projectId, entityName, entityType }
      );

      const documentIds = docResult.records.map((r) => r.get('documentId') as string);

      Logger.debug(`Neo4j getNodeDetail: ${connections.length} connection(s), ${documentIds.length} document(s) for "${entityName}" (${entityType})`);
      return { connections, documentIds };
    } finally {
      await session.close();
    }
  }

  // Returns the subset of documentIds that have no Document node in Neo4j.
  public static async findMissingDocuments(documentIds: string[]): Promise<string[]> {
    if (documentIds.length === 0) return [];
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (d:Document) WHERE d.id IN $ids RETURN d.id AS id`,
        { ids: documentIds }
      );
      const found = new Set(result.records.map((r) => r.get('id') as string));
      return documentIds.filter((id) => !found.has(id));
    } finally {
      await session.close();
    }
  }

  // Replaces the stored graph for a document atomically.
  // Delete-then-insert (not MERGE) ensures stale entities from re-runs are removed.
  public static async loadGraph(graph: RelationshipGraph): Promise<void> {
    const session = this.driver.session();
    try {
      await session.executeWrite(async (tx: ManagedTransaction) => {
        // Remove all existing entity nodes for this document (index on documentId makes this fast)
        await tx.run(
          `MATCH (n:Entity {documentId: $documentId}) DETACH DELETE n`,
          { documentId: graph.documentId }
        );
        // Remove the document node itself
        await tx.run(
          `MATCH (d:Document {id: $documentId}) DETACH DELETE d`,
          { documentId: graph.documentId }
        );

        // Create the document node
        await tx.run(
          `CREATE (:Document {id: $documentId, projectId: $projectId})`,
          { documentId: graph.documentId, projectId: graph.projectId }
        );

        // Group entities by type for batched inserts (one UNWIND per label)
        const byEntityType = new Map<string, { id: string; name: string }[]>();
        for (const entity of graph.entities) {
          const label = VALID_ENTITY_TYPES.has(entity.type) ? entity.type : 'Other';
          const group = byEntityType.get(label) ?? [];
          group.push({
            id: `${graph.documentId}:${entity.id}`,
            name: entity.value,
          });
          byEntityType.set(label, group);
        }

        for (const [label, nodes] of byEntityType) {
          // :Entity co-label satisfies the uniqueness constraint and enables cross-type queries.
          // Specific type label (e.g. :Person) enables type-scoped pattern matching.
          // MENTIONS edge links the document to each entity for "what's in this doc" queries.
          await tx.run(
            `UNWIND $nodes AS e
             CREATE (n:Entity:\`${label}\` {
               id:         e.id,
               name:       e.name,
               type:       $type,
               documentId: $documentId,
               projectId:  $projectId
             })
             WITH n
             MATCH (d:Document {id: $documentId})
             CREATE (d)-[:MENTIONS]->(n)`,
            {
              nodes,
              type: label,
              documentId: graph.documentId,
              projectId: graph.projectId,
            }
          );
        }

        // Group relationships by type for batched inserts (one UNWIND per relationship type)
        const byRelType = new Map<
          string,
          { srcId: string; tgtId: string; attributes: Record<string, string> }[]
        >();
        for (const rel of graph.relationships) {
          const type = VALID_REL_TYPES.has(rel.type) ? rel.type : 'REFERENCES';
          const group = byRelType.get(type) ?? [];
          group.push({
            srcId: `${graph.documentId}:${rel.source}`,
            tgtId: `${graph.documentId}:${rel.target}`,
            attributes: rel.attributes ?? {},
          });
          byRelType.set(type, group);
        }

        for (const [relType, rels] of byRelType) {
          await tx.run(
            `UNWIND $rels AS r
             MATCH (a:Entity {id: r.srcId}), (b:Entity {id: r.tgtId})
             CREATE (a)-[rel:\`${relType}\` {documentId: $documentId}]->(b)
             SET rel += r.attributes`,
            { rels, documentId: graph.documentId }
          );
        }
      });

      Logger.info(
        `Neo4j: loaded graph for document ${graph.documentId} — ` +
        `${graph.entities.length} node(s), ${graph.relationships.length} edge(s)`
      );
    } finally {
      await session.close();
    }
  }
}
