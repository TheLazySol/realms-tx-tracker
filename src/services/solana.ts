/**
 * Solana connection service with retry logic and optimization
 */

import {
  Connection,
  PublicKey,
  ConfirmedSignatureInfo,
  ParsedTransactionWithMeta,
  GetVersionedTransactionConfig
} from '@solana/web3.js';
import { RETRY_CONFIG, MAX_SIGNATURES_PER_FETCH } from '../constants';
import { logProgress, logWarning, clearLine } from '../utils/logger';
import { throttle, initRateLimiter } from '../utils/rate-limiter';

let connection: Connection | null = null;

/**
 * Initialize and get Solana connection
 * @param rpcUrl - The RPC endpoint URL
 * @param rps - Optional requests per second limit (initializes rate limiter if provided)
 */
export function getConnection(rpcUrl: string, rps?: number): Connection {
  if (!connection) {
    connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000
    });
  }
  
  // Initialize rate limiter if rps is provided
  if (rps !== undefined) {
    initRateLimiter(rps);
  }
  
  return connection;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff
 */
function calculateBackoff(attempt: number): number {
  const delay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
  return Math.min(delay, RETRY_CONFIG.maxDelayMs);
}

/**
 * Retry wrapper for RPC calls with rate limiting
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      // Throttle before each RPC request attempt
      await throttle();
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < RETRY_CONFIG.maxRetries) {
        const delay = calculateBackoff(attempt);
        logWarning(`${operationName} failed, retrying in ${delay}ms... (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries})`);
        await sleep(delay);
      }
    }
  }

  throw new Error(`${operationName} failed after ${RETRY_CONFIG.maxRetries} retries: ${lastError?.message}`);
}

/**
 * Fetch signatures for an address with pagination
 * Returns signatures in reverse chronological order (newest first)
 */
export async function fetchSignaturesForAddress(
  conn: Connection,
  address: PublicKey,
  startTimestamp: number,
  endTimestamp: number
): Promise<ConfirmedSignatureInfo[]> {
  const allSignatures: ConfirmedSignatureInfo[] = [];
  let beforeSignature: string | undefined = undefined;
  let reachedStartDate = false;
  let fetchCount = 0;

  while (!reachedStartDate) {
    fetchCount++;
    logProgress(`Fetching signatures batch ${fetchCount}...`);

    const signatures = await withRetry(
      () => conn.getSignaturesForAddress(address, {
        before: beforeSignature,
        limit: MAX_SIGNATURES_PER_FETCH
      }),
      'getSignaturesForAddress'
    );

    if (signatures.length === 0) {
      break;
    }

    for (const sig of signatures) {
      const blockTime = sig.blockTime;

      // Skip if no blockTime
      if (!blockTime) {
        continue;
      }

      // Skip if transaction is newer than end date
      if (blockTime > endTimestamp) {
        continue;
      }

      // Stop if transaction is older than start date
      if (blockTime < startTimestamp) {
        reachedStartDate = true;
        break;
      }

      // Include transaction if within date range and no error
      if (!sig.err) {
        allSignatures.push(sig);
      }
    }

    // Prepare for next iteration
    beforeSignature = signatures[signatures.length - 1].signature;

    // Check if we've exhausted all signatures
    if (signatures.length < MAX_SIGNATURES_PER_FETCH) {
      break;
    }
  }

  clearLine();
  return allSignatures;
}

/**
 * Fetch full transaction details for a signature
 */
export async function fetchTransaction(
  conn: Connection,
  signature: string
): Promise<ParsedTransactionWithMeta | null> {
  const config: GetVersionedTransactionConfig = {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0
  };

  return withRetry(
    () => conn.getParsedTransaction(signature, config),
    `getTransaction(${signature.slice(0, 8)}...)`
  );
}

/**
 * Fetch multiple transactions with concurrency limit
 */
export async function fetchTransactionsBatch(
  conn: Connection,
  signatures: string[],
  concurrencyLimit: number = 10
): Promise<Map<string, ParsedTransactionWithMeta | null>> {
  const results = new Map<string, ParsedTransactionWithMeta | null>();
  
  for (let i = 0; i < signatures.length; i += concurrencyLimit) {
    const batch = signatures.slice(i, i + concurrencyLimit);
    logProgress(`Fetching transactions ${i + 1}-${Math.min(i + concurrencyLimit, signatures.length)} of ${signatures.length}...`);
    
    const batchResults = await Promise.all(
      batch.map(async (sig) => {
        const tx = await fetchTransaction(conn, sig);
        return { signature: sig, transaction: tx };
      })
    );

    for (const result of batchResults) {
      results.set(result.signature, result.transaction);
    }
    // Rate limiter handles timing between requests, no additional delay needed
  }

  clearLine();
  return results;
}

