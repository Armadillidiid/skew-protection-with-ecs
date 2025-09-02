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
  public readonly ecsCluster: ecs.Cluster;
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
    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      "ApiTaskDefinition",
      {
        memoryLimitMiB: 512,
        cpu: 256,
      },
    );

    // Container Definition
    const container = taskDefinition.addContainer("node-api", {
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
          "curl -f http://localhost:3000/health || exit 1",
        ],
      },
    });

    // ECS Service
    this.ecsService = new ecs.FargateService(this, "ApiService", {
      cluster: this.ecsCluster,
      taskDefinition,
      assignPublicIp: true,
      securityGroups: [ecsSecurityGroup],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
        availabilityZones: this.vpc.availabilityZones.slice(0, 2), // Limit to 2 AZs for cost control
      },
      deploymentStrategy: ecs.DeploymentStrategy.BLUE_GREEN,
      bakeTime: cdk.Duration.minutes(15),
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

    const target = this.ecsService.loadBalancerTarget({
      containerName: container.containerName,
      containerPort: 3000,
      protocol: ecs.Protocol.TCP,
      alternateTarget: new ecs.AlternateTarget("LBAlternateOptions", {
        alternateTargetGroup: this.greenTargetGroup,
        productionListener:
          ecs.ListenerRuleConfiguration.applicationListenerRule(
            prodListenerRule,
          ),
      }),
    });

    target.attachToApplicationTargetGroup(this.blueTargetGroup);

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
  }
}
