import openAIMark from './assets/openai-mark.svg';
import { IMAGE_PROTOCOL_CONTRACTS, imageProtocolDisplayName } from './imageProtocols';
import type { ImageProtocolContract } from './types';

interface ImageProtocolSelectorProps {
  label: string;
  values: ImageProtocolContract[];
  disabledContracts: Set<ImageProtocolContract>;
  onChange: (values: ImageProtocolContract[]) => void;
}

export default function ImageProtocolSelector({
  label,
  values,
  disabledContracts,
  onChange
}: ImageProtocolSelectorProps) {
  return (
    <fieldset className="text-protocol-selector image-protocol-selector">
      <legend>{label}</legend>
      <div className="text-protocol-options">
        {IMAGE_PROTOCOL_CONTRACTS.map((contract) => {
          const checked = values.includes(contract);
          const disabled = disabledContracts.has(contract);
          return (
            <label className="text-protocol-option" data-disabled={disabled || undefined} key={contract}>
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
          );
        })}
      </div>
    </fieldset>
  );
}
