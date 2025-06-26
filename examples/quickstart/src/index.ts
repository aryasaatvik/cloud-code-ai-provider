import { createGoogleCloudCode, GoogleCloudCodeAuth } from 'cloud-code-ai-provider';
import { generateObject, generateText, streamText } from 'ai';
import { z } from 'zod';

async function main() {
  console.log('🚀 Google Cloud Code AI SDK - Quickstart\n');

  // Create the provider with default settings (uses OAuth)
  const provider = createGoogleCloudCode({
    credentialDirectory: '.free-gemini'
  });

  try {

    // Example 1: Simple text generation
    console.log('1️⃣ Simple Text Generation:');
    const result = await generateText({
      model: provider('gemini-2.5-flash'),
      prompt: 'Write a haiku about coding with AI.',
    });
    console.log(result.text);
    console.log();

    // Example 2: Streaming response
    console.log('2️⃣ Streaming Response:');
    const { textStream } = streamText({
      model: provider('gemini-2.5-flash'),
      prompt: 'List 3 benefits of using AI in software development.',
    });

    for await (const chunk of textStream) {
      process.stdout.write(chunk);
    }
    console.log('\n');

    // Example 3: Simple chat (tools can have compatibility issues with some models)
    console.log('3️⃣ Chat Conversation:');
    const chatResult = await generateText({
      model: provider('gemini-2.5-flash'),
      messages: [
        { role: 'user', content: 'What is 2+2?' },
        { role: 'assistant', content: '2+2 equals 4.' },
        { role: 'user', content: 'What about 3+3?' }
      ],
    });
    console.log(chatResult.text);
    console.log();

    // Example 4: Using tools with Gemini 2.5 Pro
    console.log('4️⃣ Using Tools (Gemini 2.5 Pro):');
    try {
      const toolResult = await generateText({
        model: provider('gemini-2.5-pro'),
        prompt: 'What is the weather like in San Francisco and Tokyo?',
        tools: {
          getWeather: {
            description: 'Get weather information for a city',
            parameters: z.object({
              city: z.string().describe('The city name'),
              unit: z.enum(['celsius', 'fahrenheit']).optional().default('celsius'),
            }),
            execute: async ({ city, unit }) => {
              // Simulated weather data
              const weatherData = {
                'San Francisco': { temp: 18, condition: 'Sunny' },
                'Tokyo': { temp: 22, condition: 'Cloudy' },
              };
              const data = weatherData[city as keyof typeof weatherData] || { temp: 20, condition: 'Unknown' };
              const temp = unit === 'fahrenheit' ? Math.round(data.temp * 9/5 + 32) : data.temp;
              return {
                city,
                temperature: temp,
                unit: unit || 'celsius',
                condition: data.condition,
                description: `${data.condition} with a temperature of ${temp}°${unit === 'fahrenheit' ? 'F' : 'C'}`
              };
            },
          },
        },
        maxSteps: 5,
      });
      console.log('Tool Result:', toolResult.text);
      console.log();
    } catch (error) {
      console.log('Tool calling not supported or error:', error instanceof Error ? error.message : error);
      console.log();
    }

    // Example 5: Structured output
    console.log('5️⃣ Structured Output:');
    const { object } = await generateObject({
      model: provider('gemini-2.5-flash'),
      prompt: 'Generate a simple todo item about learning AI.',
      schema: z.object({
        title: z.string(),
        description: z.string(),
        priority: z.enum(['low', 'medium', 'high']),
        dueDate: z.string(),
      }),
    });
    console.log('Generated Todo:', JSON.stringify(object, null, 2));
    console.log();

    // Show configuration info
    console.log('ℹ️  Configuration:');
    const projectId = await GoogleCloudCodeAuth.getProjectId();
    console.log(`- Project ID: ${projectId}`);
    console.log(`- Credential Directory: ~/.${GoogleCloudCodeAuth.getCredentialDirectory()}`);
    console.log('- Cost: FREE (using OAuth)\n');

    console.log('✨ All examples completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    
    if (error instanceof Error) {
      if (error.message.includes('Authentication required') || error.message.includes('401')) {
        console.log('\n👉 You need to authenticate first. Run "npm run auth" to set up OAuth.');
      } else if (error.message.includes('Authentication failed')) {
        console.log('\n👉 Your authentication may have expired. Run "npm run auth" to re-authenticate.');
      }
    }
    
    process.exit(1);
  }
}

// Run the examples
main();