# State — order-messaging-lab

## Decisions

- 2026-07-13: ORM de persistência Postgres = TypeORM (não Prisma). Motivo: mais idiomático/maduro com NestJS em arquitetura hexagonal.
- 2026-07-13: `GET /orders/:id` entra no escopo da Fase 0 (não fica no Backlog Futuro). Motivo: permite validar o fluxo de criação de forma independente do retorno do POST.
- 2026-07-13: Lint de arquitetura (dependency-cruiser) bloqueante em CI desde a Fase 0. Motivo: estrutura hexagonal por subdomínio já nasce na Fase 0; travar cedo evita vazamento de infra no domínio.
- 2026-07-13: Fase 0 cria apenas o subdomínio `order` completo (domain/application/infrastructure). `payment`, `stock`, `notification` só ganham estrutura na Fase 1, quando tiverem casos de uso reais.
- 2026-07-13: `OrderItem` é entidade filha do agregado `Order` (identidade própria via `orderItemId`), não value object — correção da PRD original (§3.1), que classificava `OrderItem` junto de `Money`/`OrderStatus` como VO. Motivo: o backlog do PRD (§11) prevê reserva parcial de estoque por item, o que exige rastrear/referenciar cada linha do pedido individualmente ao longo do fluxo — algo que só faz sentido com identidade, não com igualdade por valor. `Money` e `OrderStatus` continuam VOs. Corrigido em PRD.md:68 e no spec da Fase 0.
- 2026-07-13: Topologia de deploy = **monólito modular** (um único processo NestJS, subdomínios como módulos por pasta comunicando-se só via broker real), não microsserviços separados por subdomínio. Motivo: o foco do lab é validar isolamento de domínio e portabilidade de broker, não orquestração de N deploys — separar processos aumentaria complexidade operacional sem agregar ao objetivo de aprendizado. Isso não estava explícito na PRD original (ambiguidade resolvida). Nota adicionada em PRD.md §7.1.
- 2026-07-13: Banco de dados = **uma única instância Postgres, um schema por subdomínio** (cada subdomínio só acessa seu próprio schema via sua própria porta de repositório), não uma instância por subdomínio. Motivo: mantém isolamento lógico de dados (equivalente ao "database-per-service" em espírito) com custo mínimo de infraestrutura local, alinhado ao NFR de "uso de recursos gerenciados sempre que possível / nenhum custo de nuvem real necessário" (PRD §6). Nota adicionada em PRD.md §7.1.
- AD-001 (2026-07-13, status: active): Ferramenta concreta do lint de arquitetura bloqueante = `dependency-cruiser` (rodado via script `npm run lint:arch`, arquivo `.dependency-cruiser.js` na raiz). Motivo: já apontado como opção primária em PROJECT.md/STATE.md; CLI standalone, roda como step de CI isolado do lint de estilo (ESLint), e produz mensagem de violação de fronteira mais clara que um plugin de ESLint boundaries.
- AD-002 (2026-07-13, status: active): Seleção de adapter de persistência via env var `PERSISTENCE_PROVIDER` (`IN_MEMORY` | `POSTGRES`), lida em `OrdersModule` via `useFactory`, default `IN_MEMORY` quando ausente. Motivo: nome análogo ao `MESSAGING_PROVIDER` já previsto para a Fase 2 em PROJECT.md; default `IN_MEMORY` evita exigir Docker em dev/teste padrão.
- AD-003 (2026-07-13, status: active): Persistência Postgres do subdomínio `order` usa migrations explícitas do TypeORM (`typeorm migration:generate`/`run`); `synchronize: true` nunca é usado, nem em dev. Motivo: `synchronize: true` mascara migrations quebradas até elas surgirem em CI/produção — risco identificado no design da Fase 0.
- AD-004 (2026-07-13, status: active): `Money` (VO de domínio) é representado internamente como inteiro de centavos (`number` inteiro), não `Decimal`/`bignumber.js`; normalização de entrada usa arredondamento bancário (half-to-even) para 2 casas decimais. Motivo: evita nova dependência só para isso; escala de valores de pedido de e-commerce não se aproxima do limite seguro de inteiro do JS. Persistência Postgres usa `numeric(12,2)` lido/escrito como string no mapper (nunca `number` cru), para não perder precisão do driver.
- AD-005 (2026-07-13, status: active): Geração de `orderId`/`orderItemId` usa `crypto.randomUUID()` nativo do Node, chamado direto nas factories do domínio (`Order.create`, `OrderItem.create`), sem porta `IdGenerator` injetável. Motivo: `crypto` é built-in do Node (não IO, não rede/banco), não se enquadra no tipo de import que o lint de arquitetura precisa bloquear; introduzir uma porta só para isso seria over-engineering para o escopo da Fase 0.
- AD-006 (2026-07-14, status: active): Fábricas de domínio do subdomínio `order` (`OrderItem.create`, `Order.create`) retornam `Either<DomainError, T>` (tipo próprio em `src/shared/either.ts`, união `Left`/`Right`, sem dependência externa) em vez de lançar exceção para erros de validação esperados (`InvalidOrderItemError`, `EmptyOrderError`). Motivo: validação de domínio é fluxo de controle previsível, não excepcional; `Either` obriga o caller a tratar o erro pelo tipo, ao contrário de exception (fácil de esquecer um `try/catch`). Escopo desta decisão: entities/aggregates. Erros verdadeiramente excepcionais (bug de infra etc.) continuam como exception.
- AD-007 (2026-07-14, status: active): Estende AD-006 para a camada de aplicação: `CreateOrderUseCase.execute` passa a retornar `Either<EmptyOrderError | InvalidOrderItemError, Order>` (não relança o erro do domínio) e `GetOrderUseCase.execute` passa a retornar `Either<OrderNotFoundError, Order>` (novo domain error) em vez de `Order | null`. Motivo: contrato consistente entre os use cases da mesma camada; "pedido não encontrado" é um caso esperado, não excepcional. Sem controllers/consumidores externos ainda (confirmado por busca no repo) — quando um controller HTTP existir, ele decide o mapeamento `Either` → status HTTP.

## Blockers

(nenhum)

## Lessons

(nenhuma ainda)

## Todos / Deferred ideas

- Resolver perguntas abertas #1, #3, #4, #6 do PRD ao especificar a Fase 1.
- Resolver pergunta aberta #5 do PRD ao iniciar a Fase 2.

## Preferences

(nenhuma registrada ainda)
