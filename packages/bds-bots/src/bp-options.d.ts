declare module 'bedrock-protocol/src/options' {
  export const Versions: Record<string, number>;
  export const CURRENT_VERSION: string;
  export const MIN_VERSION: string;
  export const defaultOptions: Record<string, unknown>;
  export function validateOptions(options: Record<string, unknown>): void;
}
