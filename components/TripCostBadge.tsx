interface Props {
  usd: number
}

// Per-trip estimated Google API spend. Estimate only (derived from counted API
// calls × SKU price), not a real bill — hence the 「估算」 label + tooltip.
export function TripCostBadge({ usd }: Props) {
  const display = `US$${(Number.isFinite(usd) ? usd : 0).toFixed(2)}`
  return (
    <span
      title="估算值，非真實帳單。依 Google API 呼叫次數 × 單價估算。"
      aria-label={`本行程估算花費 ${display}`}
      className="inline-flex items-center gap-1 rounded-full bg-[#C65D3B]/10 px-2.5 py-1 text-xs font-medium text-[#C65D3B]"
    >
      <span aria-hidden="true">💰</span>
      估算花費 ≈ {display}
    </span>
  )
}
