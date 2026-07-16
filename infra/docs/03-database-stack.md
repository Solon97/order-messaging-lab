# DatabaseStack

Arquivo: [`../lib/database-stack.ts`](../lib/database-stack.ts)

## O que ela provisiona

1. Um **Security Group** dedicado ao banco (`databaseSecurityGroup`), sem regras de saída por
   padrão (`allowAllOutbound: false`).
2. Uma **instância RDS Postgres** (`rds.DatabaseInstance`), versão 16, rodando na subnet privada da
   VPC recebida como prop, com credenciais geradas automaticamente.

Recebe `vpc: networkStack.vpc` de fora (veja [`../bin/app.ts`](../bin/app.ts)) — por isso depende do
`NetworkStack`.

## RDS: o que é e por que usar em vez de rodar Postgres você mesmo

**RDS (Relational Database Service)** é o serviço de banco de dados gerenciado da AWS. Em vez de você
subir uma VM, instalar o Postgres, cuidar de patches de segurança, backups, etc., a AWS cuida da
parte operacional — você define o motor (`postgres`), a versão, o tamanho da máquina, e a AWS
provisiona, monitora e mantém isso rodando.

```ts
engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
```

`T4G.MICRO` é uma instância pequena e barata (arquitetura ARM/Graviton) — adequada para um ambiente
de laboratório/dev, não para produção com carga real.

## Rede: por que o banco fica em subnet privada

```ts
vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
```

Isso diz ao CDK "coloque esse banco só nas subnets privadas da VPC" (ver conceito de subnet pública
vs. privada em [`02-network-stack.md`](02-network-stack.md)). Um banco de dados **nunca** deveria ter
IP público — não existe um cenário legítimo em que a internet precise falar diretamente com o
Postgres. Só a aplicação (`ComputeStack`) deve alcançá-lo, e só através da rede interna da VPC.

## Security Group: o firewall do banco

```ts
this.databaseSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
  vpc: props.vpc,
  allowAllOutbound: false,
});
```

Por padrão, um Security Group da AWS permite todo tráfego de **saída** (egress) e bloqueia todo
tráfego de **entrada** (ingress) até você adicionar regras explícitas. Aqui, `allowAllOutbound:
false` desliga até a saída — o banco não deveria precisar iniciar conexões pra lugar nenhum, então
zero regras de saída é o comportamento mais restritivo possível (*least privilege*).

Repare que este stack **não adiciona nenhuma regra de entrada aqui**. Quem adiciona é o
`ComputeStack`, que — depois que a VPC do container e do banco já existem — chama:

```ts
props.databaseSecurityGroup.addIngressRule(
  serviceSecurityGroup,
  ec2.Port.tcp(5432),
  'Allow order-service Fargate tasks to reach Postgres',
);
```

Ou seja: "aceite conexões na porta 5432 (Postgres), mas *só* vindas de quem estiver no Security Group
do serviço Fargate". Isso é o Security Group funcionando como controle de acesso baseado em
identidade de rede — não é "libere esse range de IP", é "libere esse grupo específico de recursos".
Veja mais em [`04-compute-stack.md`](04-compute-stack.md).

## Credenciais: `fromGeneratedSecret`

```ts
credentials: rds.Credentials.fromGeneratedSecret('order_service'),
```

Em vez de você escrever uma senha no código (nunca faça isso!), o CDK pede pro RDS gerar uma senha
aleatória forte e guardá-la automaticamente no **AWS Secrets Manager** — um cofre de segredos gerido
pela AWS, com rotação e controle de acesso via IAM. O `order_service` aqui é o nome do usuário mestre
do banco.

O `ComputeStack` acessa esse segredo (via `props.database.secret`) para montar a `DATABASE_URL` que
o container usa — veja [`04-compute-stack.md`](04-compute-stack.md) para o detalhe de como isso é
passado ao container sem nunca aparecer em texto plano em lugar nenhum do código.

## `removalPolicy: DESTROY`

```ts
removalPolicy: cdk.RemovalPolicy.DESTROY,
```

Se você rodar `cdk destroy`, o banco (com todos os dados!) é apagado junto — sem snapshot final,
sem proteção contra remoção acidental. Isso é aceitável **só** porque este é um ambiente de
laboratório/demo. Num projeto real com dados de produção, você normalmente usaria
`RemovalPolicy.SNAPSHOT` ou `RETAIN`.

## SSL forçado: `rds.force_ssl`

```ts
const parameterGroup = new rds.ParameterGroup(this, 'ParameterGroup', {
  engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
  parameters: { 'rds.force_ssl': '1' },
});
```

Um **parameter group** é a forma de configurar parâmetros do motor do banco (equivalente ao
`postgresql.conf`) via CDK/CloudFormation em vez de editar arquivo de configuração na instância.
`rds.force_ssl=1` faz o Postgres recusar qualquer conexão que não negocie TLS — sem isso, nada
impede um cliente (por exemplo, um `psql` manual através do túnel do `BastionStack`, veja
[`06-bastion-stack.md`](06-bastion-stack.md)) de conversar com o banco em texto plano dentro da VPC.
Com essa flag, toda conexão — da aplicação ou de um humano via bastion — precisa de `sslmode=require`
(ou equivalente), senão o RDS derruba a conexão.

## Recomendação: um segundo usuário, só leitura, para acesso manual

O usuário master (`order_service`) usado pela aplicação tem privilégio total (DDL, escrita, tudo).
Reaproveitar essas credenciais para debug manual via `BastionStack` significa que qualquer sessão
manual roda com poder de superusuário — um erro de digitação num `UPDATE`/`DELETE` sem `WHERE` teria
o mesmo alcance de um bug de aplicação.

Este stack **não provisiona** esse segundo usuário — não há SQL nem secret gerado pelo CDK para
isso. É uma recomendação operacional: crie manualmente, uma vez por ambiente, um usuário Postgres
`bastion_readonly` com uma senha própria (sua, não gerenciada pelo CDK) e privilégio só de
`SELECT`. Veja o passo a passo em [`../README.md`](../README.md), seção "Acessando o banco da sua
máquina local". Depois desse passo único, todo acesso manual via bastion deveria usar
`bastion_readonly`, nunca o usuário master.

## Migração de schema: por quê não é automática na própria stack

Esta stack só cria a *instância* do banco — um Postgres vazio, sem nenhuma tabela. Rodar as
migrations (criar as tabelas da aplicação) não faz parte do CloudFormation da stack: é uma
*one-off task* no ECS, documentada no runbook principal ([`../README.md`](../README.md), seção 4) e
automatizada no `deploy.yml` — roda a cada push em `main`, depois de todo `cdk deploy --all`.
