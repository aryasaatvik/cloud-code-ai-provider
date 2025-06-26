import { OAuth2Client, Credentials } from 'google-auth-library';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as http from 'http';
import * as url from 'url';
import * as crypto from 'crypto';
import * as net from 'net';
import open from 'open';

/**
 * Google Cloud Code authentication module
 * Handles OAuth flow and Code Assist API integration
 */

// Client configuration (from Gemini CLI)
const CLIENT_ID = '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

const CODE_ASSIST_ENDPOINT = process.env['CODE_ASSIST_ENDPOINT'] || 'https://cloudcode-pa.googleapis.com';
const CODE_ASSIST_API_VERSION = 'v1internal';

// Types for Cloud Code Assist API
interface ClientMetadata {
  ideType?: string;
  ideVersion?: string;
  pluginVersion?: string;
  platform?: string;
  updateChannel?: string;
  duetProject?: string;
  pluginType?: string;
  ideName?: string;
}

interface LoadCodeAssistRequest {
  cloudaicompanionProject?: string;
  metadata: ClientMetadata;
}

interface LoadCodeAssistResponse {
  currentTier?: GeminiUserTier | null;
  allowedTiers?: GeminiUserTier[] | null;
  cloudaicompanionProject?: string | null;
}

interface GeminiUserTier {
  id: string;
  name: string;
  description: string;
  userDefinedCloudaicompanionProject?: boolean | null;
  isDefault?: boolean;
  hasAcceptedTos?: boolean;
  hasOnboardedPreviously?: boolean;
}

interface OnboardUserRequest {
  tierId: string;
  cloudaicompanionProject?: string;
  metadata: ClientMetadata;
}

interface LongrunningOperationResponse {
  name: string;
  done?: boolean;
  response?: {
    cloudaicompanionProject?: {
      id: string;
      name: string;
    };
  };
  error?: {
    code: number;
    message: string;
  };
}

const DEFAULT_GEMINI_DIR = '.gemini';
const CREDENTIAL_FILENAME = 'oauth_creds.json';

export class GoogleCloudCodeAuth {
  private static oauthClient: OAuth2Client | null = null;
  private static cachedProjectId: string | null = null;
  private static customCredentialDir: string | null = null;

  static async getOAuthClient(): Promise<OAuth2Client> {
    if (!this.oauthClient) {
      this.oauthClient = new OAuth2Client({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
      });
    }

    // Try to load cached credentials
    if (await this.loadCachedCredentials()) {
      return this.oauthClient;
    }

    return this.oauthClient;
  }

  static async setCredentials(credentials: Credentials): Promise<void> {
    const client = await this.getOAuthClient();
    client.setCredentials(credentials);
    await this.cacheCredentials(credentials);
  }

  static async getAccessToken(): Promise<string | undefined> {
    const client = await this.getOAuthClient();

    try {
      const { token } = await client.getAccessToken();
      return token || undefined;
    } catch {
      return undefined;
    }
  }

  static generateAuthUrl(redirectUri: string, state: string): string {
    const client = new OAuth2Client({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    });

    return client.generateAuthUrl({
      redirect_uri: redirectUri,
      access_type: 'offline',
      scope: SCOPES,
      state,
    });
  }

  // Cloud Code Assist API methods
  private static async callEndpoint<T>(
    client: OAuth2Client,
    method: string,
    body: object
  ): Promise<T> {
    const res = await client.request({
      url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      data: body,
    });
    return res.data as T;
  }

  private static async loadCodeAssist(
    client: OAuth2Client,
    projectId?: string
  ): Promise<LoadCodeAssistResponse> {
    const metadata = this.getClientMetadata(projectId);
    const request: LoadCodeAssistRequest = {
      cloudaicompanionProject: projectId,
      metadata,
    };
    return this.callEndpoint<LoadCodeAssistResponse>(client, 'loadCodeAssist', request);
  }

  private static async onboardUser(
    client: OAuth2Client,
    tierId: string,
    projectId?: string
  ): Promise<LongrunningOperationResponse> {
    const metadata = this.getClientMetadata(projectId);
    const request: OnboardUserRequest = {
      tierId,
      cloudaicompanionProject: projectId,
      metadata,
    };
    return this.callEndpoint<LongrunningOperationResponse>(client, 'onboardUser', request);
  }

  private static getClientMetadata(projectId?: string): ClientMetadata {
    const platform = this.getPlatform();
    return {
      ideType: 'IDE_UNSPECIFIED',
      platform,
      pluginType: 'GEMINI',
      duetProject: projectId,
    };
  }

  private static getPlatform(): string {
    const platform = os.platform();
    const arch = os.arch();

    if (platform === 'darwin') {
      return arch === 'arm64' ? 'DARWIN_ARM64' : 'DARWIN_AMD64';
    } else if (platform === 'linux') {
      return arch === 'arm64' ? 'LINUX_ARM64' : 'LINUX_AMD64';
    } else if (platform === 'win32') {
      return 'WINDOWS_AMD64';
    }
    return 'PLATFORM_UNSPECIFIED';
  }

