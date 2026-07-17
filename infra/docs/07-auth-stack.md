# AuthStack

Arquivo: [`../lib/auth-stack.ts`](../lib/auth-stack.ts)

Esta stack provisiona a autenticação **machine-to-machine (M2M)** da API: nenhum login de usuário
final, nenhuma hosted UI — só um jeito de um cliente de serviço (outro backend, um script, um job)
provar "eu sou um chamador autorizado" antes de bater em `/orders`. Não depende de VPC nem de banco
— Cognito é um serviço regional/global da AWS, não vive dentro de uma rede privada seu.

## Os 3 recursos que ela cria

```ts
this.userPool = new cognito.UserPool(this, 'UserPool', {
  userPoolName: `${serviceConfig.serviceName}-users`,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});

const accessScope = new cognito.ResourceServerScope({
  scopeName: 'access',
  scopeDescription: 'Catch-all access scope for M2M clients',
});

const resourceServer = this.userPool.addResourceServer('ResourceServer', {
  identifier: this.resourceServerIdentifier, // 'order-service'
  scopes: [accessScope],
});

this.userPoolClient = this.userPool.addClient('ServiceClient', {
  generateSecret: true,
  oAuth: {
    flows: { clientCredentials: true },
    scopes: [cognito.OAuthScope.resourceServer(resourceServer, accessScope)],
  },
});
```

### User Pool — o emissor de tokens

Um **Cognito User Pool** normalmente é pensado como "onde ficam cadastrados os usuários finais de um
app" (login, cadastro, MFA...). Aqui ele é usado só pelo lado que importa para M2M: é o **emissor
(issuer)** dos tokens JWT — a mesma entidade que tanto o `EdgeStack` (via `HttpJwtAuthorizer`) quanto
o guard do NestJS vão consultar para validar assinatura/issuer/audience de um token. Nenhuma hosted
UI, nenhum fluxo de cadastro é usado.

`removalPolicy: RETAIN` significa que, se você derrubar essa stack (`cdk destroy`), o User Pool **não
é apagado** — precisa ser removido manualmente depois. Isso é deliberado: dados de autenticação (e,
principalmente, o vínculo entre `client_id`/User Pool que sistemas externos podem já ter configurado)
não são o tipo de coisa que você quer perder por acidente num `cdk destroy` de rotina.

### Resource Server + scope catch-all — um requisito técnico, não autorização

Um **Resource Server** no Cognito representa "uma API que aceita tokens deste User Pool" —
aqui, `identifier: 'order-service'`. Ele existe só para permitir a próxima peça: o fluxo OAuth2
`client_credentials` **exige** que o App Client tenha pelo menos 1 *scope* de algum Resource Server;
não existe "App Client sem nenhum scope" nesse fluxo.

Como esta feature decidiu, de propósito, não diferenciar permissões por operação (é só "autenticado
ou não" — ver `spec.md`), o scope `access` criado aqui é **puramente infraestrutural**: nem o guard
do NestJS nem o authorizer do API Gateway verificam esse scope especificamente. Ele só satisfaz o
requisito técnico do Cognito. Se um dia a aplicação precisar de autorização granular (ex:
`orders.read` vs `orders.write`), é aqui que novos scopes seriam adicionados.

### App Client — quem obtém o token

O **App Client** (`ServiceClient`) é a credencial que um cliente de serviço externo usa para trocar
`client_id`/`client_secret` por um JWT, chamando o endpoint de token do Cognito com
`grant_type=client_credentials`. `generateSecret: true` é o que torna esse client apto ao fluxo
M2M (diferente de clients de SPA/mobile, que normalmente não têm secret).

```ts
new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
new cdk.CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
```

Repare no que **não** é exposto aqui: o `client_secret` nunca vira `CfnOutput` nem aparece em log
nenhum do CloudFormation. Ele só existe dentro do Cognito e é recuperável via o console AWS, a CLI
(`aws cognito-idp describe-user-pool-client`) ou o Secrets Manager — nunca hardcoded em código nem
commitado em texto plano. Só os dois IDs (não sensíveis) saem como output, para as outras stacks
(`EdgeStack`, `ComputeStack`) e para configuração manual de clientes externos.

## Quem consome o que essa stack expõe

```ts
export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly resourceServerIdentifier: string;
  ...
}
```

- [`EdgeStack`](05-edge-stack.md) recebe `userPool` e `userPoolClient.userPoolClientId` para montar o
  `HttpJwtAuthorizer` (o issuer e o audience esperado do token, na borda).
- [`ComputeStack`](04-compute-stack.md) recebe `userPool.userPoolId` e
  `userPoolClient.userPoolClientId` como variáveis de ambiente do container, para o guard do NestJS
  revalidar o mesmo token de forma independente.

## Por que essa stack não depende de nenhuma outra

Igual a `FoundationStack` e `NetworkStack`, `AuthStack` não recebe props de nenhuma outra stack —
Cognito não vive numa VPC, não depende de rede nem de banco. Ela é instanciada bem no início de
[`../bin/app.ts`](../bin/app.ts), e são o `EdgeStack` e o `ComputeStack` que passam a depender dela
(`addDependency(authStack)`), não o contrário.
