# BastionStack

Arquivo: [`../lib/bastion-stack.ts`](../lib/bastion-stack.ts)

## Pra que serve

O RDS Postgres (`DatabaseStack`) fica em subnet privada, sem IP público — de propósito, veja
[`03-database-stack.md`](03-database-stack.md). Isso significa que **nada fora da VPC** consegue
falar com o banco diretamente, nem você da sua máquina local. O `BastionStack` existe só pra abrir
uma exceção controlada a essa regra: uma forma de você, com credenciais AWS válidas, alcançar o
banco pontualmente (debug, inspecionar dados, rodar uma query manual) sem expor o Postgres à
internet.

## O que ela provisiona

1. Uma instância **EC2** (`t4g.nano`, Amazon Linux 2023 ARM) na subnet privada da VPC — sem IP
   público.
2. Uma **IAM Role** anexada à instância com a managed policy `AmazonSSMManagedInstanceCore`, que
   permite ao AWS Systems Manager (SSM) Agent (já embutido na AMI) se comunicar com a AWS.
3. Um **Security Group** próprio para a instância, sem nenhuma regra de entrada e com egress
   restrito a só o necessário (veja abaixo).
4. Uma regra de **ingress no `databaseSecurityGroup`** liberando a porta 5432 só para esse Security
   Group.

Recebe `vpc` e `databaseSecurityGroup` de fora (veja [`../bin/app.ts`](../bin/app.ts)) — por isso
depende de `NetworkStack` e `DatabaseStack`.

## Por que EC2 + SSM em vez de SSH tradicional

Um "bastion" ou "jump host" clássico é uma EC2 com IP público, porta 22 (SSH) aberta, e uma chave
`.pem` que você guarda e distribui. Isso tem dois problemas: a porta 22 fica exposta na internet
(alvo de scanners/brute-force), e a chave SSH precisa ser gerenciada e revogada manualmente.

O **AWS Systems Manager Session Manager** resolve isso de outro jeito: o SSM Agent, rodando dentro
da instância, abre uma conexão *de saída* para a AWS (não precisa de porta de entrada nenhuma). Você
inicia a sessão do seu lado usando suas credenciais IAM, e a AWS faz a ponte. Resultado:

- Nenhuma porta de entrada aberta no Security Group da bastion (`SecurityGroupIngress: []`).
- Nenhuma chave SSH para gerenciar — o controle de acesso é feito por política IAM.
- Toda sessão fica registrada (CloudTrail), com quem abriu e quando.

## Security Group: egress mínimo, não `allowAllOutbound`

```ts
const securityGroup = new ec2.SecurityGroup(this, 'BastionSecurityGroup', {
  vpc: props.vpc,
  allowAllOutbound: false,
});

securityGroup.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Allow HTTPS to SSM endpoints');
securityGroup.addEgressRule(props.databaseSecurityGroup, ec2.Port.tcp(5432), 'Allow Postgres to the RDS instance');
```

A instância só precisa de saída para dois destinos: HTTPS (443), usado pelo SSM Agent para falar
com os endpoints da AWS (`ssm`, `ssmmessages`, `ec2messages`), e Postgres (5432), para o próprio
túnel até o RDS. `allowAllOutbound: false` + essas duas regras explícitas é o mesmo princípio de
*least privilege* aplicado em [`03-database-stack.md`](03-database-stack.md) — a bastion não tem
motivo pra falar com mais nada.

## Como usar (da sua máquina local)

Veja o passo a passo completo no runbook principal: [`../README.md`](../README.md), seção "Acessando
o banco da sua máquina local".
