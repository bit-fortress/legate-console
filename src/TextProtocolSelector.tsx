import anthropicMark from './assets/anthropic-mark.svg';
import openAIMark from './assets/openai-mark.svg';
import { TEXT_PROTOCOL_CONTRACTS, textProtocolDisplayName } from './textProtocols';
import type { TextProtocolContract } from './types';

interface TextProtocolSelectorProps {
  label: string;
  values: TextProtocolContract[];
  disabledContracts: Set<TextProtocolContract>;
  onChange: (values: TextProtocolContract[]) => void;
}

export default function TextProtocolSelector({
  label,
  values,
  disabledContracts,
  onChange
}: TextProtocolSelectorProps) {
  return (
    <fieldset className="text-protocol-selector">
      <legend>{label}</legend>
      <div className="text-protocol-options">
        {TEXT_PROTOCOL_CONTRACTS.map((contract) => {
          const checked = values.includes(contract);
          const disabled = !checked && disabledContracts.has(contract);
          const logo = contract === 'anthropic.messages/2026-07-18' ? anthropicMark : openAIMark;
          return (
            <label className="text-protocol-option" data-disabled={disabled || undefined} key={contract}>
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...values, contract]
                    : values.filter((value) => value !== contract);
                  onChange(TEXT_PROTOCOL_CONTRACTS.filter((value) => next.includes(value)));
                }}
              />
              <span className="text-protocol-logo" aria-hidden="true">
                <img src={logo} alt="" />
              </span>
              <span>{textProtocolDisplayName(contract)}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
