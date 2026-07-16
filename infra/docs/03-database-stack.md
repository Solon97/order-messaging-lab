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

## Migração de schema: por quê não é automática

Esta stack só cria a *instância* do banco — um Postgres vazio, sem nenhuma tabela. Rodar as
migrations (criar as tabelas da aplicação) é um passo manual separado, documentado no runbook
principal ([`../README.md`](../README.md), seção 3), executado como uma *one-off task* no ECS depois
do primeiro deploy do `ComputeStack`.
