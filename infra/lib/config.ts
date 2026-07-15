export interface ServiceConfig {
  serviceName: 'order-service';
  containerPort: number;
  publicPath: '/orders';
  healthCheckPath: '/health';
  cpu: number;
  memoryLimitMiB: number;
  desiredCount: number;
}

export const serviceConfig: ServiceConfig = {
  serviceName: 'order-service',
  containerPort: 3000,
  publicPath: '/orders',
  healthCheckPath: '/health',
  cpu: 512,
  memoryLimitMiB: 1024,
  desiredCount: 1,
};

export const imageTagParameterName = `/order-messaging-lab/${serviceConfig.serviceName}/image-tag`;
