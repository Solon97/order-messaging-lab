import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { FoundationStack } from '../lib/foundation-stack';
import { NetworkStack } from '../lib/network-stack';
import { DatabaseStack } from '../lib/database-stack';
import { ComputeStack } from '../lib/compute-stack';

describe('ComputeStack', () => {
  const app = new cdk.App();
  const foundationStack = new FoundationStack(app, 'TestFoundationStack2');
  const networkStack = new NetworkStack(app, 'TestNetworkStack2');
  const databaseStack = new DatabaseStack(app, 'TestDatabaseStack2', {
    vpc: networkStack.vpc,
  });
  const stack = new ComputeStack(app, 'TestComputeStack', {
    vpc: networkStack.vpc,
    repository: foundationStack.repository,
    imageTagParameter: foundationStack.imageTagParameter,
    database: databaseStack.database,
    databaseSecurityGroup: databaseStack.databaseSecurityGroup,
  });
  const template = Template.fromStack(stack);

  it('injects DATABASE_URL via secrets, never via plain environment', () => {
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Secrets: Match.arrayWith([
            Match.objectLike({ Name: 'DATABASE_URL' }),
          ]),
        }),
      ]),
    });

    const taskDefs = template.findResources('AWS::ECS::TaskDefinition');
    const containerDefs = (
      Object.values(taskDefs)[0] as {
        Properties: { ContainerDefinitions: { Environment?: { Name: string }[] }[] };
      }
    ).Properties.ContainerDefinitions;
    const envNames = containerDefs.flatMap(
      (container) => container.Environment?.map((env) => env.Name) ?? [],
    );
    expect(envNames).not.toContain('DATABASE_URL');
  });

  it('enables the ECS deployment circuit breaker with rollback', () => {
    template.hasResourceProperties('AWS::ECS::Service', {
      DeploymentConfiguration: Match.objectLike({
        DeploymentCircuitBreaker: { Enable: true, Rollback: true },
      }),
    });
  });

  it('sets the target group health check path to /health', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      HealthCheckPath: '/health',
    });
  });

  it('scopes the database ingress rule to the Fargate service security group only', () => {
    const serviceSecurityGroups = template.findResources('AWS::EC2::SecurityGroup', {
      Properties: {
        GroupDescription: Match.stringLikeRegexp('order-service Fargate service'),
      },
    });
    const serviceSecurityGroupLogicalId = Object.keys(serviceSecurityGroups)[0];
    expect(serviceSecurityGroupLogicalId).toBeDefined();

    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      FromPort: 5432,
      ToPort: 5432,
      SourceSecurityGroupId: Match.objectLike({
        'Fn::GetAtt': Match.arrayWith([serviceSecurityGroupLogicalId]),
      }),
    });
  });
});
