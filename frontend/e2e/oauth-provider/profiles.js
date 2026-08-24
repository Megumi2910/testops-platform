export const profileCookieName = 'testops_e2e_oauth_profile'

const derivedProfilePattern = /^(google-only|link|mismatch)\.([a-z0-9]{8,32})$/

export function profileForKey(key, legacyProfile) {
  if (key === 'legacy') return legacyProfile
  const match = derivedProfilePattern.exec(key)
  if (!match) return null
  const [, kind, nonce] = match
  return {
    sub: `e2e-${kind}-${nonce}`,
    email: `qa.${kind}.${nonce}@testops.local`,
    name: `QA ${kind.replace('-', ' ')} ${nonce}`,
    picture: 'https://example.test/avatar.png',
  }
}

export function encodedCredential(prefix, profileKey) {
  return `${prefix}.${profileKey}`
}

export function credentialProfile(value, prefix, legacyProfile) {
  const marker = `${prefix}.`
  if (!value.startsWith(marker)) return null
  const profileKey = value.slice(marker.length)
  return profileForKey(profileKey, legacyProfile) ? profileKey : null
}
