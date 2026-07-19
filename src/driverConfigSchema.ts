export type DriverConfigFieldType = 'string' | 'integer' | 'number' | 'boolean';

export interface DriverConfigField {
  name: string;
  type: DriverConfigFieldType;
  title: string;
  description: string;
  required: boolean;
  defaultValue?: unknown;
  enumValues?: Array<string | number>;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
}

export interface DriverConfigFormSchema {
  fields: DriverConfigField[];
  hasUnsupportedFields: boolean;
}

export interface DriverConfigValidationIssue {
  field: string;
  label: string;
  code: 'required' | 'invalid_type' | 'enum' | 'minimum' | 'maximum' | 'min_length' | 'max_length';
}

export function inspectDriverConfigSchema(schema: unknown): DriverConfigFormSchema {
  if (!isRecord(schema)) return { fields: [], hasUnsupportedFields: false };
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required)
    ? new Set(schema.required.filter((value): value is string => typeof value === 'string'))
    : new Set<string>();
  const fields: DriverConfigField[] = [];
  let hasUnsupportedFields = false;

  for (const [name, definition] of Object.entries(properties)) {
    if (!isRecord(definition) || !isFieldType(definition.type)) {
      hasUnsupportedFields = true;
      continue;
    }
    const enumValues = Array.isArray(definition.enum)
      ? definition.enum.filter((value): value is string | number => (
          (definition.type === 'string' && typeof value === 'string')
          || ((definition.type === 'integer' || definition.type === 'number') && typeof value === 'number')
        ))
      : undefined;
    if (Array.isArray(definition.enum) && enumValues?.length !== definition.enum.length) {
      hasUnsupportedFields = true;
    }
    fields.push({
      name,
      type: definition.type,
      title: typeof definition.title === 'string' && definition.title.trim() ? definition.title : name,
      description: typeof definition.description === 'string' ? definition.description : '',
      required: required.has(name),
      defaultValue: definition.default,
      enumValues,
      minimum: finiteNumber(definition.minimum),
      maximum: finiteNumber(definition.maximum),
      minLength: nonNegativeInteger(definition.minLength),
      maxLength: nonNegativeInteger(definition.maxLength)
    });
  }

  if (hasUnsupportedSchemaKeywords(schema)) hasUnsupportedFields = true;
  return { fields, hasUnsupportedFields };
}

export function validateDriverConfigAgainstSchema(
  schema: unknown,
  config: Record<string, unknown>
): DriverConfigValidationIssue | null {
  const inspected = inspectDriverConfigSchema(schema);
  for (const field of inspected.fields) {
    const value = config[field.name];
    if (value == null || value === '') {
      if (field.required) return { field: field.name, label: field.title, code: 'required' };
      continue;
    }
    if (!matchesFieldType(value, field.type)) {
      return { field: field.name, label: field.title, code: 'invalid_type' };
    }
    if (field.enumValues && !field.enumValues.includes(value as string | number)) {
      return { field: field.name, label: field.title, code: 'enum' };
    }
    if (typeof value === 'number') {
      if (field.minimum != null && value < field.minimum) return { field: field.name, label: field.title, code: 'minimum' };
      if (field.maximum != null && value > field.maximum) return { field: field.name, label: field.title, code: 'maximum' };
    }
    if (typeof value === 'string') {
      if (field.minLength != null && value.length < field.minLength) return { field: field.name, label: field.title, code: 'min_length' };
      if (field.maxLength != null && value.length > field.maxLength) return { field: field.name, label: field.title, code: 'max_length' };
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFieldType(value: unknown): value is DriverConfigFieldType {
  return value === 'string' || value === 'integer' || value === 'number' || value === 'boolean';
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function matchesFieldType(value: unknown, type: DriverConfigFieldType): boolean {
  if (type === 'string') return typeof value === 'string';
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  return typeof value === 'number' && Number.isFinite(value);
}

function hasUnsupportedSchemaKeywords(schema: Record<string, unknown>): boolean {
  return ['$ref', '$defs', 'definitions', 'allOf', 'anyOf', 'oneOf', 'if', 'then', 'else', 'patternProperties']
    .some((key) => key in schema);
}
