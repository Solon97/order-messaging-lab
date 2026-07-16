import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { imageTagParameterName, serviceConfig } from './config';

// SPEC_DEVIATION: the GitHub org/repo owning this codebase is not yet fixed
// (no git remote configured at scaffold time). Update `githubOrg` before the
// first real `cdk deploy` — see infra/README.md.
const githubOrg = 'Solon97';
const githubRepo = 'order-messaging-lab';
const githubBranch = 'main';

// GitHub's OIDC `sub` claim can appear either in the plain form
// (`repo:ORG/REPO:ref:refs/heads/BRANCH`) or, when the org/repo has the
// "use immutable database IDs" subject-claim setting enabled, with the
// numeric org/repo IDs appended (`repo:ORG@id/REPO@id:ref:refs/heads/BRANCH`).
// Match both so the trust policy doesn't depend on that setting.
const githubSubClaimPatterns = [
  `repo:${githubOrg}/${githubRepo}:ref:refs/heads/${githubBranch}`,
  `repo:${githubOrg}@*/${githubRepo}@*:ref:refs/heads/${githubBranch}`,
];

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

    this.imageTagParameter = new ssm.StringParameter(
      this,
      'ImageTagParameter',
      {
        parameterName: imageTagParameterName,
        stringValue: 'latest',
      },
    );

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
            'token.actions.githubusercontent.com:sub': githubSubClaimPatterns,
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

    // Deterministic literal — see the matching `clusterName` in
    // compute-stack.ts.
    const clusterName = `${serviceConfig.serviceName}-cluster`;
    const clusterArn = `arn:aws:ecs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:cluster/${clusterName}`;

    new iam.Role(this, 'CdkDeployRole', {
      roleName: 'github-actions-cdk-deploy',
      assumedBy: new iam.WebIdentityPrincipal(
        githubOidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
          StringLike: {
            'token.actions.githubusercontent.com:sub': githubSubClaimPatterns,
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
        // Lets the `deploy` job read the ComputeStack/NetworkStack outputs
        // (cluster's SG, subnet) and run the one-off migration ECS task
        // after every `cdk deploy --all` — see .github/workflows/deploy.yml.
        RunMigrationTask: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['cloudformation:DescribeStacks'],
              resources: [
                `arn:aws:cloudformation:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:stack/ComputeStack/*`,
                `arn:aws:cloudformation:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:stack/NetworkStack/*`,
              ],
            }),
            new iam.PolicyStatement({
              actions: ['ecs:RunTask'],
              resources: [
                `arn:aws:ecs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:task-definition/${serviceConfig.serviceName}:*`,
              ],
              conditions: { ArnEquals: { 'ecs:cluster': clusterArn } },
            }),
            new iam.PolicyStatement({
              actions: ['ecs:DescribeTasks'],
              resources: [
                `arn:aws:ecs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:task/${clusterName}/*`,
              ],
            }),
            new iam.PolicyStatement({
              actions: ['iam:PassRole'],
              resources: ['*'],
              conditions: {
                StringEquals: {
                  'iam:PassedToService': 'ecs-tasks.amazonaws.com',
                },
              },
            }),
          ],
        }),
      },
    });
  }
}
