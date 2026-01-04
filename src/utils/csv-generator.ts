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
    `Token Deposits,${results.tokenDeposits.count},${formatSolAmount(results.tokenDeposits.totalFees)} SOL`,
    `Token Withdrawals,${results.tokenWithdrawals.count},${formatSolAmount(results.tokenWithdrawals.totalFees)} SOL`,
    `Delegations,${results.delegates.count},${formatSolAmount(results.delegates.totalFees)} SOL`,
    `Execute Transactions,${results.executes.count},${formatSolAmount(results.executes.totalFees)} SOL`,
    `Signatory Actions,${results.signatories.count},${formatSolAmount(results.signatories.totalFees)} SOL`,
    `Proposal Instructions,${results.proposalInstructions.count},${formatSolAmount(results.proposalInstructions.totalFees)} SOL`,
    `Governance Admin,${results.governanceAdmin.count},${formatSolAmount(results.governanceAdmin.totalFees)} SOL`,
    `Refunds,${results.refunds.count},${formatSolAmount(results.refunds.totalFees)} SOL`,
    `Other Governance,${results.otherGovernance.count},${formatSolAmount(results.otherGovernance.totalFees)} SOL`,
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
  const sumFees = (txs: TrackedTransaction[]) => 
    txs.reduce((sum, tx) => sum + tx.totalCost, 0);

  const filterByType = (type: TransactionType) => 
    transactions.filter(tx => tx.transactionType === type);

  const createSummary = (type: TransactionType) => {
    const txs = filterByType(type);
    return {
      count: txs.length,
      totalFees: sumFees(txs)
    };
  };

  return {
    transactions,
    votes: createSummary(TransactionType.VOTE),
    proposals: createSummary(TransactionType.PROPOSAL),
    comments: createSummary(TransactionType.COMMENT),
    tokenDeposits: createSummary(TransactionType.TOKEN_DEPOSIT),
    tokenWithdrawals: createSummary(TransactionType.TOKEN_WITHDRAWAL),
    delegates: createSummary(TransactionType.DELEGATE),
    executes: createSummary(TransactionType.EXECUTE),
    signatories: createSummary(TransactionType.SIGNATORY),
    proposalInstructions: createSummary(TransactionType.PROPOSAL_INSTRUCTION),
    governanceAdmin: createSummary(TransactionType.GOVERNANCE_ADMIN),
    refunds: createSummary(TransactionType.REFUND),
    otherGovernance: createSummary(TransactionType.OTHER_GOVERNANCE),
    totalCount: transactions.length,
    totalFees: sumFees(transactions)
  };
}

