# <img src="Source/assets/icon.svg" width="32" alt="Document Analysis app icon"/> Document Analysis Application

Local application for extracting relationships between entities (people, money, property, objects) across batches of documents. Uses an Electron front-end, AWS for document processing and cloud state, and local Docker containers for graph and vector storage.

---
## Installation Requirements
Below are the pre-requisites and instructions for installing and running this application

### Pre-requisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (must be installed and running)
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html) configured with a valid IAM user (`aws configure`)

Your local IAM user needs two permissions:

| Permission | Purpose |
|---|---|
| `secretsmanager:GetSecretValue` on `doc-analysis-secret` | Read app config and role ARN at startup and when running `deploy.sh` |
| `sts:AssumeRole` on `doc-analysis-svc-role` | Assume the service role for all AWS resource operations |

### Infrastructure (Terraform)

AWS resources for this project are managed via Terraform in the [Terraform/](Terraform/) folder. Deployment is triggered manually via a GitHub Actions workflow if you have the required permissions. Instructions to deploy the infrastructure from your local device are below.

#### GitHub Actions workflow

1. Go to your repository on GitHub
2. Navigate to **Actions** → **AWS Setup**
3. Click **Run workflow** and select the branch

The workflow uses OIDC to authenticate with AWS — no AWS credentials need to be stored in GitHub. The required repository secrets and variables are:

| Type | Name | Description |
|---|---|---|
| Secret | `AWS_ACCOUNT_ID` | Your 12-digit AWS account ID |
| Secret | `AWS_DEPLOY_SVC_ACCT_ARN` | ARN of the GitHub Actions IAM role |
| Secret | `AWS_USER_ARN` | ARN of the IAM user allowed to assume the service role |
| Variable | `AWS_RESOURCE_REGION` | AWS region (e.g. `us-east-2`) |
| Variable | `PROJECT` | Human-readable project name |
| Variable | `TF_PROJECT_NAME` | Slug used for resource naming (e.g. `doc-analysis-app`) |
| Variable | `OWNER` | Owner name tagged on resources |
| Variable | `SECRETS_MANAGER_PATH` | Secrets Manager secret name (e.g. `doc-analysis-secret`) |

#### Running Terraform locally

