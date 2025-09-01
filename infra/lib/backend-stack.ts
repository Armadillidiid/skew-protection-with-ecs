import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as codedeploy from "aws-cdk-lib/aws-codedeploy";
import { Construct } from "constructs";

export interface BackendStackProps extends cdk.StackProps {}

export class BackendStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly ecrRepository: ecr.Repository;
  public readonly ecsService: ecs.FargateService;
  public readonly codeDeployApplication: codedeploy.EcsApplication;
  public readonly blueTargetGroup: elbv2.ApplicationTargetGroup;
  public readonly greenTargetGroup: elbv2.ApplicationTargetGroup;

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
    const cluster = new ecs.Cluster(this, "SkewProtectionCluster", {
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
    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      "ApiTaskDefinition",
      {
        memoryLimitMiB: 512,
        cpu: 256,
      },
    );

    // Container Definition
    const container = taskDefinition.addContainer("ApiContainer", {
      image: ecs.ContainerImage.fromEcrRepository(this.ecrRepository),
      healthCheck: {
        command: [
          "CMD-SHELL",
          "curl -f http://localhost:3000/health || exit 1",
        ],
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
      assignPublicIp: true,
      securityGroups: [ecsSecurityGroup],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
        availabilityZones: this.vpc.availabilityZones.slice(0, 2), // Limit to 2 AZs for cost control
      },
      deploymentStrategy: ecs.DeploymentStrategy.BLUE_GREEN,
      deploymentController: { type: ecs.DeploymentControllerType.ECS },
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
    };

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

    this.ecsService.attachToApplicationTargetGroup(this.blueTargetGroup);

    const productionListener = this.loadBalancer.addListener(
      "ProductionListener",
      {
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        defaultTargetGroups: [this.blueTargetGroup],
      },
    );

    // CodeDeploy Application
    this.codeDeployApplication = new codedeploy.EcsApplication(
      this,
      "CodeDeployApplication",
    );

    // CodeDeploy Deployment Group
    new codedeploy.EcsDeploymentGroup(this, "DeploymentGroup", {
      application: this.codeDeployApplication,
      service: this.ecsService,
      blueGreenDeploymentConfig: {
        blueTargetGroup: this.blueTargetGroup,
        greenTargetGroup: this.greenTargetGroup,
        listener: productionListener,
        deploymentApprovalWaitTime: cdk.Duration.minutes(5),
        terminationWaitTime: cdk.Duration.minutes(5),
      },
      deploymentConfig:
        codedeploy.EcsDeploymentConfig.CANARY_10PERCENT_5MINUTES,
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
  }
}
