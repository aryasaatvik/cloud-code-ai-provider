import {
  LanguageModelV1,
  NoSuchModelError,
  ProviderV1,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  Resolvable,
  resolve,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { GoogleCloudCodeLanguageModel } from './google-cloud-code-language-model';
import {
  GoogleCloudCodeModelId,
  GoogleCloudCodeSettings,
} from './google-cloud-code-settings';
import { GoogleCloudCodeAuth } from './google-cloud-code-auth';

export interface GoogleCloudCodeProvider extends ProviderV1 {
  (
    modelId: GoogleCloudCodeModelId,
    settings?: GoogleCloudCodeSettings,
  ): LanguageModelV1;

  languageModel(
    modelId: GoogleCloudCodeModelId,
    settings?: GoogleCloudCodeSettings,
  ): LanguageModelV1;
}

export interface GoogleCloudCodeProviderSettings {
  /**
   * OAuth access token for authentication.
   * If not provided, the provider will attempt to use OAuth authentication.
   */
  accessToken?: Resolvable<string | undefined>;

  /**
   * Google Cloud project ID.
   * If not provided, the provider will attempt to retrieve it automatically.
   */
  projectId?: Resolvable<string | undefined>;

  /**
   * OAuth credentials for automatic authentication.
   * If provided, the provider will use these credentials to obtain access tokens.
   */
  credentials?: {
    access_token: string;
    refresh_token?: string;
    expiry_date?: number;
  };

  /**
   * Whether to use OAuth authentication.
   * If true and no credentials are provided, you must authenticate separately.
   * Defaults to true if no accessToken is provided.
   */
  useOAuth?: boolean;

  /**
   * Custom directory for storing OAuth credentials.
   * Defaults to ~/.gemini
   * Can also be overridden with GOOGLE_APPLICATION_CREDENTIALS environment variable.
   */
  credentialDirectory?: string;

  /**
   * Base URL for the Cloud Code API.
   * Defaults to https://cloudcode-pa.googleapis.com
   */
  baseURL?: string;

  /**
   * Custom headers to include in requests.
   */
  headers?: Resolvable<Record<string, string | undefined>>;

  /**
   * Custom fetch implementation.
   */
  fetch?: FetchFunction;
}

/**
 * Create a Google Cloud Code provider instance.
 */
export function createGoogleCloudCode(
  options: GoogleCloudCodeProviderSettings = {},
): GoogleCloudCodeProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://cloudcode-pa.googleapis.com',
  );

  // Set custom credential directory if provided
  if (options.credentialDirectory) {
    GoogleCloudCodeAuth.setCredentialDirectory(options.credentialDirectory);
  }

  // Initialize OAuth if credentials are provided
  if (options.credentials) {
    GoogleCloudCodeAuth.setCredentials(options.credentials);
  }

  const getHeaders = async () => {
    const headers = await resolve(options.headers);
    const directAccessToken = await resolve(options.accessToken);
    
    // If direct access token is provided, use it
    if (directAccessToken) {
      return {
        ...headers,
        Authorization: `Bearer ${directAccessToken}`,
      };
    }

    // Otherwise, try OAuth
    const useOAuth = options.useOAuth !== false; // Default to true
    if (useOAuth) {
      const oauthToken = await GoogleCloudCodeAuth.getAccessToken();
      if (oauthToken) {
        return {
          ...headers,
          Authorization: `Bearer ${oauthToken}`,
        };
      }
      
      // If OAuth is enabled but no token is available, throw an error
      throw new Error(
        'Authentication required. Please run the auth flow first or provide an access token.'
      );
    }

    // If OAuth is disabled and no token provided, throw error
    throw new Error(
      'No authentication credentials provided. Either enable OAuth or provide an access token.'
    );
  };

  const getProjectId = async () => {
    const directProjectId = await resolve(options.projectId);
    
    // If direct project ID is provided, use it
    if (directProjectId) {
      return directProjectId;
    }

    // Otherwise, try to get it through OAuth/Code Assist
    const useOAuth = options.useOAuth !== false;
    if (useOAuth) {
      try {
        return await GoogleCloudCodeAuth.getProjectId();
      } catch (error) {
        console.warn('Failed to get project ID through OAuth:', error);
      }
    }

    return undefined;
  };

  const createLanguageModel = (
    modelId: GoogleCloudCodeModelId,
    settings: GoogleCloudCodeSettings = {},
  ) =>
    new GoogleCloudCodeLanguageModel(modelId, settings, {
      provider: 'google-cloud-code',
      baseURL: baseURL ?? 'https://cloudcode-pa.googleapis.com',
      headers: getHeaders,
      getProjectId,
      fetch: options.fetch,
    });

  const createTextEmbeddingModel = () => {
    throw new NoSuchModelError({
      errorName: 'NoSuchModelError',
      modelId: 'text-embedding-001',
      modelType: 'textEmbeddingModel',
      message: 'Text embedding model not supported',
    });
  };

  const provider = function (
    modelId: GoogleCloudCodeModelId,
    settings?: GoogleCloudCodeSettings,
  ) {
    if (new.target) {
      throw new Error(
        'The Google Cloud Code model function cannot be called with the new keyword.',
      );
    }

    return createLanguageModel(modelId, settings);
  };

  provider.languageModel = createLanguageModel;
  provider.textEmbeddingModel = createTextEmbeddingModel;

  return provider;
}

/**
 * Default Google Cloud Code provider instance.
 */
export const googleCloudCode = createGoogleCloudCode();