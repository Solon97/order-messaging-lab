# EdgeStack

Arquivo: [`../lib/edge-stack.ts`](../lib/edge-stack.ts)

Esta é a "porta de entrada" da aplicação: onde uma requisição HTTP vinda da internet acaba chegando
até o container do `order-service`. Recebe `vpc` do `NetworkStack` e é conectada ao `ComputeStack`
depois de ambas existirem (veja o final de
[`04-compute-stack.md`](04-compute-stack.md) para o porquê dessa ordem).

## O caminho de uma requisição, em 3 saltos

```
Cliente HTTP → API Gateway (HTTP API) → VPC Link → Application Load Balancer → Fargate Service
```

Por que 3 componentes em vez de expor o Load Balancer direto pra internet? Porque o ALB aqui é
**interno** (sem IP público) — de propósito, veja a seção abaixo. O API Gateway é o único ponto que
efetivamente tem uma URL pública.

## Application Load Balancer (ALB) — interno, não voltado pra internet

```ts
this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
  vpc: props.vpc,
  internetFacing: false,
});
```

Um **Load Balancer** distribui requisições entre as réplicas saudáveis de um serviço (hoje só 1
réplica do `order-service`, mas o mecanismo é o mesmo mesmo com 1 só). `internetFacing: false` o
torna **interno**: ele não tem IP público, só é alcançável de dentro da VPC. Isso é uma decisão
deliberada de segurança — várias arquiteturas de referência colocam o ALB direto na internet; aqui
ele fica escondido atrás do API Gateway, reduzindo a superfície de ataque (o ALB não processa TLS
público nem fica exposto a scans/DDoS diretos da internet).

```ts
this.listener = this.loadBalancer.addListener('Listener', {
  port: 80,
  protocol: elbv2.ApplicationProtocol.HTTP,
  defaultAction: elbv2.ListenerAction.fixedResponse(404, { ... }),
});
```

Um **Listener** é a porta+protocolo em que o Load Balancer escuta (aqui, porta 80/HTTP — como o ALB
é interno e só falado via VPC Link, TLS termina antes, no API Gateway). O `defaultAction` é o que
responde quando nenhuma regra mais específica bate — aqui, um 404 simples. As regras específicas (as
que de fato mandam tráfego pro container) são adicionadas depois, por
`registerFargateServiceListener` (ver mais abaixo).

## API Gateway HTTP API — o endpoint público de verdade

```ts
this.httpApi = new apigwv2.HttpApi(this, 'HttpApi');
this.httpApi.addRoutes({
  path: `${serviceConfig.publicPath}/{proxy+}`,
  methods: [apigwv2.HttpMethod.ANY],
  integration: new HttpAlbIntegration('OrdersIntegration', this.listener, { vpcLink }),
});
```

**API Gateway** é um serviço gerenciado que expõe endpoints HTTP(S) públicos sem você precisar
gerenciar TLS, DNS, escala, etc. — a AWS cuida disso. A variante "HTTP API" (`apigwv2`) é a versão
mais simples/barata comparada à "REST API" mais antiga (`apigateway` v1), pensada exatamente pra
esse tipo de caso: proxyar requisições pra um backend.

- `path: '/orders/{proxy+}'` — `{proxy+}` é uma rota "curinga": casa com `/orders/qualquer/coisa`,
  e repassa o restante do caminho pro backend.
- Uma segunda rota cobre exatamente `/orders` (sem nada depois), pra não deixar esse caso de fora.
- `methods: [ANY]` — aceita qualquer verbo HTTP (GET, POST, etc.), deixando o roteamento por verbo a
  cargo da própria aplicação.

Repare que `serviceConfig.publicPath` (`/orders`, definido em
[`../lib/config.ts`](../lib/config.ts)) é o único lugar que precisa mudar se um dia você quiser expor
esse serviço num caminho diferente — tanto o API Gateway quanto as regras do Load Balancer
(`registerFargateServiceListener`, abaixo) leem do mesmo valor.

## VPC Link — a ponte entre o API Gateway (público) e o ALB (privado)

```ts
const vpcLink = new apigwv2.VpcLink(this, 'VpcLink', {
  vpc: props.vpc,
  securityGroups: [vpcLinkSecurityGroup],
});
```

Como o API Gateway roda fora da sua VPC (é um serviço totalmente gerenciado, multi-tenant da AWS),
ele normalmente não conseguiria enxergar recursos internos como um ALB privado. Um **VPC Link** é
exatamente essa ponte: um túnel gerenciado que permite ao API Gateway alcançar recursos dentro da
VPC sem que esses recursos precisem ser expostos publicamente. É o que viabiliza o desenho
"ALB interno, mas ainda assim acessível de fora via API Gateway".

O Security Group do VPC Link é propositalmente restrito:

```ts
vpcLinkSecurityGroup.addEgressRule(
  ec2.Peer.securityGroupId(this.loadBalancer.connections.securityGroups[0].securityGroupId),
  ec2.Port.tcp(80),
  'Allow VPC Link to reach the internal ALB listener only',
);
```

Só pode "sair" (egress) para o Security Group do próprio ALB, na porta 80 — não consegue alcançar
mais nada dentro da VPC (nem o banco, nem outra coisa). Least privilege de novo: o VPC Link só faz
uma coisa, então só tem permissão pra essa coisa.

## `registerFargateServiceListener` — como o container vira, de fato, o alvo do tráfego

```ts
public registerFargateServiceListener(config: FargateServiceListenerConfig): void {
  this.listener.addTargets('OrdersRoute', {
    priority: config.priority,
    conditions: [elbv2.ListenerCondition.pathPatterns([`${config.publicPath}*`])],
    port: config.containerPort,
    protocol: elbv2.ApplicationProtocol.HTTP,
    healthCheck: { path: config.healthCheckPath },
    targets: [config.service],
  });
}
```

Este método não é chamado dentro do construtor da própria stack — é chamado de fora, em
[`../bin/app.ts`](../bin/app.ts), depois que tanto `EdgeStack` quanto `ComputeStack` já existem:

```ts
edgeStack.registerFargateServiceListener(computeStack.listenerConfig);
```

`addTargets` cria, por trás dos panos, um **Target Group** (o registro do ALB de "quais instâncias
recebem tráfego") e uma regra de roteamento no listener: "requisições cujo path bate com `/orders*`
vão para a porta 3000 do serviço Fargate, e considere o serviço saudável enquanto `/health`
responder OK" (`healthCheck.path`). O ALB faz *health checks* periódicos nesse caminho — se o
container parar de responder `/health` corretamente, o ALB para de rotear tráfego pra ele
automaticamente, mesmo que o processo ainda esteja "rodando".

Essa chamada ficar em `bin/app.ts` (em vez de dentro de uma das duas stacks) é a solução para evitar
uma dependência circular entre `ComputeStack` e `EdgeStack` — a explicação completa do porquê está em
[`04-compute-stack.md`](04-compute-stack.md#listenerconfig-por-que-o-compute-não-conecta-direto-no-load-balancer).
