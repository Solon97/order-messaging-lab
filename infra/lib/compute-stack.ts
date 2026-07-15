import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { FargateServiceListenerConfig } from './edge-stack';
import { imageTagParameterName, serviceConfig } from './config';

export interface ComputeStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  repository: ecr.IRepository;
  imageTagParameter: ssm.IStringParameter;
  database: rds.DatabaseInstance;
  databaseSecurityGroup: ec2.ISecurityGroup;
}

export class ComputeStack extends cdk.Stack {
  public readonly cluster: ecs.ICluster;
  public readonly service: ecs.FargateService;
  public readonly listenerConfig: FargateServiceListenerConfig;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    this.cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: props.vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    if (!props.database.secret) {
      throw new Error(
        'DatabaseStack must provision a generated credentials secret',
      );
    }
    const dbCredentials = props.database.secret;

    const databaseUrlSecret = new secretsmanager.Secret(
      this,
      'DatabaseUrlSecret',
      {
        secretStringValue: cdk.SecretValue.unsafePlainText(
          `postgresql://${dbCredentials.secretValueFromJson('username').unsafeUnwrap()}:${dbCredentials.secretValueFromJson('password').unsafeUnwrap()}@${props.database.dbInstanceEndpointAddress}:${props.database.dbInstanceEndpointPort}/postgres`,
        ),
      },
    );

    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      'TaskDefinition',
      {
        family: serviceConfig.serviceName,
        cpu: serviceConfig.cpu,
        memoryLimitMiB: serviceConfig.memoryLimitMiB,
      },
    );

    // The parameter name is a deterministic literal (see config.ts), not
    // resolved from `props.imageTagParameter.parameterName` — that prop is a
    // cross-stack token here, and `valueForStringParameter` needs a concrete
    // name to build the SSM ARN.
    const imageTag = ssm.StringParameter.valueForStringParameter(
      this,
      imageTagParameterName,
    );

    const container = taskDefinition.addContainer(serviceConfig.serviceName, {
      image: ecs.ContainerImage.fromEcrRepository(props.repository, imageTag),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: serviceConfig.serviceName,
        logGroup: new logs.LogGroup(this, 'LogGroup', {
          logGroupName: `/ecs/${serviceConfig.serviceName}`,
          retention: logs.RetentionDays.ONE_MONTH,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
      }),
      environment: {
        PORT: String(serviceConfig.containerPort),
      },
      secrets: {
        DATABASE_URL: ecs.Secret.fromSecretsManager(databaseUrlSecret),
      },
      portMappings: [{ containerPort: serviceConfig.containerPort }],
    });
    void container;

    props.repository.grantPull(taskDefinition.taskRole);

    const serviceSecurityGroup = new ec2.SecurityGroup(
      this,
      'ServiceSecurityGroup',
      {
        vpc: props.vpc,
        description: `Security group for the ${serviceConfig.serviceName} Fargate service`,
        allowAllOutbound: true,
      },
    );

    serviceSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(serviceConfig.containerPort),
    );

    props.databaseSecurityGroup.addIngressRule(
      serviceSecurityGroup,
      ec2.Port.tcp(5432),
      `Allow ${serviceConfig.serviceName} Fargate tasks to reach Postgres`,
      /* remoteRule */ true,
    );

    this.service = new ecs.FargateService(this, 'Service', {
      cluster: this.cluster,
      taskDefinition,
      desiredCount: serviceConfig.desiredCount,
      securityGroups: [serviceSecurityGroup],
      circuitBreaker: { enable: true, rollback: true },
    });

    // ComputeStack does not own an ApplicationTargetGroup (see AD note in
    // design.md): the ECS Service always carries a safety dependency onto
    // wherever its target group is attached to a listener rule, so
    // EdgeStack -> ComputeStack (needing the service as a target) and
    // ComputeStack -> EdgeStack (Service waiting on the listener rule) would
    // be a genuine cycle if both stacks referenced each other directly.
    // ComputeStack instead exposes routing metadata; bin/app.ts wires it into
    // EdgeStack.registerFargateServiceListener(...) after both stacks exist.
    this.listenerConfig = {
      service: this.service,
      containerPort: serviceConfig.containerPort,
      publicPath: serviceConfig.publicPath,
      healthCheckPath: serviceConfig.healthCheckPath,
      priority: 1,
    };
  }
}
