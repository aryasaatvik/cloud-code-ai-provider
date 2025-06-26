# Google Cloud Code Provider - Quickstart Example

This example demonstrates how to use the Google Cloud Code AI SDK Provider with built-in OAuth authentication for free access to Gemini models.

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Authenticate (one-time setup):
```bash
pnpm run auth
```

This will:
- Open your browser for Google OAuth authentication
- Save credentials to `~/.gemini/oauth_creds.json`
- Set up your Cloud Code project automatically

3. Run the examples:
```bash
pnpm start
```

## What's Included

The example demonstrates:
- ✅ Simple text generation
- ✅ Streaming responses
- ✅ Tool/function calling
- ✅ Structured output generation
- ✅ Automatic authentication handling

## Features

### Built-in Authentication
The provider includes OAuth authentication using the same credentials as the official Gemini CLI. Once authenticated, you get free access to Gemini models.

### Zero Configuration
After authentication, the provider automatically handles:
- Token refresh
- Project ID management
- API endpoint configuration

### Custom Credential Storage
By default, credentials are stored in `~/.gemini/`. You can customize this:

```typescript
const provider = createGoogleCloudCode({
  credentialDirectory: '.myapp/auth', // Use ~/.myapp/auth instead
});
```

## Troubleshooting

If you encounter authentication issues:
1. Run `pnpm run auth` to re-authenticate
2. Check that you have internet access
3. Ensure your Google account has access to Google Cloud

## Next Steps

- Explore the [AI SDK documentation](https://sdk.vercel.ai/docs)
- Check out more [Gemini models](https://ai.google.dev/models/gemini)
- Learn about [tool calling](https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling) and [structured generation](https://sdk.vercel.ai/docs/ai-sdk-core/generating-structured-data)