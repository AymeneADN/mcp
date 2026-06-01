FROM node:20-slim

# Salesforce CLI
RUN npm install -g @salesforce/cli@latest

# Proxy stdio -> HTTP/SSE
RUN npm install -g mcp-proxy

WORKDIR /app

# Copier les fichiers du projet
COPY . .

# Corriger les fins de ligne Windows et rendre le script exécutable
RUN sed -i 's/\r$//' /app/entrypoint.sh && chmod 755 /app/entrypoint.sh

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