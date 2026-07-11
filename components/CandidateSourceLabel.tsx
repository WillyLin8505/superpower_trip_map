import type { CandidateSource } from '@/lib/types'

export function CandidateSourceLabel({
  source,
}: {
  source: CandidateSource | null | undefined
}) {
  if (!source) return null

  if (source.kind === 'line_group') {
    return (
      <span className="text-xs text-gray-500">
        {source.lineDisplayName ? `LINE 群組 / ${source.lineDisplayName} 加入` : 'LINE 群組加入'}
      </span>
    )
  }

  return null
}
