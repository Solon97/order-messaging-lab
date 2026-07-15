import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpAlbIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { serviceConfig } from './config';

export interface EdgeStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
}

export interface FargateServiceListenerConfig {
  service: ecs.FargateService;
  containerPort: number;
  publicPath: string;
  healthCheckPath: string;
  priority: number;
}

export class EdgeStack extends cdk.Stack {
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly httpApi: apigwv2.HttpApi;
  private readonly listener: elbv2.ApplicationListener;

  constructor(scope: Construct, id: string, props: EdgeStackProps) {
    super(scope, id, props);

    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc: props.vpc,
      // explicit internal: closes the reference architecture's known gap
      // (its ALB otherwise defaults to internet-facing) — see design.md.
      internetFacing: false,
    });

    this.listener = this.loadBalancer.addListener('Listener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: 'Not Found',
      }),
    });

    const vpcLinkSecurityGroup = new ec2.SecurityGroup(
      this,
      'VpcLinkSecurityGroup',
      {
        vpc: props.vpc,
        description: 'Security group for the API Gateway VPC Link',
        allowAllOutbound: false,
      },
    );
    vpcLinkSecurityGroup.addEgressRule(
      ec2.Peer.securityGroupId(
        this.loadBalancer.connections.securityGroups[0].securityGroupId,
      ),
      ec2.Port.tcp(80),
      'Allow VPC Link to reach the internal ALB listener only',
    );

    const vpcLink = new apigwv2.VpcLink(this, 'VpcLink', {
      vpc: props.vpc,
      securityGroups: [vpcLinkSecurityGroup],
    });

    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi');
    this.httpApi.addRoutes({
      path: `${serviceConfig.publicPath}/{proxy+}`,
      methods: [apigwv2.HttpMethod.ANY],
      integration: new HttpAlbIntegration('OrdersIntegration', this.listener, {
        vpcLink,
      }),
    });
    this.httpApi.addRoutes({
      path: serviceConfig.publicPath,
      methods: [apigwv2.HttpMethod.ANY],
      integration: new HttpAlbIntegration('OrdersRootIntegration', this.listener, {
        vpcLink,
      }),
    });
  }

  // Registers a Fargate service against this stack's listener. Called from
  // bin/app.ts after both ComputeStack and EdgeStack are constructed — see
  // AD note in design.md: ComputeStack must depend on EdgeStack (not the
  // reverse), because ecs.FargateService always adds a safety dependency
  // from the ECS Service onto wherever its target group is attached to a
  // listener rule. Building the target group here, empty of any inline
  // `targets`, and having ComputeStack (via this method, but the mutation
  // lands on the Service's own resource) attach afterwards keeps the
  // resulting cross-stack reference one-directional: ComputeStack -> EdgeStack.
  public registerFargateServiceListener(config: FargateServiceListenerConfig): void {
    this.listener.addTargets('OrdersRoute', {
      priority: config.priority,
      conditions: [
        elbv2.ListenerCondition.pathPatterns([`${config.publicPath}*`]),
      ],
      port: config.containerPort,
      protocol: elbv2.ApplicationProtocol.HTTP,
      healthCheck: { path: config.healthCheckPath },
      targets: [config.service],
    });
  }
}
