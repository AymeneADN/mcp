FROM node:20-slim

# Salesforce CLI (nécessaire pour l'auth et les commandes sf)
RUN npm install -g @salesforce/cli@latest

# mcp-proxy : bridge stdio ↔ HTTP/SSE
RUN npm install -g mcp-proxy

WORKDIR /app

# Copier les éventuels fichiers de config Salesforce
COPY . .

EXPOSE 8080

ENTRYPOINT ["/app/entrypoint.sh"]

CMD ["mcp-proxy", \
  "--port", "8080", \
  "--host", "0.0.0.0", \
  "--", \
  "npx", "-y", "@salesforce/mcp", \
  "--orgs", "DEFAULT_TARGET_ORG", \
  "--toolsets", "orgs,data,metadata,testing", \
  "--allow-non-ga-tools"]