terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.84"
    }
  }

  backend "s3" {
    bucket = "doc-analysis-tfstate-048908104884"
    key    = "doc-analysis.tfstate"
    region = "us-east-2"
  }
}

provider "aws" {
  region = var.region
}

# IAM is a global service whose CloudTrail events are only delivered to
# EventBridge in us-east-1 — used by the svc-role change alert in monitoring.tf.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

data "aws_caller_identity" "current" {}
