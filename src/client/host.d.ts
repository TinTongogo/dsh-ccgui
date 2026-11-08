/** The parts of the harness's client UI kit this plugin uses. */
declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type {
    ButtonHTMLAttributes,
    ComponentType,
    ForwardRefExoticComponent,
    HTMLAttributes,
    InputHTMLAttributes,
    ReactElement,
    ReactNode,
    RefAttributes,
  } from 'react'

  type Icon = ComponentType<{ size?: number; className?: string }>

  export const Menu: ComponentType<{
    open: boolean
    anchor: ReactNode
    items: readonly { readonly id: string; readonly label: ReactNode; readonly icon?: ReactNode }[]
    selectedId?: string | undefined
    onSelect: (id: string) => void
    onClose: () => void
    side?: 'top' | 'bottom'
    portal?: boolean
    className?: string
  }>
  export const MenuSurface: ForwardRefExoticComponent<HTMLAttributes<HTMLDivElement> & RefAttributes<HTMLDivElement>>
  export const Button: ForwardRefExoticComponent<
    ButtonHTMLAttributes<HTMLButtonElement> & {
      variant?: 'primary' | 'ghost' | 'outline' | 'toolbar'
      size?: 'md' | 'sm'
      icon?: ReactNode
    } & RefAttributes<HTMLButtonElement>
  >
  export const Tooltip: ComponentType<{
    label: ReactNode
    side?: 'top' | 'bottom' | 'left' | 'right'
    delayMs?: number
    disabled?: boolean
    children: ReactElement
  }>
  export const Input: ForwardRefExoticComponent<InputHTMLAttributes<HTMLInputElement> & RefAttributes<HTMLInputElement>>
  export const StateDot: ComponentType<{ state: 'ongoing' }>
  export const Toast: ComponentType<{ text: string; icon?: ReactNode; anchor?: HTMLElement | null; onDone: () => void }>
  export const Modal: ComponentType<{
    open: boolean
    onClose: () => void
    title: string
    closeLabel: string
    description?: string
    children?: ReactNode
    footer?: ReactNode
    className?: string
  }>
  export const Switch: ComponentType<{
    checked: boolean
    onChange: (next: boolean) => void
    label: string
    disabled?: boolean
    title?: string | undefined
    className?: string | undefined
  }>
  export const IconCheckOutlineRegular: Icon
  export const IconEditOutlineRegular: Icon
  export const IconPlayOutlineRegular: Icon
  export const IconPlusOutlineRegular: Icon
  export const IconSettingsOutlineRegular: Icon
  export const IconTrashOutlineRegular: Icon
  export const IconChevronDownOutlineRegular: Icon
  export const IconChevronUpOutlineRegular: Icon
  export const IconDataOutlineRegular: Icon
  export const IconWarningOutlineRegular: Icon
  export const IconSlidersTwoOutlineRegular: Icon
  export function isMobileDevice(): boolean
  export function observeComposition(document: Document): {
    guards(event: KeyboardEvent): boolean
    dispose(): void
  }
  export function rankByName<T extends { readonly name: string }>(items: readonly T[], query: string): readonly T[]
}

/** The harness shares this at runtime; the plugin has no other use for its full types. */
declare module 'react-dom' {
  import type { ReactNode, ReactPortal } from 'react'

  export function createPortal(children: ReactNode, container: Element): ReactPortal
}

/** Bundled as a data URL by scripts/build-client.mjs; vite serves it as a URL in tests. */
declare module '*.png' {
  const url: string
  export default url
}
