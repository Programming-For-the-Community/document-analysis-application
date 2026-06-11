import { EntityType } from '../types/bedrock';

export interface Entity {
  id: string;
  type: EntityType;
  value: string;
}

export interface Relationship {
  source: string;
  target: string;
  type: string;
  attributes?: Record<string, string>;
}

export interface RelationshipGraph {
  documentId: string;
  projectId: string;
  entities: Entity[];
  relationships: Relationship[];
}

export interface BedrockJsonPayload {
  entities?: Entity[];
  relationships?: Relationship[];
}
