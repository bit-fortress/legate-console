import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: ReactNode;
  textLabel?: string;
  className?: string;
  endAdornment?: ReactNode;
}

interface SelectControlProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function SelectField({
  label,
  ...controlProps
}: SelectControlProps & { label: string }) {
  return (
    <div className="field">
      <span>{label}</span>
      <SelectControl {...controlProps} ariaLabel={controlProps.ariaLabel ?? label} />
    </div>
  );
}

export function SelectControl({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  ariaLabel,
  className = ''
}: SelectControlProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value);
  const displayLabel = selected?.label ?? placeholder ?? '';

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useLayoutEffect(() => {
    if (!open) return;

    function updateMenuPosition() {
      const root = rootRef.current;
      const menu = menuRef.current;
      if (!root || !menu) return;

      const rect = root.getBoundingClientRect();
      const scrollBoundary = nearestScrollBoundary(root);
      const boundaryRect = scrollBoundary?.getBoundingClientRect();
      const boundaryTop = Math.max(0, boundaryRect?.top ?? 0);
      const boundaryBottom = Math.min(window.innerHeight, boundaryRect?.bottom ?? window.innerHeight);
      const hasLayout = rect.width > 0 && rect.height > 0;
      const triggerVisible = !scrollBoundary
        || !hasLayout
        || (rect.top >= boundaryTop && rect.bottom <= boundaryBottom);

      if (!triggerVisible) {
        menu.style.visibility = 'hidden';
        setOpen(false);
        return;
      }

      const preferred = Math.min(220, options.length * 36 + 12);
      const spaceBelow = boundaryBottom - rect.bottom;
      const spaceAbove = rect.top - boundaryTop;
      const nextPlacement = spaceBelow < preferred && spaceAbove > spaceBelow ? 'up' : 'down';
      const maxHeight = Math.min(220, Math.max(0, nextPlacement === 'down' ? spaceBelow - 12 : spaceAbove - 12));
      root.classList.toggle('placement-up', nextPlacement === 'up');
      root.classList.toggle('placement-down', nextPlacement === 'down');
      menu.classList.toggle('placement-up', nextPlacement === 'up');
      menu.classList.toggle('placement-down', nextPlacement === 'down');
      Object.assign(menu.style, {
        visibility: 'visible',
        position: 'fixed',
        top: nextPlacement === 'down' ? `${rect.bottom + 4}px` : '',
        bottom: nextPlacement === 'up' ? `${window.innerHeight - rect.top + 4}px` : '',
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        maxHeight: `${maxHeight}px`
      });
    }

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const classes = ['select-control', open ? 'open' : '', className].filter(Boolean).join(' ');

  return (
    <div className={classes} ref={rootRef}>
      <button
        type="button"
        className={selected ? 'select-trigger' : 'select-trigger placeholder'}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="select-value">{displayLabel}</span>
        <ChevronDown size={14} className="select-caret" aria-hidden="true" />
      </button>
      {open && createPortal(
        <div
          className="select-menu placement-down"
          role="listbox"
          aria-label={ariaLabel}
          ref={menuRef}
          style={{ position: 'fixed', visibility: 'hidden' }}
        >
          {options.map((option) => {
            const active = option.value === value;
            const optionClasses = ['select-option', active ? 'active' : '', option.className]
              .filter(Boolean)
              .join(' ');
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-label={option.textLabel}
                aria-selected={active}
                className={optionClasses}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {(option.endAdornment || active) && (
                  <span className="select-option-end">
                    {option.endAdornment}
                    {active && <Check size={14} aria-hidden="true" />}
                  </span>
                )}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

function nearestScrollBoundary(element: HTMLElement): HTMLElement | null {
  let ancestor = element.parentElement;
  while (ancestor) {
    const style = window.getComputedStyle(ancestor);
    const inlineVerticalOverflow = ancestor.style.overflowY
      || (!ancestor.style.overflowX ? ancestor.style.overflow : '');
    const explicitlyClipsVertically = /(auto|scroll|hidden|clip)/.test(inlineVerticalOverflow);
    const actuallyOverflowsVertically = ancestor.scrollHeight > ancestor.clientHeight;
    const alwaysClipsVertically = /(hidden|clip)/.test(style.overflowY);

    // overflow-x: auto computes to overflow-y: auto in browsers even when the
    // element has no vertical overflow. Such table wrappers must not constrain
    // a portaled menu's height.
    if (explicitlyClipsVertically || actuallyOverflowsVertically || alwaysClipsVertically) return ancestor;
    ancestor = ancestor.parentElement;
  }
  return null;
}
