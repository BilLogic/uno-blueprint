// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { OAuthConsent } from './OAuthConsent'

const details = {
  authorization_id: 'request-one', redirect_uri: 'http://localhost:48000/callback',
  client: { id: 'client-one', name: 'Blueprint host', uri: '', logo_uri: '' },
  user: { id: 'person-one', email: 'owner@example.test' }, scope: 'openid profile',
}
const oauth = {
  getAuthorizationDetails: vi.fn().mockResolvedValue({ data: details, error: null }),
  approveAuthorization: vi.fn().mockResolvedValue({ data: { redirect_url: 'http://localhost:48000/callback?code=approved' }, error: null }),
  denyAuthorization: vi.fn().mockResolvedValue({ data: { redirect_url: 'http://localhost:48000/callback?error=access_denied' }, error: null }),
}
const signInWithPassword = vi.fn().mockResolvedValue({ error: null })
const signInWithOtp = vi.fn().mockResolvedValue({ error: null })
const verifyOtp = vi.fn().mockResolvedValue({ error: null })
const context = { client: { auth: { oauth, signInWithPassword, signInWithOtp, verifyOtp } } }
vi.mock('@/lib/supabase', () => ({ createSupabaseClient: () => context.client }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('shows the Auth-verified request and sends only the explicit decision', async () => {
  const navigate = vi.fn()
  render(<OAuthConsent authorizationId="request-one" navigate={navigate} />)
  expect(await screen.findByText('Blueprint host')).toBeDefined()
  expect(screen.getByText('openid profile')).toBeDefined()
  expect(screen.getByText('owner@example.test')).toBeDefined()
  expect(oauth.approveAuthorization).not.toHaveBeenCalled()
  await act(async () => { screen.getByRole('button', { name: 'Allow' }).click() })
  expect(oauth.approveAuthorization).toHaveBeenCalledWith('request-one', { skipBrowserRedirect: true })
  expect(navigate).toHaveBeenCalledWith('http://localhost:48000/callback?code=approved')
})

it('declines without approving and follows the server denial callback', async () => {
  const navigate = vi.fn()
  render(<OAuthConsent authorizationId="request-one" navigate={navigate} />)
  await screen.findByText('Blueprint host')
  await act(async () => { screen.getByRole('button', { name: 'Decline' }).click() })
  expect(oauth.approveAuthorization).not.toHaveBeenCalled()
  expect(navigate).toHaveBeenCalledWith('http://localhost:48000/callback?error=access_denied')
})

it('signs in without losing the request, then fetches consent details again', async () => {
  oauth.getAuthorizationDetails.mockResolvedValueOnce({ data: null, error: { name: 'AuthSessionMissingError', status: 400 } })
  render(<OAuthConsent authorizationId="request-one" navigate={vi.fn()} />)
  await screen.findByRole('button', { name: 'Sign in' })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@example.test' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } })
  await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!) })
  await screen.findByText('Blueprint host')
  expect(signInWithPassword).toHaveBeenCalledWith({ email: 'owner@example.test', password: 'test-password' })
  expect(oauth.getAuthorizationDetails).toHaveBeenNthCalledWith(2, 'request-one')
})

it('refuses a missing request without an Auth call', () => {
  render(<OAuthConsent authorizationId={null} />)
  expect(screen.getByRole('alert').textContent).toContain('Missing authorization request')
  expect(oauth.getAuthorizationDetails).not.toHaveBeenCalled()
})

it('does not expose provider errors or redirect after a failed approval', async () => {
  oauth.approveAuthorization.mockResolvedValueOnce({ data: null, error: { message: 'sensitive provider detail' } })
  const navigate = vi.fn()
  render(<OAuthConsent authorizationId="request-one" navigate={navigate} />)
  await screen.findByText('Blueprint host')
  await act(async () => { screen.getByRole('button', { name: 'Allow' }).click() })
  expect(screen.getByRole('status').textContent).toContain('could not be completed')
  expect(screen.queryByText('sensitive provider detail')).toBeNull()
  expect(navigate).not.toHaveBeenCalled()
})

it('signs in with an emailed code while keeping the consent request', async () => {
  oauth.getAuthorizationDetails.mockResolvedValueOnce({ data: null, error: { name: 'AuthSessionMissingError', status: 400 } })
  const navigate = vi.fn()
  render(<OAuthConsent authorizationId="request-one" navigate={navigate} />)
  await screen.findByRole('button', { name: 'Sign in' })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@example.test' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Email a sign-in code' })) })
  expect(signInWithOtp).toHaveBeenCalledWith({
    email: 'owner@example.test',
    options: { shouldCreateUser: false, emailRedirectTo: expect.stringContaining('authorization_id=request-one') },
  })
  expect(oauth.approveAuthorization).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Sign-in code'), { target: { value: '123456' } })
  await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Verify code' }).closest('form')!) })
  expect(verifyOtp).toHaveBeenCalledWith({ email: 'owner@example.test', token: '123456', type: 'email' })
  await screen.findByText('Blueprint host')
  expect(oauth.getAuthorizationDetails).toHaveBeenNthCalledWith(2, 'request-one')
  expect(oauth.approveAuthorization).not.toHaveBeenCalled()
  expect(navigate).not.toHaveBeenCalled()
})
