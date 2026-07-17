import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { AuthStack } from '../lib/auth-stack';

describe('AuthStack', () => {
  const app = new cdk.App();
  const stack = new AuthStack(app, 'TestAuthStack');
  const template = Template.fromStack(stack);

  it('creates a Cognito User Pool', () => {
    template.resourceCountIs('AWS::Cognito::UserPool', 1);
  });

  it('creates a User Pool Resource Server with one catch-all scope', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolResourceServer', {
      Identifier: 'order-service',
      Scopes: Match.arrayWith([Match.objectLike({ ScopeName: 'access' })]),
    });
    const resourceServers = template.findResources(
      'AWS::Cognito::UserPoolResourceServer',
    );
    const scopes = (
      Object.values(resourceServers)[0] as {
        Properties: { Scopes: unknown[] };
      }
    ).Properties.Scopes;
    expect(scopes).toHaveLength(1);
  });

  it('creates an App Client configured for the client_credentials flow with a generated secret', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      GenerateSecret: true,
      AllowedOAuthFlows: ['client_credentials'],
      AllowedOAuthFlowsUserPoolClient: true,
    });
  });

  it('never outputs the client secret, only the pool and client IDs', () => {
    const outputs = template.toJSON().Outputs as Record<
      string,
      { Value: unknown; Export?: unknown }
    >;
    const outputValues = JSON.stringify(outputs);
    expect(outputValues).not.toMatch(/ClientSecret/i);

    const outputNames = Object.keys(outputs);
    expect(outputNames.some((name) => /UserPoolId/i.test(name))).toBe(true);
    expect(outputNames.some((name) => /UserPoolClientId/i.test(name))).toBe(
      true,
    );
  });

  it('provisions a Cognito hosted domain so the token endpoint is reachable', () => {
    template.resourceCountIs('AWS::Cognito::UserPoolDomain', 1);
    const domains = template.findResources('AWS::Cognito::UserPoolDomain');
    const domainValue = JSON.stringify(
      Object.values(domains)[0].Properties.Domain,
    );
    expect(domainValue).toContain('order-service-');
  });

  it('outputs the token endpoint URL, never the client secret', () => {
    const outputs = template.toJSON().Outputs as Record<
      string,
      { Value: unknown }
    >;
    const outputNames = Object.keys(outputs);
    const tokenEndpointName = outputNames.find((name) =>
      /UserPoolTokenEndpoint/i.test(name),
    );
    expect(tokenEndpointName).toBeDefined();
    const value = JSON.stringify(outputs[tokenEndpointName as string].Value);
    expect(value).toMatch(/oauth2\/token/);
  });
});
