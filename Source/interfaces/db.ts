import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: process.env['NODE_ENV'] ?? path.join(__dirname, '../../.env') });

export interface DBConnectionsConfig {
  neo4jUri: string;
  qdrantUrl: string;
}
