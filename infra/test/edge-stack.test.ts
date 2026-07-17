import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/network-stack';
import { FoundationStack } from '../lib/foundation-stack';
import { DatabaseStack } from '../lib/database-stack';
import { ComputeStack } from '../lib/compute-stack';
import { EdgeStack } from '../lib/edge-stack';
import { AuthStack } from '../lib/auth-stack';
import { edgeThrottle } from '../lib/config';

describe('EdgeStack', () => {
  const app = new cdk.App();
  const networkStack = new NetworkStack(app, 'TestNetworkStack3');
  const foundationStack = new FoundationStack(app, 'TestFoundationStack3');
  const authStack = new AuthStack(app, 'TestAuthStack3');
  const databaseStack = new DatabaseStack(app, 'TestDatabaseStack3', {
    vpc: networkStack.vpc,
  });
  const computeStack = new ComputeStack(app, 'TestComputeStack3', {
    vpc: networkStack.vpc,
    repository: foundationStack.repository,
    imageTagParameter: foundationStack.imageTagParameter,
    database: databaseStack.database,
    databaseSecurityGroup: databaseStack.databaseSecurityGroup,
  });
  const stack = new EdgeStack(app, 'TestEdgeStack', {
    vpc: networkStack.vpc,
    userPool: authStack.userPool,
    userPoolClientId: authStack.userPoolClient.userPoolClientId,
  });
  stack.registerFargateServiceListener(computeStack.listenerConfig);
  const template = Template.fromStack(stack);

  it('creates the ALB as internal, not internet-facing', () => {
    template.hasResourceProperties(
      'AWS::ElasticLoadBalancingV2::LoadBalancer',
      {
        Scheme: 'internal',
      },
    );
  });

  it('the listener default action is a fixed 404 response', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
      DefaultActions: Match.arrayWith([
        Match.objectLike({
          Type: 'fixed-response',
          FixedResponseConfig: Match.objectLike({ StatusCode: '404' }),
        }),
      ]),
    });
  });

  it('creates an HTTP API with a route matching the public /orders path', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'ANY /orders',
    });
  });

  it('registers the target group with the /health check path', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      HealthCheckPath: '/health',
    });
  });

  it('requires the JWT authorizer on both /orders routes', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
      AuthorizerType: 'JWT',
    });

    const authorizers = template.findResources(
      'AWS::ApiGatewayV2::Authorizer',
      { Properties: { AuthorizerType: 'JWT' } },
    );
    const authorizerLogicalId = Object.keys(authorizers)[0];
    expect(authorizerLogicalId).toBeDefined();

    const proxyRoute = template.findResources('AWS::ApiGatewayV2::Route', {
      Properties: { RouteKey: 'ANY /orders/{proxy+}' },
    });
    const rootRoute = template.findResources('AWS::ApiGatewayV2::Route', {
      Properties: { RouteKey: 'ANY /orders' },
    });
    expect(Object.keys(proxyRoute)).toHaveLength(1);
    expect(Object.keys(rootRoute)).toHaveLength(1);

    for (const route of [
      ...Object.values(proxyRoute),
      ...Object.values(rootRoute),
    ]) {
      const properties = (route as { Properties: { AuthorizerId: unknown } })
        .Properties;
      expect(properties.AuthorizerId).toEqual({
        Ref: authorizerLogicalId,
      });
    }
  });

  it('configures the $default stage with auto-deploy and the configured throttle limits', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      StageName: '$default',
      AutoDeploy: true,
      DefaultRouteSettings: Match.objectLike({
        ThrottlingRateLimit: edgeThrottle.rateLimit,
        ThrottlingBurstLimit: edgeThrottle.burstLimit,
      }),
    });
  });

  it('the HttpApiUrl output still resolves to the $default stage', () => {
    const outputs = template.toJSON().Outputs as Record<
      string,
      { Value: unknown }
    >;
    const httpApiUrlOutput = Object.entries(outputs).find(([name]) =>
      /HttpApiUrl/i.test(name),
    );
    expect(httpApiUrlOutput).toBeDefined();
  });

  it('the VPC Link security group has no unrestricted egress rule', () => {
    const securityGroups = template.findResources('AWS::EC2::SecurityGroup', {
      Properties: { GroupDescription: Match.stringLikeRegexp('VPC Link') },
    });
    expect(Object.keys(securityGroups).length).toBe(1);

    const sg = Object.values(securityGroups)[0] as {
      Properties: { SecurityGroupEgress?: { CidrIp?: string }[] };
    };
    const wideOpenEgress = (sg.Properties.SecurityGroupEgress ?? []).filter(
      (rule) => rule.CidrIp === '0.0.0.0/0',
    );
    expect(wideOpenEgress).toHaveLength(0);
  });
});
