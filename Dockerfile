FROM node:20-slim

RUN npm install -g @salesforce/cli@latest
RUN npm install -g mcp-proxy

WORKDIR /app
COPY . .

RUN sed -i 's/\r$//' /app/entrypoint.sh && chmod 755 /app/entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/app/entrypoint.sh"]