  static async setupUser(): Promise<string> {
    if (this.cachedProjectId) {
      return this.cachedProjectId;
    }

    const envProjectId = process.env['GOOGLE_CLOUD_PROJECT'];
    if (envProjectId) {
      this.cachedProjectId = envProjectId;
      return envProjectId;
    }

    const client = await this.getOAuthClient();

    try {
      const loadRes = await this.loadCodeAssist(client, envProjectId);

      if (!loadRes.allowedTiers || loadRes.allowedTiers.length === 0) {
        throw new Error('No available tiers for Code Assist. Your account may not have access.');
      }

      const defaultTier = loadRes.allowedTiers.find(tier => tier.isDefault);
      const selectedTier = defaultTier || loadRes.allowedTiers[0];

      const projectId = loadRes.cloudaicompanionProject || envProjectId || '';
      let operation = await this.onboardUser(client, selectedTier.id, projectId);

      const maxAttempts = 12;
      let attempts = 0;

      while (!operation.done && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await this.onboardUser(client, selectedTier.id, projectId);
        attempts++;
      }

      if (!operation.done) {
        throw new Error('Onboarding timeout - operation did not complete');
      }

      if (operation.error) {
        throw new Error(`Onboarding failed: ${operation.error.message}`);
      }

      const resolvedProjectId = operation.response?.cloudaicompanionProject?.id;
      if (!resolvedProjectId) {
        throw new Error('No project ID returned from onboarding');
      }

      this.cachedProjectId = resolvedProjectId;
      return resolvedProjectId;

    } catch (error) {
      if (error instanceof Error && error.message.includes('Workspace')) {
        throw new Error(
          'Google Workspace Account detected. Please set GOOGLE_CLOUD_PROJECT environment variable.'
        );
      }

      console.error('Failed to setup Code Assist:', error);

      // Fallback project ID
      const fallbackProjectId = 'elegant-machine-vq6tl';
      this.cachedProjectId = fallbackProjectId;
      return fallbackProjectId;
    }
  }

  static async getProjectId(): Promise<string> {
    return this.setupUser();
  }

  static async clearCache(): Promise<void> {
    this.cachedProjectId = null;
    try {
      await fs.unlink(this.getCachedCredentialPath());
    } catch {
      // File might not exist
    }
  }

  /**
   * Complete OAuth authentication flow with browser
   * Opens browser for authentication and handles the OAuth callback
   * @param options - Optional configuration for the auth flow
   * @returns Promise that resolves when authentication is complete
   */
  static async authenticate(options?: {
    /** Force re-authentication even if already authenticated */
    force?: boolean;
    /** Custom success redirect URL */
    successUrl?: string;
    /** Custom failure redirect URL */
    failureUrl?: string;
    /** Skip browser opening */
    skipBrowser?: boolean;
    /** Custom directory for storing credentials */
    credentialDirectory?: string;
  }): Promise<void> {
    const {
      force = false,
      successUrl = 'https://developers.google.com/gemini-code-assist/auth_success_gemini',
      failureUrl = 'https://developers.google.com/gemini-code-assist/auth_failure_gemini',
      skipBrowser = false,
      credentialDirectory,
    } = options || {};

    // Set custom credential directory if provided
    if (credentialDirectory) {
      this.setCredentialDirectory(credentialDirectory);
    }

    // Check if already authenticated
    if (!force && await this.loadCachedCredentials()) {
      console.log('✅ Already authenticated. Use { force: true } to re-authenticate.');
      return;
    }

    // Clear cache if forcing re-auth
    if (force) {
      await this.clearCache();
    }

    // Get available port for OAuth callback
    const port = await this.getAvailablePort();
    const redirectUri = `http://localhost:${port}/oauth2callback`;
    const state = crypto.randomBytes(32).toString('hex');

    // Generate auth URL
    const authUrl = this.generateAuthUrl(redirectUri, state);

    // Create OAuth callback server promise
    const authPromise = this.createOAuthCallbackServer(port, state, redirectUri, successUrl, failureUrl);

    // Open browser if not skipped
    if (!skipBrowser) {
      console.log('\n🔐 Google Cloud Code Authentication');
      console.log('Opening browser for authentication...\n');
      
      try {
        await open(authUrl);
      } catch (e) {
        console.log('Failed to open browser automatically.');
      }
    }
    
    console.log('Visit this URL to authenticate:');
    console.log(`\n${authUrl}\n`);
    console.log('Waiting for authentication...');

    try {
      await authPromise;
      console.log('\n✅ Authentication successful!');
      
      // Setup user and get project ID
      const projectId = await this.setupUser();
      console.log(`📁 Project ID: ${projectId}`);
      console.log(`📂 Credentials saved to: ${this.getCachedCredentialPath()}\n`);
    } catch (error) {
      console.error('\n❌ Authentication failed:', error);
      throw error;
    }
  }

  /**
   * Check if the user is authenticated
   * @returns True if authenticated with valid credentials
   */
  static async isAuthenticated(): Promise<boolean> {
    try {
      const client = await this.getOAuthClient();
      const hasCredentials = await this.loadCachedCredentials();
      if (!hasCredentials) return false;
      
      const { token } = await client.getAccessToken();
      return !!token;
    } catch {
      return false;
    }
  }

