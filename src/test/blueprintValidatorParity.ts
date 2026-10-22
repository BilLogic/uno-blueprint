/** The canonical file validator is the independent oracle for stored-document diagnostics. */
import { execFileSync } from 'node:child_process'

export function pythonVerdicts(documents: unknown[]): { valid: boolean; warnings: number; paths: string[] }[] {
  return JSON.parse(execFileSync('python3', ['-c', `
import json,sys
sys.path.insert(0,'scripts')
from validate_ir import Report,validate_document
answers=[]
for doc in json.load(sys.stdin):
    report=Report('parity')
    validate_document(doc,report)
    answers.append({'valid':not report.errors,'warnings':len(report.warnings),'paths':sorted(e.split(':',1)[1].split(' — ',1)[0] for e in report.errors)})
print(json.dumps(answers))
`], { input: JSON.stringify(documents), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }))
}
