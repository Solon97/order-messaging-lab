import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpAlbIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import type * as cognito from 'aws-cdk-lib/aws-cognito';
import { serviceConfig } from './config';

export interface EdgeStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  // SPEC_DEVIATION: design.md specifies `cognito.IUserPool`, but
  // `userPoolProviderUrl` (needed for the JWT authorizer's issuer) is only
  // exposed on the concrete `UserPool` class, not the `IUserPool` interface.
  userPool: cognito.UserPool;
  userPoolClientId: string;
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

    const ordersAuthorizer = new HttpJwtAuthorizer(
      'OrdersAuthorizer',
      props.userPool.userPoolProviderUrl,
      { jwtAudience: [props.userPoolClientId] },
    );

    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi');
    this.httpApi.addRoutes({
      path: `${serviceConfig.publicPath}/{proxy+}`,
      methods: [apigwv2.HttpMethod.ANY],
      integration: new HttpAlbIntegration('OrdersIntegration', this.listener, {
        vpcLink,
      }),
      authorizer: ordersAuthorizer,
    });
    this.httpApi.addRoutes({
      path: serviceConfig.publicPath,
      methods: [apigwv2.HttpMethod.ANY],
      integration: new HttpAlbIntegration(
        'OrdersRootIntegration',
        this.listener,
        {
          vpcLink,
        },
      ),
      authorizer: ordersAuthorizer,
    });

    new cdk.CfnOutput(this, 'HttpApiUrl', {
      value: this.httpApi.url!,
    });
  }

  public registerFargateServiceListener(
    config: FargateServiceListenerConfig,
  ): void {
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
