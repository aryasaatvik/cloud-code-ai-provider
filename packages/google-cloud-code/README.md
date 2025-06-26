# Google Cloud Code Provider for AI SDK

The **Google Cloud Code Provider** enables you to use Google's Gemini models through the Cloud Code API with the [AI SDK](https://sdk.vercel.ai/docs). This provider includes built-in OAuth authentication for free access to Gemini models, similar to the Vertex AI provider but optimized for development tools and IDE integrations.

## Installation

```bash
pnpm add cloud-code-ai-provider
```

## Provider Instance

You can import the default provider instance `googleCloudCode` from `cloud-code-ai-provider`:

```ts
import { googleCloudCode } from 'cloud-code-ai-provider';
```

## Example

```ts
import { googleCloudCode } from 'cloud-code-ai-provider';
import { generateText } from 'ai';

const { text } = await generateText({
  model: googleCloudCode('gemini-2.5-flash'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

## Authentication

This provider supports multiple authentication methods:

### 1. Built-in OAuth (Default)

The provider includes built-in OAuth support using the same credentials as the official Gemini CLI:

```ts
import { createGoogleCloudCode } from 'cloud-code-ai-provider';

// Uses OAuth by default
const provider = createGoogleCloudCode();
```

### 2. Direct Access Token

If you have an access token from another source:

```ts
const provider = createGoogleCloudCode({
  accessToken: 'your-oauth-access-token',
  projectId: 'your-project-id',
  useOAuth: false, // Disable built-in OAuth
});
```

### 3. Pre-existing OAuth Credentials

Use credentials from a previous OAuth flow:

```ts
const provider = createGoogleCloudCode({
  credentials: {
    access_token: 'token',
    refresh_token: 'refresh-token',
    expiry_date: Date.now() + 3600000, // 1 hour
  },
});
```

### Managing Authentication

The provider exports authentication utilities:

```ts
import { GoogleCloudCodeAuth } from 'cloud-code-ai-provider';

// Run the complete OAuth flow with browser authentication
await GoogleCloudCodeAuth.authenticate();

// Force re-authentication
await GoogleCloudCodeAuth.authenticate({ force: true });

// Use custom credential directory
await GoogleCloudCodeAuth.authenticate({ 
  credentialDirectory: '.myapp/credentials' 
});

// Check if authenticated
const isAuth = await GoogleCloudCodeAuth.isAuthenticated();

// Get user info
const userInfo = await GoogleCloudCodeAuth.getUserInfo();
console.log(`Authenticated as: ${userInfo.email}`);

// Check current authentication
const token = await GoogleCloudCodeAuth.getAccessToken();
const projectId = await GoogleCloudCodeAuth.getProjectId();

// Set credentials programmatically
await GoogleCloudCodeAuth.setCredentials({
  access_token: 'token',
  refresh_token: 'refresh',
  expiry_date: Date.now() + 3600000,
});

// Set custom credential directory (default: ~/.gemini)
GoogleCloudCodeAuth.setCredentialDirectory('.myapp/credentials');

// Clear cached credentials
await GoogleCloudCodeAuth.clearCache();
```

### Credential Storage

By default, credentials are stored in `~/.gemini/oauth_creds.json`. You can customize this:

```ts
// Option 1: Via provider settings
const provider = createGoogleCloudCode({
  credentialDirectory: '.myapp/auth', // Will use ~/.myapp/auth/oauth_creds.json
});

// Option 2: Via environment variable
// Set GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json

// Option 3: Programmatically
GoogleCloudCodeAuth.setCredentialDirectory('.custom-dir');
```

## Language Models

You can create models that call the Google Cloud Code API using the provider instance:

```ts
const model = googleCloudCode('gemini-2.5-flash');
```

### Available Models

Currently, only the following models work with Google Cloud Code:

- `gemini-2.5-flash` - Fast, efficient model for most tasks
- `gemini-2.5-pro` - More capable model for complex tasks

### Model Capabilities

| Model | Image Input | Object Generation | Tool Usage | Tool Streaming |
|-------|-------------|-------------------|------------|----------------|
| `gemini-2.5-flash` | No* | Yes | Yes | Yes |
| `gemini-2.5-pro` | No* | Yes | Yes | Yes |

*Note: Image input is not currently supported by the Cloud Code API

### Model Settings

The models support various settings:

```ts
const model = googleCloudCode('gemini-2.5-flash', {
  safetySettings: [
    {
      category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      threshold: 'BLOCK_LOW_AND_ABOVE'
    }
  ],
  useSearchGrounding: false,
  topK: 40,
});
```

## Integration with OpenCode

This provider is designed to work seamlessly with OpenCode and similar development tools:

```ts
// OpenCode handles the OAuth flow internally
const provider = createGoogleCloudCode();

// The provider automatically uses OpenCode's authentication
const result = await generateText({
  model: provider('gemini-2.5-flash'),
  prompt: 'Hello, world!',
});
```

## Differences from Vertex AI Provider

| Feature | Cloud Code Provider | Vertex AI Provider |
|---------|--------------------|--------------------|
| Authentication | OAuth (built-in) | Service Account/ADC |
| Cost | Free with OAuth | Standard API pricing |
| Models | Gemini only | Gemini + Anthropic + Imagen |
| Image Generation | No | Yes |
| Text Embeddings | No | Yes |
| Use Case | Development tools | Production apps |

## Environment Variables

- `GOOGLE_CLOUD_PROJECT` - Override the auto-detected project ID
- `CODE_ASSIST_ENDPOINT` - Custom Cloud Code API endpoint

## Changelog

### 0.1.0

- Added built-in OAuth authentication support
- Integrated with Code Assist API for automatic user onboarding
- Support for multiple authentication methods
- Export authentication utilities for advanced use cases

### 0.0.1

- Initial release with support for Gemini models via Cloud Code API