import { describe, expect, it } from 'vitest';
import { inspectDriverConfigSchema, validateDriverConfigAgainstSchema } from './driverConfigSchema';

describe('driver config schema', () => {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['region'],
    properties: {
      region: { type: 'string', title: 'Region', default: 'us-east-1', minLength: 2 },
      retries: { type: 'integer', minimum: 0, maximum: 5 },
      enabled: { type: 'boolean', default: true },
      mode: { type: 'string', enum: ['fast', 'safe'] }
    }
  };

  it('extracts the supported flat field subset', () => {
    expect(inspectDriverConfigSchema(schema)).toEqual({
      hasUnsupportedFields: false,
      fields: [
        expect.objectContaining({ name: 'region', type: 'string', title: 'Region', required: true, defaultValue: 'us-east-1' }),
        expect.objectContaining({ name: 'retries', type: 'integer', minimum: 0, maximum: 5 }),
        expect.objectContaining({ name: 'enabled', type: 'boolean', defaultValue: true }),
        expect.objectContaining({ name: 'mode', type: 'string', enumValues: ['fast', 'safe'] })
      ]
    });
  });

  it('flags unsupported nested fields without hiding supported siblings', () => {
    const inspected = inspectDriverConfigSchema({
      type: 'object',
      properties: {
        region: { type: 'string' },
        nested: { type: 'object', properties: {} }
      }
    });
    expect(inspected.fields.map((field) => field.name)).toEqual(['region']);
    expect(inspected.hasUnsupportedFields).toBe(true);
  });

  it('returns the first field validation issue', () => {
    expect(validateDriverConfigAgainstSchema(schema, {})).toMatchObject({ field: 'region', code: 'required' });
    expect(validateDriverConfigAgainstSchema(schema, { region: 'x' })).toMatchObject({ field: 'region', code: 'min_length' });
    expect(validateDriverConfigAgainstSchema(schema, { region: 'eu', retries: 6 })).toMatchObject({ field: 'retries', code: 'maximum' });
    expect(validateDriverConfigAgainstSchema(schema, { region: 'eu', mode: 'unknown' })).toMatchObject({ field: 'mode', code: 'enum' });
    expect(validateDriverConfigAgainstSchema(schema, { region: 'eu', retries: 2, enabled: true, mode: 'safe' })).toBeNull();
  });
});
