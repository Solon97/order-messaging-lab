# Auth (Cognito M2M) Specification

## Problem Statement

Hoje `POST /orders` e `GET /orders/:id` estão publicamente acessíveis via API Gateway, sem nenhuma verificação de identidade do chamador — qualquer cliente que descubra a URL pode criar ou ler pedidos. O PRD (§5.4) já previa autenticação em defesa em profundidade (borda + backend) para JWT/API Key de serviço, mas isso nunca foi implementado. Esta feature fecha essa lacuna usando AWS Cognito como emissor de token, com um fluxo machine-to-machine (sem login de usuário final).

## Goals

- [ ] Nenhum endpoint de escrita ou leitura do subdomínio `order` é acessível sem um JWT válido emitido pelo Cognito — métrica: 100% das chamadas sem token, ou com token inválido/expirado, retornam 401 em ambas as camadas (API Gateway e NestJS).
- [ ] Autenticação replicada em 2 camadas independentes (API Gateway + guard NestJS), nenhuma confia apenas na outra — métrica: guard do NestJS revalida assinatura/issuer/audience mesmo que a requisição já tenha passado pelo authorizer do API Gateway.
- [ ] Dev/teste local roda sem depender de Cognito real — métrica: suíte de testes (unit + e2e) passa com `AUTH_PROVIDER=NONE`, sem chamada de rede.
- [ ] Throttling básico na borda protege a API de picos de tráfego — métrica: limite de rate/burst configurado no HTTP API, requisições acima do limite recebem 429.

## Out of Scope

Explicitamente excluído. Documentado para prevenir scope creep.

| Feature | Reason |
| --- | --- |
| Login de usuário final (hosted UI, cadastro, MFA, reset de senha) | PRD §3 já exclui autenticação de usuário final completa; esta feature é M2M (client_credentials) — decisão confirmada com o usuário nesta sessão |
| Autorização por escopo/permissão (ex. `orders.read` vs `orders.write`) | Decisão do usuário: por ora só "autenticado ou não", sem diferenciação de permissões entre operações |
| Múltiplos App Clients / múltiplos consumidores com políticas distintas | Um único App Client cobre o caso de uso atual (um consumidor de serviço); múltiplos clients ficam para quando houver um segundo consumidor real |
| Rotação automática de client secret | Cognito permite rotação manual via console/API; automação (ex. Secrets Manager rotation lambda) fica para o backlog futuro |
| Autenticação entre subdomínios via broker (SNS/SQS/RabbitMQ) | PRD §5.4 já resolve isso via confiança de borda do broker gerenciado (IAM/vhost) — não é JWT/Cognito |
| Rate limiting avançado (por client, por IP, WAF) | Só o throttling nativo do HTTP API (rate/burst) entra nesta fase; regras mais finas (WAF, por client) ficam para o backlog futuro |

---

## Assumptions & Open Questions

Toda ambiguidade foi resolvida ou registrada aqui — nada fica silenciosamente indefinido.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Modelo de fluxo Cognito | OAuth2 `client_credentials` (M2M), sem hosted UI | Decisão explícita do usuário nesta sessão, após explicação das 3 alternativas | y |
| Granularidade de autorização | Só "autenticado ou não", sem scopes por operação | Decisão explícita do usuário | y |
| Env var de controle local/CI | `AUTH_PROVIDER` (`NONE` \| `COGNITO`), **default `COGNITO`** | Decisão explícita do usuário — segue o mesmo padrão de `PERSISTENCE_PROVIDER` (AD-002/AD-009), mas com default seguro (`COGNITO`), igual ao AD-009 já fez para persistência | y |
| Testes locais/CI | `AUTH_PROVIDER=NONE` fixado explicitamente nos specs de teste (unit/e2e), guard desligado; nenhum JWT fake necessário | Mesmo padrão já usado para `PERSISTENCE_PROVIDER=IN_MEMORY` nos e2e existentes (AD-009) | y |
| Throttling na borda | Incluído nesta feature — throttling nativo do HTTP API (rate/burst) nas rotas de `orders` | Decisão explícita do usuário | y |
| Posição no roadmap | Nova Fase 1 ("Autenticação e autorização — Cognito"); fase `messaging-flow` (SNS/SQS) vira Fase 2, `RabbitMQ` vira Fase 3 | Decisão explícita do usuário — reordenar ROADMAP.md | y |
| Falha de dependência externa (JWKS do Cognito inacessível) | Guard NestJS falha fechado: se o cache de JWKS em memória não tem a chave e a busca falhar, a requisição é rejeitada com 401 — nunca aceita token sem validar assinatura | Ausência de posição explícita do usuário; "fail closed" é o único comportamento seguro para autenticação — registrado como assumption, não pergunta em aberto | n (assumido, sem discussão explícita) |
| Cache de JWKS | Biblioteca de verificação mantém cache em memória do JWKS (chaves públicas do User Pool) pela vida do processo, evitando round-trip ao Cognito a cada requisição | Padrão de mercado para verificação de JWT via JWKS (ex. `aws-jwt-verify`); evita acoplar disponibilidade do endpoint por requisição | n (assumido, sem discussão explícita) |
| TTL do access token | Default do Cognito (1h) mantido, sem customização nesta fase | Nenhum requisito de negócio identificado que justifique token de vida curta/longa customizada; lab não tem tráfego real | n (assumido, sem discussão explícita) |
| Endpoint `/health` | Continua público, fora do escopo do authorizer — não é exposto via rota do HTTP API (só usado pelo target group do ALB para health check do ECS) | Confirmado lendo `edge-stack.ts`: `/health` nunca passa pela rota `{proxy+}` do HTTP API; comportamento já existente, sem mudança necessária | y (verificado no código) |
| Múltiplos App Clients | Um único App Client no User Pool cobre o único consumidor de serviço existente hoje | Não há um segundo consumidor real identificado; adicionar clients extras seria over-engineering para o escopo atual | n (assumido, sem discussão explícita) |

