import { useState } from 'react';
import { Settings } from 'lucide-react';
import openAIMark from './assets/openai-mark.svg';
import { IMAGE_PROTOCOL_CONTRACTS, imageProtocolDisplayName } from './imageProtocols';
import type { ImageProtocolContract, ImageProtocolLimit } from './types';

interface ImageProtocolSelectorProps {
  label: string;
  values: ImageProtocolContract[];
  disabledContracts: Set<ImageProtocolContract>;
  onChange: (values: ImageProtocolContract[]) => void;
  limits?: ImageProtocolLimit[];
  onLimitChange?: (contract: ImageProtocolContract, patch: Partial<ImageProtocolLimit>) => void;
  settingsLabel?: string;
  maxImagesLabel?: string;
  maxReferenceImagesLabel?: string;
  compact?: boolean;
}

export default function ImageProtocolSelector({
  label,
  values,
  disabledContracts,
  onChange,
  limits = [],
  onLimitChange,
  settingsLabel = '',
  maxImagesLabel = '',
  maxReferenceImagesLabel = '',
  compact = false
}: ImageProtocolSelectorProps) {
  const [selectedContract, setSelectedContract] = useState<ImageProtocolContract | null>(null);

  if (compact && onLimitChange) {
    return (
      <fieldset className="text-protocol-selector image-protocol-selector compact">
        <legend>{label}</legend>
        <div className="image-protocol-configurator">
          <div className="image-protocol-config-list" role="list" aria-label={label}>
            {IMAGE_PROTOCOL_CONTRACTS.map((contract) => {
              const checked = values.includes(contract);
              const disabled = disabledContracts.has(contract);
              const displayName = imageProtocolDisplayName(contract);
              return (
                <div
                  className="image-protocol-config-item"
                  data-selected={selectedContract === contract || undefined}
                  data-disabled={disabled || undefined}
                  role="listitem"
                  key={contract}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled && !checked}
                    aria-label={displayName}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...values, contract]
                        : values.filter((value) => value !== contract);
                      setSelectedContract(contract);
                      onChange(IMAGE_PROTOCOL_CONTRACTS.filter((value) => next.includes(value)));
                    }}
                  />
                  <button
                    type="button"
                    className="image-protocol-config-select"
                    aria-label={displayName}
                    aria-pressed={selectedContract === contract}
                    disabled={disabled && !checked}
                    onClick={() => setSelectedContract(contract)}
                  >
                    <span className="text-protocol-logo" aria-hidden="true"><img src={openAIMark} alt="" /></span>
                    <span>{displayName}</span>
                  </button>
                  <button
                    type="button"
                    className="icon-button subtle image-protocol-settings-trigger"
                    disabled={disabled && !checked}
                    aria-label={`${settingsLabel}: ${displayName}`}
                    aria-expanded={selectedContract === contract}
                    title={settingsLabel}
                    onClick={() => setSelectedContract(contract)}
                  >
                    <Settings size={14} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="image-protocol-config-detail">
            {selectedContract && (() => {
              const displayName = imageProtocolDisplayName(selectedContract);
              const limit = limits.find((item) => item.contract === selectedContract);
              return (
                <section aria-label={`${settingsLabel}: ${displayName}`}>
                  <div className="image-protocol-config-detail-head">
                    <span className="text-protocol-logo" aria-hidden="true"><img src={openAIMark} alt="" /></span>
                    <strong>{displayName}</strong>
                  </div>
                  <div className="image-protocol-config-fields">
                    <label className="field">
                      <span>{maxImagesLabel}</span>
                      <input
                        type="number"
                        min="1"
                        max="128"
                        step="1"
                        value={limit?.maxImagesPerRequest ?? 4}
                        onChange={(event) => onLimitChange(selectedContract, { maxImagesPerRequest: Number(event.target.value) })}
                      />
                    </label>
                    {selectedContract === 'openai.images.edits/2026-07-19' && (
                      <label className="field">
                        <span>{maxReferenceImagesLabel}</span>
                        <input
                          type="number"
                          min="1"
                          max="128"
                          step="1"
                          value={limit?.maxReferenceImages ?? 4}
                          onChange={(event) => onLimitChange(selectedContract, { maxReferenceImages: Number(event.target.value) })}
                        />
                      </label>
                    )}
                  </div>
                </section>
              );
            })()}
          </div>
        </div>
      </fieldset>
    );
  }

  return (
    <fieldset className="text-protocol-selector image-protocol-selector">
      <legend>{label}</legend>
      <div className="text-protocol-options">
        {IMAGE_PROTOCOL_CONTRACTS.map((contract) => {
          const checked = values.includes(contract);
          const disabled = disabledContracts.has(contract);
          return (
            <div className="text-protocol-option image-protocol-option" data-disabled={disabled || undefined} key={contract}>
              <div className="image-protocol-option-row">
                <label>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled && !checked}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...values, contract]
                        : values.filter((value) => value !== contract);
                      onChange(IMAGE_PROTOCOL_CONTRACTS.filter((value) => next.includes(value)));
                    }}
                  />
                  <span className="text-protocol-logo" aria-hidden="true"><img src={openAIMark} alt="" /></span>
                  <span>{imageProtocolDisplayName(contract)}</span>
                </label>
                {onLimitChange && <button
                  type="button"
                  className="icon-button subtle image-protocol-settings-trigger"
                  disabled={disabled && !checked}
                  aria-label={`${settingsLabel}: ${imageProtocolDisplayName(contract)}`}
                  aria-expanded={selectedContract === contract}
                  title={settingsLabel}
                  onClick={() => setSelectedContract((current) => current === contract ? null : contract)}
                >
                  <Settings size={14} aria-hidden="true" />
                </button>}
              </div>
              {checked && onLimitChange && selectedContract === contract && (() => {
                const limit = limits.find((item) => item.contract === contract);
                return (
                  <div className="image-protocol-limit-fields">
                    <label>
                      <span>{maxImagesLabel}</span>
                      <input
                        type="number"
                        min="1"
                        max="128"
                        step="1"
                        value={limit?.maxImagesPerRequest ?? 4}
                        onChange={(event) => onLimitChange(contract, { maxImagesPerRequest: Number(event.target.value) })}
                      />
                    </label>
                    {contract === 'openai.images.edits/2026-07-19' && (
                      <label>
                        <span>{maxReferenceImagesLabel}</span>
                        <input
                          type="number"
                          min="1"
                          max="128"
                          step="1"
                          value={limit?.maxReferenceImages ?? 4}
                          onChange={(event) => onLimitChange(contract, { maxReferenceImages: Number(event.target.value) })}
                        />
                      </label>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
