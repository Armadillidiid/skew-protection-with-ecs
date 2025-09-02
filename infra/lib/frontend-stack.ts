import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface FrontendStackProps extends cdk.StackProps {}

export class FrontendStack extends cdk.Stack {
  public readonly s3Bucket: s3.Bucket;
  public readonly cloudFrontDistribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: FrontendStackProps = {}) {
    super(scope, id, props);

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
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          compress: true,
        },
        defaultRootObject: "index.html",
        minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      },
    );

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
  }
}
