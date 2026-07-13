# State — order-messaging-lab

## Decisions

- 2026-07-13: ORM de persistência Postgres = TypeORM (não Prisma). Motivo: mais idiomático/maduro com NestJS em arquitetura hexagonal.
- 2026-07-13: `GET /orders/:id` entra no escopo da Fase 0 (não fica no Backlog Futuro). Motivo: permite validar o fluxo de criação de forma independente do retorno do POST.
- 2026-07-13: Lint de arquitetura (dependency-cruiser) bloqueante em CI desde a Fase 0. Motivo: estrutura hexagonal por subdomínio já nasce na Fase 0; travar cedo evita vazamento de infra no domínio.
- 2026-07-13: Fase 0 cria apenas o subdomínio `order` completo (domain/application/infrastructure). `payment`, `stock`, `notification` só ganham estrutura na Fase 1, quando tiverem casos de uso reais.
- 2026-07-13: `OrderItem` é entidade filha do agregado `Order` (identidade própria via `orderItemId`), não value object — correção da PRD original (§3.1), que classificava `OrderItem` junto de `Money`/`OrderStatus` como VO. Motivo: o backlog do PRD (§11) prevê reserva parcial de estoque por item, o que exige rastrear/referenciar cada linha do pedido individualmente ao longo do fluxo — algo que só faz sentido com identidade, não com igualdade por valor. `Money` e `OrderStatus` continuam VOs. Corrigido em PRD.md:68 e no spec da Fase 0.

## Blockers

(nenhum)

## Lessons

(nenhuma ainda)

## Todos / Deferred ideas

- Resolver perguntas abertas #1, #3, #4, #6 do PRD ao especificar a Fase 1.
- Resolver pergunta aberta #5 do PRD ao iniciar a Fase 2.

## Preferences

(nenhuma registrada ainda)
