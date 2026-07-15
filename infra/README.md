# Deploy runbook — `order-service` on AWS

CDK app for the `aws-deploy` feature (`.specs/features/aws-deploy/`). Provisions 5 stacks —
`FoundationStack`, `NetworkStack`, `DatabaseStack`, `ComputeStack`, `EdgeStack` — deployed in that
order (see `bin/app.ts` and `.specs/features/aws-deploy/design.md` for the dependency graph).

## Useful commands

* `npm run build` compile typescript to js
* `npm run test` run the CDK stack unit tests (`Template.fromStack` assertions)
* `npx cdk synth` emit the synthesized CloudFormation templates
* `npx cdk diff` compare deployed stacks with current state
* `npx cdk deploy --all` deploy all 5 stacks to the default AWS account/region

## 1. Prerequisites

1. An AWS account with credentials configured locally (`aws configure` or equivalent) — used only
   for the one-off manual bootstrap and first deploy below. Ongoing deploys run via GitHub Actions
   OIDC, not local credentials.
2. Bootstrap the CDK toolkit stack in the target account/region (one-time per account/region):

   ```sh
   npx cdk bootstrap aws://<ACCOUNT_ID>/<REGION>
   ```

3. A GitHub OIDC identity provider (`token.actions.githubusercontent.com`) must already exist in
   the account — `FoundationStack` references it by ARN but does not create it
   (`arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com`). Create it once
   via the IAM console/CLI if the account doesn't have it yet:

   ```sh
   aws iam create-open-id-connect-provider \
     --url https://token.actions.githubusercontent.com \
     --client-id-list sts.amazonaws.com \
     --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
   ```

4. Before the first deploy, update `githubOrg` in `infra/lib/foundation-stack.ts` — it's set to the
   placeholder `REPLACE_WITH_GITHUB_ORG` until the repo's real GitHub org/user is known. This value
   scopes the OIDC trust policy's `sub` condition (`repo:<org>/order-messaging-lab:ref:refs/heads/main`)
   for both IAM roles `FoundationStack` creates.

## 2. First deploy (manual, local credentials)

The GitHub Actions workflow (`.github/workflows/deploy.yml`) assumes IAM roles that
`FoundationStack` itself creates — it can't run before those roles exist. So the first
`cdk deploy --all` is manual, from a local machine with AWS credentials:

```sh
cd infra
npm ci
npx cdk deploy --all --require-approval never
```

This provisions all 5 stacks, including the two OIDC roles
(`github-actions-order-service-ecr-push`, `github-actions-cdk-deploy`) the workflow needs for every
subsequent push to `main`.

## 3. One-off database migration

`ComputeStack` provisions the ECS cluster, task definition (family `order-service`, container name
`order-service`), and Fargate service, but does **not** run TypeORM migrations automatically. Before
the first request hits `/orders`, run the migration once as a one-off ECS task, overriding the
container's default command:

```sh
aws ecs run-task \
  --cluster <ComputeStack ECS cluster name — see CDK deploy output or `aws ecs list-clusters`> \
  --task-definition order-service \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[<private-subnet-id>],securityGroups=[<service-security-group-id>],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides":[{"name":"order-service","command":["node_modules/.bin/typeorm","migration:run","-d","dist/order/infrastructure/persistence/typeorm/data-source.js"]}]}'
```

The compiled `DataSource` lives at `dist/order/infrastructure/persistence/typeorm/data-source.js`
(exported as `AppDataSource` from `src/order/infrastructure/persistence/typeorm/data-source.ts`) —
`typeorm` is a runtime `dependency` in `package.json` (survives `npm ci --omit=dev` in the
production image), so `node_modules/.bin/typeorm` is present without any dev-only tooling.

Subnet ID, security group ID, and cluster name are all outputs of `NetworkStack`/`ComputeStack` —
read them from `cdk deploy`'s console output, or `aws cloudformation describe-stacks` after
deploy. Without this step, `/health` and `GET /orders/:id` will fail against a Postgres instance
with no schema (`/orders` responds `500` — accepted behavior per the feature spec, not silently
masked).

## 4. Configure the GitHub Actions deploy pipeline

`.github/workflows/deploy.yml` triggers on every push to `main` and reads two role ARNs from
**repository variables** (Settings → Secrets and variables → Actions → Variables) — never
hardcoded in the workflow:

| Repo variable | Value | Source |
| --- | --- | --- |
| `ECR_PUSH_ROLE_ARN` | ARN of `github-actions-order-service-ecr-push` | `FoundationStack` output (after step 2's manual deploy) |
| `CDK_DEPLOY_ROLE_ARN` | ARN of `github-actions-cdk-deploy` | `FoundationStack` output (after step 2's manual deploy) |
| `AWS_REGION` | target AWS region, e.g. `us-east-1` | your account's chosen deploy region |

Look up the two role ARNs after the manual deploy in step 2:

```sh
aws iam get-role --role-name github-actions-order-service-ecr-push --query Role.Arn --output text
aws iam get-role --role-name github-actions-cdk-deploy --query Role.Arn --output text
```

Once the three repo variables are set, every push to `main` runs `deploy.yml`: `build-and-push`
(app gate — lint/test/e2e — then builds and pushes the Docker image to ECR tagged with the commit
SHA, writes that tag to the `image-tag` SSM parameter `FoundationStack` created) followed by
`deploy` (`cd infra && npx cdk deploy --all --require-approval never`, picking up the new image tag
from SSM via `ComputeStack`).
