#!/bin/sh
set -e

# Reconstruire le fichier server.key depuis le secret Fly
if [ -n "$SF_JWT_PRIVATE_KEY" ]; then
  mkdir -p /app/assets
  printf '%s' "$SF_JWT_PRIVATE_KEY" > /app/assets/server.key
  chmod 600 /app/assets/server.key
fi

# Authentification JWT vers Salesforce
sf org login jwt \
  --username "$SF_USERNAME" \
  --jwt-key-file /app/assets/server.key \
  --client-id "$SF_CONSUMER_KEY" \
  --instance-url "$SF_INSTANCE_URL" \
  --alias default \
  --set-default

echo "✅ Salesforce JWT auth OK — démarrage du MCP server..."

# Démarrer le bridge stdio → HTTP/SSE
exec mcp-proxy \
  --port 8080 \
  --host 0.0.0.0 \
  -- \
  npx -y @salesforce/mcp \
    --orgs DEFAULT_TARGET_ORG \
    --toolsets orgs,data,metadata,testing \
    --allow-non-ga-tools