import { atom, read, update } from 'claude-code'
import type { Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { Usage } from '../types'

const usage = atom({ plugin: 'token-bar', key: 'usage' } as const, null)

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

function bar(percent: number, width: number): string {
  const filled = Math.max(0, Math.min(width, Math.round((percent / 100) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function colorFor(percent: number): string {
  return percent >= 85 ? 'red' : percent >= 60 ? 'yellow' : 'green'
}

function untilReset(resetsAt: string | undefined, now: number): string | null {
  if (!resetsAt) return null
  const ms = Date.parse(resetsAt) - now
  if (!Number.isFinite(ms) || ms <= 0) return null
  const totalMin = Math.ceil(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `сброс через ${h} ч ${m} мин` : `сброс через ${m} мин`
}

function toUsage(context: SessionContextUsage, rateLimits: SessionRateLimit[]): Usage {
  return {
    tokens: context.tokens ?? null,
    window: context.window,
    percent: context.percent ?? null,
    limits: rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const u = await $.session.usage()
    await update($, usage, () => toUsage(u.context, u.rateLimits))
    // Обратный отсчёт до сброса лимита: перерисовываем полоску каждые 20 секунд
    $.clock.every(20_000, () => $.ui.invalidate('ui.render'))
    return result
  })

  on('session.measure', async ($, e, next) => {
    await update($, usage, () => toUsage(e.context, e.rateLimits))
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const u = await read($, usage)
    if (e.props.hasSurvey || u === null) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const used = u.tokens ?? 0
    const percent = u.percent ?? Math.round((used / u.window) * 100)
    const left = Math.max(0, u.window - used)
    const fiveHour = u.limits.find(l => l.kind === 'five_hour')
    const limitPercent = fiveHour ? Math.round(fiveHour.percentUsed) : 0
    const reset = fiveHour ? untilReset(fiveHour.resetsAt, await $.clock.now()) : null

    return (
      <Box flexDirection="row" flexWrap="wrap" justifyContent="space-between" columnGap={3}>
        <Box flexDirection="row" flexWrap="nowrap" gap={1}>
          <Text bold>Контекст</Text>
          <Text color={colorFor(percent)}>{bar(percent, 16)}</Text>
          <Text bold>{percent}%</Text>
          <Text dimColor>
            {fmt(used)} из {fmt(u.window)}, свободно {fmt(left)}
          </Text>
        </Box>
        {fiveHour ? (
          <Box flexDirection="row" flexWrap="nowrap" gap={1}>
            <Text bold>Лимит 5 ч</Text>
            <Text color={colorFor(limitPercent)}>{bar(limitPercent, 10)}</Text>
            <Text bold>{limitPercent}%</Text>
            {reset ? <Text dimColor>{reset}</Text> : null}
          </Box>
        ) : null}
      </Box>
    )
  })
}
