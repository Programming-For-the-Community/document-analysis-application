// -------------------------------------------------------
// Constraints
// -------------------------------------------------------

CREATE CONSTRAINT user_id IF NOT EXISTS
  FOR (u:User) REQUIRE u.id IS UNIQUE;

CREATE CONSTRAINT user_email IF NOT EXISTS
  FOR (u:User) REQUIRE u.email IS UNIQUE;

CREATE CONSTRAINT project_id IF NOT EXISTS
  FOR (p:Project) REQUIRE p.id IS UNIQUE;

CREATE CONSTRAINT document_id IF NOT EXISTS
  FOR (d:Document) REQUIRE d.id IS UNIQUE;

// Entity IDs are document-scoped composites: "<documentId>:<localId>" (e.g. "abc123:e1")
CREATE CONSTRAINT entity_id IF NOT EXISTS
  FOR (e:Entity) REQUIRE e.id IS UNIQUE;

// -------------------------------------------------------
// Indexes
// -------------------------------------------------------

// Look up entities by display name (e.g. find all mentions of "John Smith")
CREATE INDEX entity_name IF NOT EXISTS
  FOR (e:Entity) ON (e.name);

// Filter entities by type
// Types: Person, Organization, Date, Amount, Location, Product, Role, Account
CREATE INDEX entity_type IF NOT EXISTS
  FOR (e:Entity) ON (e.type);

// Efficiently clean up all entities belonging to a document on re-load
CREATE INDEX entity_document IF NOT EXISTS
  FOR (e:Entity) ON (e.documentId);

// Filter documents by project
CREATE INDEX document_project IF NOT EXISTS
  FOR (d:Document) ON (d.projectId);

// -------------------------------------------------------
// Graph structure
//
// (:Document {id, projectId})
//   -[:MENTIONS]->
// (:Entity {id, name, type, documentId, projectId})
//
// Entity nodes carry two labels: the generic :Entity (satisfies the uniqueness
// constraint and enables cross-type queries) plus a specific type label
// (enables efficient type-scoped queries):
//   :Entity:Person, :Entity:Organization, :Entity:Date, :Entity:Amount,
//   :Entity:Location, :Entity:Product, :Entity:Role, :Entity:Account
//
// Entity-to-entity relationships use typed edges (not a generic RELATED_TO):
//   (:Entity)-[:EMPLOYED_BY]->(:Entity)
//   (:Entity)-[:MANAGES]->(:Entity)
//   (:Entity)-[:PAID_BY]->(:Entity)
//   (:Entity)-[:SHIPS_TO]->(:Entity)
//   (:Entity)-[:SHIPS_FROM]->(:Entity)
//   (:Entity)-[:ORDERED_FROM]->(:Entity)
//   (:Entity)-[:INVOICED_BY]->(:Entity)
//   (:Entity)-[:INVOICED_TO]->(:Entity)
//   (:Entity)-[:REFERENCES]->(:Entity)
//   (:Entity)-[:DATED]->(:Entity)
//   (:Entity)-[:LOCATED_AT]->(:Entity)
//   (:Entity)-[:HAS_ROLE]->(:Entity)
//
// All entity-to-entity edges carry:
//   documentId : string  — ID of the document where this relationship was found
//   (plus any model-extracted attributes, e.g. title, amount, date)
// -------------------------------------------------------
