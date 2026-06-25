import { spawn } from 'child_process'

export function callClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', prompt])
    let out = ''
    let err = ''
    child.stdout.on('data', (d: Buffer) => { out += d.toString() })
    child.stderr.on('data', (d: Buffer) => { err += d.toString() })
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(err || `exit ${code}`))
      else resolve(out.trim())
    })
    child.on('error', reject)
  })
}
