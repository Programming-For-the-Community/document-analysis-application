export interface AWSConfig {
  region: string
  roleArn: string
  secretName: string
}

export interface RoleCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string | undefined
}