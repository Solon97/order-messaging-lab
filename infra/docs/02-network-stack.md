# NetworkStack

Arquivo: [`../lib/network-stack.ts`](../lib/network-stack.ts)

## O que ela provisiona

Uma única coisa: uma **VPC** (`ec2.Vpc`), com no máximo 2 *Availability Zones* (`maxAzs: 2`). É a
stack mais curta do projeto (15 linhas), mas é a base de tudo que roda "dentro" da rede: banco de
dados, containers, load balancer.

```ts
this.vpc = new ec2.Vpc(this, 'Vpc', { maxAzs: 2 });
```

## O que é uma VPC, de fato

VPC = **Virtual Private Cloud**. Pense nela como a sua própria rede local isolada dentro da AWS —
o equivalente "na nuvem" de montar uma rede privada num datacenter físico, com seus próprios
intervalos de IP, sem exposição direta à internet a menos que você explicitamente permita.

Toda conta AWS pode ter várias VPCs, e cada recurso "de rede" (banco de dados, container, load
balancer, etc.) precisa viver dentro de alguma VPC. Neste projeto só existe uma, e ela é
compartilhada por `DatabaseStack`, `ComputeStack` e `EdgeStack` (repare que os três recebem
`vpc: networkStack.vpc` como prop em [`../bin/app.ts`](../bin/app.ts)).

## Availability Zones (AZs)

Uma *Availability Zone* é, na prática, um datacenter (ou conjunto de datacenters) fisicamente
separado dentro da mesma região AWS (ex: `us-east-1a`, `us-east-1b`). Espalhar recursos por 2+ AZs
significa que se uma delas tiver um problema (falta de energia, rede, etc.), a aplicação continua
rodando na outra. `maxAzs: 2` diz ao CDK "monte essa VPC usando até 2 zonas de disponibilidade" — é
o mínimo recomendado pra ter alguma redundância real.

## Subnets: pública vs. privada (o conceito mais importante desse stack)

Quando o CDK cria uma `ec2.Vpc` com as configurações default, ele automaticamente particiona a rede
em **subnets** (sub-redes) dentro de cada AZ, tipicamente em duas categorias:

- **Subnet pública**: tem uma rota direta para a internet (via um *Internet Gateway*). Qualquer coisa
  aqui *pode* ter um IP público. Normalmente é onde ficam load balancers voltados pra internet, NAT
  gateways, etc.
- **Subnet privada** (`PRIVATE_WITH_EGRESS`, usada pelo `DatabaseStack`): **não tem IP público** nem
  é alcançável diretamente da internet, mas consegue iniciar conexões *saindo* para a internet
  (ex: para baixar atualizações) através de um *NAT Gateway* que fica na subnet pública. "Egress" =
  saída. Ou seja: ninguém de fora consegue bater na porta dessa subnet, mas recursos dentro dela
  conseguem, por exemplo, acessar uma API externa.

Neste projeto:
- O **RDS Postgres** (`DatabaseStack`) roda em subnet privada — nunca deve ser alcançável
  diretamente da internet.
- O **Application Load Balancer** (`EdgeStack`) é criado com `internetFacing: false`, então mesmo
  ele fica numa posição "interna" da VPC (mais detalhes em
  [`05-edge-stack.md`](05-edge-stack.md)) — só é alcançável via API Gateway, nunca diretamente.

Isso segue o princípio de **defesa em profundidade**: mesmo que alguém descubra o endereço interno do
banco ou do load balancer, eles simplesmente não são roteáveis a partir da internet pública.

## Security Groups (mencionados nos outros stacks, mas o conceito nasce aqui)

Dentro da VPC, cada recurso de rede (banco, container, load balancer) tem um ou mais **Security
Groups** — um firewall com estado, associado ao recurso, que define quem pode falar com quem em
quais portas. Diferente de uma ACL de subnet (que é por sub-rede inteira), o Security Group é por
recurso individual. Você vai ver Security Groups sendo criados e conectados entre si em
[`03-database-stack.md`](03-database-stack.md), [`04-compute-stack.md`](04-compute-stack.md) e
[`05-edge-stack.md`](05-edge-stack.md) — a rede em si (esta stack) só fornece o "terreno"; quem
decide as regras de quem-fala-com-quem são os outros stacks.

## Por que essa stack não depende de nenhuma outra

Assim como `FoundationStack`, `NetworkStack` não recebe props de nenhuma outra stack — ela é pura
infraestrutura de rede, sem opinião sobre o que vai rodar dentro dela. Todas as outras 3 stacks
(exceto `FoundationStack`) dependem dela porque todas precisam de uma VPC pra existir.
