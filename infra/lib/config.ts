export interface ServiceConfig {
  imageTagParameterName: string;
  serviceName: string;
  containerPort: number;
  publicPath: string;
  docsPath: string;
  healthCheckPath: string;
  cpu: number;
  memoryLimitMiB: number;
  desiredCount: number;
  repository: {
    organization: string;
    name: string;
    branch: string;
  };
}

export const serviceConfig: ServiceConfig = {
  imageTagParameterName: `/order-messaging-lab/order-service/image-tag`,
  serviceName: 'order-service',
  containerPort: 3000,
  publicPath: '/orders',
  docsPath: '/api-docs',
  healthCheckPath: '/health',
  cpu: 512,
  memoryLimitMiB: 1024,
  desiredCount: 2,
  repository: {
    organization: 'Solon97',
    name: 'order-messaging-lab',
    branch: 'main',
  },
};

// Lab-scale defaults, not production sizing.
export const edgeThrottle = {
  rateLimit: 50,
  burstLimit: 100,
};