**Open questions:** nenhuma — todas resolvidas ou registradas acima.

---

## User Stories

### P1: Bloquear acesso não autenticado aos endpoints de `orders` ⭐ MVP

**User Story**: Como operador da plataforma, quero que `POST /orders` e `GET /orders/:id` rejeitem chamadas sem um JWT válido do Cognito, para que só clientes de serviço autorizados criem/consultem pedidos.

**Why P1**: É o requisito de segurança central desta feature — sem isso, a API continua publicamente exposta.

**Acceptance Criteria**:

1. WHEN uma requisição chega ao API Gateway sem header `Authorization` THEN o API Gateway SHALL rejeitar com 401, sem repassar a requisição ao NestJS.
2. WHEN uma requisição chega ao API Gateway com um JWT expirado, com assinatura inválida, ou com `issuer`/`audience` diferentes do User Pool configurado THEN o API Gateway SHALL rejeitar com 401.
3. WHEN uma requisição com JWT válido (assinatura, issuer, audience, não expirado) chega ao NestJS THEN o guard SHALL revalidar o token de forma independente (não confiar apenas no header já validado pelo API Gateway) e permitir a passagem para o controller.
4. WHEN o guard do NestJS recebe uma requisição sem header `Authorization`, ou com um token que falha na revalidação (assinatura/issuer/audience/expiração) THEN o NestJS SHALL responder 401, sem invocar o use case.
5. WHEN `AUTH_PROVIDER=NONE` THEN o guard do NestJS SHALL permitir todas as requisições sem validar token algum (modo dev/teste local).
6. WHEN `AUTH_PROVIDER` está ausente THEN o sistema SHALL assumir `COGNITO` como default.

**Independent Test**: Com `AUTH_PROVIDER=COGNITO` e um User Pool real configurado, chamar `POST /orders` sem header, com token expirado, e com token válido obtido via `client_credentials` — confirmar 401/401/201 respectivamente. Repetir com `AUTH_PROVIDER=NONE` e confirmar que a chamada sem header retorna 201 (idempotente ao comportamento pré-feature).

---

### P1: Emitir e validar tokens M2M via Cognito ⭐ MVP

**User Story**: Como cliente de serviço autorizado, quero trocar `client_id`/`client_secret` por um JWT de acesso via `client_credentials`, para chamar a API de pedidos de forma autenticada.

**Why P1**: Sem um App Client + Resource Server configurados, não existe forma de obter um token válido — é pré-requisito funcional da história anterior.

**Acceptance Criteria**:

1. WHEN um cliente chama o endpoint de token do Cognito com `grant_type=client_credentials` e credenciais válidas do App Client THEN o Cognito SHALL retornar um JWT de acesso assinado, com `token_use=access` e `client_id` correspondente.
2. WHEN o App Client é provisionado via CDK THEN o Resource Server SHALL estar associado ao mesmo User Pool usado pelo authorizer do API Gateway e pelo guard do NestJS (uma única fonte de verdade de emissão/validação).
3. WHEN as credenciais do App Client (`client_id`/`client_secret`) são necessárias em runtime (ex. para testes de integração manuais) THEN elas SHALL ser recuperáveis via Secrets Manager ou CloudFormation output — nunca hardcoded em código ou committadas em texto plano.

