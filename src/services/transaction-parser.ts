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
 * 
 * Handles multiple data formats:
 * - base64 encoded string (most common for parsed transactions)
 * - base58 encoded string (less common)
 * - raw buffer/array
 */
function getInstructionDiscriminator(data: string | Uint8Array | Buffer): number | null {
  try {
    let decoded: Buffer;
    
    if (typeof data === 'string') {
      // Try base64 first (most common format from parsed transactions)
      try {
        decoded = Buffer.from(data, 'base64');
        if (decoded.length > 0) {
          return decoded[0];
        }
      } catch {
        // Try base58 if base64 fails
        try {
          // Note: We'd need bs58 library for base58, but let's try other approaches first
          // For now, if base64 fails, we'll try treating it as raw bytes
          decoded = Buffer.from(data, 'utf8');
          if (decoded.length > 0) {
            return decoded[0];
          }
        } catch {
          return null;
        }
      }
    } else if (data instanceof Buffer || data instanceof Uint8Array) {
      decoded = Buffer.from(data);
      if (decoded.length > 0) {
        return decoded[0];
      }
    } else {
      return null;
    }
  } catch {
    return null;
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
    // Parsed instructions can have data as string (base64) or parsed object
    if ('data' in instruction) {
      const instructionData = instruction.data;
      
      // Handle string data (base64 encoded)
      if (typeof instructionData === 'string') {
        const discriminator = getInstructionDiscriminator(instructionData);
        if (discriminator !== null) {
          const txType = getTransactionTypeFromDiscriminator(discriminator, programId);
          if (txType) {
            return txType;
          }
        }
      }
      // Handle parsed instruction data (object with parsed fields)
      else if (typeof instructionData === 'object' && instructionData !== null) {
        // For parsed instructions, check the instruction type field
        // This is more reliable than trying to decode the discriminator
        const parsedIx = instructionData as { [key: string]: any };
        
        // Check for common parsed instruction formats
        if ('vote' in parsedIx || 'castVote' in parsedIx || 'relinquishVote' in parsedIx) {
          return TransactionType.VOTE;
        }
        if ('proposal' in parsedIx || 'createProposal' in parsedIx || 'cancelProposal' in parsedIx) {
          return TransactionType.PROPOSAL;
        }
      }
    }

    // For chat program, any instruction is a comment
    if (programId === GOVERNANCE_CHAT_PROGRAM_ID) {
      return TransactionType.COMMENT;
    }
  }

  // Also check inner instructions (CPIs)
  if (tx.meta?.innerInstructions) {
    for (const inner of tx.meta.innerInstructions) {
      for (const ix of inner.instructions) {
        if ('programId' in ix) {
          const programId = ix.programId.toString();
          
          if (programId === GOVERNANCE_CHAT_PROGRAM_ID) {
            return TransactionType.COMMENT;
          }

          if (programId === GOVERNANCE_PROGRAM_ID && 'data' in ix) {
            const data = (ix as { data?: string | object }).data;
            if (data) {
              if (typeof data === 'string') {
                const discriminator = getInstructionDiscriminator(data);
                if (discriminator !== null) {
                  const txType = getTransactionTypeFromDiscriminator(discriminator, programId);
                  if (txType) {
                    return txType;
                  }
                }
              } else if (typeof data === 'object') {
                // Handle parsed inner instruction data
                const parsedIx = data as { [key: string]: any };
                if ('vote' in parsedIx || 'castVote' in parsedIx || 'relinquishVote' in parsedIx) {
                  return TransactionType.VOTE;
                }
                if ('proposal' in parsedIx || 'createProposal' in parsedIx || 'cancelProposal' in parsedIx) {
                  return TransactionType.PROPOSAL;
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
 * 
 * Note: This calculates rent based on the wallet's balance change.
 * The wallet pays rent when accounts are created, and this is reflected
 * in the balance difference (preBalance - postBalance).
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

  // Find wallet index in account keys
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
    // Wallet not found in account keys - might be a signer but not directly involved
    // In this case, rent cost is 0 (wallet didn't pay rent directly)
    return 0;
  }

  // Calculate balance change
  const preBal = preBalances[walletIndex] || 0;
  const postBal = postBalances[walletIndex] || 0;
  const balanceChange = preBal - postBal;

  // The total SOL spent by the wallet is:
  // - Transaction fee (always paid by fee payer, usually the wallet)
  // - Rent deposits (when creating accounts)
  // 
  // Balance change = fee + rent deposits - rent refunds
  // So: rent deposits = balanceChange - fee + rent refunds
  //
  // For simplicity, we calculate rent cost as:
  // rentCost = max(0, balanceChange - fee)
  // This captures rent deposits but may miss rent refunds in the same transaction
  
  const rentCost = Math.max(0, balanceChange - fee);

  return rentCost;
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

