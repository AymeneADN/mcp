#!/bin/sh
set -e

chmod 600 /app/assets/server.key

sf org login jwt \
  --username "$SF_USERNAME" \
  --jwt-key-file /app/assets/server.key \
  --client-id "$SF_CONSUMER_KEY" \
  --instance-url "${SF_INSTANCE_URL:-https://test.salesforce.com}" \
  --alias default \
  --set-default

echo "Salesforce JWT auth OK"

exec mcp-proxy \
  --host 0.0.0.0 \
  --port 8080 \
  --endpoint /sse \
  -- \
  salesforce-mcp \
    --orgs utilisateurtechnique.ia@cnas.fr.devstab \
    --toolsets all \
    --allow-non-ga-tools