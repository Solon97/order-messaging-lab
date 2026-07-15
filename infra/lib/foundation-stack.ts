import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { serviceConfig } from './config';

// SPEC_DEVIATION: the GitHub org/repo owning this codebase is not yet fixed
// (no git remote configured at scaffold time). Update `githubOrg` before the
// first real `cdk deploy` — see infra/README.md.
const githubOrg = 'REPLACE_WITH_GITHUB_ORG';
const githubRepo = 'order-messaging-lab';
const githubBranch = 'main';

export class FoundationStack extends cdk.Stack {
  public readonly repository: ecr.IRepository;
  public readonly imageTagParameter: ssm.IStringParameter;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.repository = new ecr.Repository(this, 'Repository', {
      repositoryName: serviceConfig.serviceName,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      emptyOnDelete: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.imageTagParameter = new ssm.StringParameter(this, 'ImageTagParameter', {
      parameterName: `/order-messaging-lab/${serviceConfig.serviceName}/image-tag`,
      stringValue: 'latest',
    });

    const githubOidcProvider =
      iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
        this,
        'GithubOidcProvider',
        `arn:aws:iam::${cdk.Stack.of(this).account}:oidc-provider/token.actions.githubusercontent.com`,
      );

    const ecrPushRole = new iam.Role(this, 'EcrPushRole', {
      roleName: `github-actions-${serviceConfig.serviceName}-ecr-push`,
      assumedBy: new iam.WebIdentityPrincipal(
        githubOidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
          StringLike: {
            'token.actions.githubusercontent.com:sub': `repo:${githubOrg}/${githubRepo}:ref:refs/heads/${githubBranch}`,
          },
        },
      ),
    });
    this.repository.grantPullPush(ecrPushRole);
    this.imageTagParameter.grantWrite(ecrPushRole);

    const cdkBootstrapRoleArns = [
      `arn:aws:iam::${cdk.Stack.of(this).account}:role/cdk-hnb659fds-deploy-role-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
      `arn:aws:iam::${cdk.Stack.of(this).account}:role/cdk-hnb659fds-file-publishing-role-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
      `arn:aws:iam::${cdk.Stack.of(this).account}:role/cdk-hnb659fds-image-publishing-role-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
      `arn:aws:iam::${cdk.Stack.of(this).account}:role/cdk-hnb659fds-lookup-role-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
    ];

    new iam.Role(this, 'CdkDeployRole', {
      roleName: 'github-actions-cdk-deploy',
      assumedBy: new iam.WebIdentityPrincipal(
        githubOidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
          StringLike: {
            'token.actions.githubusercontent.com:sub': `repo:${githubOrg}/${githubRepo}:ref:refs/heads/${githubBranch}`,
          },
        },
      ),
      inlinePolicies: {
        AssumeCdkBootstrapRoles: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['sts:AssumeRole'],
              resources: cdkBootstrapRoleArns,
            }),
          ],
        }),
      },
    });
  }
}
