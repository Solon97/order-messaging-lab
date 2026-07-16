# Deploy runbook — `order-service` on AWS

CDK app for the `aws-deploy` feature (`.specs/features/aws-deploy/`). Provisions 6 stacks —
`FoundationStack`, `NetworkStack`, `DatabaseStack`, `ComputeStack`, `BastionStack`, `EdgeStack` —
deployed in that order (see `bin/app.ts` and `.specs/features/aws-deploy/design.md` for the
dependency graph).

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

## 2. First deploy (manual, local credentials — infra only)

The GitHub Actions workflow (`.github/workflows/deploy.yml`) assumes IAM roles that
`FoundationStack` itself creates — it can't run before those roles exist. So a first, partial
`cdk deploy` is manual, from a local machine with AWS credentials. It only needs to cover the
slow-changing infra — `FoundationStack`, `NetworkStack`, `DatabaseStack` — not the application:

```sh
cd infra
npm ci
npx cdk deploy FoundationStack NetworkStack DatabaseStack --require-approval never
```

This provisions the two OIDC roles (`github-actions-order-service-ecr-push`,
`github-actions-cdk-deploy`) the workflow needs for every push to `main`, the VPC, and the RDS
Postgres instance (which alone can take 10-15 minutes to provision — doing it here keeps that time
off the CI critical path). `ComputeStack` and `EdgeStack` are *not* deployed yet: neither depends
on `DatabaseStack` in the other direction (see `bin/app.ts`), so this partial deploy is safe, and
CDK will treat these three stacks as no-ops on every later `cdk deploy --all` since nothing about
them changes.

Everything else — deploying the application and running database migrations — happens
automatically via CI from here on. Configure the pipeline (step 3 below) and push to `main`.

## 3. Configure the GitHub Actions deploy pipeline

`.github/workflows/deploy.yml` triggers on every push to `main`. IAM role names are deterministic
literals set by `FoundationStack` (`github-actions-order-service-ecr-push`,
`github-actions-cdk-deploy`), so the workflow builds their ARNs from the account ID rather than
requiring a manual lookup + repo variable per role:

| Secret/variable | Value | Source |
| --- | --- | --- |
| `AWS_ACCOUNT_ID` (secret) | the target AWS account ID | your account |
| `AWS_REGION` (repo variable) | target AWS region, e.g. `us-east-1` | your account's chosen deploy region |

Once those are set, every push to `main` runs `deploy.yml`:

1. `build-and-push` — app gate (lint/test/e2e), then builds and pushes the Docker image to ECR
   tagged with the commit SHA, and writes that tag to the `image-tag` SSM parameter
   `FoundationStack` created.
2. `deploy` — `cd infra && npx cdk deploy --all --require-approval never` (picking up the new image
   tag from SSM via `ComputeStack`; the first run here is what actually creates `ComputeStack` and
   `EdgeStack`), then runs the one-off database migration as an ECS task (see below).

## 4. Database migration (automated via CI)

`ComputeStack` provisions the ECS cluster (deterministic name `order-service-cluster`), task
definition (family `order-service`, container name `order-service`), and Fargate service, but does
**not** run TypeORM migrations as part of the service itself. Instead, `deploy.yml`'s `deploy` job
runs the migration as a one-off ECS task after every `cdk deploy --all`:

```sh
aws ecs run-task \
  --cluster order-service-cluster \
  --task-definition order-service \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[<private-subnet-id>],securityGroups=[<service-security-group-id>],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides":[{"name":"order-service","command":["node_modules/.bin/typeorm","migration:run","-d","dist/order/infrastructure/persistence/typeorm/data-source.js"]}]}'
```

The compiled `DataSource` lives at `dist/order/infrastructure/persistence/typeorm/data-source.js`
(exported as `AppDataSource` from `src/order/infrastructure/persistence/typeorm/data-source.ts`) —
`typeorm` is a runtime `dependency` in `package.json` (survives `npm ci --omit=dev` in the
production image), so `node_modules/.bin/typeorm` is present without any dev-only tooling. This
runs on every push — TypeORM migrations only apply pending ones, so it's safe to run repeatedly,
not just on first deploy.

