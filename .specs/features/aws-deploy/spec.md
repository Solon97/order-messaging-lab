# AWS Deploy (Fase 0) Specification

## Problem Statement

O serviço `order` (Fase 0 — `domain-foundation`) está completo e validado localmente (PASS no verificador, 54 testes), mas só roda em `localhost`. Antes de iniciar a Fase 1 (`messaging-flow`), o usuário quer publicá-lo na AWS usando um padrão de arquitetura de referência já validado em outro projeto (ECS Fargate + ALB + API Gateway + ECR/OIDC), para ter o serviço acessível publicamente e uma base de infraestrutura reaproveitável para as próximas fases.

## Goals

- [ ] `POST /orders` e `GET /orders/:id` respondem publicamente via URL do API Gateway, com dados persistidos em RDS Postgres real (não mais `IN_MEMORY`/Postgres local)
- [ ] Pipeline de CI/CD (GitHub Actions + OIDC) publica automaticamente uma nova imagem e atualiza o serviço a cada push na branch de deploy, sem credenciais estáticas
- [ ] Infra como código reproduzível (CDK, dentro deste repositório) — `cdk deploy --all` recria o ambiente do zero

## Out of Scope

Explicitamente excluído. Documentado para prevenir scope creep.

| Item | Motivo |
| ----------- | -------------- |
| Infraestrutura de mensageria (SNS/SQS, Redis) da Fase 1 | `messaging-flow` ainda está em Specify; esta spec cobre só o que já existe (Fase 0) |
| RabbitMQ / Fase 2 | Depende de M1, não iniciado |
| Domínio customizado + certificado ACM/Route53 | Decisão do usuário: usar URL padrão do API Gateway por ora |
| Múltiplos ambientes (staging/prod separados) | Não mencionado pelo usuário; assume-se um único ambiente por ora (ver Assumptions) |
| Autoscaling avançado (target tracking por CPU/mem) | Fora do padrão de referência; `desiredCount` fixo é suficiente para um lab |
| WAF / rate limiting na API Gateway | Não coberto pelo padrão de referência, não solicitado |

---

## Assumptions & Open Questions

Toda ambiguidade foi resolvida ou registrada aqui — nada fica silenciosamente indefinido.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | --------------- | --------- | ---------- |
| Banco de dados | RDS Postgres gerenciado (ex.: `db.t4g.micro`), na mesma VPC, security group liberando só as tasks Fargate | Decisão explícita do usuário; alinhado ao NFR "recursos gerenciados quando possível" do PRD | y |
| Repositório da IaC | Stacks CDK neste mesmo repositório (ex.: pasta `infra/`), não em repo separado | Decisão explícita do usuário; simplifica um repo só para o lab | y |
| Segredos (`DATABASE_URL`) | AWS Secrets Manager, injetado na task definition via `secrets` (não env var em texto puro) | Decisão explícita do usuário | y |
| Escopo de CI/CD | Pipeline completo GitHub Actions + OIDC (build/push de imagem para ECR + `cdk deploy`), replicando o padrão de referência | Decisão explícita do usuário | y |
| HTTPS / domínio customizado | Não — usar URL padrão `execute-api.amazonaws.com` do API Gateway | Decisão explícita do usuário | y |
| Nome/namespace do serviço | `order-service` (path público `/orders`, mesmo path já usado localmente) | Segue a nomenclatura já usada no código (`OrdersController`, rota `/orders`); evita path público divergente do contrato já testado | n |
| Ambiente único (sem staging/prod separado) | Um único ambiente `dev` | Não mencionado pelo usuário; lab de estudo não indicou necessidade de múltiplos ambientes | n |
| Rede — NAT Gateway | Manter o padrão default (com NAT) na v1; documentar como possível otimização de custo futura, não bloquear o deploy inicial por isso | A referência já sinaliza isso como ponto de atenção de custo, não de correção; otimizar agora seria scope creep sobre a infra de referência | n |
| Migrations do TypeORM em produção | Rodar `typeorm migration:run` manualmente (ou via task one-off do ECS) antes do primeiro deploy da aplicação, não automaticamente no boot do container | AD-003 (STATE.md) já proíbe `synchronize: true`; a spec da Fase 0 não define um mecanismo de deploy de migration, isso precisa ser decidido — mas rodar automático no boot de todo container arrisca corridas entre réplicas | n |
| Branch de deploy | `main` dispara o pipeline (build+push+deploy) | Único branch existente hoje no repo (`git status` mostra branch `main`); sem menção a outro fluxo de branches | n |

**Open questions:** nenhuma sem marcação — todas resolvidas por decisão explícita do usuário (y) ou registradas como assumption com rationale (n), sujeitas a confirmação no fechamento desta spec.

---

## User Stories

### P1: Deploy do serviço `order` acessível publicamente ⭐ MVP

**User Story**: Como usuário do lab, quero que o serviço `order` (Fase 0) rode na AWS atrás de uma URL pública, persistindo em um Postgres gerenciado, para poder validar o serviço fora do ambiente local antes de avançar para a Fase 1.

**Why P1**: É o objetivo explícito desta spec — sem isso não há deploy.

