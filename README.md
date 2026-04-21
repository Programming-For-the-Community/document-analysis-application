# Document Analysis Application

Local application for extracting relationships between entities in batches of documents. Uses an Electron front-end, AWS Bedrock and Textract for document analysis, and local Docker containers for Neo4j, Qdrant, and RabbitMQ.

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html) configured with a valid IAM user (`aws configure`)
- [jq](https://jqlang.github.io/jq/download/)

---

## Infrastructure (Terraform)

AWS resources for this project are managed via Terraform in the [Terraform/](Terraform/) folder. Deployment is triggered manually via a GitHub Actions workflow — no local Terraform installation is required.

### First-time setup

1. **Create a `terraform.tfvars` file** inside the `Terraform/` folder — this file is gitignored and never committed:

   ```hcl
   iam_username = "your-iam-username"
   ```

2. **Add your AWS credentials as GitHub repository secrets:**

   Go to your repository → **Settings** → **Secrets and variables** → **Actions** and add:

   | Secret | Description |
   |---|---|
   | `AWS_ACCESS_KEY_ID` | Access key for your IAM user |
   | `AWS_SECRET_ACCESS_KEY` | Secret key for your IAM user |

### Running the Terraform workflow

1. Go to your repository on GitHub
2. Navigate to **Actions** → **Terraform Deploy**
3. Click **Run workflow**
4. Select the branch and click **Run workflow**

After a successful run, the `svc_role_arn` output will be printed in the workflow logs. Copy that value and paste it into the `ROLE_ARN` variable in [deploy.sh](deploy.sh).

---

## Local Services (Docker Compose)

Neo4j, Qdrant, and RabbitMQ run locally via Docker Compose. Service credentials are stored in AWS Secrets Manager and fetched at deploy time by [deploy.sh](deploy.sh).

### First-time setup

1. Ensure your IAM user has permission to assume the service role created by Terraform.

2. Store your service credentials in AWS Secrets Manager under the `doc-analysis-secret/` path:

   ```bash
   aws secretsmanager create-secret --name "doc-analysis-secret/SVC_USER" --secret-string "your-username"
   aws secretsmanager create-secret --name "doc-analysis-secret/SVC_PWD" --secret-string "your-password"
   ```

3. Set the `ROLE_ARN` in [deploy.sh](deploy.sh) to the value output by the Terraform workflow:

   ```bash
   ROLE_ARN="arn:aws:iam::YOUR_ACCOUNT_ID:role/doc-analysis-svc-role"
   ```

### Starting the services

```bash
chmod +x deploy.sh   # first time only
./deploy.sh
```

The script will:
1. Assume the IAM service role
2. Fetch credentials from AWS Secrets Manager
3. Write a temporary `.env` file
4. Start all containers via `docker compose up -d`
5. Delete the `.env` file immediately after

### Stopping the services

```bash
docker compose down
```

### Data storage

The script will use the primary data path if it exists, otherwise fall back to the default Docker volume location:

| | Path |
|---|---|
| Primary | `D:/Projects/.data/doc-analysis` |
| Fallback | `C:/ProgramData/docker/volumes/doc-analysis` |

---

## Services

| Service | Port | Purpose |
|---|---|---|
| Neo4j | `7474` (HTTP), `7687` (Bolt) | Graph database |
| Qdrant | `6333` (HTTP), `6334` (gRPC) | Vector database |
| RabbitMQ | `5672` (AMQP), `15672` (Management UI) | Message queue |
