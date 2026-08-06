export interface AgentCommandResult {
  success: boolean;
  stub: boolean;
  output: string;
}

/**
 * LocalBedrockAgent is a thin TypeScript health shim for workspace tooling.
 * Production process control, CGNAT-safe outbound tunneling, telemetry, and
 * backup streaming are implemented by the Go binary:
 *
 *   apps/agent/cmd/bedrock-agent
 *
 * Build: `pnpm --filter @mc-admin/agent agent:build`
 * Run:   `./bin/bedrock-agent -control-plane http://127.0.0.1:4000 -node-id node_docker_agent_1`
 */
export class LocalBedrockAgent {
  public static PORT = process.env.AGENT_PORT || 5050;
  public static SECRET_TOKEN = process.env.AGENT_SECRET || 'dev_agent_secret_token';

  public static async checkHealth() {
    return {
      status: 'healthy',
      runtime: 'typescript-shim',
      goBinary: 'cmd/bedrock-agent',
      nodeVersion: process.version,
      uptime: process.uptime()
    };
  }

  public static async executeLocalCommand(command: string): Promise<AgentCommandResult> {
    console.log(`[Bedrock Agent Daemon] TS shim received command: ${command}`);
    // Real BDS process control lives in the Go agent (simulated or live via -bds-bin).
    return {
      success: false,
      stub: true,
      output: `[AGENT STUB] Command '${command}' not executed in TS shim — use apps/agent/cmd/bedrock-agent.`
    };
  }
}

if (require.main === module) {
  console.log(`[Bedrock Agent Daemon] TS health shim on http://localhost:${LocalBedrockAgent.PORT}`);
  console.log(`[Bedrock Agent Daemon] Prefer Go binary: go run ./cmd/bedrock-agent`);
}
