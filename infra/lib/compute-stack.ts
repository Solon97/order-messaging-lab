import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
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

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    this.cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: props.vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    if (!props.database.secret) {
      throw new Error('DatabaseStack must provision a generated credentials secret');
    }
    const dbCredentials = props.database.secret;

    const databaseUrlSecret = new secretsmanager.Secret(this, 'DatabaseUrlSecret', {
      secretStringValue: cdk.SecretValue.unsafePlainText(
        `postgresql://${dbCredentials.secretValueFromJson('username').unsafeUnwrap()}:${dbCredentials.secretValueFromJson('password').unsafeUnwrap()}@${props.database.dbInstanceEndpointAddress}:${props.database.dbInstanceEndpointPort}/postgres`,
      ),
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      cpu: serviceConfig.cpu,
      memoryLimitMiB: serviceConfig.memoryLimitMiB,
    });

    // The parameter name is a deterministic literal (see config.ts), not
    // resolved from `props.imageTagParameter.parameterName` — that prop is a
    // cross-stack token here, and `valueForStringParameter` needs a concrete
    // name to build the SSM ARN.
    const imageTag = ssm.StringParameter.valueForStringParameter(
      this,
      imageTagParameterName,
    );

    const container = taskDefinition.addContainer('Container', {
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

    const serviceSecurityGroup = new ec2.SecurityGroup(this, 'ServiceSecurityGroup', {
      vpc: props.vpc,
      description: `Security group for the ${serviceConfig.serviceName} Fargate service`,
      allowAllOutbound: true,
    });
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

    // SPEC_DEVIATION: design.md has ComputeStack own the ApplicationTargetGroup.
    // Creating it here with `targets: [service]` makes the ECS Service depend
    // on the ALB listener rule (EdgeStack), while EdgeStack must reference this
    // stack's target group/service — a genuine CDK cross-stack cycle, not a
    // preference. EdgeStack now owns the target group and attaches `service`
    // directly via `listener.addTargets(...)`, which is the documented pattern
    // for a target group split across a shared-ALB stack and a service stack.
    this.service = new ecs.FargateService(this, 'Service', {
      cluster: this.cluster,
      taskDefinition,
      desiredCount: serviceConfig.desiredCount,
      securityGroups: [serviceSecurityGroup],
      circuitBreaker: { enable: true, rollback: true },
    });
  }
}
