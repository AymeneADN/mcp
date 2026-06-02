/*
 * Copyright 2026, Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* eslint-disable no-console */

import { TOOLSETS } from '@salesforce/mcp-provider-api';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { Command, Flags, ux } from '@oclif/core';
import express, { Request, Response } from 'express';
import Cache from './utils/cache.js';
import { Telemetry } from './telemetry.js';
import { SfMcpServer } from './sf-mcp-server.js';
import { registerToolsets } from './utils/registry-utils.js';
import { Services } from './services.js';

/**
 * Sanitizes an array of org usernames by replacing specific orgs with a placeholder.
 */
function sanitizeOrgInput(input: string[]): string {
  return input
    .map((org) => {
      if (org === 'DEFAULT_TARGET_ORG' || org === 'DEFAULT_TARGET_DEV_HUB' || org === 'ALLOW_ALL_ORGS') {
        return org;
      }
      return 'SANITIZED_ORG';
    })
    .join(', ');
}

export default class McpServerCommand extends Command {
  public static summary = 'Start the Salesforce MCP server';
  public static description = `This command starts the Model Context Protocol (MCP) server for Salesforce, allowing access to various tools and orgs.

See: https://github.com/salesforcecli/mcp
  `;

  public static flags = {
    orgs: Flags.string({
      char: 'o',
      summary: 'Org usernames to allow access to',
      description: `If you need to pass more than one username/alias, separate them with commas.

You can also use special values to control access to orgs:
- DEFAULT_TARGET_ORG: Allow access to default orgs (global and local)
- DEFAULT_TARGET_DEV_HUB: Allow access to default dev hubs (global and local)
- ALLOW_ALL_ORGS: Allow access to all authenticated orgs (use with caution)`,
      required: true,
      multiple: true,
      delimiter: ',',
      parse: async (input: string) => {
        if (input === 'ALLOW_ALL_ORGS') {
          ux.warn('ALLOW_ALL_ORGS is set. This allows access to all authenticated orgs. Use with caution.');
        }
        if (
          input === 'DEFAULT_TARGET_ORG' ||
          input === 'DEFAULT_TARGET_DEV_HUB' ||
          input.includes('@') ||
          !input.startsWith('-')
        ) {
          return Promise.resolve(input);
        }
        ux.error(
          `Invalid org input: "${input}". Please provide a valid org username or alias, or use one of the special values: DEFAULT_TARGET_ORG, DEFAULT_TARGET_DEV_HUB, ALLOW_ALL_ORGS.`
        );
      },
    }),
    toolsets: Flags.option({
      options: ['all', ...TOOLSETS] as const,
      summary: 'Toolset(s) to enable. Set to "all" to enable every toolset',
      multiple: true,
      delimiter: ',',
      exclusive: ['dynamic-tools'],
    })(),
    tools: Flags.string({
      summary: 'Tool(s) to enable',
      multiple: true,
      delimiter: ',',
      exclusive: ['dynamic-tools'],
    }),
    version: Flags.version(),
    'no-telemetry': Flags.boolean({
      summary: 'Disable telemetry',
    }),
    debug: Flags.boolean({
      summary: 'Enable debug logging',
    }),
    'dynamic-tools': Flags.boolean({
      summary: 'Enable dynamic toolsets',
      char: 'd',
      exclusive: ['toolsets'],
    }),
    'allow-non-ga-tools': Flags.boolean({
      summary: 'Enable the ability to register tools that are not yet generally available (GA)',
    }),
    // ── NEW FLAGS ──────────────────────────────────────────────────────────────
    http: Flags.boolean({
      summary: 'Start in HTTP mode instead of stdio (uses StreamableHTTPServerTransport)',
      default: false,
    }),
    port: Flags.integer({
      summary: 'Port to listen on in HTTP mode',
      default: 3000,
      dependsOn: ['http'],
    }),
    host: Flags.string({
      summary: 'Host to bind to in HTTP mode',
      default: '0.0.0.0',
      dependsOn: ['http'],
    }),
  };

  public static examples = [
    {
      description: 'Start the server over stdio (default)',
      command: '<%= config.bin %> --toolsets all --orgs DEFAULT_TARGET_ORG',
    },
    {
      description: 'Start the server over HTTP on port 3000',
      command: '<%= config.bin %> --toolsets all --orgs DEFAULT_TARGET_ORG --http --port 3000',
    },
    {
      description: 'Start the server over HTTP on a custom host/port',
      command: '<%= config.bin %> --toolsets all --orgs DEFAULT_TARGET_ORG --http --port 8080 --host 127.0.0.1',
    },
  ];

