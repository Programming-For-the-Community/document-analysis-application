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

CREATE CONSTRAINT entity_id IF NOT EXISTS
  FOR (e:Entity) REQUIRE e.id IS UNIQUE;

// -------------------------------------------------------
// Indexes
// -------------------------------------------------------

// Look up entities by name (e.g. find all mentions of "John Smith")
CREATE INDEX entity_name IF NOT EXISTS
  FOR (e:Entity) ON (e.name);

// Filter entities by type (PERSON, MONEY, PROPERTY, OBJECT, ORG, LOCATION)
CREATE INDEX entity_type IF NOT EXISTS
  FOR (e:Entity) ON (e.type);

// Filter documents by processing status (pending, processing, complete, failed)
CREATE INDEX document_status IF NOT EXISTS
  FOR (d:Document) ON (d.status);

// -------------------------------------------------------
// Relationship property notes (for reference)
//
// (:Document)-[:MENTIONS]->(e:Entity)
//   confidence  : float   — extraction confidence score (0.0–1.0)
//   page        : int     — page number in the source document
//
// (:Entity)-[:RELATED_TO]->(:Entity)
//   type        : string  — relationship label (e.g. OWNS, TRANSFERRED_TO,
//                           LOCATED_AT, EMPLOYED_BY, PAID_TO)
//   confidence  : float   — extraction confidence score (0.0–1.0)
//   document_id : string  — ID of the document where this relationship was found
//   page        : int     — page number where the relationship was found
//   excerpt     : string  — raw text snippet that described the relationship
// -------------------------------------------------------
