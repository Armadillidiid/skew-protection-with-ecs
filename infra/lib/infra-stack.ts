import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { BackendStack } from "./backend-stack.js";
import { FrontendStack } from "./frontend-stack.js";

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Deploy backend infrastructure
    const backendStack = new BackendStack(this, "Backend", {
      env: props?.env,
    });

    // Deploy frontend infrastructure with reference to backend
    const frontendStack = new FrontendStack(this, "Frontend", {
      env: props?.env,
      apiDomain: backendStack.loadBalancer.loadBalancerDnsName,
    });

    // Add dependency to ensure backend deploys first
    frontendStack.addDependency(backendStack);

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
