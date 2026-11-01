// Uno shows the canvas only when asked, and these are the two things it runs on a yes:
//   1. a local start against the project in the workspace's .env, answered with a link;
//   2. a share to a hosting account or a repository the person owns, planned first —
//      what becomes public, and the one step only the person takes — and run only on --yes.
// Every outside tool (npm, netlify, gh) is a fake on PATH that logs what it was asked,
// so nothing here deploys, creates a repository or reaches a network.
import { afterEach, test, vi } from 'vitest'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { createServer as createHttpServer } from 'node:http'

const script = resolve('skills/init/scripts/canvas.py')
const PROJECT = 'https://abcdefghijklmnop.supabase.co'
const FILE_KEY = 'anon-key-from-the-env-file'
const SETTINGS_KEY = 'anon-key-from-the-hosting-settings'
const cleanups = []
// Each test spawns Python and real processes; a loaded CI runner needs more than the default.
vi.setConfig({ testTimeout: 30_000 })
afterEach(() => { while (cleanups.length) cleanups.pop()() })

/** A workspace with a dev script, installed modules, a project in .env, and fakes on PATH. */
function workspace({ env = `VITE_SUPABASE_URL=${PROJECT}\nVITE_SUPABASE_ANON_KEY=${FILE_KEY}\n`, settings } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'uno-canvas-')))
  cleanups.push(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'bin'))
  mkdirSync(join(root, 'node_modules'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { dev: 'vite', build: 'vite build' } }))
  if (env !== null) writeFileSync(join(root, '.env'), env)
  const log = join(root, 'calls.jsonl')
  // Each fake appends {tool, argv, cwd, env subset} and answers like the real tool would.
  const fake = (tool, body) => writeFileSync(join(root, 'bin', tool), `#!/usr/bin/env python3
import json, os, sys
argv = sys.argv[1:]
with open(${JSON.stringify(log)}, 'a') as out:
    out.write(json.dumps({'tool': ${JSON.stringify(tool)}, 'argv': argv, 'cwd': os.getcwd(),
        'url': os.environ.get('VITE_SUPABASE_URL'), 'key': os.environ.get('VITE_SUPABASE_ANON_KEY')}) + '\\n')
${body}
`, { mode: 0o755 })
  fake('npm', `
if argv[:2] == ['run', 'dev']:
    import http.server
    port = int(argv[argv.index('--port') + 1])
    http.server.HTTPServer(('127.0.0.1', port), http.server.SimpleHTTPRequestHandler).serve_forever()
`)
  fake('netlify', `
if argv[:1] == ['env:list']:
    if ${settings === undefined ? 'True' : 'False'}:
        sys.exit('Not logged in. Run netlify login.')
    print(json.dumps(${JSON.stringify(settings ?? {})}))
elif argv[:1] == ['deploy']:
    print('Building site...')
    print(json.dumps({'site_name': 'business', 'deploy_url': 'https://abc--business.netlify.app', 'url': os.environ.get('FAKE_SITE_URL', 'http://127.0.0.1:9/')}))
`)
  fake('gh', `
if argv[:2] == ['auth', 'status']:
    sys.exit(0)
if argv[:2] == ['repo', 'create']:
    print('https://github.com/someone/' + argv[2])
`)
  const calls = () => existsSync(log)
    ? readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    : []
  const shellEnv = (extra = {}) => ({ ...process.env, PATH: `${root}/bin:${process.env.PATH}`, ...extra })
  const run = (...args) => spawnSync('python3', [script, ...args, '--workspace', root], { cwd: root, encoding: 'utf8', env: shellEnv() })
  // The same run without blocking this process, so a server in the test can answer it.
  const runAsync = (extra, ...args) => new Promise((done) => {
    const child = spawn('python3', [script, ...args, '--workspace', root], { cwd: root, env: shellEnv(extra) })
    let stdout = ''; let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('close', (status) => done({ status, stdout, stderr }))
  })
  return { root, calls, run, runAsync }
}

const freePort = () => new Promise((done) => {
  const server = createServer().listen(0, '127.0.0.1', () => {
    const { port } = server.address()
    server.close(() => done(port))
  })
})

const git = (root, ...args) => {
  const done = spawnSync('git', ['-c', 'user.email=t@example.org', '-c', 'user.name=t', ...args], { cwd: root, encoding: 'utf8' })
  assert.equal(done.status, 0, done.stderr)
}

