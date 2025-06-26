// Model IDs supported by Google Cloud Code API
export type GoogleCloudCodeModelId =
  | 'gemini-2.5-flash'
  | 'gemini-2.5-flash-preview-04-17'
  | 'gemini-2.5-flash-preview-05-20'
  | 'gemini-2.5-flash-lite-preview-06-17'
  | 'gemini-2.5-pro'
  | 'gemini-2.5-pro-preview-05-06'
  | 'gemini-2.5-pro-preview-06-05'
  | 'gemini-2.0-flash'
  | 'gemini-2.0-flash-lite'
  | 'gemini-1.5-pro'
  | 'gemini-1.5-flash'
  | 'gemini-1.5-flash-8b'
  | (string & {});

export interface GoogleCloudCodeSettings {
  /**
   * Optional. The maximum number of tokens to consider when sampling.
   * 
   * Models use nucleus sampling or combined Top-k and nucleus sampling.
   * Top-k sampling considers the set of topK most probable tokens.
   * Models running with nucleus sampling don't allow topK setting.
   */
  topK?: number;

  /**
   * A list of unique safety settings for blocking unsafe content.
   */
  safetySettings?: Array<{
    category: string;
    threshold: string;
  }>;

  /**
   * Enable using the web grounding service and search for grounding sources in the response.
   * 
   * Default: false (Google AI) or true (Vertex AI)
   */
  useSearchGrounding?: boolean;
}