Install [Terraform](https://developer.hashicorp.com/terraform/install) locally and pass all variables explicitly:

```bash
cd Terraform
terraform init
terraform apply \
  -var="account_id=YOUR_ACCOUNT_ID" \
  -var="region=us-east-2" \
  -var="project=Document Analysis Application" \
  -var="tf_project_name=doc-analysis-app" \
  -var="owner=YOUR_NAME" \
  -var="user_arn=arn:aws:iam::YOUR_ACCOUNT_ID:user/YOUR_USERNAME" \
  -var="github_org=YOUR_GITHUB_ORG" \
  -var="github_repo=YOUR_REPO_NAME" \
  -var="secrets_manager_path=doc-analysis-secret"
```

Terraform will populate `SVC_ROLE_ARN` and all other AWS resource identifiers directly into the secret on apply — no manual note-taking required.

---

## Design

The app ships with two themes selectable at runtime with the dark theme set to be the default.

**Slate Pro (dark)**

![Slate Pro dark theme](docs/screenshots/project-dark.svg)

**Parchment (light)**

![Parchment light theme](docs/screenshots/project-light.svg)

---

## Architecture
Below is the architecture diagram for the application, specifying which components are run locally and which portions are running and/or managed by AWS

![Architecture diagram](docs/diagrams/architecture.svg)

---

## High-Level Workflow
The diagram below outlines the workflow of the application and how the user interacts with it.

![High-level workflow diagram](docs/diagrams/workflow.svg)

### How it works

1. **Startup** — A splash window opens immediately. The app reads `doc-analysis-secret` from Secrets Manager using the local AWS CLI credentials, then assumes `doc-analysis-svc-role` via STS for all subsequent AWS calls. In parallel, the Docker engine is started automatically (if not already running) and the Neo4j and Qdrant containers are brought up. The splash window shows live status throughout. Once all services are healthy the login screen appears. On exit, the app stops its containers and — if it started the Docker engine and no other containers are running — stops the engine too.
2. **Auth** — The user logs in via Cognito. A 30-second background poll starts, syncing project and document state across devices.
3. **Upload** — Documents are uploaded to S3. Textract-compatible files (PDF, images) start an async Textract job with an SNS notification channel. Office files (DOCX, XLSX, HTML) are extracted locally via mammoth/ExcelJS. Plain-text files are read directly from S3.
4. **Processing** — Extracted text is passed to Bedrock (Claude) for entity and relationship extraction. Results are written to S3 (analysis JSON), DynamoDB (status), Neo4j (graph), and Qdrant (vector embeddings).
5. **Search** — Questions are answered by vector-searching Qdrant for relevant chunks and synthesising an answer via Bedrock, with source citations.
6. **Sync** — Every 30 seconds the app polls DynamoDB for new, deleted, or status-changed documents and reconciles local Neo4j and Qdrant accordingly, enabling multi-device and future multi-user project sharing.

> **Note:** Tearing down the AWS infrastructure will result in a complete loss of data and users even if graph and vector data is still stored locally as the multi-device sync capabilities only sync from AWS -> Device, NOT Device -> AWS

---

## Running the Application

The intended way to launch the app is via the Windows installer (`.exe`). Double-clicking the desktop shortcut starts everything automatically — Docker engine, Neo4j, Qdrant, and the app itself. No terminal required.

See [Building the Installer](#building-the-installer) below for how to produce the `.exe`.

### App Configuration (.env)

The application reads two values from `Source/.env` at startup. Everything else comes from Secrets Manager.

```env
AWS_REGION=us-east-2
AWS_SECRET_NAME=doc-analysis-secret

# Local services — device-specific
NEO4J_URI=bolt://localhost:7687
QDRANT_URL=http://localhost:6333
```

### Local Services (Docker Compose)

Neo4j and Qdrant run locally via Docker Compose. When running the installed app, container lifecycle is managed automatically — you do not need to run any of the commands below.

The `deploy.sh` script is provided for **local development** (i.e. running the app via `npm run dev` without the installer). It pulls credentials from Secrets Manager and starts the containers manually.

#### Local Services - Ports

| Service | Port | Purpose |
|---|---|---|
| Neo4j | `7474` (HTTP), `7687` (Bolt) | Graph database — entities and relationships |
| Qdrant | `6333` (HTTP), `6334` (gRPC) | Vector database — document embeddings |

### First-time setup

1. **Create the secret in AWS Secrets Manager** with the Neo4j and Qdrant credentials. Terraform will add all remaining keys (including `SVC_ROLE_ARN`) on first apply. In addition to the AWS CLI commands below, you can add these values directly from the AWS console of your user has access.

   ```bash
   aws secretsmanager create-secret \
     --name "doc-analysis-secret" \
     --secret-string '{"SVC_USER":"your-username","SVC_PWD":"your-password","QDRANT_KEY":"your-qdrant-api-key"}'
   ```

   If the secret already exists, update it:

   ```bash
   aws secretsmanager put-secret-value \
     --secret-id "doc-analysis-secret" \
     --secret-string '{"SVC_USER":"your-username","SVC_PWD":"your-password","QDRANT_KEY":"your-qdrant-api-key"}'
   ```

2. **Run Terraform** (via GitHub Actions or locally) to provision all AWS resources. Terraform will merge `SVC_ROLE_ARN` and all other resource identifiers into the secret automatically.

3. **Ensure your local IAM user** has `secretsmanager:GetSecretValue` on `doc-analysis-secret` and `sts:AssumeRole` on `doc-analysis-svc-role`.

### Starting the services

```bash
chmod +x deploy.sh   # first time only
./deploy.sh
```

The script will:
1. Read `SVC_PWD` and `QDRANT_KEY` from the `doc-analysis-secret` secret using your local AWS credentials
2. Write a temporary `.env` file
3. Start all containers via `docker compose up -d`
4. Delete the `.env` file immediately after

### Stopping the services

```bash
docker compose down
```

### Data storage

The script uses the primary path if it exists, otherwise falls back to the Docker volume location:

| | Path |
|---|---|
| Primary | `D:/Projects/.data/doc-analysis` |
| Fallback | `C:/ProgramData/docker/volumes/doc-analysis` |

> **Note:** Neo4j credentials are only applied on first initialisation. If you rotate the secret in AWS, run `docker compose down -v` to wipe the volumes before restarting so the new credentials take effect.

> **Note:** If you wipe the volumes to reset the database credentials or Qdrant API key, everything stored locally will be lost and will need to be re-synced  upon next startup of the application

---

## Building the Installer

Produces a Windows NSIS installer at `Source/dist-electron/Document Analysis Setup <version>.exe`.

### Prerequisites

- [Node.js and npm](https://nodejs.org/) installed
- **Windows Developer Mode enabled** — required so the build toolchain can create symbolic links during packaging. Enable it at Settings → System → For developers → Developer Mode.
- All [infrastructure](#infrastructure-terraform) provisioned and secrets populated in AWS Secrets Manager

### Steps

```bash
cd Source
npm install
npm run dist:win
```

Once the build completes, run the installer:

```
Source/dist-electron/Document Analysis Setup <version>.exe
```

The installer will:
- Install the app to `%LocalAppData%\Programs\Document Analysis`
- Create a desktop shortcut pointing to that fixed install path

> **Updating to a new version:** run the new installer over the existing installation. It updates the files in place at the same path, so the existing desktop shortcut continues to work without any manual changes.

> **Note:** The installer does not bundle Docker Desktop or the AWS CLI — these must already be installed on the target machine.