test('the canvas starts on this machine against the project in .env, and the answer is a link', async () => {
  const { run, calls } = workspace()
  const port = await freePort()
  const started = run('start', '--port', String(port))
  assert.equal(started.status, 0, started.stderr)
  const answer = JSON.parse(started.stdout)
  cleanups.push(() => { try { process.kill(-answer.pid) } catch { /* already gone */ } })
  assert.equal(answer.url, `http://127.0.0.1:${port}/`)
  assert.equal(answer.project, 'abcdefghijklmnop.supabase.co')
  assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200)
  assert.deepEqual(calls()[0].argv, ['run', 'dev', '--', '--port', String(port), '--strictPort', '--host', '127.0.0.1'])
  assert.ok(!started.stdout.includes(FILE_KEY), 'the key reached the transcript')
})

test('with no project in .env the canvas does not start, because it would show the sample', () => {
  const { run, calls } = workspace({ env: null })
  const refused = run('start')
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /sample/)
  assert.deepEqual(calls(), [])
})

test('a service key in .env.local keeps Uno from starting the canvas', () => {
  const { root, run, calls } = workspace()
  writeFileSync(join(root, '.env.local'), 'VITE_SUPABASE_DEV_SERVICE_KEY="service-key-value" # local authoring\n')
  const refused = run('start')
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /VITE_SUPABASE_DEV_SERVICE_KEY/)
  assert.ok(!refused.stderr.includes('service-key-value'))
  assert.deepEqual(calls(), [])
})

test('a port already taken is named, not silently replaced', async () => {
  const { run } = workspace()
  const busy = createServer().listen(0, '127.0.0.1')
  await new Promise((done) => busy.once('listening', done))
  cleanups.push(() => busy.close())
  const refused = run('start', '--port', String(busy.address().port))
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, new RegExp(`${busy.address().port}.*in use`))
})

test('a share plan says what becomes public and runs nothing', () => {
  const { run, calls } = workspace({ settings: {} })
  const plan = run('share', '--to', 'netlify')
  assert.equal(plan.status, 0, plan.stderr)
  const answer = JSON.parse(plan.stdout)
  assert.match(answer.becomes_public.join(' '), /anyone with the link/i)
  assert.match(answer.becomes_public.join(' '), /evidence/)
  assert.match(answer.becomes_public.join(' '), /edit history with who made each edit/)
  assert.match(answer.person_step, /VITE_SUPABASE_URL/)
  assert.match(answer.on_yes, /--yes/)
  assert.deepEqual(calls(), [])
  assert.ok(!plan.stdout.includes(FILE_KEY))
})

test('a deploy waits for the person to put the project in their own hosting settings', () => {
  const { run, calls } = workspace({ settings: { NODE_VERSION: '22' } })
  const refused = run('share', '--to', 'netlify', '--yes')
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /VITE_SUPABASE_ANON_KEY/)
  assert.ok(!calls().some((call) => call.argv[0] === 'deploy'), 'deployed without the settings')
  assert.ok(!calls().some((call) => call.argv[0]?.startsWith('env:set')), 'Uno set a key in hosting')
})

test('a signed-out host hands the person the sign-in step', () => {
  const { run, calls } = workspace()
  const refused = run('share', '--to', 'netlify', '--yes')
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /netlify login/)
  assert.ok(!calls().some((call) => call.argv[0] === 'deploy'))
})

test('a deploy builds from the person\'s hosting settings, carries no project of its own, and checks the page', async () => {
  const { runAsync, calls } = workspace({ settings: { VITE_SUPABASE_URL: PROJECT, VITE_SUPABASE_ANON_KEY: SETTINGS_KEY } })
  // The deployed site, standing in for Netlify: its page loads a script that names the project.
  const site = createHttpServer((request, response) => response.end(request.url === '/'
    ? '<script type="module" crossorigin src="/assets/index-abc.js"></script>'
    : `const url = "${PROJECT}"`)).listen(0, '127.0.0.1')
  await new Promise((done) => site.once('listening', done))
  cleanups.push(() => site.close())
  const siteUrl = `http://127.0.0.1:${site.address().port}/`
  // A key in the agent's own shell must not ride into the build: the shell outranks the site's settings.
  const deployed = await runAsync({ VITE_SUPABASE_ANON_KEY: FILE_KEY, FAKE_SITE_URL: siteUrl }, 'share', '--to', 'netlify', '--yes')
  assert.equal(deployed.status, 0, deployed.stderr)
  const answer = JSON.parse(deployed.stdout)
  assert.equal(answer.url, siteUrl)
  assert.equal(answer.page_names_project, true)
  const deploy = calls().find((call) => call.argv[0] === 'deploy')
  assert.deepEqual(deploy.argv, ['deploy', '--build', '--prod', '--json'])
  assert.equal(deploy.key, null)
  assert.ok(!calls().some((call) => call.argv[0]?.startsWith('env:set')))
  for (const key of [FILE_KEY, SETTINGS_KEY]) assert.ok(!deployed.stdout.includes(key) && !deployed.stderr.includes(key))
})

