import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { BackendStack } from "./backend-stack.ts";
import { FrontendStack } from "./frontend-stack.ts";

export interface InfraStackProps extends cdk.StackProps {}

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: InfraStackProps = {}) {
    super(scope, id, props);

    const backendStack = new BackendStack(this, "Backend", {
      env: props?.env,
    });

    const frontendStack = new FrontendStack(this, "Frontend", {
      backendStack,
      env: props?.env,
    });

    // Cross-stack outputs
    new cdk.CfnOutput(this, "ApiEndpoint", {
      value: `http://${backendStack.loadBalancer.loadBalancerDnsName}`,
      description: "API Endpoint URL",
    });

    new cdk.CfnOutput(this, "WebsiteURL", {
      value: `https://${frontendStack.cloudFrontDistribution.distributionDomainName}`,
      description: "Frontend Website URL",
    });
  }
}
