/// <reference lib="dom" />

/**
 * Stand-in for `@deepseek-ai/dsh-client-ui-primitives`, which the harness supplies at runtime
 * and is not installed here. It implements only what `src/client/host.d.ts` declares, as plain
 * DOM, so component tests exercise the plugin's own behavior rather than the host's widgets.
 * Wired in through `resolve.alias` in vitest.config.ts.
 */

import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactElement, ReactNode } from 'react'

interface MenuItem {
  readonly id: string
  readonly label: ReactNode
  readonly icon?: ReactNode
}

interface MenuProps {
  open: boolean
  anchor: ReactNode
  items: readonly MenuItem[]
  selectedId?: string | undefined
  onSelect: (id: string) => void
  onClose: () => void
  side?: 'top' | 'bottom'
  portal?: boolean
  className?: string
}

export function Menu({ open, anchor, items, selectedId, onSelect, onClose, className }: MenuProps): ReactElement {
  return (
    <div className={className} data-testid="stub-menu">
      {anchor}
      {open && (
        <div role="menu">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitemradio"
              aria-checked={item.id === selectedId}
              data-item-id={item.id}
              onClick={() => {
                onSelect(item.id)
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
          <button type="button" onClick={onClose}>
            stub-close
          </button>
        </div>
      )}
    </div>
  )
}

export const MenuSurface = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function MenuSurface(props, ref) {
  return <div ref={ref} {...props} />
})

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: string
  size?: 'md' | 'sm'
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, icon, children, ...rest },
  ref,
) {
  return (
    <button ref={ref} type="button" data-variant={variant} data-size={size} {...rest}>
      {icon}
      {children}
    </button>
  )
})

/** Renders the label beside its anchor, so tests can find it without hovering. */
export function Tooltip({ label, children }: { label: ReactNode; children: ReactElement }): ReactElement {
  return <span data-tooltip={typeof label === 'string' ? label : undefined}>{children}</span>
}

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  closeLabel: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  className?: string
}

/** A plain dialog element; the host's focus trap and portal are not under test. */
export function Modal({
  open,
  onClose,
  title,
  closeLabel,
  description,
  children,
  footer,
}: ModalProps): ReactElement | null {
  if (!open) return null
  return (
    <div role="dialog" aria-label={title}>
      <h2>{title}</h2>
      {description === undefined ? null : <p>{description}</p>}
      <button type="button" aria-label={closeLabel} onClick={onClose} />
      {children}
      {footer}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(props, ref) {
  return <input ref={ref} {...props} />
})

export function StateDot({ state }: { state: 'ongoing' }): ReactElement {
  return <span data-state-dot={state} />
}

interface ToastProps {
  text: string
  icon?: ReactNode
  anchor?: HTMLElement | null
  onDone: () => void
}

export function Toast({ text, icon, anchor, onDone }: ToastProps): ReactElement {
  return (
    <div role="alert" data-anchored={anchor ? 'yes' : 'no'}>
      {icon}
      {text}
      <button type="button" onClick={onDone}>
        stub-toast-done
      </button>
    </div>
  )
}

interface SwitchProps {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
  title?: string | undefined
  className?: string | undefined
}

export function Switch({ checked, onChange, label, disabled, title, className }: SwitchProps): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      className={className}
      onClick={() => {
        onChange(!checked)
      }}
    />
  )
}

function icon(name: string) {
  return function StubIcon({ size, className }: { size?: number; className?: string }): ReactElement {
    return <svg data-icon={name} width={size} height={size} className={className} />
  }
}

export const IconCheckOutlineRegular = icon('check')
export const IconEditOutlineRegular = icon('edit')
export const IconPlayOutlineRegular = icon('play')
export const IconPlusOutlineRegular = icon('plus')
export const IconSettingsOutlineRegular = icon('settings')
export const IconTrashOutlineRegular = icon('trash')
export const IconChevronDownOutlineRegular = icon('chevron-down')
export const IconChevronUpOutlineRegular = icon('chevron-up')
export const IconDataOutlineRegular = icon('data')
export const IconWarningOutlineRegular = icon('warning')
export const IconSlidersTwoOutlineRegular = icon('sliders')

export function isMobileDevice(): boolean {
  return false
}

export function observeComposition(_document: Document): {
  guards(event: KeyboardEvent): boolean
  dispose(): void
} {
  return {
    guards: (event) => event.isComposing,
    dispose: () => undefined,
  }
}

/** Case-insensitive substring match; the host's ranking is richer, but order is not under test. */
export function rankByName<T extends { readonly name: string }>(items: readonly T[], query: string): readonly T[] {
  const needle = query.toLowerCase()
  return needle === '' ? items : items.filter((item) => item.name.toLowerCase().includes(needle))
}
