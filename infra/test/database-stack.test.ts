import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/network-stack';
import { DatabaseStack } from '../lib/database-stack';

describe('DatabaseStack', () => {
  const app = new cdk.App();
  const networkStack = new NetworkStack(app, 'TestNetworkStack');
  const stack = new DatabaseStack(app, 'TestDatabaseStack', {
    vpc: networkStack.vpc,
  });
  const template = Template.fromStack(stack);

  it('creates exactly one RDS Postgres instance in private subnets', () => {
    template.resourceCountIs('AWS::RDS::DBInstance', 1);
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      Engine: 'postgres',
      DBInstanceClass: 'db.t4g.micro',
    });
  });

  it('creates a dedicated security group with no open ingress rules', () => {
    const securityGroups = template.findResources('AWS::EC2::SecurityGroup', {
      Properties: { GroupDescription: Match.stringLikeRegexp('order-service RDS') },
    });
    expect(Object.keys(securityGroups).length).toBe(1);

    const sg = Object.values(securityGroups)[0] as {
      Properties: { SecurityGroupIngress?: unknown[] };
    };
    expect(sg.Properties.SecurityGroupIngress ?? []).toHaveLength(0);
  });
});
