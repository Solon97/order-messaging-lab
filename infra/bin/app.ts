#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { FoundationStack } from '../lib/foundation-stack';
import { NetworkStack } from '../lib/network-stack';
import { DatabaseStack } from '../lib/database-stack';
import { ComputeStack } from '../lib/compute-stack';
import { EdgeStack } from '../lib/edge-stack';
import { BastionStack } from '../lib/bastion-stack';
import { AuthStack } from '../lib/auth-stack';

const app = new cdk.App();

const foundationStack = new FoundationStack(app, 'FoundationStack');
const networkStack = new NetworkStack(app, 'NetworkStack');
const authStack = new AuthStack(app, 'AuthStack');

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

const bastionStack = new BastionStack(app, 'BastionStack', {
  vpc: networkStack.vpc,
  databaseSecurityGroup: databaseStack.databaseSecurityGroup,
});
bastionStack.addDependency(networkStack);
bastionStack.addDependency(databaseStack);

const edgeStack = new EdgeStack(app, 'EdgeStack', {
  vpc: networkStack.vpc,
  userPool: authStack.userPool,
  userPoolClientId: authStack.userPoolClient.userPoolClientId,
});
edgeStack.addDependency(networkStack);
edgeStack.addDependency(authStack);
edgeStack.registerFargateServiceListener(computeStack.listenerConfig);
