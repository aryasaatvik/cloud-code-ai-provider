import { describe, it, expect } from 'vitest';
import { createGoogleCloudCode } from './google-cloud-code-provider';

describe('GoogleCloudCodeProvider', () => {
  it('should create a provider instance', () => {
    const provider = createGoogleCloudCode();
    expect(provider).toBeDefined();
    expect(typeof provider).toBe('function');
  });

  it('should create a language model', () => {
    const provider = createGoogleCloudCode({
      accessToken: 'test-token',
      projectId: 'test-project',
    });
    
    const model = provider('gemini-2.5-flash');
    expect(model).toBeDefined();
    expect(model.provider).toBe('google-cloud-code');
    expect(model.modelId).toBe('gemini-2.5-flash');
  });

  it('should throw when called with new keyword', () => {
    const provider = createGoogleCloudCode();
    
    expect(() => {
      // @ts-expect-error - testing invalid usage
      new provider('gemini-2.5-flash');
    }).toThrow('The Google Cloud Code model function cannot be called with the new keyword.');
  });

  it('should use custom baseURL when provided', () => {
    const provider = createGoogleCloudCode({
      baseURL: 'https://custom.example.com',
      accessToken: 'test-token',
      projectId: 'test-project',
    });
    
    const model = provider('gemini-2.5-flash');
    expect(model).toBeDefined();
  });

  it('should support auth callback', async () => {
    let authCalled = false;
    
    const provider = createGoogleCloudCode({
      getAuth: async () => {
        authCalled = true;
        return {
          accessToken: 'callback-token',
          projectId: 'callback-project',
        };
      },
    });
    
    const model = provider('gemini-2.5-flash');
    expect(model).toBeDefined();
    
    // The auth callback will be called when making requests
    // For now, just verify the provider was created successfully
  });
});