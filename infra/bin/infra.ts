#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { InfraStack } from "../lib/infra-stack.ts";

const app = new cdk.App();

// Main infrastructure stack (deployed by GitHub Actions)
new InfraStack(app, "SkewProtectionStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
