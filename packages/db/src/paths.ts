/**
 * Resolve a writable on-disk path for a Bedrock server working directory.
 * Prefer BDS_HOME (live local BDS) then fall back to /tmp/bedrockops-worlds/<id>.
 */
export function defaultServerPath(serverId: string, explicit?: string): string {
  const trimmed = explicit?.trim();
  if (trimmed) {
    return trimmed;
  }
  const bdsHome = process.env.BDS_HOME?.trim();
  if (bdsHome) {
    return bdsHome;
  }
  return `/tmp/bedrockops-worlds/${serverId}`;
}

/** Default Docker agent node id used for local / Wave A unison smoke. */
export const DEFAULT_DOCKER_AGENT_ID = 'node_docker_agent_1';
