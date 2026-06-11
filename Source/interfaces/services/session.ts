import { CognitoCredentials } from '../aws';
import { DynamoDBConfig, CognitoConfig } from '../config';

export interface HeartbeatOptions {
  userSub: string;
  dbConfig: DynamoDBConfig;
  cognitoConfig: CognitoConfig;
  getRefreshToken: () => string | null;
  setTokens: (tokens: CognitoCredentials) => void;
  onInvalidated: () => void;
}
