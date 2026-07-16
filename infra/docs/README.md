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

Este projeto tem **5 stacks**, deployadas nesta ordem (cada uma depende da anterior):

```
FoundationStack   → ECR (registro de imagens Docker) + parâmetro SSM + roles de CI/CD
NetworkStack      → VPC (a "rede privada" onde tudo mais vive)
DatabaseStack     → instância RDS Postgres (depende da VPC)
ComputeStack      → cluster ECS + serviço Fargate rodando o container (depende de Foundation, Network, Database)
EdgeStack         → Application Load Balancer + API Gateway HTTP API (a porta de entrada pública)
```

A ordem de deploy está codificada em [`bin/app.ts`](../bin/app.ts) via `.addDependency(...)`. O CDK
respeita essa ordem automaticamente — você não precisa (e não deve) tentar deployar uma stack fora
de ordem manualmente.

### Por que dividir em 5 stacks em vez de uma só?

Cada stack tem um ciclo de vida diferente. Rede e banco de dados são coisas que você raramente
recria; o serviço de compute (containers) muda a cada deploy de aplicação. Separar em stacks permite
atualizar o `ComputeStack` (nova versão da imagem Docker) sem tocar em rede ou banco, e também limita
o "raio de explosão" — um erro num `cdk deploy` do Compute não arrisca derrubar a VPC ou o banco.

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

## Como as peças se conectam (visão de 1000 pés)

```
                        Internet
                           │
                           ▼
                 ┌───────────────────┐
                 │  API Gateway      │  (EdgeStack) — endpoint público HTTPS
                 │  (HTTP API)       │
                 └─────────┬─────────┘
                           │ via VPC Link (túnel privado)
                           ▼
                 ┌───────────────────┐
                 │  Load Balancer     │  (EdgeStack) — ALB **interno**, sem IP público
                 │  (ALB, porta 80)   │
                 └─────────┬─────────┘
                           │ roteia /orders* pro target group
                           ▼
                 ┌───────────────────┐
                 │  Fargate Service   │  (ComputeStack) — containers rodando a API
                 │  (order-service)   │
                 └─────────┬─────────┘
                           │ lê DATABASE_URL de um Secret
                           ▼
                 ┌───────────────────┐
                 │  RDS Postgres      │  (DatabaseStack) — sem IP público
                 └───────────────────┘

Tudo isso (Load Balancer, Fargate, RDS) vive dentro da VPC (NetworkStack).
A imagem Docker do container vem do ECR (FoundationStack).
```

Para o runbook de deploy passo a passo (bootstrap, primeiro deploy manual, migração do banco,
configuração do GitHub Actions), veja [`../README.md`](../README.md). Este `docs/` explica o *o quê*
e o *por quê* de cada stack; o `README.md` da raiz da infra explica o *como fazer* o deploy.
