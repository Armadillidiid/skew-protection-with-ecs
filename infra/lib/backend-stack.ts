import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as codedeploy from "aws-cdk-lib/aws-codedeploy";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as codepipeline_actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export interface BackendStackProps extends cdk.StackProps {}

export class BackendStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly ecrRepository: ecr.Repository;
  public readonly ecsService: ecs.FargateService;
  public readonly ecsCluster: ecs.Cluster;
  public readonly taskDefinition: ecs.FargateTaskDefinition;
  public readonly codeDeployApplication: codedeploy.EcsApplication;
  public readonly codeDeployDeploymentGroup: codedeploy.EcsDeploymentGroup;
  public readonly codeBuildProject: codebuild.Project;
  public readonly blueTargetGroup: elbv2.ApplicationTargetGroup;
  public readonly greenTargetGroup: elbv2.ApplicationTargetGroup;
  public readonly pipeline: codepipeline.Pipeline;
  public readonly sourceArtifactBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: BackendStackProps = {}) {
    super(scope, id, props);

    // Use default VPC
    this.vpc = ec2.Vpc.fromLookup(this, "DefaultVpc", {
      isDefault: true,
    });

    // ECR Repository for container images
    this.ecrRepository = new ecr.Repository(this, "ApiRepository", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      imageTagMutability: ecr.TagMutability.MUTABLE,
    });

    // ECS Cluster
    this.ecsCluster = new ecs.Cluster(this, "SkewProtectionCluster", {
      vpc: this.vpc,
    });

    // Application Load Balancer
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(
      this,
      "ApiLoadBalancer",
      {
        vpc: this.vpc,
        internetFacing: true,
      },
    );

    // Security Group for ALB
    const albSecurityGroup = new ec2.SecurityGroup(this, "AlbSecurityGroup", {
      vpc: this.vpc,
      description: "Security group for ALB",
    });
    albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));
    albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));

    this.loadBalancer.addSecurityGroup(albSecurityGroup);

    // Security Group for ECS Service
    const ecsSecurityGroup = new ec2.SecurityGroup(this, "EcsSecurityGroup", {
      vpc: this.vpc,
      description: "Security group for ECS service",
    });
    ecsSecurityGroup.addIngressRule(albSecurityGroup, ec2.Port.allTcp());

    // Task Definition
    this.taskDefinition = new ecs.FargateTaskDefinition(
      this,
      "ApiTaskDefinition",
      {
        memoryLimitMiB: 512,
        cpu: 256,
      },
    );

    // Container Definition
    this.taskDefinition.addContainer("node-api", {
      image: ecs.ContainerImage.fromEcrRepository(this.ecrRepository),
      portMappings: [
        {
          name: "api",
          containerPort: 3000,
          appProtocol: ecs.AppProtocol.http,
        },
      ],
      healthCheck: {
        command: [
          "CMD-SHELL",
          // Use Node.js instead of curl since Alpine Linux doesn't include curl by default
          "node -e \"require('http').get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))\"",
        ],
      },
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "api" }),
    });

    // ECS Service
    this.ecsService = new ecs.FargateService(this, "ApiService", {
      cluster: this.ecsCluster,
      taskDefinition: this.taskDefinition,
      assignPublicIp: true,
      securityGroups: [ecsSecurityGroup],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
        availabilityZones: this.vpc.availabilityZones.slice(0, 2), // Limit to 2 AZs for cost control
      },
      deploymentController: {
        type: ecs.DeploymentControllerType.CODE_DEPLOY,
      },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      desiredCount: 1,
    });

    const targetGroupProps = {
      vpc: this.vpc,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        enabled: true,
        path: "/health",
      },
    } satisfies cdk.aws_elasticloadbalancingv2.ApplicationTargetGroupProps;

    this.blueTargetGroup = new elbv2.ApplicationTargetGroup(
      this,
      "BlueTargetGroup",
      targetGroupProps,
    );

    this.greenTargetGroup = new elbv2.ApplicationTargetGroup(
      this,
      "GreenTargetGroup",
      targetGroupProps,
    );

    const productionListener = this.loadBalancer.addListener(
      "ProductionListener",
      {
        port: 80,
        defaultAction: elbv2.ListenerAction.fixedResponse(404),
      },
    );

    const prodListenerRule = new elbv2.ApplicationListenerRule(
      this,
      "ProductionListenerRule",
      {
        listener: productionListener,
        priority: 1,
        conditions: [elbv2.ListenerCondition.pathPatterns(["/*"])],
        action: elbv2.ListenerAction.weightedForward([
          {
            targetGroup: this.blueTargetGroup,
            weight: 100,
          },
          {
            targetGroup: this.greenTargetGroup,
            weight: 0,
          },
        ]),
      },
    );

    // Attach ECS service to blue target group
    this.blueTargetGroup.addTarget(this.ecsService);

    // CodeBuild Project for building Docker images
    this.codeBuildProject = new codebuild.PipelineProject(
      this,
      "ApiCodeBuildProject",
      {
        buildSpec: codebuild.BuildSpec.fromSourceFilename(
          "apps/api/buildspec.yml",
        ),
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
          privileged: true, // Required for Docker builds
          computeType: codebuild.ComputeType.SMALL,
        },
        environmentVariables: {
          AWS_DEFAULT_REGION: { value: this.region },
          AWS_ACCOUNT_ID: { value: this.account },
          IMAGE_REPO_NAME: { value: this.ecrRepository.repositoryName },
          IMAGE_TAG: { value: "latest" },
          TASK_DEFINITION_ARN: { value: this.taskDefinition.taskDefinitionArn },
          TASK_ROLE_ARN: { value: this.taskDefinition.taskRole.roleArn },
          EXECUTION_ROLE_ARN: {
            value: this.taskDefinition.executionRole?.roleArn,
          },
        },
      },
    );

    // Grant ECR permissions to CodeBuild
    this.ecrRepository.grantPullPush(this.codeBuildProject);

    // CodeDeploy Application for Blue/Green deployments
    this.codeDeployApplication = new codedeploy.EcsApplication(
      this,
      "ApiCodeDeployApplication",
    );

    // CodeDeploy Deployment Group for Blue/Green deployments
    this.codeDeployDeploymentGroup = new codedeploy.EcsDeploymentGroup(
      this,
      "ApiDeploymentGroup",
      {
        application: this.codeDeployApplication,
        service: this.ecsService,
        blueGreenDeploymentConfig: {
          blueTargetGroup: this.blueTargetGroup,
          greenTargetGroup: this.greenTargetGroup,
          listener: productionListener,
          terminationWaitTime: cdk.Duration.minutes(5),
        },
      },
    );

    // CodePipeline Setup
    // S3 bucket for pipeline artifacts
    const artifactBucket = new s3.Bucket(this, "ApiPipelineArtifacts", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // S3 bucket for source artifacts (uploaded by GitHub Actions)
    this.sourceArtifactBucket = new s3.Bucket(this, "ApiSourceArtifacts", {
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
    this.pipeline = new codepipeline.Pipeline(this, "ApiPipeline", {
      pipelineName: "skew-protection-api-pipeline",
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
          actionName: "Build_Docker_Image",
          project: this.codeBuildProject,
          input: sourceOutput,
          outputs: [buildOutput],
        }),
      ],
    });

    // Stage 3: Deploy with CodeDeploy
    this.pipeline.addStage({
      stageName: "Deploy",
      actions: [
        new codepipeline_actions.CodeDeployEcsDeployAction({
          actionName: "Deploy_to_ECS",
          deploymentGroup: this.codeDeployDeploymentGroup,
          taskDefinitionTemplateFile: buildOutput.atPath("taskdef.json"),
          appSpecTemplateFile: buildOutput.atPath("appspec.yml"),
        }),
      ],
    });

    // Outputs
    new cdk.CfnOutput(this, "LoadBalancerDNS", {
      value: this.loadBalancer.loadBalancerDnsName,
      description: "DNS name of the load balancer",
      exportName: "SkewProtection-LoadBalancerDNS",
    });

    new cdk.CfnOutput(this, "ECRRepositoryURI", {
      value: this.ecrRepository.repositoryUri,
      description: "ECR Repository URI",
      exportName: "SkewProtection-ECRRepositoryURI",
    });

    new cdk.CfnOutput(this, "ECSClusterName", {
      value: this.ecsCluster.clusterName,
      description: "ECS Cluster Name",
      exportName: "SkewProtection-ECSClusterName",
    });

    new cdk.CfnOutput(this, "ECSServiceName", {
      value: this.ecsService.serviceName,
      description: "ECS Service Name",
      exportName: "SkewProtection-ECSServiceName",
    });

    new cdk.CfnOutput(this, "CodeBuildProjectName", {
      value: this.codeBuildProject.projectName,
      description: "CodeBuild Project Name",
      exportName: "SkewProtection-CodeBuildProjectName",
    });

    new cdk.CfnOutput(this, "CodeDeployApplicationName", {
      value: this.codeDeployApplication.applicationName,
      description: "CodeDeploy Application Name",
      exportName: "SkewProtection-CodeDeployApplicationName",
    });

    new cdk.CfnOutput(this, "CodeDeployDeploymentGroupName", {
      value: this.codeDeployDeploymentGroup.deploymentGroupName,
      description: "CodeDeploy Deployment Group Name",
      exportName: "SkewProtection-CodeDeployDeploymentGroupName",
    });

    new cdk.CfnOutput(this, "TaskRoleArn", {
      value: this.taskDefinition.taskRole.roleArn,
      description: "ECS Task Role ARN",
      exportName: "SkewProtection-TaskRoleArn",
    });

    new cdk.CfnOutput(this, "ExecutionRoleArn", {
      value: this.taskDefinition.executionRole!.roleArn,
      description: "ECS Task Execution Role ARN",
      exportName: "SkewProtection-ExecutionRoleArn",
    });

    new cdk.CfnOutput(this, "TaskDefinitionArn", {
      value: this.taskDefinition.taskDefinitionArn,
      description: "ECS Task Definition ARN",
      exportName: "SkewProtection-TaskDefinitionArn",
    });

    new cdk.CfnOutput(this, "PipelineName", {
      value: this.pipeline.pipelineName,
      description: "API CodePipeline Name",
      exportName: "SkewProtection-ApiPipelineName",
    });

    new cdk.CfnOutput(this, "PipelineArn", {
      value: this.pipeline.pipelineArn,
      description: "API CodePipeline ARN",
      exportName: "SkewProtection-ApiPipelineArn",
    });

    new cdk.CfnOutput(this, "SourceBucketName", {
      value: this.sourceArtifactBucket.bucketName,
      description:
        "S3 bucket for source artifacts (GitHub Actions uploads here)",
      exportName: "SkewProtection-ApiSourceBucket",
    });
  }
}
