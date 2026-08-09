export type ScenarioName = 'join' | 'chat' | 'flood' | 'churn' | 'ping';

export interface BotTarget {
  host: string;
  port: number;
  /** Bedrock protocol version string, e.g. "1.21.130". Empty = library default. */
  version?: string;
}

export interface ScenarioOptions extends BotTarget {
  usernamePrefix: string;
  count: number;
  holdMs: number;
  chatMessages: string[];
  churnRounds: number;
  staggerMs: number;
}

export interface ScenarioResult {
  scenario: ScenarioName;
  ok: boolean;
  detail: string;
  joined: string[];
  errors: string[];
}
