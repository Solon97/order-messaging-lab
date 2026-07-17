# Documentação da infra (CDK) — `order-messaging-lab`

Este diretório explica, stack por stack, o que a infra em AWS CDK (`infra/lib/*.ts`) provisiona e
por quê — pensado para quem sabe programar mas não tem muita bagagem de AWS/redes/infra. Se você já
conhece VPC, ECS, ALB etc., pode pular direto para o stack que te interessa.

## O que é uma "stack" aqui?

CDK (Cloud Development Kit) é uma forma de descrever infraestrutura AWS usando código (TypeScript,
no nosso caso) em vez de clicar no console ou escrever YAML/JSON de CloudFormation na mão. Uma
**stack** é uma unidade de deploy: um grupo de recursos AWS (bancos, redes, containers, etc.) que
sobe e desce junto. Quando você roda `npx cdk deploy`, o CDK traduz o código TypeScript em um
template do CloudFormation e pede pra AWS criar/atualizar os recursos descritos nele.

Este projeto tem **7 stacks**, deployadas nesta ordem (cada uma depende da anterior):

```
FoundationStack   → ECR (registro de imagens Docker) + parâmetro SSM + roles de CI/CD
NetworkStack      → VPC (a "rede privada" onde tudo mais vive)
AuthStack         → Cognito User Pool + Resource Server + App Client (autenticação M2M)
DatabaseStack     → instância RDS Postgres (depende da VPC)
ComputeStack      → cluster ECS + serviço Fargate rodando o container (depende de Foundation, Network, Database, Auth)
BastionStack      → EC2 + SSM Session Manager para acesso local ao banco (depende de Network, Database)
EdgeStack         → Application Load Balancer + API Gateway HTTP API (depende de Network, Auth)
```

A ordem de deploy está codificada em [`bin/app.ts`](../bin/app.ts) via `.addDependency(...)`. O CDK
respeita essa ordem automaticamente — você não precisa (e não deve) tentar deployar uma stack fora
de ordem manualmente.

### Por que dividir em 7 stacks em vez de uma só?

Cada stack tem um ciclo de vida diferente. Rede e banco de dados são coisas que você raramente
recria; o serviço de compute (containers) muda a cada deploy de aplicação. Separar em stacks permite
atualizar o `ComputeStack` (nova versão da imagem Docker) sem tocar em rede ou banco, e também limita
o "raio de explosão" — um erro num `cdk deploy` do Compute não arrisca derrubar a VPC ou o banco.
`AuthStack` segue o mesmo raciocínio: Cognito não vive na VPC nem depende do banco, então ganha uma
stack própria em vez de ser encaixado numa das existentes (ver [`07-auth-stack.md`](07-auth-stack.md)).

## Os arquivos

1. [`01-foundation-stack.md`](01-foundation-stack.md) — registro de imagens Docker (ECR) e como o
   GitHub Actions tem permissão pra publicar imagens e deployar, sem precisar de senhas/chaves
   fixas (OIDC).
2. [`02-network-stack.md`](02-network-stack.md) — a VPC: o que é uma rede privada na AWS, subnets
   públicas vs. privadas, por que isso importa.
3. [`03-database-stack.md`](03-database-stack.md) — a instância RDS Postgres, onde ela vive na rede,
   e como as credenciais são geridas.
4. [`04-compute-stack.md`](04-compute-stack.md) — o coração da aplicação: cluster ECS, Fargate,
   task definition, container, variáveis de ambiente e segredos.
5. [`05-edge-stack.md`](05-edge-stack.md) — como uma requisição HTTP externa chega até o container:
   API Gateway → VPC Link → Load Balancer → serviço.
6. [`06-bastion-stack.md`](06-bastion-stack.md) — a EC2 bastion e o SSM Session Manager: como
   conectar no banco (que não tem IP público) a partir da sua máquina local, sem SSH exposto.
7. [`07-auth-stack.md`](07-auth-stack.md) — Cognito User Pool, Resource Server e App Client: como a
   API autentica clientes de serviço (M2M, `client_credentials`) sem login de usuário final.

## Como as peças se conectam (visão de 1000 pés)

```
                 ┌───────────────────┐
                 │  Cognito           │  (AuthStack) — emite/valida JWT (client_credentials)
                 │  User Pool         │
                 └─────────▲─────────┘
                           │ 1. troca client_id/secret por JWT
                     Cliente de serviço
                           │ 2. Bearer JWT
                           ▼
                        Internet
                           │
                           ▼
                 ┌───────────────────┐
                 │  API Gateway      │  (EdgeStack) — endpoint público HTTPS
                 │  (HTTP API)       │  valida o JWT (HttpJwtAuthorizer) — 401 se inválido
                 └─────────┬─────────┘  + throttling (rate/burst) — 429 se exceder
                           │ via VPC Link (túnel privado)
                           ▼
                 ┌───────────────────┐
                 │  Load Balancer     │  (EdgeStack) — ALB **interno**, sem IP público
                 │  (ALB, porta 80)   │
                 └─────────┬─────────┘
                           │ roteia /orders* pro target group
                           ▼
                 ┌───────────────────┐
                 │  Fargate Service   │  (ComputeStack) — CognitoAuthGuard revalida o mesmo JWT
                 │  (order-service)   │  (2ª camada, independente da 1ª) — 401 se inválido
                 └─────────┬─────────┘
                           │ lê DATABASE_URL de um Secret
                           ▼
                 ┌───────────────────┐
                 │  RDS Postgres      │  (DatabaseStack) — sem IP público
                 └─────────▲─────────┘
                           │ porta 5432, só de quem estiver no SG liberado
                 ┌─────────┴─────────┐
                 │  EC2 Bastion       │  (BastionStack) — sem IP público, sem SSH exposto
                 └─────────▲─────────┘
                           │ túnel via SSM Session Manager (IAM, sem porta de entrada)
                     Sua máquina local

Tudo isso (Load Balancer, Fargate, RDS, Bastion) vive dentro da VPC (NetworkStack).
A imagem Docker do container vem do ECR (FoundationStack).
Cognito (AuthStack) é regional/global — não vive dentro da VPC.
```

Para o runbook de deploy passo a passo (bootstrap, primeiro deploy manual, migração do banco,
configuração do GitHub Actions), veja [`../README.md`](../README.md). Este `docs/` explica o *o quê*
e o *por quê* de cada stack; o `README.md` da raiz da infra explica o *como fazer* o deploy.