Subnet ID and security group ID are read from `NetworkStack`/`ComputeStack`'s `CfnOutput`s via
`aws cloudformation describe-stacks` (see `deploy.yml`'s `migration-network` step) — the workflow's
`github-actions-cdk-deploy` role is scoped to exactly this: reading those two stacks' outputs and
running/describing this one task definition on this one cluster (see the `RunMigrationTask` inline
policy in `foundation-stack.ts`). Without this step succeeding, `/health` and `GET /orders/:id`
would fail against a Postgres instance with no schema (`/orders` responds `500` — accepted behavior
per the feature spec, not silently masked) — the workflow now fails the `deploy` job instead if the
migration task exits non-zero.

## 5. Acessando o banco da sua máquina local

O RDS Postgres (`DatabaseStack`) fica em subnet privada, sem IP público — não há como conectar nele
diretamente pela internet. Para debug/inspeção manual, `BastionStack` provisiona uma EC2 dentro da
VPC que serve de intermediária, alcançável via **AWS Systems Manager (SSM) Session Manager** — sem
SSH exposto, sem chave para gerenciar, controlado por permissões IAM. Veja o *porquê* completo em
[`docs/06-bastion-stack.md`](docs/06-bastion-stack.md).

Pré-requisitos: `BastionStack` já deployada, o [plugin de sessão do SSM](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html)
instalado localmente (`session-manager-plugin`), e credenciais AWS com permissão para
`ssm:StartSession` na instância.

`DatabaseStack` força SSL em toda conexão (`rds.force_ssl=1` no parameter group) — qualquer `psql`
abaixo precisa de `sslmode=require`, senão o RDS recusa a conexão.

Para debug/inspeção manual, use sempre o usuário `bastion_readonly` (só leitura), não o usuário
master `order_service` da aplicação — mantém acesso ad-hoc sem risco de alterar/derrubar dados por
engano. Veja o porquê em [`docs/03-database-stack.md`](docs/03-database-stack.md).

### Configuração única (uma vez por ambiente)

Isso **não é provisionado pelo CDK** — é uma recomendação operacional. Escolha uma senha própria
(gere localmente, ex. `openssl rand -base64 24`, e guarde onde sua equipe já guarda segredos
operacionais) e, depois do primeiro deploy da `DatabaseStack`, conecte uma vez como usuário master
(passos 1-2 abaixo, trocando `bastion_readonly` pelo secret do `order_service`) e rode:

```sql
CREATE USER bastion_readonly WITH PASSWORD '<sua senha>';
GRANT CONNECT ON DATABASE postgres TO bastion_readonly;
GRANT USAGE ON SCHEMA public TO bastion_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO bastion_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO bastion_readonly;
```

A última linha garante que tabelas criadas por migrations futuras também fiquem legíveis pro
`bastion_readonly`, sem precisar repetir o `GRANT` a cada migration.

### Uso do dia a dia

1. Pegue o ID da instância bastion (output `BastionInstanceId` da stack) e o endpoint do RDS (output
   da `DatabaseStack`, ou via console/`describe-db-instances`):

   ```sh
   aws cloudformation describe-stacks --stack-name BastionStack \
     --query "Stacks[0].Outputs[?OutputKey=='BastionInstanceId'].OutputValue" --output text

   aws rds describe-db-instances --db-instance-identifier <db-instance-id> \
     --query "DBInstances[0].Endpoint.Address" --output text
   ```

2. Abra o túnel de encaminhamento de porta (fica rodando em primeiro plano — deixe o terminal aberto
   enquanto usa a conexão):

   ```sh
   aws ssm start-session \
     --target <BastionInstanceId> \
     --document-name AWS-StartPortForwardingSessionToRemoteHost \
     --parameters '{"host":["<db-endpoint>"],"portNumber":["5432"],"localPortNumber":["5432"]}'
   ```

3. Conecte no banco via `localhost:5432` com `sslmode=require`, usando a senha do `bastion_readonly`
   escolhida na configuração única acima:

   ```sh
   psql "host=localhost port=5432 dbname=postgres user=bastion_readonly password=<sua senha> sslmode=require"
   ```

Encerre a sessão (`Ctrl+C` no terminal do `ssm start-session`) quando terminar — não há custo
contínuo além da própria instância bastion (`t4g.nano`) já rodando.
