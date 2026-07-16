# FoundationStack

Arquivo: [`../lib/foundation-stack.ts`](../lib/foundation-stack.ts)

## O que ela provisiona

1. Um **repositório ECR** (`ecr.Repository`) — onde as imagens Docker do `order-service` ficam
   guardadas.
2. Um **parâmetro SSM** (`ssm.StringParameter`) guardando qual tag de imagem Docker está "atual".
3. Duas **IAM Roles** que o GitHub Actions assume via **OIDC**, sem usar chaves de acesso fixas:
   - `github-actions-order-service-ecr-push` — permissão pra publicar imagens no ECR e escrever o
     parâmetro SSM acima.
   - `github-actions-cdk-deploy` — permissão pra assumir as roles internas que o CDK usa pra
     deployar (bootstrap roles), ou seja, permissão pra rodar `cdk deploy`.

## Conceitos AWS usados aqui

### ECR (Elastic Container Registry)

É basicamente um "Docker Hub privado" dentro da sua conta AWS. Em vez de publicar a imagem do
`order-service` no Docker Hub, o pipeline de CI publica nesse repositório ECR, e o `ComputeStack`
(veja [`04-compute-stack.md`](04-compute-stack.md)) puxa a imagem de lá para rodar no ECS.

- `imageTagMutability: IMMUTABLE` — uma vez que você publica uma tag (ex: o SHA do commit), ela não
  pode ser sobrescrita. Isso evita o bug clássico de "alguém fez push da tag `latest` de novo e
  ninguém sabe qual código está rodando".
- `emptyOnDelete: true` + `removalPolicy: DESTROY` — se você derrubar essa stack (`cdk destroy`), o
  repositório e as imagens dentro dele são apagados também. Isso é aceitável aqui porque é um
  ambiente de laboratório; num projeto de produção você normalmente manteria o registro mesmo que
  destruísse o resto.

### SSM Parameter Store

É um key-value store simples e gratuito da AWS pra guardar configuração (não segredos sensíveis —
para isso existe o Secrets Manager, usado no `DatabaseStack`/`ComputeStack`). Aqui ele guarda **qual
tag de imagem Docker** deve ser usada (ex: `abc1234`, o SHA de um commit). O pipeline de CI escreve
nesse parâmetro toda vez que builda uma imagem nova; o `ComputeStack` lê esse valor no momento do
deploy pra saber qual imagem colocar no container. É assim que "buildar uma imagem nova" e "fazer
deploy dela" ficam desacoplados sem precisar hardcodar a tag em lugar nenhum.

### IAM Roles e OIDC (por que não usar Access Key/Secret Key?)

Historicamente, dar ao GitHub Actions permissão pra mexer na sua conta AWS significava criar um
usuário IAM com uma Access Key/Secret Key fixa e colar isso como secret no GitHub. O problema: essas
chaves não expiram sozinhas, e se vazarem, alguém tem acesso permanente à sua conta.

**OIDC (OpenID Connect)** resolve isso de um jeito mais seguro: o GitHub Actions gera um token de
identidade de curta duração (só vale durante aquele workflow) provando "eu sou o workflow X, rodando
no branch Y, do repositório Z". A AWS confia nesse token porque existe um **OIDC Identity Provider**
(`token.actions.githubusercontent.com`) configurado na conta, e as roles acima só aceitam ("trust")
tokens que batem com um repo/branch específico:

```ts
StringLike: {
  'token.actions.githubusercontent.com:sub': `repo:${githubOrg}/${githubRepo}:ref:refs/heads/${githubBranch}`,
},
```

Ou seja: só o workflow rodando no branch `main` do repo `<githubOrg>/order-messaging-lab` pode
assumir essas roles — nenhuma chave fixa, nenhum secret de longa duração pra vazar. Isso é o padrão
recomendado hoje em dia para CI/CD na AWS.

> ⚠️ **Atenção**: `githubOrg` está com o valor placeholder `REPLACE_WITH_GITHUB_ORG` até o repositório
> real ser conhecido. Sem trocar esse valor antes do primeiro deploy, o GitHub Actions não vai
> conseguir assumir nenhuma das duas roles (o `sub` do token não vai bater com o trust policy). Veja
> o passo 1.4 do runbook em [`../README.md`](../README.md).

### "Bootstrap roles" do CDK — o que são?

Quando você roda `cdk bootstrap` numa conta/região pela primeira vez, o CDK cria um pequeno conjunto
de roles próprias (`cdk-hnb659fds-*`) que ele usa internamente pra: subir assets (imagens, arquivos)
pro S3/ECR, e aplicar o CloudFormation em si. A role `github-actions-cdk-deploy` criada aqui não faz
o deploy diretamente — ela tem permissão apenas para **assumir** essas roles de bootstrap, que são
quem de fato tem permissão de escrever recursos na conta. É uma camada extra de indireção que segue
o mesmo modelo de "least privilege" (dar só a permissão mínima necessária).

## Por que essa stack não depende de nenhuma outra

`FoundationStack` não recebe nenhum parâmetro de outra stack (veja em
[`../bin/app.ts`](../bin/app.ts) que ela é instanciada sem `props`). Ela existe antes de tudo porque
o pipeline de CI (que builda e publica imagens) precisa dessas roles/repositório mesmo antes do
banco ou da rede existirem.
