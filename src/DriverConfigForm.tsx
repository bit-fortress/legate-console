import { useId, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { SelectControl } from './SelectControl';
import { inspectDriverConfigSchema } from './driverConfigSchema';

interface DriverConfigFormLabels {
  title: string;
  empty: string;
  advanced: string;
  unsupported: string;
  invalidNumber: string;
}

interface DriverConfigFormProps {
  schema: unknown;
  value: Record<string, unknown>;
  rawValue: string;
  labels: DriverConfigFormLabels;
  onChange: (value: Record<string, unknown>) => void;
  onRawChange: (value: string) => void;
}

export function DriverConfigForm({ schema, value, rawValue, labels, onChange, onRawChange }: DriverConfigFormProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const inspected = inspectDriverConfigSchema(schema);

  function setField(name: string, next: unknown) {
    const updated = { ...value };
    if (next === undefined || next === '') delete updated[name];
    else updated[name] = next;
    onChange(updated);
  }

  return (
    <section className="driver-config-form" aria-label={labels.title}>
      <div className="driver-config-form-head">
        <strong>{labels.title}</strong>
      </div>
      {inspected.fields.length === 0 && !inspected.hasUnsupportedFields && (
        <p className="driver-config-empty">{labels.empty}</p>
      )}
      {inspected.fields.length > 0 && (
        <div className="driver-config-field-grid">
          {inspected.fields.map((field) => (
            <SchemaField
              key={field.name}
              field={field}
              value={value[field.name]}
              invalidNumberLabel={labels.invalidNumber}
              onChange={(next) => setField(field.name, next)}
            />
          ))}
        </div>
      )}
      {inspected.hasUnsupportedFields && (
        <div className="driver-config-advanced">
          <p className="driver-config-warning">{labels.unsupported}</p>
          <button
            type="button"
            className="driver-config-advanced-toggle"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((current) => !current)}
          >
            {advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {labels.advanced}
          </button>
          {advancedOpen && (
            <textarea
              aria-label={labels.advanced}
              rows={7}
              value={rawValue}
              onChange={(event) => onRawChange(event.target.value)}
            />
          )}
        </div>
      )}
    </section>
  );
}

function SchemaField({ field, value, invalidNumberLabel, onChange }: {
  field: ReturnType<typeof inspectDriverConfigSchema>['fields'][number];
  value: unknown;
  invalidNumberLabel: string;
  onChange: (value: unknown) => void;
}) {
  const inputId = useId();
  const label = field.required ? `${field.title} *` : field.title;

  if (field.type === 'boolean') {
    const checked = value === true;
    return (
      <div className="schema-field schema-field-boolean">
        <div>
          <span>{label}</span>
          {field.description && <p>{field.description}</p>}
        </div>
        <button
          id={inputId}
          type="button"
          className={checked ? 'switch on' : 'switch'}
          role="switch"
          aria-label={label}
          aria-checked={checked}
          onClick={() => onChange(!checked)}
        >
          <span aria-hidden="true" />
        </button>
      </div>
    );
  }

  if (field.enumValues?.length) {
    return (
      <div className="field schema-field">
        <span>{label}</span>
        <SelectControl
          value={value == null ? '' : String(value)}
          ariaLabel={label}
          placeholder="—"
          options={field.enumValues.map((option) => ({ value: String(option), label: String(option) }))}
          onChange={(next) => {
            if (field.type === 'integer' || field.type === 'number') onChange(Number(next));
            else onChange(next);
          }}
        />
        {field.description && <small>{field.description}</small>}
      </div>
    );
  }

  const numeric = field.type === 'integer' || field.type === 'number';
  return (
    <div className="field schema-field">
      <span>{label}</span>
      <input
        id={inputId}
        aria-label={label}
        type={numeric ? 'number' : 'text'}
        step={field.type === 'integer' ? 1 : numeric ? 'any' : undefined}
        min={field.minimum}
        max={field.maximum}
        minLength={field.minLength}
        maxLength={field.maxLength}
        value={typeof value === 'string' || typeof value === 'number' ? value : ''}
        aria-errormessage={numeric && typeof value === 'number' && !Number.isFinite(value) ? invalidNumberLabel : undefined}
        onChange={(event) => {
          if (!numeric) {
            onChange(event.target.value);
            return;
          }
          if (event.target.value === '') {
            onChange(undefined);
            return;
          }
          onChange(Number(event.target.value));
        }}
      />
      {field.description && <small>{field.description}</small>}
    </div>
  );
}