**Acceptance Criteria**:

1. WHEN `cdk deploy --all` é executado em uma conta/região AWS bootstrapped THEN o sistema SHALL provisionar VPC, RDS Postgres, ECS Cluster, Fargate Service do `order-service`, ALB e API Gateway HTTP API, na ordem de dependências do padrão de referência (ECR/OIDC → Rede → Cluster → Serviço Fargate → Load Balancer → API Gateway)
2. WHEN um cliente faz `POST https://{api-id}.execute-api.{region}.amazonaws.com/orders` com um payload válido THEN o sistema SHALL criar o pedido, persistir no RDS Postgres provisionado e responder `201`
3. WHEN um cliente faz `GET https://{api-id}.execute-api.{region}.amazonaws.com/orders/:id` para um pedido existente THEN o sistema SHALL responder `200` com os dados do pedido lidos do RDS
4. WHEN a task Fargate inicia THEN o sistema SHALL ler `DATABASE_URL` a partir do AWS Secrets Manager (não como env var em texto puro na task definition)
5. WHEN as migrations do TypeORM ainda não foram aplicadas ao RDS THEN a aplicação SHALL falhar de forma explícita ao tentar acessar tabelas inexistentes (não deve haver fallback para `synchronize: true`, consistente com AD-003)

**Independent Test**: Após `cdk deploy --all` + `typeorm migration:run` contra o RDS provisionado, `curl -X POST` e `curl -X GET` na URL do API Gateway retornam os mesmos resultados que os testes e2e locais já cobrem.

---

### P2: Pipeline de CI/CD sem credenciais estáticas

**User Story**: Como usuário do lab, quero que um push na branch `main` publique automaticamente uma nova imagem e atualize o serviço rodando, sem precisar gerenciar access keys da AWS.

**Why P2**: Importante para o fluxo de trabalho contínuo do lab, mas o serviço já é utilizável (P1) mesmo com deploy manual da imagem inicial.

**Acceptance Criteria**:

1. WHEN um push ocorre na branch `main` THEN o workflow do GitHub Actions SHALL assumir a IAM role de push via OIDC (sem access keys), fazer build da imagem, publicar no ECR com tag imutável e escrever a tag no SSM Parameter do serviço
2. WHEN a tag no SSM Parameter muda THEN um segundo job/step do workflow SHALL assumir a role de deploy da IaC via OIDC e rodar `cdk deploy` para atualizar a Fargate Service com a nova imagem
3. WHEN o deploy de uma nova task falha o health check THEN o ECS SHALL fazer rollback automático para a versão anterior (`circuitBreaker: { enable: true, rollback: true }`, conforme padrão de referência)

**Independent Test**: Um push de teste na `main` resulta em uma nova imagem visível no ECR com tag = SHA do commit, e a Fargate Service passa a rodar essa tag sem intervenção manual.

---

## Edge Cases

- WHEN o RDS Postgres está indisponível (ex.: ainda provisionando) THEN a task Fargate SHALL falhar o health check e o ECS SHALL não marcar o serviço como saudável (comportamento padrão do health check do target group, sem lógica adicional)
- WHEN a variável `PERSISTENCE_PROVIDER` não é definida na task definition THEN o sistema SHALL usar o default já existente `POSTGRES` (AD-009), exigindo que `DATABASE_URL` do Secrets Manager esteja sempre presente na task definition
- WHEN uma rota não mapeada é chamada (ex.: `/nao-existe`) THEN o ALB SHALL responder `404 Not Found` via default action (comportamento herdado do padrão de referência)
- WHEN o deploy inicial ainda não rodou as migrations THEN qualquer chamada a `/orders` SHALL retornar erro 500 de forma visível nos logs do CloudWatch (não silenciosamente) — não há tratamento especial além do já existente em `OrderExceptionFilter`

---

## Requirement Traceability

| Requirement ID | Story | Task(s) | Status |
| -------------- | ----------- | ------- | ------- |
| AWSD-01 | P1: Deploy público | T3-T9 | In Tasks |
| AWSD-02 | P1: Deploy público | T6, T8, T9 | In Tasks |
| AWSD-03 | P1: Deploy público | T6, T8, T9 | In Tasks |
| AWSD-04 | P1: Deploy público | T7 | In Tasks |
| AWSD-05 | P1: Deploy público | T11 | In Tasks |
| AWSD-06 | P2: CI/CD | T4, T10 | In Tasks |
| AWSD-07 | P2: CI/CD | T4, T10 | In Tasks |
| AWSD-08 | P2: CI/CD | T7 | In Tasks |

**ID format:** `AWSD-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 8 total, 8 mapped to tasks, 0 unmapped ✅ (ver `.specs/features/aws-deploy/tasks.md`)

---

## Success Criteria

- [ ] `cdk deploy --all` roda do zero em uma conta AWS bootstrapped sem edição manual de stacks
- [ ] `POST /orders` e `GET /orders/:id` funcionam via URL pública do API Gateway, com dados persistidos em RDS
- [ ] Nenhuma credencial estática (access key) é usada em nenhum ponto do pipeline
- [ ] Um push na `main` resulta em nova imagem rodando no serviço sem passo manual
