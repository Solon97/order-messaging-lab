import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { serviceConfig } from './config';

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly resourceServerIdentifier: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.resourceServerIdentifier = serviceConfig.serviceName;

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `${serviceConfig.serviceName}-users`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const accessScope = new cognito.ResourceServerScope({
      scopeName: 'access',
      scopeDescription: 'Catch-all access scope for M2M clients',
    });

    const resourceServer = this.userPool.addResourceServer('ResourceServer', {
      identifier: this.resourceServerIdentifier,
      scopes: [accessScope],
    });

    this.userPoolClient = this.userPool.addClient('ServiceClient', {
      generateSecret: true,
      oAuth: {
        flows: { clientCredentials: true },
        scopes: [
          cognito.OAuthScope.resourceServer(resourceServer, accessScope),
        ],
      },
    });

    const domain = this.userPool.addDomain('AuthDomain', {
      cognitoDomain: {
        domainPrefix: `${serviceConfig.serviceName}-${cdk.Aws.ACCOUNT_ID}`,
      },
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
    });

    new cdk.CfnOutput(this, 'UserPoolTokenEndpoint', {
      value: `https://${domain.domainName}.auth.${cdk.Aws.REGION}.amazoncognito.com/oauth2/token`,
    });
  }
}
