/**
 * Console logging utilities with consistent formatting
 */

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

/**
 * Log an info message
 */
export function logInfo(message: string): void {
  console.log(`${COLORS.cyan}ℹ${COLORS.reset} ${message}`);
}

/**
 * Log a success message
 */
export function logSuccess(message: string): void {
  console.log(`${COLORS.green}✓${COLORS.reset} ${message}`);
}

/**
 * Log a warning message
 */
export function logWarning(message: string): void {
  console.log(`${COLORS.yellow}⚠${COLORS.reset} ${message}`);
}

/**
 * Log an error message
 */
export function logError(message: string): void {
  console.error(`${COLORS.red}✖${COLORS.reset} ${message}`);
}

/**
 * Log a progress update
 */
export function logProgress(message: string): void {
  process.stdout.write(`\r${COLORS.dim}...${COLORS.reset} ${message}          `);
}

/**
 * Clear the current line (for progress updates)
 */
export function clearLine(): void {
  process.stdout.write('\r\x1b[K');
}

/**
 * Log a header/title
 */
export function logHeader(title: string): void {
  console.log();
  console.log(`${COLORS.bright}${COLORS.magenta}═══════════════════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.magenta}  ${title}${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.magenta}═══════════════════════════════════════════════════════${COLORS.reset}`);
  console.log();
}

/**
 * Log a section separator
 */
export function logSeparator(): void {
  console.log(`${COLORS.dim}───────────────────────────────────────────────────────${COLORS.reset}`);
}

/**
 * Log a summary line
 */
export function logSummaryLine(label: string, count: number, amount: string): void {
  console.log(`  ${COLORS.bright}${label}:${COLORS.reset} ${count} | ${COLORS.green}${amount}${COLORS.reset} paid in tx fees`);
}

/**
 * Log the final total
 */
export function logTotal(count: number, amount: string): void {
  console.log();
  logSeparator();
  console.log(`  ${COLORS.bright}${COLORS.cyan}Total DAO Interactions:${COLORS.reset} ${count} | ${COLORS.bright}${COLORS.green}Total Paid: ${amount}${COLORS.reset} in tx fees`);
  logSeparator();
  console.log();
}

