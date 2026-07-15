import * as cdk from 'aws-cdk-lib/core';
import { Template } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/network-stack';

describe('NetworkStack', () => {
  const app = new cdk.App();
  const stack = new NetworkStack(app, 'TestNetworkStack');
  const template = Template.fromStack(stack);

  it('creates exactly one VPC', () => {
    template.resourceCountIs('AWS::EC2::VPC', 1);
  });

  it('creates public and private subnets across 2 AZs', () => {
    const subnets = template.findResources('AWS::EC2::Subnet');
    const subnetCount = Object.keys(subnets).length;
    // maxAzs: 2, default config = 1 public + 1 private subnet per AZ = 4 subnets
    expect(subnetCount).toBe(4);

    const publicSubnetIds = Object.keys(subnets).filter((id) =>
      id.includes('PublicSubnet'),
    );
    const privateSubnetIds = Object.keys(subnets).filter((id) =>
      id.includes('PrivateSubnet'),
    );
    expect(publicSubnetIds.length).toBe(2);
    expect(privateSubnetIds.length).toBe(2);
  });
});
