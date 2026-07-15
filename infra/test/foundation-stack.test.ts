import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { FoundationStack } from '../lib/foundation-stack';

describe('FoundationStack', () => {
  const app = new cdk.App();
  const stack = new FoundationStack(app, 'TestFoundationStack');
  const template = Template.fromStack(stack);

  it('creates an ECR repository with immutable tags', () => {
    template.hasResourceProperties('AWS::ECR::Repository', {
      ImageTagMutability: 'IMMUTABLE',
    });
  });

  it('creates the SSM parameter for the published image tag', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/order-messaging-lab/order-service/image-tag',
    });
  });

  it('restricts the ECR push role trust policy to this repo + main branch', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'github-actions-order-service-ecr-push',
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Condition: Match.objectLike({
              StringLike: Match.objectLike({
                'token.actions.githubusercontent.com:sub': Match.stringLikeRegexp(
                  ':ref:refs/heads/main$',
                ),
              }),
            }),
          }),
        ]),
      }),
    });
  });

  it('grants the CDK deploy role only sts:AssumeRole, no direct resource permissions', () => {
    const roles = template.findResources('AWS::IAM::Role', {
      Properties: { RoleName: 'github-actions-cdk-deploy' },
    });
    const deployRole = Object.values(roles)[0] as {
      Properties: {
        Policies: { PolicyDocument: { Statement: { Action: unknown }[] } }[];
      };
    };

    expect(deployRole).toBeDefined();
    const allStatements = deployRole.Properties.Policies.flatMap(
      (policy) => policy.PolicyDocument.Statement,
    );
    expect(allStatements.length).toBeGreaterThan(0);
    expect(allStatements.every((statement) => statement.Action === 'sts:AssumeRole')).toBe(
      true,
    );
  });
});
