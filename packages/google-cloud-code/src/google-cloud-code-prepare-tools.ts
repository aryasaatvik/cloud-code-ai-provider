import {
  LanguageModelV1CallWarning,
} from '@ai-sdk/provider';

type ToolsInput = {
  type: 'regular';
  tools?: Array<{
    type: string;
    name: string;
    description?: string;
    parameters: any;
  }>;
  toolChoice?: {
    type: 'auto' | 'none' | 'required';
  } | {
    type: 'tool';
    toolName: string;
  };
};

export function prepareTools(mode: ToolsInput): {
  tools?: Array<{
    functionDeclarations: Array<{
      name: string;
      description?: string;
      parameters?: any;
    }>;
  }>;
  toolConfig?: {
    functionCallingConfig: {
      mode: 'AUTO' | 'ANY' | 'NONE';
      allowedFunctionNames?: string[];
    };
  };
  toolWarnings: LanguageModelV1CallWarning[];
} {
  const toolWarnings: LanguageModelV1CallWarning[] = [];

  if (!mode.tools || mode.tools.length === 0) {
    return { toolWarnings };
  }

  const functionDeclarations = mode.tools.map(tool => {
    // Remove $schema field if it exists (Cloud Code API doesn't accept it)
    let params = tool.parameters;
    if (params && typeof params === 'object' && '$schema' in params) {
      const { $schema, ...cleanParams } = params;
      params = cleanParams;
    }
    
    return {
      name: tool.name,
      description: tool.description,
      parameters: params,
    };
  });

  const tools = [{
    functionDeclarations,
  }];

  // Map tool choice to Cloud Code format
  let toolConfig: any;
  
  if (mode.toolChoice) {
    if (mode.toolChoice.type === 'none') {
      toolConfig = {
        functionCallingConfig: {
          mode: 'NONE',
        },
      };
    } else if (mode.toolChoice.type === 'required') {
      toolConfig = {
        functionCallingConfig: {
          mode: 'ANY',
        },
      };
    } else if (mode.toolChoice.type === 'tool') {
      toolConfig = {
        functionCallingConfig: {
          mode: 'ANY',
          allowedFunctionNames: [mode.toolChoice.toolName],
        },
      };
    } else {
      // auto
      toolConfig = {
        functionCallingConfig: {
          mode: 'AUTO',
        },
      };
    }
  } else {
    // Default to AUTO
    toolConfig = {
      functionCallingConfig: {
        mode: 'AUTO',
      },
    };
  }

  return {
    tools,
    toolConfig,
    toolWarnings,
  };
}