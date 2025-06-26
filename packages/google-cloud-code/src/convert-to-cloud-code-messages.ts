import {
  LanguageModelV1Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';

export function convertToCloudCodeMessages(
  prompt: LanguageModelV1Prompt,
): CloudCodeContent[] {
  const messages: CloudCodeContent[] = [];
  
  // Cloud Code API expects messages in a specific format
  // System messages should be handled separately
  let systemInstruction: string | undefined;
  
  for (const message of prompt) {
    const { role, content } = message;

    switch (role) {
      case 'system': {
        // Collect system messages
        systemInstruction = systemInstruction 
          ? `${systemInstruction}\n\n${content}`
          : content;
        break;
      }

      case 'user': {
        const parts: CloudCodePart[] = [];
        
        for (const part of content) {
          switch (part.type) {
            case 'text': {
              parts.push({ text: part.text });
              break;
            }
            case 'image': {
              parts.push({
                inlineData: {
                  mimeType: part.mimeType ?? 'image/jpeg',
                  data: part.image instanceof URL
                    ? undefined // URL images not supported in base format
                    : convertUint8ArrayToBase64(part.image),
                },
              });
              break;
            }
            case 'file': {
              throw new UnsupportedFunctionalityError({
                functionality: 'File content parts in messages',
              });
            }
          }
        }
        
        messages.push({
          role: 'user',
          parts,
        });
        break;
      }

      case 'assistant': {
        const parts: CloudCodePart[] = [];
        
        for (const part of content) {
          switch (part.type) {
            case 'text': {
              if (part.text.length > 0) {
                parts.push({ text: part.text });
              }
              break;
            }
            case 'tool-call': {
              parts.push({
                functionCall: {
                  name: part.toolName,
                  args: part.args,
                },
              });
              break;
            }
          }
        }
        
        if (parts.length > 0) {
          messages.push({
            role: 'model',
            parts,
          });
        }
        break;
      }

      case 'tool': {
        const parts: CloudCodePart[] = [];
        
        for (const toolResponse of content) {
          parts.push({
            functionResponse: {
              name: toolResponse.toolName,
              response: toolResponse.result,
            },
          });
        }
        
        messages.push({
          role: 'function',
          parts,
        });
        break;
      }

      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  // If we have a system instruction, prepend it as the first user message
  if (systemInstruction) {
    messages.unshift({
      role: 'user',
      parts: [{ text: systemInstruction }],
    });
    
    // Add a model response acknowledging the system instruction
    messages.splice(1, 0, {
      role: 'model',
      parts: [{ text: 'I understand and will follow these instructions.' }],
    });
  }

  return messages;
}

interface CloudCodeContent {
  role: 'user' | 'model' | 'function';
  parts: CloudCodePart[];
}

interface CloudCodePart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data?: string;
  };
  functionCall?: {
    name: string;
    args?: any;
  };
  functionResponse?: {
    name: string;
    response: any;
  };
}