import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

export interface BackendStackProps extends cdk.StackProps {}

export class BackendStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly ecrRepository: ecr.Repository;
  public readonly ecsService: ecs.FargateService;

  constructor(scope: Construct, id: string, props: BackendStackProps = {}) {
    super(scope, id, props);

    // VPC
    this.vpc = new ec2.Vpc(this, "SkewProtectionVpc", {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // ECR Repository for container images
    this.ecrRepository = new ecr.Repository(this, "ApiRepository", {
      repositoryName: "skew-protection-api",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      imageScanOnPush: true,
    });

    // ECS Cluster
    const cluster = new ecs.Cluster(this, "SkewProtectionCluster", {
      vpc: this.vpc,
      clusterName: "skew-protection-cluster",
      containerInsights: true,
    });

    // Application Load Balancer
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(
      this,
      "ApiLoadBalancer",
      {
        vpc: this.vpc,
        internetFacing: true,
        loadBalancerName: "skew-protection-alb",
      },
    );

    // Security Group for ALB
    const albSecurityGroup = new ec2.SecurityGroup(this, "AlbSecurityGroup", {
      vpc: this.vpc,
      description: "Security group for ALB",
      allowAllOutbound: true,
    });

    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Allow HTTP traffic",
    );

    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      "Allow HTTPS traffic",
    );

    this.loadBalancer.addSecurityGroup(albSecurityGroup);

    // Security Group for ECS Service
    const ecsSecurityGroup = new ec2.SecurityGroup(this, "EcsSecurityGroup", {
      vpc: this.vpc,
      description: "Security group for ECS service",
      allowAllOutbound: true,
    });

    ecsSecurityGroup.addIngressRule(
      albSecurityGroup,
      ec2.Port.tcp(3000),
      "Allow traffic from ALB",
    );

    // Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      "ApiTaskDefinition",
      {
        memoryLimitMiB: 512,
        cpu: 256,
      },
    );

    // CloudWatch Log Group
    const logGroup = new logs.LogGroup(this, "ApiLogGroup", {
      logGroupName: "/ecs/skew-protection-api",
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Container Definition
    const container = taskDefinition.addContainer("ApiContainer", {
      image: ecs.ContainerImage.fromEcrRepository(this.ecrRepository, "latest"),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "api",
        logGroup,
      }),
      environment: {
        NODE_ENV: "production",
        PORT: "3000",
      },
      healthCheck: {
        command: [
          "CMD-SHELL",
          "curl -f http://localhost:3000/health || exit 1",
        ],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    container.addPortMappings({
      containerPort: 3000,
      protocol: ecs.Protocol.TCP,
    });

    // ECS Service
    this.ecsService = new ecs.FargateService(this, "ApiService", {
      cluster,
      taskDefinition,
      serviceName: "skew-protection-api",
      desiredCount: 2,
      assignPublicIp: false,
      securityGroups: [ecsSecurityGroup],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      healthCheckGracePeriod: cdk.Duration.seconds(60),
      enableExecuteCommand: true, // For debugging
    });

    // Target Group
    const targetGroup = new elbv2.ApplicationTargetGroup(
      this,
      "ApiTargetGroup",
      {
        vpc: this.vpc,
        port: 3000,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targetType: elbv2.TargetType.IP,
        healthCheck: {
          enabled: true,
          path: "/health",
          healthyHttpCodes: "200",
          interval: cdk.Duration.seconds(30),
          timeout: cdk.Duration.seconds(5),
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 3,
        },
        deregistrationDelay: cdk.Duration.seconds(30),
      },
    );

    // Attach ECS Service to Target Group
    this.ecsService.attachToApplicationTargetGroup(targetGroup);

    // ALB Listener
    this.loadBalancer.addListener("ApiListener", {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultTargetGroups: [targetGroup],
    });

    // Auto Scaling
    const scaling = this.ecsService.autoScaleTaskCount({
      minCapacity: 2,
      maxCapacity: 10,
    });

    scaling.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.minutes(5),
      scaleOutCooldown: cdk.Duration.minutes(2),
    });

    scaling.scaleOnMemoryUtilization("MemoryScaling", {
      targetUtilizationPercent: 80,
      scaleInCooldown: cdk.Duration.minutes(5),
      scaleOutCooldown: cdk.Duration.minutes(2),
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

    new cdk.CfnOutput(this, "VpcId", {
      value: this.vpc.vpcId,
      description: "VPC ID",
      exportName: "SkewProtection-VpcId",
    });

    new cdk.CfnOutput(this, "EcsClusterName", {
      value: cluster.clusterName,
      description: "ECS Cluster Name",
      exportName: "SkewProtection-EcsClusterName",
    });

    new cdk.CfnOutput(this, "EcsServiceName", {
      value: this.ecsService.serviceName,
      description: "ECS Service Name",
      exportName: "SkewProtection-EcsServiceName",
    });
  }
}
