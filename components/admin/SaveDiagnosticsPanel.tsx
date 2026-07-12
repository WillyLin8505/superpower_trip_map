'use client'

import { useState } from 'react'

type DiagnosticResult = {
  ok: boolean
  runId: string
  startedAt: string
  finishedAt: string
  steps: Array<{
    name: string
    ok: boolean
    detail?: unknown
    error?: unknown
  }>
}

export function SaveDiagnosticsPanel() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<DiagnosticResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runDiagnostics() {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const response = await fetch('/api/admin/diagnostics/save-trip', { method: 'POST' })
      const body = await response.json() as DiagnosticResult
      setResult(body)
      if (!response.ok) setError(`診斷失敗，runId=${body.runId}`)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '診斷請求失敗')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mb-8 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-700">儲存功能診斷</h2>
          <p className="mt-1 text-sm text-gray-500">
            會用目前登入的管理員帳號實際執行 trips insert / update / select / delete，並在 Vercel Functions log 寫入同一個 runId。
          </p>
        </div>
        <button
          type="button"
          onClick={runDiagnostics}
          disabled={busy}
          className="self-start rounded-md border border-border px-3 py-1.5 text-sm hover:bg-paper disabled:opacity-50"
        >
          {busy ? '診斷中…' : '執行儲存診斷'}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {result && (
          <div className="flex flex-col gap-3">
            <div className={result.ok ? 'text-sm text-green-700' : 'text-sm text-red-700'}>
              結果：{result.ok ? '通過' : '失敗'} / runId：{result.runId}
            </div>
            <ul className="flex flex-col gap-1 text-sm">
              {result.steps.map((step) => (
                <li key={step.name} className={step.ok ? 'text-green-700' : 'text-red-700'}>
                  {step.ok ? '✓' : '✗'} {step.name}
                </li>
              ))}
            </ul>
            <details>
              <summary className="cursor-pointer text-sm text-clay-deep">查看完整 JSON</summary>
              <pre className="mt-2 max-h-96 overflow-auto rounded bg-gray-950 p-3 text-xs text-gray-100">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </section>
  )
}
