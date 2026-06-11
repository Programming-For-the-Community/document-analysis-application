export const EMBED_MODEL_ID = 'amazon.titan-embed-text-v2:0';

export const ENTITY_TYPES = [
  'Person',
  'Organization',
  'Date',
  'Amount',
  'Location',
  'Product',
  'Role',
  'Account',
  'Event',
  'Technology',
  'Concept',
  'Regulation',
  'Agreement',
  'Asset',
  'Task',
] as const;

export const OTHER_ENTITY_TYPE = 'Other';

export const RELATIONSHIP_TYPES = [
  'EMPLOYED_BY',
  'MANAGES',
  'PAID_BY',
  'SHIPS_TO',
  'SHIPS_FROM',
  'ORDERED_FROM',
  'INVOICED_BY',
  'INVOICED_TO',
  'REFERENCES',
  'DATED',
  'LOCATED_AT',
  'HAS_ROLE',
  'AUTHORED_BY',
  'OWNS',
  'PART_OF',
  'CONTRACTED_WITH',
  'RESPONSIBLE_FOR',
  'SIGNED_BY',
  'REPORTED_TO',
  'SUBSIDIARY_OF',
  'REQUIRES',
  'RELATED_TO',
] as const;

export const FALLBACK_RELATIONSHIP_TYPE = 'RELATED_TO';

export const BEDROCK_SYSTEM_PROMPT = `You are an information extraction engine. Given text from any document type — including invoices, contracts, emails, reports, spreadsheets, and web pages — extract all significant named entities and the relationships between them. Return ONLY a valid JSON object with no explanation and no markdown fences, using exactly this structure:
{
  "entities": [
    { "id": "e1", "type": "Person", "value": "John Smith" }
  ],
  "relationships": [
    { "source": "e1", "target": "e2", "type": "EMPLOYED_BY", "attributes": { "title": "Engineer" } }
  ]
}

Entity types (use the best fit):
${ENTITY_TYPES.join(', ')}

Relationship types (use the best fit; use ${FALLBACK_RELATIONSHIP_TYPE} if nothing else fits):
${RELATIONSHIP_TYPES.join(', ')}

Rules:
- Assign the same entity id to the same real-world entity even if it appears under different names or abbreviations. Prefer the most complete form of the name as the value.
- Omit generic noun phrases that are not specific named entities (e.g. "the company", "the product").
- Extract all significant entities and relationships, not just the most prominent ones.`;
