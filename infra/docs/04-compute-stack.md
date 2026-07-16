# ComputeStack

Arquivo: [`../lib/compute-stack.ts`](../lib/compute-stack.ts)

Esta é a stack mais densa do projeto — é onde a aplicação (`order-service`) de fato roda. Recebe
props de **três** stacks diferentes: `vpc`/`repository`/`imageTagParameter` (Foundation/Network) e
`database`/`databaseSecurityGroup` (Database). Também expõe `listenerConfig`, consumido pelo
`EdgeStack` (veja a seção final).

## ECS e Fargate: os dois conceitos centrais

**ECS (Elastic Container Service)** é o serviço da AWS para rodar containers Docker de forma
orquestrada — parecido em objetivo ao Kubernetes, mas mais simples e nativo da AWS. Um **Cluster**
ECS é só um agrupamento lógico de "onde meus serviços rodam"; não é uma máquina em si.

```ts
this.cluster = new ecs.Cluster(this, 'Cluster', {
  vpc: props.vpc,
  containerInsightsV2: ecs.ContainerInsights.ENABLED,
});
```

`containerInsightsV2: ENABLED` liga métricas detalhadas (CPU, memória, rede por container) no
CloudWatch — útil pra debugar performance depois.

**Fargate** é o modo "serverless" de rodar containers no ECS: você não gerencia servidores EC2 por
trás — só diz "quero rodar este container, com essa CPU/memória", e a AWS cuida de onde ele roda
fisicamente. É o modo mais simples de começar (a alternativa, EC2 launch type, exige você gerenciar
as instâncias que hospedam os containers).

## Task Definition: a "receita" do container

```ts
const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
  family: serviceConfig.serviceName,
  cpu: serviceConfig.cpu,           // 512 = 0.5 vCPU
  memoryLimitMiB: serviceConfig.memoryLimitMiB,  // 1024 = 1 GiB
});
```

Uma **Task Definition** é um template que descreve como rodar um ou mais containers juntos: qual
imagem, quanta CPU/memória, quais variáveis de ambiente, portas, logs. Ela não roda nada sozinha —
é a "planta baixa"; quem efetivamente coloca instâncias dela rodando é o **Service** (mais abaixo).
Os valores `cpu`/`memoryLimitMiB` vêm centralizados de [`../lib/config.ts`](../lib/config.ts).

### A imagem: como o container sabe qual versão rodar

```ts
const imageTag = ssm.StringParameter.valueForStringParameter(this, imageTagParameterName);

const container = taskDefinition.addContainer(serviceConfig.serviceName, {
  image: ecs.ContainerImage.fromEcrRepository(props.repository, imageTag),
  ...
});
```

Lembra do parâmetro SSM criado em `FoundationStack` (ver
[`01-foundation-stack.md`](01-foundation-stack.md))? É aqui que ele é lido: o valor "tag da imagem
atual" (escrito pelo pipeline de CI toda vez que builda uma imagem nova) é buscado do SSM em tempo
de synth/deploy do CDK, e usado para montar a referência da imagem no ECR. Isso é o que permite ao
GitHub Actions "trocar a versão em produção" sem precisar editar código do CDK — só escreve um novo
valor no parâmetro e roda `cdk deploy` de novo.

> Nota técnica: o código usa o nome literal do parâmetro (`imageTagParameterName`, uma string fixa)
> em vez do `props.imageTagParameter.parameterName` recebido do `FoundationStack`. Isso é intencional
> — quando uma stack recebe uma referência de outra, o CDK entrega um "token" que só resolve de
> verdade no CloudFormation, mas `valueForStringParameter` precisa montar o ARN do parâmetro *durante
> o synth*, então precisa do nome já conhecido como string literal.

### Logs

```ts
logging: ecs.LogDrivers.awsLogs({
  streamPrefix: serviceConfig.serviceName,
  logGroup: new logs.LogGroup(this, 'LogGroup', {
    logGroupName: `/ecs/${serviceConfig.serviceName}`,
    retention: logs.RetentionDays.ONE_MONTH,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  }),
}),
```

Tudo que o container escreve em `stdout`/`stderr` vai parar automaticamente no **CloudWatch Logs**,
num log group `/ecs/order-service`, retido por 1 mês. Isso é o equivalente gerenciado de "olhar os
logs do container" sem precisar entrar na máquina.

### Variáveis de ambiente vs. segredos

```ts
environment: { PORT: String(serviceConfig.containerPort) },
secrets: { DATABASE_URL: ecs.Secret.fromSecretsManager(databaseUrlSecret) },
```

`environment` é configuração não sensível, injetada em texto plano na task definition — visível pra
quem tiver acesso de leitura ao ECS. `secrets` é diferente: o **valor nunca aparece na task
definition nem nos logs do CloudFormation** — o ECS injeta a variável de ambiente `DATABASE_URL`
dentro do container só no momento em que ele inicia, buscando o valor direto do Secrets Manager. É
assim que uma connection string com senha chega até o container sem nunca ter sido escrita em texto
plano em nenhum lugar visível.

A `databaseUrlSecret` é montada nesta própria stack, concatenando usuário/senha/host/porta do banco
(vindos do `Secret` gerado automaticamente pelo RDS no `DatabaseStack`) numa URL `postgresql://...`
— e essa URL concatenada vira, ela mesma, um novo Secret no Secrets Manager.

## Rede: quem pode falar com o container, e com quem ele pode falar

```ts
const serviceSecurityGroup = new ec2.SecurityGroup(this, 'ServiceSecurityGroup', {
  vpc: props.vpc,
  allowAllOutbound: true,
});

serviceSecurityGroup.addIngressRule(
  ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
  ec2.Port.tcp(serviceConfig.containerPort),
);

props.databaseSecurityGroup.addIngressRule(
  serviceSecurityGroup,
  ec2.Port.tcp(5432),
  'Allow order-service Fargate tasks to reach Postgres',
);
```

Duas regras de Security Group (conceito explicado em
[`02-network-stack.md`](02-network-stack.md)):

1. O container aceita conexões na sua porta (3000) vindas de **qualquer coisa dentro da VPC**
   (`vpcCidrBlock` = o range de IP inteiro da VPC) — isso é o que permite o Load Balancer do
   `EdgeStack` alcançá-lo, sem abrir a porta pra internet.
2. O banco (Security Group criado no `DatabaseStack`) passa a aceitar conexões na porta 5432
   **especificamente vindas do Security Group do container** — não de qualquer IP da VPC, só desse
   grupo específico. Essa regra é adicionada aqui (não no `DatabaseStack`) porque só neste ponto o
   Security Group do container já existe.

## O Service: quem efetivamente roda a task definition

```ts
this.service = new ecs.FargateService(this, 'Service', {
  cluster: this.cluster,
  taskDefinition,
  desiredCount: serviceConfig.desiredCount,   // 1
  securityGroups: [serviceSecurityGroup],
  circuitBreaker: { enable: true, rollback: true },
});
```

Um **Service** ECS garante que sempre haja `desiredCount` instâncias saudáveis da task definition
rodando — se um container cair, o Service sobe outro automaticamente. `desiredCount: 1` significa
"mantenha sempre 1 réplica rodando" (adequado pra lab; produção normalmente usaria 2+ para tolerar
falhas e fazer deploy sem downtime).

`circuitBreaker: { enable: true, rollback: true }` é uma proteção de deploy: se uma nova versão da
task definition falhar repetidamente ao subir (ex: crash loop), o ECS detecta isso e reverte
automaticamente para a versão anterior estável, em vez de ficar tentando pra sempre.
