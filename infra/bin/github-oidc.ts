#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { GitHubOidcStack } from "../lib/github-oidc-stack.ts";

const app = new cdk.App();

// GitHub OIDC stack for CI/CD authentication
// This is deployed manually once to bootstrap the CI/CD pipeline
new GitHubOidcStack(app, "SkewProtectionGitHubOIDC", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