test('hosting settings naming another project stop the deploy and name both', () => {
  const { run, calls } = workspace({ settings: { VITE_SUPABASE_URL: 'https://another.supabase.co', VITE_SUPABASE_ANON_KEY: SETTINGS_KEY } })
  const refused = run('share', '--to', 'netlify', '--yes')
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /another\.supabase\.co/)
  assert.match(refused.stderr, /abcdefghijklmnop\.supabase\.co/)
  assert.ok(!calls().some((call) => call.argv[0] === 'deploy'))
})

test('a site address Uno cannot read is not taken for the same project', () => {
  const { run, calls } = workspace({ settings: { VITE_SUPABASE_URL: 'abcdefghijklmnop.supabase.co', VITE_SUPABASE_ANON_KEY: SETTINGS_KEY } })
  const refused = run('share', '--to', 'netlify', '--yes')
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /unreadable address/)
  assert.ok(!calls().some((call) => call.argv[0] === 'deploy'))
})

test('a repository plan lists what the push carries and is private unless asked', () => {
  const { root, run } = workspace()
  mkdirSync(join(root, 'blueprint'))
  writeFileSync(join(root, 'blueprint/clinic.json'), '{}')
  writeFileSync(join(root, '.gitignore'), '.env\nbin\nnode_modules\ncalls.jsonl\n')
  git(root, 'init', '-q'); git(root, 'add', '-A'); git(root, 'commit', '-qm', 'workspace')
  const plan = JSON.parse(run('share', '--to', 'github').stdout)
  assert.equal(plan.visibility, 'private')
  assert.match(plan.becomes_public.join(' '), /blueprint\/.*1 file/)
  assert.match(plan.becomes_public.join(' '), /you and the people you add/i)
})

test('a tracked .env stops the push', () => {
  const { root, run, calls } = workspace()
  git(root, 'init', '-q'); git(root, 'add', '-f', '.env', 'package.json'); git(root, 'commit', '-qm', 'oops')
  const refused = run('share', '--to', 'github', '--yes', '--repo', 'clinic-blueprint')
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /\.env/)
  assert.ok(!calls().some((call) => call.argv[0] === 'repo'))
})

test('a .env committed once and deleted since still stops the push', () => {
  const { root, run, calls } = workspace()
  writeFileSync(join(root, '.gitignore'), 'bin\nnode_modules\ncalls.jsonl\n')
  git(root, 'init', '-q'); git(root, 'add', '-A'); git(root, 'commit', '-qm', 'with keys')
  git(root, 'rm', '-q', '--cached', '.env'); git(root, 'commit', '-qm', 'drop keys')
  const refused = run('share', '--to', 'github', '--yes', '--repo', 'clinic-blueprint')
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /\.env is in the git history/)
  assert.ok(!calls().some((call) => call.argv[0] === 'repo'))
})

test('a push creates a private repository the person owns and sets no secret', () => {
  const { root, run, calls } = workspace()
  writeFileSync(join(root, '.gitignore'), '.env\nbin\nnode_modules\ncalls.jsonl\n')
  git(root, 'init', '-q'); git(root, 'add', '-A'); git(root, 'commit', '-qm', 'workspace')
  const pushed = run('share', '--to', 'github', '--yes', '--repo', 'clinic-blueprint')
  assert.equal(pushed.status, 0, pushed.stderr)
  assert.equal(JSON.parse(pushed.stdout).url, 'https://github.com/someone/clinic-blueprint')
  const create = calls().find((call) => call.argv[0] === 'repo')
  assert.deepEqual(create.argv, ['repo', 'create', 'clinic-blueprint', '--private', `--source=${root}`, '--remote=business', '--push'])
  assert.ok(!calls().some((call) => call.argv[0] === 'secret'))
})
