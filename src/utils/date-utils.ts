/**
 * Date utility functions for parsing and validation
 */

/**
 * Parse MM-DD-YYYY date string to Unix timestamp (start of day UTC)
 * @param dateStr - Date string in MM-DD-YYYY format
 * @returns Unix timestamp in seconds
 */
export function parseDateToTimestamp(dateStr: string): number {
  const [month, day, year] = dateStr.split('-').map(Number);
  
  if (!month || !day || !year) {
    throw new Error(`Invalid date format: ${dateStr}. Expected MM-DD-YYYY`);
  }

  if (month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}. Must be 1-12`);
  }

  if (day < 1 || day > 31) {
    throw new Error(`Invalid day: ${day}. Must be 1-31`);
  }

  if (year < 2020 || year > 2100) {
    throw new Error(`Invalid year: ${year}. Must be 2020-2100`);
  }

  // Create date in UTC at start of day
  const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  
  // Validate the date is real (e.g., not Feb 30)
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Invalid date: ${dateStr}`);
  }

  return Math.floor(date.getTime() / 1000);
}

/**
 * Get current timestamp (end of current day UTC)
 * @returns Unix timestamp in seconds for end of today
 */
export function getCurrentEndOfDayTimestamp(): number {
  const now = new Date();
  const endOfDay = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    23, 59, 59, 999
  ));
  return Math.floor(endOfDay.getTime() / 1000);
}

/**
 * Get end of day timestamp for a given date string
 * @param dateStr - Date string in MM-DD-YYYY format
 * @returns Unix timestamp in seconds for end of that day
 */
export function parseEndDateToTimestamp(dateStr: string): number {
  const [month, day, year] = dateStr.split('-').map(Number);
  
  if (!month || !day || !year) {
    throw new Error(`Invalid date format: ${dateStr}. Expected MM-DD-YYYY`);
  }

  // Create date in UTC at end of day
  const date = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  
  return Math.floor(date.getTime() / 1000);
}

/**
 * Format Unix timestamp to human-readable date/time string
 * @param timestamp - Unix timestamp in seconds
 * @returns Formatted date string (YYYY-MM-DD HH:mm:ss UTC)
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}

/**
 * Validate date string format (MM-DD-YYYY)
 * @param dateStr - Date string to validate
 * @returns true if valid format
 */
export function isValidDateFormat(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== 'string') {
    return false;
  }

  const regex = /^\d{2}-\d{2}-\d{4}$/;
  return regex.test(dateStr);
}

