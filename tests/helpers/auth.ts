import { APIRequestContext } from '@playwright/test'

// Authentication configuration
const authConfig = {
  enabled: process.env.OAUTH2_ENABLED === 'true',
  keycloakUrl: process.env.KEYCLOAK_URL || 'http://localhost:8080',
  realm: process.env.KEYCLOAK_REALM || 'shopping-cart',
  clientId: process.env.KEYCLOAK_CLIENT_ID || 'e2e-tests',
  clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || '',
  testUsername: process.env.TEST_USERNAME || 'e2e-user',
  testPassword: process.env.TEST_PASSWORD || 'e2e-password',
}

// Token cache
let cachedToken: { token: string; expiresAt: number } | null = null

/**
 * Get OAuth2 token from Keycloak
 */
export async function getAuthToken(request: APIRequestContext): Promise<string | null> {
  if (!authConfig.enabled) {
    return null
  }

  // Check cached token
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token
  }

  const tokenUrl = `${authConfig.keycloakUrl}/realms/${authConfig.realm}/protocol/openid-connect/token`

  try {
    const response = await request.post(tokenUrl, {
      form: {
        grant_type: 'password',
        client_id: authConfig.clientId,
        client_secret: authConfig.clientSecret,
        username: authConfig.testUsername,
        password: authConfig.testPassword,
      },
    })

    if (!response.ok()) {
      console.error('Failed to get auth token:', await response.text())
      return null
    }

    const data = await response.json()
    const expiresIn = data.expires_in || 300 // Default 5 minutes

    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (expiresIn - 30) * 1000, // Refresh 30s before expiry
    }

    return cachedToken.token
  } catch (error) {
    console.error('Error getting auth token:', error)
    return null
  }
}

/**
 * Get authorization headers for API requests
 */
export async function getAuthHeaders(
  request: APIRequestContext
): Promise<Record<string, string>> {
  const token = await getAuthToken(request)

  if (token) {
    return {
      Authorization: `Bearer ${token}`,
    }
  }

  // Fallback to X-User-ID for non-OAuth2 mode
  return {
    'X-User-ID': process.env.TEST_USER_ID || 'e2e-test-user',
  }
}

/**
 * Clear cached token (useful for testing token refresh)
 */
export function clearTokenCache(): void {
  cachedToken = null
}

/**
 * Check if OAuth2 is enabled
 */
export function isOAuth2Enabled(): boolean {
  return authConfig.enabled
}