  /**
   * Get information about the authenticated user
   * @returns User information including email
   */
  static async getUserInfo(): Promise<{ email?: string; name?: string; picture?: string }> {
    const client = await this.getOAuthClient();
    const { token } = await client.getAccessToken();
    
    if (!token) {
      throw new Error('Not authenticated');
    }

    const res = await client.request({
      url: 'https://www.googleapis.com/oauth2/v1/userinfo',
    });
    
    return res.data as { email?: string; name?: string; picture?: string };
  }

  /**
   * Find an available port for the OAuth callback server
   */
  private static getAvailablePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      let port = 0;
      try {
        const server = net.createServer();
        server.listen(0, () => {
          const address = server.address()! as net.AddressInfo;
          port = address.port;
        });
        server.on('listening', () => {
          server.close();
          server.unref();
        });
        server.on('error', (e) => reject(e));
        server.on('close', () => resolve(port));
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Create OAuth callback server
   */
  private static createOAuthCallbackServer(
    port: number,
    expectedState: string,
    redirectUri: string,
    successUrl: string,
    failureUrl: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        try {
          const parsedUrl = new url.URL(req.url!, `http://localhost:${port}`);
          
          // Log incoming request for debugging
          console.log(`OAuth callback received: ${req.url}`);
          
          // Only handle OAuth callback
          if (parsedUrl.pathname !== '/oauth2callback') {
            res.writeHead(404);
            res.end('Not found');
            return;
          }

          const code = parsedUrl.searchParams.get('code');
          const state = parsedUrl.searchParams.get('state');
          const error = parsedUrl.searchParams.get('error');

          // Handle OAuth errors
          if (error) {
            res.writeHead(301, { Location: failureUrl });
            res.end();
            server.close(() => reject(new Error(`OAuth error: ${error}`)));
            return;
          }

          // Validate state for CSRF protection
          if (state !== expectedState) {
            res.writeHead(301, { Location: failureUrl });
            res.end();
            server.close(() => reject(new Error('State mismatch - possible CSRF attack')));
            return;
          }

          // Validate authorization code
          if (!code) {
            res.writeHead(301, { Location: failureUrl });
            res.end();
            server.close(() => reject(new Error('No authorization code received')));
            return;
          }

          // Exchange code for tokens
          console.log('Exchanging authorization code for tokens...');
          const client = new OAuth2Client({
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
            redirectUri: redirectUri,
          });

          const { tokens } = await client.getToken(code);
          console.log('Token exchange successful');
          
          await this.setCredentials(tokens);
          console.log('Credentials saved');

          // Success redirect
          res.writeHead(301, { Location: successUrl });
          res.end();

          // Close server immediately and resolve
          setImmediate(() => {
            server.close(() => {
              console.log('OAuth server closed');
              resolve();
            });
          });

        } catch (error) {
          console.error('OAuth callback error:', error);
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1>❌ Authentication Error</h1>
                <p>An error occurred during authentication. Please check the console and try again.</p>
                <p style="color: #666; font-size: 14px;">${error instanceof Error ? error.message : 'Unknown error'}</p>
              </body>
            </html>
          `);
          server.close(() => reject(error));
        }
      });

      server.listen(port, () => {
        console.log(`OAuth callback server listening on port ${port}`);
      });

      // Add timeout (5 minutes)
      const timeout = setTimeout(() => {
        server.close(() => reject(new Error('Authentication timeout')));
      }, 5 * 60 * 1000);

      server.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  static setCredentialDirectory(directory: string): void {
    this.customCredentialDir = directory;
  }

  static getCredentialDirectory(): string {
    return this.customCredentialDir || DEFAULT_GEMINI_DIR;
  }

  private static getCachedCredentialPath(): string {
    // Priority order:
    // 1. Environment variable GOOGLE_APPLICATION_CREDENTIALS
    // 2. Custom directory if set via setCredentialDirectory
    // 3. Default ~/.gemini directory
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      return process.env.GOOGLE_APPLICATION_CREDENTIALS;
    }
    
    const baseDir = this.customCredentialDir || DEFAULT_GEMINI_DIR;
    console.log('baseDir', baseDir);
    return path.join(os.homedir(), baseDir, CREDENTIAL_FILENAME);
  }

  private static async loadCachedCredentials(): Promise<boolean> {
    try {
      const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || this.getCachedCredentialPath();
      const creds = await fs.readFile(keyFile, 'utf-8');
      this.oauthClient!.setCredentials(JSON.parse(creds));

      // Verify the credentials are valid
      const { token } = await this.oauthClient!.getAccessToken();
      if (!token) {
        return false;
      }

      // Check with server that token hasn't been revoked
      await this.oauthClient!.getTokenInfo(token);
      return true;
    } catch {
      return false;
    }
  }

  private static async cacheCredentials(credentials: Credentials): Promise<void> {
    const filePath = this.getCachedCredentialPath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const credString = JSON.stringify(credentials, null, 2);
    await fs.writeFile(filePath, credString);
  }
}