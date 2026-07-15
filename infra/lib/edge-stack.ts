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
  service: ecs.FargateService;
}

export class EdgeStack extends cdk.Stack {
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly httpApi: apigwv2.HttpApi;

  constructor(scope: Construct, id: string, props: EdgeStackProps) {
    super(scope, id, props);

    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc: props.vpc,
      // explicit internal: closes the reference architecture's known gap
      // (its ALB otherwise defaults to internet-facing) — see design.md.
      internetFacing: false,
    });

    const listener = this.loadBalancer.addListener('Listener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: 'Not Found',
      }),
    });

    listener.addTargets('OrdersRoute', {
      priority: 1,
      conditions: [elbv2.ListenerCondition.pathPatterns([`${serviceConfig.publicPath}*`])],
      port: serviceConfig.containerPort,
      protocol: elbv2.ApplicationProtocol.HTTP,
      healthCheck: { path: serviceConfig.healthCheckPath },
      targets: [props.service],
    });

    const vpcLinkSecurityGroup = new ec2.SecurityGroup(this, 'VpcLinkSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for the API Gateway VPC Link',
      allowAllOutbound: false,
    });
    vpcLinkSecurityGroup.addEgressRule(
      ec2.Peer.securityGroupId(this.loadBalancer.connections.securityGroups[0].securityGroupId),
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
      integration: new HttpAlbIntegration('OrdersIntegration', listener, {
        vpcLink,
      }),
    });
    this.httpApi.addRoutes({
      path: serviceConfig.publicPath,
      methods: [apigwv2.HttpMethod.ANY],
      integration: new HttpAlbIntegration('OrdersRootIntegration', listener, {
        vpcLink,
      }),
    });
  }
}
