import assert from 'node:assert/strict'
import test from 'node:test'

import { credentialProfile, encodedCredential, profileForKey } from './profiles.js'

const legacy = {
  sub: 'legacy-subject',
  email: 'legacy@testops.local',
  name: 'Legacy User',
  picture: 'https://example.test/legacy.png',
}

test('derives each allowed profile from only its strict kind and nonce', () => {
  for (const kind of ['google-only', 'link', 'mismatch']) {
    assert.deepEqual(profileForKey(`${kind}.abc12345`, legacy), {
      sub: `e2e-${kind}-abc12345`,
      email: `qa.${kind}.abc12345@testops.local`,
      name: `QA ${kind.replace('-', ' ')} abc12345`,
      picture: 'https://example.test/avatar.png',
    })
  }
  assert.equal(profileForKey('legacy', legacy), legacy)
})

test('rejects malformed profiles and cannot accept an arbitrary email', () => {
  for (const invalid of [
    'link.short',
    'link.UPPERCASE1',
    'link.abc12345@example.test',
    'admin.abc12345',
    'link.abc12345.extra',
  ]) assert.equal(profileForKey(invalid, legacy), null)
})

test('binds authorization codes and access tokens to one validated profile key', () => {
  const code = encodedCredential('e2e-google-code', 'link.abc12345')
  const token = encodedCredential('e2e-google-token', 'link.abc12345')
  assert.equal(credentialProfile(code, 'e2e-google-code', legacy), 'link.abc12345')
  assert.equal(credentialProfile(token, 'e2e-google-token', legacy), 'link.abc12345')
  assert.equal(credentialProfile('e2e-google-token.link.bad', 'e2e-google-token', legacy), null)
})
