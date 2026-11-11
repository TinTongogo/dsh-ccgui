/**
 * Shared names.
 * @module dsh-ccgui/constants
 */

/**
 * The only tool a CLI session calls in the harness. The name is deliberately not
 * one the harness ships, so a CLI call can never reach a real tool body and run a
 * command the CLI already ran.
 */
export const CLI_TOOL_NAME = 'cli_tool'

/** Every CLI's provider route starts with this; the rest is its configured id. */
export const CLI_ROUTE_PREFIX = 'cli-'

/**
 * Name a CLI's provider route.
 * @param id - the configured agent id.
 * @returns its route.
 */
export const cliRoute = (id: string): string => `${CLI_ROUTE_PREFIX}${id}`

/**
 * Whether a provider route is a CLI's rather than one of the harness's own.
 * @param provider - a provider route, or nothing before one is chosen.
 * @returns true for a CLI route.
 */
export const isCliRoute = (provider: string | undefined): boolean => provider?.startsWith(CLI_ROUTE_PREFIX) ?? false

/** Model id meaning whatever the CLI itself is set to. */
export const DEFAULT_MODEL_ID = 'default'

/** Path prefix of the 变更 panel's git routes; the browser posts to `<prefix>/<operation>`. */
export const GIT_ROUTE_PREFIX = '/dsh-ccgui/git'

/**
 * The route the composer's mode control posts to. It only lists the modes a CLI reported
 * and sends the chosen id back to that CLI, unchanged.
 */
export const MODE_ROUTE_PREFIX = '/dsh-ccgui/modes'
