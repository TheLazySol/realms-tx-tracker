/**
 * CSV file generation for transaction reports
 */

import { createObjectCsvWriter } from 'csv-writer';
import * as path from 'path';
import { TrackedTransaction, TrackingResults, CsvRow, TransactionType } from '../types';
import { lamportsToSol } from '../services/transaction-parser';
import { logSuccess, logInfo } from './logger';
import { LAMPORTS_PER_SOL } from '../constants';

/**
 * Generate CSV file with all tracked transactions
 * @param walletAddress - Wallet address (used for filename)
 * @param results - Tracking results with all transactions and summaries
 */
export async function generateCsvReport(
  walletAddress: string,
  results: TrackingResults
): Promise<string> {
  const filename = `${walletAddress}.csv`;
  const filepath = path.join(process.cwd(), filename);

  // Prepare CSV rows
  const rows: CsvRow[] = results.transactions.map(tx => ({
    'Transaction Signature': tx.signature,
    'Date/Time': tx.dateTime,
    'Block/Slot': tx.slot,
    'Transaction Type': tx.transactionType,
    'Transaction Fee (SOL)': lamportsToSol(tx.transactionFee),
    'Rent Cost (SOL)': lamportsToSol(tx.rentCost),
    'Total Cost (SOL)': lamportsToSol(tx.totalCost)
  }));

  // Sort by date (oldest first for the report)
  rows.sort((a, b) => {
    const dateA = new Date(a['Date/Time']).getTime();
    const dateB = new Date(b['Date/Time']).getTime();
    return dateA - dateB;
  });

  // Create CSV writer
  const csvWriter = createObjectCsvWriter({
    path: filepath,
    header: [
      { id: 'Transaction Signature', title: 'Transaction Signature' },
      { id: 'Date/Time', title: 'Date/Time' },
      { id: 'Block/Slot', title: 'Block/Slot' },
      { id: 'Transaction Type', title: 'Transaction Type' },
      { id: 'Transaction Fee (SOL)', title: 'Transaction Fee (SOL)' },
      { id: 'Rent Cost (SOL)', title: 'Rent Cost (SOL)' },
      { id: 'Total Cost (SOL)', title: 'Total Cost (SOL)' }
    ]
  });

  // Write transaction rows
  await csvWriter.writeRecords(rows);

  // Append summary section using fs
  const fs = await import('fs');
  const summaryLines = [
    '',
    '--- SUMMARY ---',
    '',
    `Votes Casted,${results.votes.count},${formatSolAmount(results.votes.totalFees)} SOL`,
    `Proposals Created,${results.proposals.count},${formatSolAmount(results.proposals.totalFees)} SOL`,
    `Comments Posted,${results.comments.count},${formatSolAmount(results.comments.totalFees)} SOL`,
    '',
    `Total DAO Interactions,${results.totalCount},${formatSolAmount(results.totalFees)} SOL`
  ];

  fs.appendFileSync(filepath, '\n' + summaryLines.join('\n'));

  logSuccess(`CSV report generated: ${filename}`);
  logInfo(`Full path: ${filepath}`);

  return filepath;
}

/**
 * Format SOL amount for display
 */
function formatSolAmount(lamports: number): string {
  const sol = lamports / LAMPORTS_PER_SOL;
  return sol.toFixed(9);
}

/**
 * Calculate tracking results from transactions
 */
export function calculateResults(transactions: TrackedTransaction[]): TrackingResults {
  const votes = transactions.filter(tx => tx.transactionType === TransactionType.VOTE);
  const proposals = transactions.filter(tx => tx.transactionType === TransactionType.PROPOSAL);
  const comments = transactions.filter(tx => tx.transactionType === TransactionType.COMMENT);

  const sumFees = (txs: TrackedTransaction[]) => 
    txs.reduce((sum, tx) => sum + tx.totalCost, 0);

  return {
    transactions,
    votes: {
      count: votes.length,
      totalFees: sumFees(votes)
    },
    proposals: {
      count: proposals.length,
      totalFees: sumFees(proposals)
    },
    comments: {
      count: comments.length,
      totalFees: sumFees(comments)
    },
    totalCount: transactions.length,
    totalFees: sumFees(transactions)
  };
}

