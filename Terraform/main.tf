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

data "aws_caller_identity" "current" {}
