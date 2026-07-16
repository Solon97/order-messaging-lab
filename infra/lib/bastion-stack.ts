import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface BastionStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  databaseSecurityGroup: ec2.ISecurityGroup;
}

export class BastionStack extends cdk.Stack {
  public readonly instance: ec2.Instance;

  constructor(scope: Construct, id: string, props: BastionStackProps) {
    super(scope, id, props);

    const securityGroup = new ec2.SecurityGroup(this, 'BastionSecurityGroup', {
      vpc: props.vpc,
      description:
        'Security group for the order-service RDS bastion (SSM Session Manager only, no open ingress)',
      allowAllOutbound: false,
    });

    securityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS to SSM endpoints',
    );

    securityGroup.addEgressRule(
      props.databaseSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow Postgres to the RDS instance',
    );

    const role = new iam.Role(this, 'BastionRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'AmazonSSMManagedInstanceCore',
        ),
      ],
    });

    this.instance = new ec2.Instance(this, 'Bastion', {
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO,
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.X86_64,
      }),
      securityGroup,
      role,
    });

    props.databaseSecurityGroup.addIngressRule(
      securityGroup,
      ec2.Port.tcp(5432),
      'Allow the RDS bastion to reach Postgres for SSM port forwarding',
      /* remoteRule */ true,
    );

    new cdk.CfnOutput(this, 'BastionInstanceId', {
      value: this.instance.instanceId,
      description:
        'Bastion instance ID — use with `aws ssm start-session --document-name AWS-StartPortForwardingSessionToRemoteHost` to reach the RDS instance from your machine',
    });
  }
}