  private telemetry?: Telemetry;

  public async run(): Promise<void> {
    const { flags } = await this.parse(McpServerCommand);

    if (!flags['no-telemetry']) {
      this.telemetry = new Telemetry(this.config, {
        toolsets: (flags.toolsets ?? []).join(', '),
        orgs: sanitizeOrgInput(flags.orgs),
      });

      await this.telemetry.start();

      process.stdin.on('close', () => {
        this.telemetry?.sendEvent('SERVER_STOPPED_SUCCESS');
        this.telemetry?.stop();
      });

      process.on('SIGTERM', () => {
        this.telemetry?.sendEvent('SERVER_STOPPED_SUCCESS');
        this.telemetry?.stop();
      });
    }

    await Cache.safeSet('allowedOrgs', new Set(flags.orgs));
    this.logToStderr(`Allowed orgs:\n${flags.orgs.map((org) => `- ${org}`).join('\n')}`);

    const server = new SfMcpServer(
      {
        name: 'sf-mcp-server',
        version: this.config.version,
        capabilities: {
          resources: {},
          tools: {},
        },
      },
      { telemetry: this.telemetry }
    );

    const services = new Services({
      telemetry: this.telemetry,
      dataDir: this.config.dataDir,
      startupFlags: {
        'allow-non-ga-tools': flags['allow-non-ga-tools'],
        debug: flags.debug,
      },
    });

    await registerToolsets(
      flags.toolsets ?? [],
      flags.tools ?? [],
      flags['dynamic-tools'] ?? false,
      flags['allow-non-ga-tools'] ?? false,
      server,
      services
    );

    // if (flags.http) {
      await this.startHttpServer(server, flags.port, flags.host);
    // } else {
    //   await this.startStdioServer(server);
    // }
  }

  // ── stdio (comportement original) ──────────────────────────────────────────
  private async startStdioServer(server: SfMcpServer): Promise<void> {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`✅ Salesforce MCP Server v${this.config.version} running on stdio`);
  }

  // ── HTTP via StreamableHTTPServerTransport ─────────────────────────────────
  private async startHttpServer(server: SfMcpServer, port: number, host: string): Promise<void> {
    const app = express();
    app.use(express.json());

    /**
     * Map of sessionId → transport pour le mode stateful.
     * Un nouveau transport est créé à chaque requête d'initialisation MCP.
     */
    const transports = new Map<string, StreamableHTTPServerTransport>();

    // ── Point d'entrée principal MCP (POST + GET + DELETE sur /mcp) ──────────
    app.all('/mcp', async (req: Request, res: Response) => {
      try {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;

        // Réutilise un transport existant si la session est connue
        if (sessionId && transports.has(sessionId)) {
          const transport = transports.get(sessionId)!;
          await transport.handleRequest(req, res, req.body);
          return;
        }

        // Nouvelle connexion : doit être une requête d'initialisation MCP
        if (req.method === 'POST' && isInitializeRequest(req.body)) {
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
            onsessioninitialized: (newSessionId) => {
              transports.set(newSessionId, transport);
            },
          });

          // Nettoyage à la fermeture du transport
          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid) transports.delete(sid);
          };

          // Connecte le serveur MCP à ce transport (crée un handler dédié)
          await server.connect(transport);
          await transport.handleRequest(req, res, req.body);
          return;
        }

        // Requête inconnue / session manquante
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: missing or unknown MCP session' },
          id: null,
        });
      } catch (err) {
        console.error('MCP HTTP error:', err);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null,
          });
        }
      }
    });

    // ── Health-check ─────────────────────────────────────────────────────────
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', version: this.config.version, sessions: transports.size });
    });

    app.listen(port, host, () => {
      console.error(
        `✅ Salesforce MCP Server v${this.config.version} running on http://${host}:${port}/mcp`
      );
    });
  }

  protected async catch(error: Error): Promise<void> {
    if (!this.telemetry && !process.argv.includes('--no-telemetry')) {
      this.telemetry = new Telemetry(this.config);
      await this.telemetry.start();
    }

    this.telemetry?.sendEvent('START_ERROR', {
      error: error.message,
      stack: error.stack,
    });

    await super.catch(error);
  }
}