**Independent Test**: Rodar `aws cognito-idp` (ou `curl` no endpoint de token) com as credenciais do App Client provisionado e confirmar retorno de um JWT decodificável (via `jwt.io` ou equivalente) com os claims esperados.

---

### P2: Throttling básico na borda

**User Story**: Como operador da plataforma, quero um limite de rate/burst configurado no API Gateway, para que picos de tráfego (legítimos ou abusivos) não sobrecarreguem o backend.

**Why P2**: Complementa a defesa em profundidade (PRD §5.4 menciona "rate limiting básico"), mas não bloqueia o objetivo central de autenticação — pode ser adicionado depois da P1 sem redesenho.

**Acceptance Criteria**:

1. WHEN o número de requisições por segundo às rotas de `orders` excede o limite configurado (rate) THEN o API Gateway SHALL responder 429 às requisições excedentes.
2. WHEN uma rajada de requisições excede o burst configurado, mesmo dentro do limite médio de rate THEN o API Gateway SHALL responder 429 às requisições excedentes.
3. WHEN o limite de throttling é atingido THEN a rejeição SHALL ocorrer no API Gateway, antes de alcançar o ALB/ECS (a mesma camada 1 da autenticação).

**Independent Test**: Disparar requisições acima do limite configurado (ex. via script de carga simples) e confirmar respostas 429 acima do threshold, 2xx/401 abaixo dele.

---

## Edge Cases

- WHEN o JWKS do Cognito não está em cache e a busca à rede falha (Cognito inacessível) THEN o guard do NestJS SHALL rejeitar a requisição com 401 (fail closed), nunca aceitar o token sem verificação.
- WHEN o token está bem formado mas usa um algoritmo de assinatura inesperado (ex. `alg=none` ou HMAC em vez do RSA do Cognito) THEN o guard SHALL rejeitar com 401.
- WHEN o header `Authorization` está presente mas em formato inválido (sem prefixo `Bearer `, ou vazio) THEN tanto o API Gateway quanto o guard SHALL rejeitar com 401.
- WHEN `AUTH_PROVIDER` recebe um valor diferente de `NONE`/`COGNITO` THEN a aplicação SHALL falhar ao iniciar (erro de configuração explícito), não cair silenciosamente em um dos dois modos.
- WHEN `GET /health` é chamado THEN a autenticação SHALL continuar não se aplicando (endpoint não exposto via rota do HTTP API, comportamento inalterado).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| AUTH-01 | P1: Bloquear acesso não autenticado — rejeição no API Gateway (sem header, token inválido/expirado) | Design | Pending |
| AUTH-02 | P1: Bloquear acesso não autenticado — revalidação independente no guard NestJS | Design | Pending |
| AUTH-03 | P1: Bloquear acesso não autenticado — modo `AUTH_PROVIDER=NONE`/default `COGNITO` | Design | Pending |
| AUTH-04 | P1: Emitir/validar tokens M2M — App Client + Resource Server via CDK | Design | Pending |
| AUTH-05 | P1: Emitir/validar tokens M2M — credenciais nunca hardcoded (Secrets Manager/CFN output) | Design | Pending |
| AUTH-06 | P2: Throttling básico na borda (rate + burst, 429) | Design | Pending |
| AUTH-07 | Edge cases: fail-closed em falha de JWKS, algoritmo inesperado, header malformado, config inválida | Design | Pending |

**ID format:** `AUTH-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 7 total, 0 mapped to tasks, 7 unmapped ⚠️ (mapeamento ocorre na fase Design/Tasks)

---

## Success Criteria

Como saberemos que a feature é bem-sucedida:

- [ ] `POST /orders` e `GET /orders/:id` retornam 401 para toda chamada sem JWT válido, medido em teste e2e automatizado (API Gateway) e em teste de integração do guard (NestJS).
- [ ] Suíte de testes completa (unit + e2e) passa com `AUTH_PROVIDER=NONE`, sem dependência de rede/Cognito real.
- [ ] `cdk synth` da stack de borda (`EdgeStack`) inclui o JWT authorizer do API Gateway apontando para o User Pool, sem erros.
- [ ] Requisições acima do limite de throttling configurado recebem 429 em teste manual/script de carga.
