import * as iam from "aws-cdk-lib/aws-iam";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export class GitHubOidcStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const orgName = new cdk.CfnParameter(this, "OrgName", {
      type: "String",
      description: "GitHub Organization Name",
      minLength: 1,
    });

    const repoName = new cdk.CfnParameter(this, "RepoName", {
      type: "String",
      description: "GitHub Repository Name",
      minLength: 1,
    });

    // Create OIDC Identity Provider
    const githubProvider = new iam.OpenIdConnectProvider(
      this,
      "GitHubProvider",
      {
        url: "https://token.actions.githubusercontent.com",
        clientIds: ["sts.amazonaws.com"],
      }
    );

    // Create the role
    const githubActionsRole = new iam.Role(this, "GitHubActionsRole", {
      assumedBy: new iam.WebIdentityPrincipal(
        githubProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          },
          StringLike: {
            "token.actions.githubusercontent.com:sub": `repo:${orgName.valueAsString}/${repoName.valueAsString}:*`,
          },
        }
      ),
    });

    // CloudFormation permissions for infrastructure deployment
    githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["cloudformation:*"],
        resources: ["*"],
      })
    );

    // S3 permissions for web app deployment and CDK assets
    githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:*"],
        resources: ["*"],
      })
    );

    // CloudFront permissions for web app deployment
    githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["cloudfront:*"],
        resources: ["*"],
      })
    );

    // ECR permissions for API container deployment
    githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ecr:*"],
        resources: ["*"],
      })
    );

    // ECS permissions for API deployment
    githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ecs:*"],
        resources: ["*"],
      })
    );

    // Application Load Balancer permissions
    githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["elasticloadbalancing:*"],
        resources: ["*"],
      })
    );

    // VPC and EC2 networking permissions
    githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ec2:*"],
        resources: ["*"],
      })
    );

    // IAM permissions for role and policy management
    githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["iam:*"],
        resources: ["*"],
      })
    );

    // CloudWatch Logs permissions for ECS and Lambda
    githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["logs:*"],
        resources: ["*"],
      })
    );

    // SSM Parameter Store permissions (for configuration)
    githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ssm:*"],
        resources: ["*"],
      })
    );

    // AWS Certificate Manager permissions (for HTTPS)
    githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["acm:*"],
        resources: ["*"],
      })
    );

    // Route53 permissions (for DNS and certificate validation)
    githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["route53:*"],
        resources: ["*"],
      })
    );

    // STS permissions for CDK Bootstrap and role assumption
    githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["sts:*"],
        resources: ["*"],
      })
    );

    // Output the role ARN for use in GitHub Actions
    new cdk.CfnOutput(this, "GitHubActionsRoleArn", {
      value: githubActionsRole.roleArn,
      description: "ARN of the GitHub Actions role for CI/CD",
      exportName: `${this.stackName}-GitHubActionsRoleArn`,
    });

    // Output the OIDC provider ARN for reference
    new cdk.CfnOutput(this, "GitHubOIDCProviderArn", {
      value: githubProvider.openIdConnectProviderArn,
      description: "ARN of the GitHub OIDC provider",
      exportName: `${this.stackName}-GitHubOIDCProviderArn`,
    });
  }
}
