#!/bin/sh
set -e

if [ -n "$SF_JWT_PRIVATE_KEY" ]; then
  mkdir -p /app/assets
  printf '%s' "$SF_JWT_PRIVATE_KEY" | base64 -d > /app/assets/server.key
  chmod 600 /app/assets/server.key
fi

sf org login jwt \
  --username "$SF_USERNAME" \
  --jwt-key-file /app/assets/server.key \
  --client-id "$SF_CONSUMER_KEY" \
  --instance-url "${SF_INSTANCE_URL:-https://test.salesforce.com}" \
  --alias default \
  --set-default

echo "Salesforce JWT auth OK"

exec mcp-proxy \
  --port 8080 \
  --host 0.0.0.0 \
  -- \
  npx -y @salesforce/mcp \
    --orgs DEFAULT_TARGET_ORG \
    --toolsets orgs,data,metadata,testing \
    --allow-non-ga-tools