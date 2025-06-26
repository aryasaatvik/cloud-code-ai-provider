import {
  LanguageModelV1,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
  LanguageModelV1StreamPart,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  ParseResult,
  Resolvable,
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  postJsonToApi,
  resolve,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { convertToCloudCodeMessages } from './convert-to-cloud-code-messages';
import { mapCloudCodeFinishReason } from './map-cloud-code-finish-reason';
import {
  GoogleCloudCodeModelId,
  GoogleCloudCodeSettings,
} from './google-cloud-code-settings';
import { cloudCodeFailedResponseHandler } from './google-cloud-code-error';
import { prepareTools } from './google-cloud-code-prepare-tools';

type GoogleCloudCodeConfig = {
  provider: string;
  baseURL: string;
  headers: Resolvable<Record<string, string | undefined>>;
  getProjectId: () => Promise<string | undefined>;
  fetch?: FetchFunction;
};

export class GoogleCloudCodeLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly defaultObjectGenerationMode = 'json';
  readonly supportsImageUrls = false;

  readonly modelId: GoogleCloudCodeModelId;
  readonly settings: GoogleCloudCodeSettings;

  private readonly config: GoogleCloudCodeConfig;

  constructor(
    modelId: GoogleCloudCodeModelId,
    settings: GoogleCloudCodeSettings,
    config: GoogleCloudCodeConfig,
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  supportsUrl(url: URL): boolean {
    return url.protocol === 'https:';
  }

  private async getArgs({
    mode,
    prompt,
    maxTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    responseFormat,
    seed,
  }: Parameters<LanguageModelV1['doGenerate']>[0]) {
    const type = mode.type;

    const warnings: LanguageModelV1CallWarning[] = [];

    if (frequencyPenalty != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'frequencyPenalty',
      });
    }

    if (presencePenalty != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'presencePenalty',
      });
    }

    if (seed != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'seed',
      });
    }

    const projectId = await this.config.getProjectId();
    if (!projectId) {
      throw new Error('Project ID is required for Google Cloud Code API');
    }

    const generationConfig = {
      temperature,
      topP,
      topK: topK ?? this.settings.topK,
      maxOutputTokens: maxTokens,
      stopSequences,
      responseMimeType: 
        responseFormat?.type === 'json' ? 'application/json' : undefined,
    };

    const baseRequest = {
      contents: convertToCloudCodeMessages(prompt),
      generationConfig,
      safetySettings: this.settings.safetySettings,
    };

    const baseArgs = {
      model: this.modelId,
      project: projectId,
      request: baseRequest,
    };

    switch (type) {
      case 'regular': {
        const { tools, toolConfig, toolWarnings } = prepareTools(mode);
        
        return {
          args: {
            ...baseArgs,
            request: {
              ...baseRequest,
              tools,
              toolConfig,
            },
          },
          warnings: [...warnings, ...toolWarnings],
        };
      }

      case 'object-json': {
        return {
          args: {
            ...baseArgs,
            request: {
              ...baseRequest,
              generationConfig: {
                ...generationConfig,
                responseMimeType: 'application/json',
              },
            },
          },
          warnings,
        };
      }

      case 'object-tool': {
        return {
          args: {
            ...baseArgs,
            request: {
              ...baseRequest,
              tools: [{
                functionDeclarations: [{
                  name: mode.tool.name,
                  description: mode.tool.description,
                  parameters: mode.tool.parameters,
                }],
              }],
              toolConfig: {
                functionCallingConfig: {
                  mode: 'ANY',
                  allowedFunctionNames: [mode.tool.name],
                },
              },
            },
          },
          warnings,
        };
      }

      default: {
        const _exhaustiveCheck: never = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }

  async doGenerate(
    options: Parameters<LanguageModelV1['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>> {
    const { args, warnings } = await this.getArgs(options);

    let headers;
    try {
      headers = await resolve(this.config.headers);
    } catch (error) {
      throw new Error(
        `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/v1internal:generateContent`,
      headers: combineHeaders(headers, options.headers),
      body: args,
      failedResponseHandler: cloudCodeFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        cloudCodeGenerateContentResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { request: rawPrompt, ...rawSettings } = args;

    // Extract the actual response from the Cloud Code wrapper
    const actualResponse = response.response;
    const candidate = actualResponse.candidates?.[0];

    if (!candidate) {
      throw new Error('No candidates in response');
    }

    const content = candidate.content;
    const textParts = content.parts
      .filter(part => part.text != null)
      .map(part => part.text)
      .join('');

    const toolCalls = content.parts
      .filter(part => part.functionCall != null)
      .map(part => ({
        toolCallType: 'function' as const,
        toolCallId: crypto.randomUUID(),
        toolName: part.functionCall!.name,
        args: JSON.stringify(part.functionCall!.args),
      }));

    return {
      text: textParts || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: mapCloudCodeFinishReason(candidate.finishReason),
      usage: {
        promptTokens: actualResponse.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: actualResponse.usageMetadata?.candidatesTokenCount ?? 0,
      },
      rawCall: { rawPrompt, rawSettings },
      rawResponse: {
        headers: responseHeaders,
        body: rawResponse,
      },
      request: { body: JSON.stringify(args) },
      warnings,
    };
  }

  async doStream(
    options: Parameters<LanguageModelV1['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
    const { args, warnings } = await this.getArgs(options);

    let headers;
    try {
      headers = await resolve(this.config.headers);
    } catch (error) {
      throw new Error(
        `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    const { responseHeaders, value: response } = await postJsonToApi({
      url: `${this.config.baseURL}/v1internal:streamGenerateContent?alt=sse`,
      headers: combineHeaders(headers, options.headers),
      body: args,
      failedResponseHandler: cloudCodeFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        cloudCodeStreamContentChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { request: rawPrompt, ...rawSettings } = args;

    let finishReason: LanguageModelV1FinishReason = 'unknown';
    let usage: { promptTokens: number; completionTokens: number } = {
      promptTokens: Number.NaN,
      completionTokens: Number.NaN,
    };

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof cloudCodeStreamContentChunkSchema>>,
          LanguageModelV1StreamPart
        >({
          transform(chunk, controller) {
            if (!chunk.success) {
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }

            const value = chunk.value;
            
            // Extract the actual response from the Cloud Code wrapper
            const actualResponse = value.response;
            if (!actualResponse) {
              return;
            }

            if (actualResponse.usageMetadata) {
              usage = {
                promptTokens: actualResponse.usageMetadata.promptTokenCount ?? 0,
                completionTokens: actualResponse.usageMetadata.candidatesTokenCount ?? 0,
              };
            }

            const candidate = actualResponse.candidates?.[0];
            if (!candidate) {
              return;
            }

            if (candidate.finishReason) {
              finishReason = mapCloudCodeFinishReason(candidate.finishReason);
            }

            const content = candidate.content;
            if (!content || !content.parts) {
              return;
            }

            for (const part of content.parts) {
              if (part.text != null) {
                controller.enqueue({
                  type: 'text-delta',
                  textDelta: part.text,
                });
              }

              if (part.functionCall != null) {
                const toolCallId = crypto.randomUUID();
                
                controller.enqueue({
                  type: 'tool-call-delta',
                  toolCallType: 'function',
                  toolCallId,
                  toolName: part.functionCall.name,
                  argsTextDelta: JSON.stringify(part.functionCall.args),
                });

                controller.enqueue({
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId,
                  toolName: part.functionCall.name,
                  args: JSON.stringify(part.functionCall.args),
                });
              }
            }
          },

          flush(controller) {
            controller.enqueue({ type: 'finish', finishReason, usage });
          },
        }),
      ),
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      request: { body: JSON.stringify(args) },
      warnings,
    };
  }
}

// Response schemas for Cloud Code API
const cloudCodeContentSchema = z.object({
  role: z.string(),
  parts: z.array(
    z.object({
      text: z.string().optional(),
      functionCall: z.object({
        name: z.string(),
        args: z.record(z.any()).optional(),
      }).optional(),
    }),
  ),
});

const cloudCodeCandidateSchema = z.object({
  content: cloudCodeContentSchema,
  finishReason: z.string().optional(),
});

const cloudCodeUsageMetadataSchema = z.object({
  promptTokenCount: z.number().optional(),
  candidatesTokenCount: z.number().optional(),
  totalTokenCount: z.number().optional(),
});

const cloudCodeGenerateContentResponseSchema = z.object({
  response: z.object({
    candidates: z.array(cloudCodeCandidateSchema).optional(),
    promptFeedback: z.any().optional(),
    usageMetadata: cloudCodeUsageMetadataSchema.optional(),
  }),
});

const cloudCodeStreamContentChunkSchema = z.object({
  response: z.object({
    candidates: z.array(cloudCodeCandidateSchema).optional(),
    usageMetadata: cloudCodeUsageMetadataSchema.optional(),
  }).optional(),
});