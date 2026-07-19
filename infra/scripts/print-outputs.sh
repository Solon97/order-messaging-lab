#!/usr/bin/env bash
# Prints every CloudFormation output across all stacks — ECR URI, API URL,
# Cognito IDs/token endpoint, bastion instance ID, DB endpoint/secret, etc.
# Read-only: just queries the AWS CLI with whatever credentials/profile/
# region are already active locally. Run after bring-up.yml finishes.
set -euo pipefail

STACKS=(
  FoundationStack
  NetworkStack
  AuthStack
  DatabaseStack
  ComputeStack
  BastionStack
  EdgeStack
)

for stack in "${STACKS[@]}"; do
  echo
  echo "--- $stack ---"
  aws cloudformation describe-stacks --stack-name "$stack" \
    --query "Stacks[0].Outputs[].[OutputKey,OutputValue]" --output text \
    | while IFS=$'\t' read -r key value; do
        printf '  %-24s %s\n' "$key" "$value"
      done
done

echo
echo "--- Bastion tunnel example (replace <db-endpoint> with DatabaseEndpoint above) ---"
BASTION_ID=$(aws cloudformation describe-stacks --stack-name BastionStack \
  --query "Stacks[0].Outputs[?OutputKey=='BastionInstanceId'].OutputValue" --output text)
echo "  aws ssm start-session --target $BASTION_ID \\"
echo "    --document-name AWS-StartPortForwardingSessionToRemoteHost \\"
echo "    --parameters '{\"host\":[\"<db-endpoint>\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"5432\"]}'"
