import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';

export interface DatabaseStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
}

export class DatabaseStack extends cdk.Stack {
  public readonly database: rds.DatabaseInstance;
  public readonly databaseSecurityGroup: ec2.ISecurityGroup;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    this.databaseSecurityGroup = new ec2.SecurityGroup(
      this,
      'DatabaseSecurityGroup',
      {
        vpc: props.vpc,
        description: 'Security group for the order-service RDS instance',
        allowAllOutbound: false,
      },
    );

    // Rejects any client connection that doesn't negotiate TLS — closes the
    // gap where a manual psql session (e.g. through the BastionStack tunnel)
    // could otherwise fall back to plaintext.
    const parameterGroup = new rds.ParameterGroup(this, 'ParameterGroup', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      parameters: {
        'rds.force_ssl': '1',
      },
    });

    this.database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO,
      ),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [this.databaseSecurityGroup],
      credentials: rds.Credentials.fromGeneratedSecret('order_service'),
      parameterGroup,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: this.database.dbInstanceEndpointAddress,
      description: 'RDS endpoint address, reachable via the bastion SSM tunnel',
    });

    new cdk.CfnOutput(this, 'DatabasePort', {
      value: this.database.dbInstanceEndpointPort,
    });

    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: this.database.secret!.secretArn,
      description: 'Secrets Manager ARN holding the generated DB credentials',
    });
  }
}
