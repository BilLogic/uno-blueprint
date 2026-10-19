import { useEffect, useState, type FormEvent } from 'react'
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js'
import { createSupabaseClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const followRedirect = (url: string) => window.location.assign(url)

/** Auth resolves the request and validates its callback; URL parameters never supply a redirect. */
export function OAuthConsent({
  authorizationId = new URLSearchParams(window.location.search).get('authorization_id'),
  navigate = followRedirect,
}: { authorizationId?: string | null; navigate?: (url: string) => void }) {
  // The consent page never inherits a dev authoring key or automatic dev login.
  const [client] = useState(() => createSupabaseClient({ publicOnly: true }))
  const [request, setRequest] = useState<OAuthAuthorizationDetails | null>(null)
  const [login, setLogin] = useState(false)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [codeEmail, setCodeEmail] = useState<string | null>(null)
  const [message, setMessage] = useState('Loading authorization request…')

  useEffect(() => {
    let current = true
    if (!authorizationId || !client) return
    void client.auth.oauth.getAuthorizationDetails(authorizationId).then(({ data, error }) => {
      if (!current) return
      if (error) {
        const needsLogin = error.status === 401 || error.name === 'AuthSessionMissingError'
        setLogin(needsLogin)
        setMessage(needsLogin ? 'Sign in to review this request.' : 'This authorization request is unavailable. Start again from your agent host.')
      } else if (data && 'authorization_id' in data) {
        setRequest(data)
        setLogin(false)
      } else if (data && 'redirect_url' in data) navigate(data.redirect_url)
    }).catch(() => { if (current) setMessage('Authorization could not be loaded. Try again from your agent host.') })
    return () => { current = false }
  }, [authorizationId, client, navigate, revision])

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!client) return
    const fields = new FormData(event.currentTarget)
    setBusy(true)
    try {
      const { error } = codeEmail
        ? await client.auth.verifyOtp({ email: codeEmail, token: String(fields.get('code')).trim(), type: 'email' })
        : await client.auth.signInWithPassword({ email: String(fields.get('email')), password: String(fields.get('password')) })
      if (error) setMessage(codeEmail ? 'The sign-in code could not be verified. Try again.' : 'Sign-in failed. Check your email and password.')
      else { setMessage('Loading authorization request…'); setRevision(value => value + 1) }
    } catch { setMessage('Sign-in could not finish. Try again.') }
    finally { setBusy(false) }
  }

  async function sendCode(form: HTMLFormElement | null) {
    if (!client || !form || busy) return
    const email = String(new FormData(form).get('email') ?? '').trim()
    if (!email) { setMessage('Enter your email before requesting a sign-in code.'); return }
    setBusy(true)
    try {
      const redirect = new URL(`${import.meta.env.BASE_URL}oauth/consent`, window.location.origin)
      redirect.searchParams.set('authorization_id', authorizationId ?? '')
      const { error } = await client.auth.signInWithOtp({
        email, options: { shouldCreateUser: false, emailRedirectTo: redirect.href },
      })
      if (error) setMessage('A sign-in email could not be sent. Try again.')
      else {
        setCodeEmail(email)
        setMessage('Check your email. Enter its sign-in code here, or follow its sign-in link to return to this request.')
      }
    } catch { setMessage('A sign-in email could not be sent. Try again.') }
    finally { setBusy(false) }
  }

  async function decide(allow: boolean) {
    if (!client || !authorizationId || !request || busy) return
    setBusy(true)
    try {
      const result = allow
        ? await client.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : await client.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })
      if (result.error || !result.data) {
        setRequest(null)
        setMessage('This request could not be completed. Start again from your agent host.')
      } else navigate(result.data.redirect_url)
    } catch { setRequest(null); setMessage('Authorization could not finish. Start again from your agent host.') }
    finally { setBusy(false) }
  }

  return <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 p-8">
    <h1 className="text-2xl font-semibold">Connect your agent</h1>
    {!authorizationId ? <p role="alert">Missing authorization request. Start again from your agent host.</p>
      : !client ? <p role="alert">Sign-in is not configured for this canvas.</p>
        : request ? <>
          <p><strong>{request.client.name}</strong> wants access to your account.</p>
          <dl className="space-y-2 break-words">
            <dt className="font-medium">Signed in as</dt><dd>{request.user.email}</dd>
            <dt className="font-medium">Requested scopes</dt><dd>{request.scope || 'No scopes requested'}</dd>
            <dt className="font-medium">Return address</dt><dd>{request.redirect_uri}</dd>
          </dl>
          <p>Your account permissions still apply to every blueprint tool call.</p>
          <div className="flex gap-3">
            <Button disabled={busy} onClick={() => void decide(true)}>Allow</Button>
            <Button variant="outline" disabled={busy} onClick={() => void decide(false)}>Decline</Button>
          </div>
        </> : <>
          <p role="status">{message}</p>
          {login && <form onSubmit={event => void signIn(event)} className="flex flex-col gap-4">
            <label>Email<Input name="email" type="email" autoComplete="username" readOnly={codeEmail !== null} required /></label>
            {codeEmail
              ? <label>Sign-in code<Input name="code" inputMode="numeric" autoComplete="one-time-code" required /></label>
              : <label>Password<Input name="password" type="password" autoComplete="current-password" required /></label>}
            <Button disabled={busy} type="submit">{codeEmail ? 'Verify code' : 'Sign in'}</Button>
            {!codeEmail && <Button disabled={busy} variant="outline" type="button" onClick={event => void sendCode(event.currentTarget.form)}>Email a sign-in code</Button>}
          </form>}
        </>}
  </main>
}
