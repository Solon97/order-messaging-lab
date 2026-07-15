#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { FoundationStack } from '../lib/foundation-stack';
import { NetworkStack } from '../lib/network-stack';
import { DatabaseStack } from '../lib/database-stack';
import { ComputeStack } from '../lib/compute-stack';
import { EdgeStack } from '../lib/edge-stack';

const app = new cdk.App();

const foundationStack = new FoundationStack(app, 'FoundationStack');
const networkStack = new NetworkStack(app, 'NetworkStack');

const databaseStack = new DatabaseStack(app, 'DatabaseStack', {
  vpc: networkStack.vpc,
});
databaseStack.addDependency(networkStack);

const computeStack = new ComputeStack(app, 'ComputeStack', {
  vpc: networkStack.vpc,
  repository: foundationStack.repository,
  imageTagParameter: foundationStack.imageTagParameter,
  database: databaseStack.database,
  databaseSecurityGroup: databaseStack.databaseSecurityGroup,
});
computeStack.addDependency(foundationStack);
computeStack.addDependency(networkStack);
computeStack.addDependency(databaseStack);

const edgeStack = new EdgeStack(app, 'EdgeStack', {
  vpc: networkStack.vpc,
});
edgeStack.addDependency(networkStack);

// Wired after both stacks exist — see the AD note in design.md /
// compute-stack.ts: EdgeStack must not reference ComputeStack directly
// (would create a cyclic stack dependency with the ECS Service's automatic
// safety ordering against its target group's listener rule).
edgeStack.registerFargateServiceListener(computeStack.listenerConfig);
