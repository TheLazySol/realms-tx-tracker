/**
 * DAO Reimbursement Tracker - Main Entry Point
 * 
 * Tracks transaction fees paid by a wallet for a specific DAO/Realm
 * including votes, proposals, and comments.
 */

import { PublicKey, ConfirmedSignatureInfo } from '@solana/web3.js';
import { loadConfig, displayConfig } from './config';
import { ValidatedConfig, TrackedTransaction, TrackingResults } from './types';
import { getConnection, fetchSignaturesForAddress, fetchTransactionsBatch } from './services/solana';
import { throttle } from './utils/rate-limiter';
import { 
  parseRealmData, 
  deriveTokenOwnerRecordAddress, 
  tokenOwnerRecordExists,
  fetchVoteRecordsForTokenOwnerRecord
} from './services/governance';
import { parseTransaction, lamportsToSol } from './services/transaction-parser';
import { generateCsvReport, calculateResults } from './utils/csv-generator';
import { MAX_CONCURRENT_REQUESTS, LAMPORTS_PER_SOL } from './constants';
import {
  logHeader,
  logInfo,
  logSuccess,
  logError,
  logWarning,
  logSeparator,
  logSummaryLine,
  logTotal,
  logProgress,
  clearLine
} from './utils/logger';

/**
 * Merge and deduplicate signature arrays
 */
