import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import { z } from 'zod';

const cloudCodeErrorDataSchema = z.object({
  error: z.object({
    code: z.number(),
    message: z.string(),
    status: z.string().optional(),
    details: z.array(z.any()).optional(),
  }),
});

export type CloudCodeErrorData = z.infer<typeof cloudCodeErrorDataSchema>;

export const cloudCodeFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: cloudCodeErrorDataSchema,
  errorToMessage: (data) => data.error.message,
});