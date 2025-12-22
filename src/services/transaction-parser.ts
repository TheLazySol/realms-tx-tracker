/**
 * Transaction parser for identifying governance instructions and extracting fees
 * 
 * Note: Since we now fetch signatures from realm-specific accounts (TokenOwnerRecord),
 * we no longer need to verify realm involvement. We only need to identify governance
 * instruction types.
 */

import { ParsedTransactionWithMeta } from '@solana/web3.js';
import {
  TransactionType,
  TrackedTransaction,
  GovernanceInstructionType
} from '../types';
import {
  GOVERNANCE_PROGRAM_ID,
  GOVERNANCE_CHAT_PROGRAM_ID,
  LAMPORTS_PER_SOL
} from '../constants';
import { formatTimestamp } from '../utils/date-utils';

/**
 * Map governance instruction discriminators to transaction types
 */
function getTransactionTypeFromDiscriminator(
  discriminator: number,
  programId: string
): TransactionType | null {
  // Chat program - PostMessage
  if (programId === GOVERNANCE_CHAT_PROGRAM_ID) {
    return TransactionType.COMMENT;
  }

  // Main governance program
  if (programId === GOVERNANCE_PROGRAM_ID) {
    switch (discriminator) {
      // Votes
      case GovernanceInstructionType.CastVote:
      case GovernanceInstructionType.RelinquishVote:
        return TransactionType.VOTE;

      // Proposals
      case GovernanceInstructionType.CreateProposal:
      case GovernanceInstructionType.CancelProposal:
      case GovernanceInstructionType.SignOffProposal:
      case GovernanceInstructionType.FinalizeVote:
      case GovernanceInstructionType.CompleteProposal:
        return TransactionType.PROPOSAL;

      default:
        return null;
    }
  }

  return null;
}

/**
 * Check if a program ID is a governance-related program
 */
function isGovernanceProgram(programId: string): boolean {
  return programId === GOVERNANCE_PROGRAM_ID || programId === GOVERNANCE_CHAT_PROGRAM_ID;
}

/**
 * Extract the first byte (discriminator) from instruction data
 */
function getInstructionDiscriminator(data: string): number | null {
  try {
    // Data is base58 encoded, decode first byte
    const decoded = Buffer.from(data, 'base64');
    if (decoded.length > 0) {
      return decoded[0];
    }
  } catch {
    // Try as raw buffer if base64 fails
    try {
      const decoded = Buffer.from(data);
      if (decoded.length > 0) {
        return decoded[0];
      }
    } catch {
      return null;
    }
  }
  return null;
}


/**
 * Determine the transaction type by analyzing instructions
 */
function determineTransactionType(
  tx: ParsedTransactionWithMeta
): TransactionType | null {
  const instructions = tx.transaction.message.instructions;

  for (const instruction of instructions) {
    // Get program ID
    const programId = 'programId' in instruction 
      ? instruction.programId.toString()
      : '';

    if (!isGovernanceProgram(programId)) {
      continue;
    }

    // For parsed instructions, check if there's data
    if ('data' in instruction && typeof instruction.data === 'string') {
      const discriminator = getInstructionDiscriminator(instruction.data);
      if (discriminator !== null) {
        const txType = getTransactionTypeFromDiscriminator(discriminator, programId);
        if (txType) {
          return txType;
        }
      }
    }

    // For chat program, any instruction is a comment
    if (programId === GOVERNANCE_CHAT_PROGRAM_ID) {
      return TransactionType.COMMENT;
    }
  }

  // Also check inner instructions
  if (tx.meta?.innerInstructions) {
    for (const inner of tx.meta.innerInstructions) {
      for (const ix of inner.instructions) {
        if ('programId' in ix) {
          const programId = ix.programId.toString();
          
          if (programId === GOVERNANCE_CHAT_PROGRAM_ID) {
            return TransactionType.COMMENT;
          }

          if (programId === GOVERNANCE_PROGRAM_ID && 'data' in ix) {
            const data = (ix as { data?: string }).data;
            if (data) {
              const discriminator = getInstructionDiscriminator(data);
              if (discriminator !== null) {
                const txType = getTransactionTypeFromDiscriminator(discriminator, programId);
                if (txType) {
                  return txType;
                }
              }
            }
          }
        }
      }
    }
  }

  return null;
}

/**
 * Calculate rent cost from balance changes
 * Rent is the SOL deposited for account creation (not recovered in the same tx)
 */
function calculateRentCost(
  tx: ParsedTransactionWithMeta,
  walletAddress: string
): number {
  if (!tx.meta) {
    return 0;
  }

  const accountKeys = tx.transaction.message.accountKeys;
  const preBalances = tx.meta.preBalances;
  const postBalances = tx.meta.postBalances;
  const fee = tx.meta.fee;

  // Find wallet index
  let walletIndex = -1;
  for (let i = 0; i < accountKeys.length; i++) {
    const pubkey = typeof accountKeys[i] === 'string'
      ? accountKeys[i]
      : accountKeys[i].pubkey?.toString() || '';
    
    if (pubkey === walletAddress) {
      walletIndex = i;
      break;
    }
  }

  if (walletIndex === -1) {
    return 0;
  }

  // Calculate total balance change excluding fee
  const preBal = preBalances[walletIndex] || 0;
  const postBal = postBalances[walletIndex] || 0;
  const balanceChange = preBal - postBal;

  // Rent cost is the balance change minus the transaction fee
  // If this is positive, it means SOL was spent on rent
  const rentCost = balanceChange - fee;

  return Math.max(0, rentCost);
}

/**
 * Parse a transaction and extract relevant data if it's a governance action
 * 
 * Note: We no longer check for realm involvement because transactions are now
 * fetched from realm-specific accounts (TokenOwnerRecord for votes/proposals,
 * wallet for comments filtered by chat program).
 */
export function parseTransaction(
  signature: string,
  tx: ParsedTransactionWithMeta | null,
  walletAddress: string,
  blockTime: number
): TrackedTransaction | null {
  if (!tx || !tx.meta) {
    return null;
  }

  // Determine transaction type from governance instructions
  const transactionType = determineTransactionType(tx);
  if (!transactionType) {
    return null;
  }

  // Extract fee
  const transactionFee = tx.meta.fee;

  // Calculate rent cost
  const rentCost = calculateRentCost(tx, walletAddress);

  // Total cost
  const totalCost = transactionFee + rentCost;

  return {
    signature,
    blockTime,
    slot: tx.slot,
    transactionType,
    transactionFee,
    rentCost,
    totalCost,
    dateTime: formatTimestamp(blockTime)
  };
}

/**
 * Convert lamports to SOL with proper formatting
 */
export function lamportsToSol(lamports: number): string {
  const sol = lamports / LAMPORTS_PER_SOL;
  return sol.toFixed(9);
}

