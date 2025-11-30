import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as codepipeline_actions from "aws-cdk-lib/aws-codepipeline-actions";
import { Construct } from "constructs";
import { BackendStack } from "./backend-stack.ts";

export interface FrontendStackProps extends cdk.StackProps {
  backendStack: BackendStack;
}

export class FrontendStack extends cdk.Stack {
  public readonly s3Bucket: s3.Bucket;
  public readonly cloudFrontDistribution: cloudfront.Distribution;
  public readonly codeBuildProject: codebuild.Project;
  public readonly pipeline: codepipeline.Pipeline;
  public readonly sourceArtifactBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const { backendStack } = props;

    // S3 Bucket for hosting static website
    this.s3Bucket = new s3.Bucket(this, "WebsiteBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      websiteIndexDocument: "index.html",
      websiteErrorDocument: "index.html",
    });

    // CloudFront distribution
    this.cloudFrontDistribution = new cloudfront.Distribution(
      this,
      "WebsiteDistribution",
      {
        defaultBehavior: {
          origin: origins.S3BucketOrigin.withOriginAccessControl(this.s3Bucket),
          // Allow HTTP since no SSL cert is configured for load balancer
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.ALLOW_ALL,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          compress: true,
        },
        defaultRootObject: "index.html",
        minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      },
    );

    // CodeBuild Project for building and deploying web app
    this.codeBuildProject = new codebuild.PipelineProject(this, "WebCodeBuildProject", {
      buildSpec: codebuild.BuildSpec.fromSourceFilename(
        "apps/web/buildspec.yml",
      ),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
      },
      environmentVariables: {
        AWS_DEFAULT_REGION: {
          value: this.region,
        },
        S3_BUCKET: {
          value: this.s3Bucket.bucketName,
        },
        CLOUDFRONT_DISTRIBUTION_ID: {
          value: this.cloudFrontDistribution.distributionId,
        },
      },
    });

    // Grant S3 and CloudFront permissions to CodeBuild
    this.s3Bucket.grantReadWrite(this.codeBuildProject);
    this.codeBuildProject.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: [
          "cloudfront:CreateInvalidation",
          "cloudfront:GetInvalidation",
        ],
        resources: [
          `arn:aws:cloudfront::${this.account}:distribution/${this.cloudFrontDistribution.distributionId}`,
        ],
      }),
    );

    // CodePipeline Setup
    // S3 bucket for pipeline artifacts
    const artifactBucket = new s3.Bucket(this, "WebPipelineArtifacts", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // S3 bucket for source artifacts (uploaded by GitHub Actions)
    this.sourceArtifactBucket = new s3.Bucket(this, "WebSourceArtifacts", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true, // Required for CodePipeline S3 source
    });

    // Source output artifact
    const sourceOutput = new codepipeline.Artifact("SourceOutput");
    
    // Build output artifact
    const buildOutput = new codepipeline.Artifact("BuildOutput");

    // CodePipeline - Manual trigger (no automatic GitHub source)
    this.pipeline = new codepipeline.Pipeline(this, "WebPipeline", {
      pipelineName: "skew-protection-web-pipeline",
      artifactBucket,
      restartExecutionOnUpdate: false, // Don't auto-restart on stack updates
    });

    // Stage 1: Source from S3 (uploaded by GitHub Actions)
    this.pipeline.addStage({
      stageName: "Source",
      actions: [
        new codepipeline_actions.S3SourceAction({
          actionName: "S3_Source",
          bucket: this.sourceArtifactBucket,
          bucketKey: "source.zip",
          output: sourceOutput,
          trigger: codepipeline_actions.S3Trigger.NONE, // Manual trigger only
        }),
      ],
    });

    // Stage 2: Build with CodeBuild
    this.pipeline.addStage({
      stageName: "Build",
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: "Build_and_Deploy",
          project: this.codeBuildProject,
          input: sourceOutput,
          outputs: [buildOutput],
          environmentVariables: {
            VITE_API_BASE_URL: {
              value: `http://${backendStack.loadBalancer.loadBalancerDnsName}`,
            },
            S3_BUCKET: {
              value: this.s3Bucket.bucketName,
            },
            CLOUDFRONT_DISTRIBUTION_ID: {
              value: this.cloudFrontDistribution.distributionId,
            },
          },
        }),
      ],
    });

    // Outputs
    new cdk.CfnOutput(this, "WebsiteBucketName", {
      value: this.s3Bucket.bucketName,
      description: "Name of the S3 bucket for the website",
      exportName: "SkewProtection-WebsiteBucketName",
    });

    new cdk.CfnOutput(this, "CloudFrontDistributionId", {
      value: this.cloudFrontDistribution.distributionId,
      description: "CloudFront Distribution ID",
      exportName: "SkewProtection-CloudFrontDistributionId",
    });

    new cdk.CfnOutput(this, "CloudFrontDomainName", {
      value: this.cloudFrontDistribution.distributionDomainName,
      description: "CloudFront Distribution Domain Name",
      exportName: "SkewProtection-CloudFrontDomainName",
    });

    new cdk.CfnOutput(this, "WebsiteURL", {
      value: `https://${this.cloudFrontDistribution.distributionDomainName}`,
      description: "Website URL",
      exportName: "SkewProtection-WebsiteURL",
    });

    new cdk.CfnOutput(this, "CodeBuildProjectName", {
      value: this.codeBuildProject.projectName,
      description: "CodeBuild Project Name",
      exportName: "SkewProtection-WebCodeBuildProjectName",
    });

    new cdk.CfnOutput(this, "PipelineName", {
      value: this.pipeline.pipelineName,
      description: "Web CodePipeline Name",
      exportName: "SkewProtection-WebPipelineName",
    });

    new cdk.CfnOutput(this, "PipelineArn", {
      value: this.pipeline.pipelineArn,
      description: "Web CodePipeline ARN",
      exportName: "SkewProtection-WebPipelineArn",
    });

    new cdk.CfnOutput(this, "SourceBucketName", {
      value: this.sourceArtifactBucket.bucketName,
      description: "S3 bucket for source artifacts (GitHub Actions uploads here)",
      exportName: "SkewProtection-WebSourceBucket",
    });
  }
}
