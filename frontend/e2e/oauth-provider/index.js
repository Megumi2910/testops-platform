import http from 'node:http'
import { URL } from 'node:url'

const port = Number(process.env.PORT || 9090)
const profile = {
  sub: process.env.GOOGLE_TEST_SUB || 'e2e-google-subject',
  email: process.env.GOOGLE_TEST_EMAIL || 'qa.google@testops.local',
  name: process.env.GOOGLE_TEST_NAME || 'QA Google User',
  picture: process.env.GOOGLE_TEST_PICTURE || 'https://example.test/avatar.png',
}

function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(body))
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`)
  if (request.method === 'GET' && url.pathname === '/health') return json(response, 200, { status: 'UP' })
  if (request.method === 'GET' && url.pathname === '/certs') return json(response, 200, { keys: [] })
  if (request.method === 'GET' && url.pathname === '/userinfo') {
    if (request.headers.authorization !== 'Bearer e2e-google-token') return json(response, 401, { error: 'invalid_token' })
    return json(response, 200, { ...profile, email_verified: true })
  }
  if (request.method === 'GET' && url.pathname === '/o/oauth2/v2/auth') {
    const redirectUri = url.searchParams.get('redirect_uri')
    const state = url.searchParams.get('state')
    if (!redirectUri || !state) return json(response, 400, { error: 'invalid_request' })
    const callback = new URL(redirectUri)
    callback.searchParams.set('code', 'e2e-google-code')
    callback.searchParams.set('state', state)
    response.writeHead(302, { location: callback.toString(), 'cache-control': 'no-store' })
    return response.end()
  }
  if (request.method === 'POST' && url.pathname === '/token') {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', chunk => { body += chunk })
    request.on('end', () => json(response, body.includes('code=e2e-google-code') ? 200 : 400,
      body.includes('code=e2e-google-code')
        ? { access_token: 'e2e-google-token', token_type: 'Bearer', expires_in: 3600 }
        : { error: 'invalid_grant' }))
    return
  }
  json(response, 404, { error: 'not_found' })
})

server.listen(port, '0.0.0.0', () => console.log(`local OAuth provider listening on ${port}`))
