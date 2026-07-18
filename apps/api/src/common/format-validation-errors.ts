import type { ValidationError } from "class-validator";

export interface FieldError {
  field: string;
  code: string;
  message: string;
}

/**
 * Flattens class-validator's ValidationError tree into the
 * `{field, code, message}[]` shape docs/API.md Section 5 documents for
 * RFC 7807's `errors` array - used as the global ValidationPipe's
 * exceptionFactory in main.ts.
 */
export function formatValidationErrors(errors: ValidationError[], parentPath = ""): FieldError[] {
  const result: FieldError[] = [];

  for (const error of errors) {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;

    if (error.constraints) {
      for (const [code, message] of Object.entries(error.constraints)) {
        result.push({ field, code, message });
      }
    }

    if (error.children && error.children.length > 0) {
      result.push(...formatValidationErrors(error.children, field));
    }
  }

  return result;
}
