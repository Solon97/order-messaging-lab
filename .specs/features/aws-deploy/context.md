# AWS Deploy (Fase 0) Context

**Gathered:** 2026-07-14
**Spec:** `.specs/features/aws-deploy/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Publicar o serviço `order` (Fase 0, já validado localmente) na AWS, seguindo o padrão de arquitetura descrito em `aws-reference.md` (ECS Fargate + ALB + API Gateway HTTP API + ECR/OIDC via GitHub Actions), acrescentando o que a referência não cobre: banco de dados gerenciado e segredos. Não inclui infraestrutura de mensageria (Fase 1/2).

---

## Implementation Decisions

### Banco de dados

- RDS Postgres gerenciado (ex.: `db.t4g.micro`), provisionado na mesma VPC das tasks Fargate.
- Acesso restrito por security group: só as tasks Fargate do `order-service` podem alcançar a porta do RDS — nenhum acesso público direto.
- Motivo do usuário: alinhado ao NFR de "recursos gerenciados quando possível" já registrado no PRD; caminho mais próximo de produção real do que Postgres em container avulso.

### Repositório da IaC

- As stacks CDK ficam neste mesmo repositório (`order-messaging-lab`), não em um repositório de IaC separado como no exemplo do `aws-reference.md`.
- Isso é um desvio consciente do padrão de referência (que assume 1 repo de IaC + 1 repo por serviço) — replicado aqui em versão simplificada, mono-repo, adequado ao escopo de lab de estudo.

### Segredos

- `DATABASE_URL` (e qualquer outra credencial) é injetada na task definition via `secrets` do AWS Secrets Manager — nunca como env var em texto puro.
- Isso estende o padrão de referência, que só demonstra env vars simples (`NODE_ENV`, `PORT`); a spec precisa cobrir esse ponto porque o serviço `order` depende de credencial de banco, algo que o serviço de exemplo da referência não tinha.

### Escopo de CI/CD

- O pipeline completo de GitHub Actions com OIDC (build/push de imagem para ECR + trigger de `cdk deploy`) entra no escopo desta spec — não fica para depois.
- Segue o padrão de referência à risca nesse ponto: roles separadas para push de imagem vs. deploy da IaC, sem credenciais estáticas em nenhum dos dois fluxos.

### HTTPS / domínio customizado

- Não é necessário agora. Usa a URL padrão gerada pelo API Gateway (`https://{api-id}.execute-api.{region}.amazonaws.com`).
- Route53 + certificado ACM ficam fora do escopo — podem ser adicionados depois sem alterar a topologia de compute/rede já provisionada.

### Agent's Discretion

- Nome/namespace do serviço (`order-service`), path público (`/orders`), branch de deploy (`main`) e ambiente único (`dev`) — o usuário não teve preferência explícita sobre esses pontos; agente decide seguindo convenções já existentes no código (ver Assumptions & Open Questions no spec.md).
- Estratégia de aplicar migrations do TypeORM no RDS (manual/one-off vs. automatizada) — usuário não opinou; agente propõe abordagem manual/one-off na primeira versão, documentando risco de corrida entre réplicas se fosse automática no boot.
- Manter NAT Gateway no padrão default da VPC (custo recorrente) na v1, em vez de otimizar agora — tratado como possível melhoria futura, não bloqueio do deploy inicial.

### Declined / Undiscussed Gray Areas → Assumptions

Nenhuma área foi recusada — as 4 perguntas levantadas (banco de dados, repositório da IaC, segredos, escopo de CI/CD, HTTPS) foram todas respondidas explicitamente pelo usuário. Os pontos remanescentes (namespace, path público, branch, ambiente único, estratégia de migration, NAT Gateway) não geraram gray area de comportamento do usuário — são decisões técnicas de baixo risco, registradas como assumptions no spec.md com rationale, e ficam sujeitas a confirmação do usuário na revisão do spec.

---

## Specific References

- Arquitetura de referência: `aws-reference.md` (raiz do repo) — padrão de 6 stacks CDK (ECR/OIDC, Rede, Cluster, Serviço Fargate, Load Balancer, API Gateway) já validado em outro projeto com o serviço de exemplo `products-service`.
- Este deploy reaproveita esse padrão para o serviço `order-service`, acrescentando RDS + Secrets Manager, que a referência não cobre.

---

## Deferred Ideas

- Domínio customizado + certificado ACM/Route53 — fica para uma iteração futura, fora desta spec.
- Otimização de custo da VPC (remover NAT Gateway, usar VPC endpoints para ECR/CloudWatch/SSM) — mencionado como ponto de atenção pela própria referência, não priorizado agora.
- Infraestrutura de mensageria (SNS/SQS, Redis) para a Fase 1 — pertence à spec `messaging-flow`, não a este deploy.
- Múltiplos ambientes (staging/prod) — não solicitado; se necessário, vira uma spec própria de "promoção entre ambientes".
