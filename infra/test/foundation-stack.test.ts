import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { FoundationStack } from '../lib/foundation-stack';
import { serviceConfig } from '../lib/config';

const {
  organization: githubOrg,
  name: githubRepo,
  branch: githubBranch,
} = serviceConfig.repository;

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
                'token.actions.githubusercontent.com:sub': Match.arrayWith([
                  Match.stringLikeRegexp(
                    `^repo:${githubOrg}(@\\*)?/${githubRepo}(@\\*)?:ref:refs/heads/${githubBranch}$`,
                  ),
                ]),
              }),
            }),
          }),
        ]),
      }),
    });
  });

  it('grants the CDK deploy role only the actions needed to deploy + run the migration task', () => {
    const roles = template.findResources('AWS::IAM::Role', {
      Properties: { RoleName: 'github-actions-cdk-deploy' },
    });
    const deployRole = Object.values(roles)[0] as {
      Properties: {
        Policies: {
          PolicyDocument: {
            Statement: { Action: unknown; Resource: unknown }[];
          };
        }[];
      };
    };

    expect(deployRole).toBeDefined();
    const allStatements = deployRole.Properties.Policies.flatMap(
      (policy) => policy.PolicyDocument.Statement,
    );
    const allowedActions = new Set([
      'sts:AssumeRole',
      'cloudformation:DescribeStacks',
      'ecs:RunTask',
      'ecs:DescribeTasks',
      'iam:PassRole',
    ]);
    expect(allStatements.length).toBeGreaterThan(0);
    expect(
      allStatements.every((statement) =>
        allowedActions.has(statement.Action as string),
      ),
    ).toBe(true);
  });

  it('restricts the migration task iam:PassRole grant to the ECS tasks service', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'github-actions-cdk-deploy',
      Policies: Match.arrayWith([
        Match.objectLike({
          PolicyDocument: Match.objectLike({
            Statement: Match.arrayWith([
              Match.objectLike({
                Action: 'iam:PassRole',
                Condition: Match.objectLike({
                  StringEquals: Match.objectLike({
                    'iam:PassedToService': 'ecs-tasks.amazonaws.com',
                  }),
                }),
              }),
            ]),
          }),
        }),
      ]),
    });
  });
});
