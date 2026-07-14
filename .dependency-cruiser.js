/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-infra-into-domain-or-application',
      comment:
        'Domain and application layers must stay free of infrastructure concerns (HTTP, persistence adapters, etc). Only infrastructure may depend on them, never the other way around.',
      severity: 'error',
      from: {
        path: '^src/order/(domain|application)',
        pathNot: '\\.spec\\.ts$',
      },
      to: {
        path: '^src/order/infrastructure',
      },
    },
    {
      name: 'no-orm-into-domain-or-application',
      comment:
        'Domain and application layers must not depend on the persistence ORM directly — go through the OrderRepository port instead.',
      severity: 'error',
      from: {
        path: '^src/order/(domain|application)',
      },
      to: {
        path: 'node_modules/(typeorm|@nestjs/typeorm)',
      },
    },
    {
      name: 'no-messaging-sdk-into-domain-or-application',
      comment:
        'Domain and application layers must not depend on any messaging broker SDK directly (forward-looking for Fase 1/2 — SNS/SQS/RabbitMQ adapters belong in infrastructure).',
      severity: 'error',
      from: {
        path: '^src/order/(domain|application)',
      },
      to: {
        path: 'node_modules/(aws-sdk|@aws-sdk|amqplib)',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
