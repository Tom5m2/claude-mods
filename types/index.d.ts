export type Usage = {
  tokens: number | null
  window: number
  percent: number | null
  limits: { kind: string; percentUsed: number; resetsAt?: string }[]
}

declare module 'claude-code' {
  interface PluginState {
    'token-bar': { usage: Usage | null }
  }
}
