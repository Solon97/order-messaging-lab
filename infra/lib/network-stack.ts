import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
    });

    new cdk.CfnOutput(this, 'PrivateSubnetId', {
      value: this.vpc.privateSubnets[0].subnetId,
      description:
        'A private subnet ID, for the one-off migration ECS task network configuration',
    });
  }
}
