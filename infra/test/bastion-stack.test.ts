import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/network-stack';
import { DatabaseStack } from '../lib/database-stack';
import { BastionStack } from '../lib/bastion-stack';

describe('BastionStack', () => {
  const app = new cdk.App();
  const networkStack = new NetworkStack(app, 'TestNetworkStack');
  const databaseStack = new DatabaseStack(app, 'TestDatabaseStack', {
    vpc: networkStack.vpc,
  });
  const stack = new BastionStack(app, 'TestBastionStack', {
    vpc: networkStack.vpc,
    databaseSecurityGroup: databaseStack.databaseSecurityGroup,
  });
  const template = Template.fromStack(stack);

  it('creates exactly one EC2 instance with the SSM managed policy attached', () => {
    template.resourceCountIs('AWS::EC2::Instance', 1);
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Principal: { Service: 'ec2.amazonaws.com' },
          }),
        ],
      },
      ManagedPolicyArns: Match.arrayWith([
        Match.objectLike({
          'Fn::Join': Match.arrayWith([
            Match.arrayWith([Match.stringLikeRegexp('AmazonSSMManagedInstanceCore')]),
          ]),
        }),
      ]),
    });
  });

  it('creates a security group for the bastion with no open ingress rules', () => {
    const securityGroups = template.findResources('AWS::EC2::SecurityGroup', {
      Properties: { GroupDescription: Match.stringLikeRegexp('bastion') },
    });
    expect(Object.keys(securityGroups).length).toBe(1);

    const sg = Object.values(securityGroups)[0] as {
      Properties: { SecurityGroupIngress?: unknown[] };
    };
    expect(sg.Properties.SecurityGroupIngress ?? []).toHaveLength(0);
  });
});
