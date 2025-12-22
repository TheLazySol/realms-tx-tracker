/**
 * Configuration loader with validation
 */

import * as fs from 'fs';
import * as path from 'path';
import { config as loadEnv } from 'dotenv';
import { PublicKey } from '@solana/web3.js';
import { AppConfig, ValidatedConfig } from './types';
import {
  parseDateToTimestamp,
  parseEndDateToTimestamp,
  getCurrentEndOfDayTimestamp,
  isValidDateFormat
} from './utils/date-utils';
import { logError, logInfo } from './utils/logger';
import { DEFAULT_RPS } from './constants';

/**
 * Load and validate configuration from config.json and .env
 * @returns Validated configuration object
 */
export function loadConfig(): ValidatedConfig {
  // Load environment variables
  loadEnv();

  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) {
    logError('RPC_URL not found in .env file');
    throw new Error('RPC_URL environment variable is required');
  }

  // Load config.json
  const configPath = path.join(process.cwd(), 'config.json');
  
  if (!fs.existsSync(configPath)) {
    logError('config.json not found in project root');
    throw new Error('config.json file is required');
  }

  const configContent = fs.readFileSync(configPath, 'utf-8');
  let appConfig: AppConfig;

  try {
    appConfig = JSON.parse(configContent);
  } catch (error) {
    logError('Failed to parse config.json');
    throw new Error('Invalid JSON in config.json');
  }

  // Validate realm_id
  if (!appConfig.realm_id) {
    throw new Error('realm_id is required in config.json');
  }
  
  try {
    new PublicKey(appConfig.realm_id);
  } catch {
    throw new Error(`Invalid realm_id public key: ${appConfig.realm_id}`);
  }

  // Validate wallet_address
  if (!appConfig.wallet_address) {
    throw new Error('wallet_address is required in config.json');
  }

  try {
    new PublicKey(appConfig.wallet_address);
  } catch {
    throw new Error(`Invalid wallet_address public key: ${appConfig.wallet_address}`);
  }

  // Validate start_date
  if (!appConfig.start_date) {
    throw new Error('start_date is required in config.json');
  }

  if (!isValidDateFormat(appConfig.start_date)) {
    throw new Error(`Invalid start_date format: ${appConfig.start_date}. Expected MM-DD-YYYY`);
  }

  const startTimestamp = parseDateToTimestamp(appConfig.start_date);

  // Validate end_date (optional, defaults to current date)
  let endTimestamp: number;

  if (!appConfig.end_date || appConfig.end_date.trim() === '') {
    endTimestamp = getCurrentEndOfDayTimestamp();
    logInfo('No end_date specified, using current date');
  } else {
    if (!isValidDateFormat(appConfig.end_date)) {
      throw new Error(`Invalid end_date format: ${appConfig.end_date}. Expected MM-DD-YYYY`);
    }
    endTimestamp = parseEndDateToTimestamp(appConfig.end_date);
  }

  // Ensure start is before end
  if (startTimestamp >= endTimestamp) {
    throw new Error('start_date must be before end_date');
  }

  // Validate rps (optional, defaults to DEFAULT_RPS)
  let rps = DEFAULT_RPS;
  if (appConfig.rps !== undefined) {
    if (typeof appConfig.rps !== 'number' || !Number.isInteger(appConfig.rps) || appConfig.rps <= 0) {
      throw new Error('rps must be a positive integer');
    }
    rps = appConfig.rps;
  }

  return {
    realmId: appConfig.realm_id,
    walletAddress: appConfig.wallet_address,
    startTimestamp,
    endTimestamp,
    rpcUrl,
    rps
  };
}

/**
 * Display loaded configuration
 */
export function displayConfig(config: ValidatedConfig): void {
  const startDate = new Date(config.startTimestamp * 1000).toISOString().split('T')[0];
  const endDate = new Date(config.endTimestamp * 1000).toISOString().split('T')[0];

  logInfo(`Realm ID: ${config.realmId}`);
  logInfo(`Wallet: ${config.walletAddress}`);
  logInfo(`Date Range: ${startDate} to ${endDate}`);
  logInfo(`RPC Rate Limit: ${config.rps} requests/second`);
}

