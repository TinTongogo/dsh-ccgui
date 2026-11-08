/**
 * Line icons for the 变更 panel, drawn for this plugin in the stroke style of the harness's
 * own icons (CC GUI's panel uses the same set of pictures). Inline so they follow the theme
 * through `currentColor`.
 * @module dsh-ccgui/client/changes/changes-icons
 */

import type { ReactElement, ReactNode } from 'react'

export interface IconProps {
  readonly size?: number
  readonly className?: string
}

const DEFAULT_SIZE = 16

function Stroke({
  size = DEFAULT_SIZE,
  className,
  children,
}: IconProps & { readonly children: ReactNode }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** Two commits joined into a branch. */
export function BranchIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="7" r="2" />
      <path d="M6 7v10M18 9c0 5-6 4-11.4 8.6" />
    </Stroke>
  )
}

/** Two arcs chasing each other. */
export function RefreshIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" />
      <path d="M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" />
      <path d="M20 20v-4h-4" />
    </Stroke>
  )
}

function Cloud({ arrow, ...props }: IconProps & { readonly arrow: ReactNode }): ReactElement {
  return (
    <Stroke {...props}>
      <path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9.5a4 4 0 0 1 0 8.5" />
      {arrow}
    </Stroke>
  )
}

/** A cloud with an arrow coming down from it. */
export function PullIcon(props: IconProps): ReactElement {
  return <Cloud {...props} arrow={<path d="M12 12v9M9 18l3 3 3-3" />} />
}

/** A cloud with an arrow going up into it. */
export function PushIcon(props: IconProps): ReactElement {
  return <Cloud {...props} arrow={<path d="M12 21v-9M9 15l3-3 3 3" />} />
}

/** A chevron pointing down; rotated by CSS when collapsed. */
export function ChevronIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="M6 9l6 6 6-6" />
    </Stroke>
  )
}

/** A hooked arrow turning back. */
export function UndoIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </Stroke>
  )
}

export function PlusIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="M12 5v14M5 12h14" />
    </Stroke>
  )
}

export function MinusIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="M5 12h14" />
    </Stroke>
  )
}

/** An arrow pointing left, for leaving the diff. */
export function BackIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </Stroke>
  )
}

/** A page with a plus over a minus: the 变更 tab's glyph. */
export function ChangesIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M12 8v6M9 11h6M9 17h6" />
    </Stroke>
  )
}

/** A large four-pointed sparkle with a small one beside it: the AI-generated mark. */
export function SparkleIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="M10 4l1.6 4.4L16 10l-4.4 1.6L10 16l-1.6-4.4L4 10l4.4-1.6z" />
      <path d="M17.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </Stroke>
  )
}