function mergeSignatures(
  ...signatureArrays: ConfirmedSignatureInfo[][]
): ConfirmedSignatureInfo[] {
  const signatureMap = new Map<string, ConfirmedSignatureInfo>();
  
  for (const signatures of signatureArrays) {
    for (const sig of signatures) {
      if (!signatureMap.has(sig.signature)) {
        signatureMap.set(sig.signature, sig);
      }
    }
  }
  
  // Sort by blockTime descending (newest first)
  return Array.from(signatureMap.values()).sort((a, b) => {
    const timeA = a.blockTime || 0;
    const timeB = b.blockTime || 0;
    return timeB - timeA;
  });
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  logHeader('DAO Reimbursement Transaction Tracker');

  try {
    // Step 1: Load and validate configuration
    logInfo('Loading configuration...');
    const config = loadConfig();
    displayConfig(config);
    logSeparator();

    // Step 2: Initialize Solana connection with rate limiting
    logInfo('Connecting to Solana RPC...');
    const connection = getConnection(config.rpcUrl, config.rps);
    
    // Test connection
    const blockHeight = await connection.getBlockHeight();
    logSuccess(`Connected to Solana (block height: ${blockHeight})`);
    logSeparator();

    // Step 3: Parse realm to get community mint and derive TokenOwnerRecord
    logInfo('Fetching realm data...');
    const realmData = await parseRealmData(connection, config.realmId);
    if (!realmData) {
      logError('Failed to parse realm data. Cannot proceed.');
      process.exit(1);
    }
    
    // Derive TokenOwnerRecord PDA for this wallet in this realm
    const tokenOwnerRecord = deriveTokenOwnerRecordAddress(
      config.realmId,
      realmData.communityMint,
      config.walletAddress
    );
    logInfo(`TokenOwnerRecord PDA: ${tokenOwnerRecord.toString()}`);
    
    // Check if TokenOwnerRecord exists
    const torExists = await tokenOwnerRecordExists(connection, tokenOwnerRecord);
    if (!torExists) {
      logWarning('TokenOwnerRecord does not exist - wallet may not have deposited governance tokens');
    }
    logSeparator();

    // Step 4: Fetch transaction signatures from multiple sources
    // - TokenOwnerRecord: captures votes and proposals (via account signatures)
    // - VoteRecord accounts: direct query of vote records (more comprehensive)
    // - Wallet: captures comments (chat program uses wallet directly)
    logInfo('Fetching transaction signatures...');
    
    const walletPubkey = new PublicKey(config.walletAddress);
    
    // Source 1: Fetch signatures for TokenOwnerRecord (votes, proposals)
    logInfo('  Querying TokenOwnerRecord for votes/proposals...');
    const torSignatures = torExists 
      ? await fetchSignaturesForAddress(
          connection,
          tokenOwnerRecord,
          config.startTimestamp,
          config.endTimestamp
        )
      : [];
    logSuccess(`  Found ${torSignatures.length} TokenOwnerRecord transactions`);
    
    // Source 2: Query VoteRecord accounts directly (more comprehensive vote discovery)
    let voteRecordSignatures: ConfirmedSignatureInfo[] = [];
    if (torExists) {
      logInfo('  Querying VoteRecord accounts directly...');
      const voteRecords = await fetchVoteRecordsForTokenOwnerRecord(
        connection,
        tokenOwnerRecord,
        config.startTimestamp,
        config.endTimestamp
      );
      
      if (voteRecords.length > 0) {
        // Fetch transaction signatures for each VoteRecord
        logInfo(`  Fetching transaction signatures for ${voteRecords.length} VoteRecords...`);
        const voteRecordPubkeys = voteRecords.map(vr => vr.pubkey);
        
        // Fetch signatures for each VoteRecord account
        for (const voteRecordPubkey of voteRecordPubkeys) {
          await throttle();
          try {
            const vrSigs = await fetchSignaturesForAddress(
              connection,
              voteRecordPubkey,
              config.startTimestamp,
              config.endTimestamp
            );
            voteRecordSignatures.push(...vrSigs);
          } catch (error) {
            logWarning(`  Failed to fetch signatures for VoteRecord ${voteRecordPubkey.toString()}: ${(error as Error).message}`);
          }
        }
        
        logSuccess(`  Found ${voteRecordSignatures.length} VoteRecord transactions`);
      } else {
        logInfo('  No VoteRecord accounts found');
      }
    }
    
    // Source 3: Fetch signatures for wallet (comments use wallet directly)
    logInfo('  Querying wallet for comments...');
    const walletSignatures = await fetchSignaturesForAddress(
      connection,
      walletPubkey,
      config.startTimestamp,
      config.endTimestamp
    );
    logSuccess(`  Found ${walletSignatures.length} wallet transactions`);
    
    // Merge and deduplicate all signature sources
    const signatures = mergeSignatures(torSignatures, voteRecordSignatures, walletSignatures);
    logSuccess(`Total unique transactions: ${signatures.length}`);
    
    // Log summary of sources
    if (signatures.length > 0) {
      logInfo(`  Transaction sources:`);
      logInfo(`    - TokenOwnerRecord: ${torSignatures.length}`);
      logInfo(`    - VoteRecords: ${voteRecordSignatures.length}`);
      logInfo(`    - Wallet: ${walletSignatures.length}`);
    }
    
    if (signatures.length === 0) {
      logWarning('No transactions found in the specified date range');
      displayEmptyResults(config);
      return;
    }
    
    logSeparator();

    // Step 5: Fetch full transaction details
    logInfo('Fetching transaction details...');
    const signatureStrings = signatures.map(s => s.signature);
    
    const transactions = await fetchTransactionsBatch(
      connection,
      signatureStrings,
      MAX_CONCURRENT_REQUESTS
    );

    logSuccess(`Fetched ${transactions.size} transaction details`);
    logSeparator();

    // Step 6: Parse transactions and identify governance actions
    logInfo('Analyzing transactions for governance actions...');
    const trackedTransactions: TrackedTransaction[] = [];
    let processedCount = 0;

    for (const [signature, tx] of transactions) {
      processedCount++;
      if (processedCount % 50 === 0) {
        logProgress(`Processing ${processedCount}/${transactions.size}...`);
      }

      // Find the blockTime from our signature list
      const sigInfo = signatures.find(s => s.signature === signature);
      const blockTime = sigInfo?.blockTime || tx?.blockTime || 0;

      if (!blockTime) {
        continue;
      }

      const tracked = parseTransaction(
        signature,
        tx,
        config.walletAddress,
        blockTime
      );

      if (tracked) {
        trackedTransactions.push(tracked);
      }
    }

    clearLine();

    if (trackedTransactions.length === 0) {
      logWarning('No governance transactions found for this realm');
      displayEmptyResults(config);
      return;
    }

    logSuccess(`Found ${trackedTransactions.length} governance transactions`);
    logSeparator();

    // Step 7: Calculate results and generate report
    logInfo('Generating report...');
    const results = calculateResults(trackedTransactions);
    
    // Generate CSV
    await generateCsvReport(config.walletAddress, results);
    logSeparator();

    // Display summary
    displayResults(results);

  } catch (error) {
    logError(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}

/**
 * Display tracking results summary in console
 */
function displayResults(results: TrackingResults): void {
  logHeader('Transaction Fee Summary');

  logSummaryLine(
    'Votes Casted',
    results.votes.count,
    formatSol(results.votes.totalFees)
  );

  logSummaryLine(
    'Proposals Created',
    results.proposals.count,
    formatSol(results.proposals.totalFees)
  );

  logSummaryLine(
    'Comments Posted',
    results.comments.count,
    formatSol(results.comments.totalFees)
  );

  logTotal(results.totalCount, formatSol(results.totalFees));
}

/**
 * Display empty results message
 */
function displayEmptyResults(config: ValidatedConfig): void {
  logHeader('Transaction Fee Summary');

  console.log('  No governance transactions found for:');
  console.log(`    Wallet: ${config.walletAddress}`);
  console.log(`    Realm: ${config.realmId}`);
  console.log();
  
  logSummaryLine('Votes Casted', 0, '0.000000000 SOL');
  logSummaryLine('Proposals Created', 0, '0.000000000 SOL');
  logSummaryLine('Comments Posted', 0, '0.000000000 SOL');
  logTotal(0, '0.000000000 SOL');
}

/**
 * Format lamports as SOL with unit
 */
function formatSol(lamports: number): string {
  const sol = lamports / LAMPORTS_PER_SOL;
  return `${sol.toFixed(9)} SOL`;
}

// Run main function
main().catch((error) => {
  logError(`Unhandled error: ${error.message}`);
  process.exit(1);
});

