import { ENTITY_TYPES, RELATIONSHIP_TYPES } from '../constants/bedrock';

export type EntityType = (typeof ENTITY_TYPES)[number];

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];
