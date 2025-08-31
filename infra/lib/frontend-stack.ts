import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import { Construct } from "constructs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface FrontendStackProps extends cdk.StackProps {
  apiDomain?: string;
}

export class FrontendStack extends cdk.Stack {
  public readonly s3Bucket: s3.Bucket;
  public readonly cloudFrontDistribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: FrontendStackProps = {}) {
    super(scope, id, props);

    // S3 Bucket for hosting static website
    this.s3Bucket = new s3.Bucket(this, "WebsiteBucket", {
      bucketName: `skew-protection-frontend-${this.account}-${this.region}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
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

    new s3deploy.BucketDeployment(this, "DeployWebsite", {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, "../../apps/web/dist")),
      ],
      destinationBucket: this.s3Bucket,
      distribution: this.cloudFrontDistribution,
      distributionPaths: ["/*"],
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
  }
}
