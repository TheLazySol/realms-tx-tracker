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
  TrackedTransaction
} from '../types';
import {
  GOVERNANCE_PROGRAM_ID,
  GOVERNANCE_CHAT_PROGRAM_ID,
  GOVERNANCE_INSTRUCTION_MAP,
  LAMPORTS_PER_SOL
} from '../constants';
import { formatTimestamp } from '../utils/date-utils';

/**
 * Convert string transaction type from GOVERNANCE_INSTRUCTION_MAP to TransactionType enum
 */
function stringToTransactionType(typeString: string): TransactionType {
  switch (typeString) {
    case 'Vote':
      return TransactionType.VOTE;
    case 'Proposal':
      return TransactionType.PROPOSAL;
    case 'Comment':
      return TransactionType.COMMENT;
    case 'Token Deposit':
      return TransactionType.TOKEN_DEPOSIT;
    case 'Token Withdrawal':
      return TransactionType.TOKEN_WITHDRAWAL;
    case 'Delegate':
      return TransactionType.DELEGATE;
    case 'Execute Transaction':
      return TransactionType.EXECUTE;
    case 'Governance Admin':
      return TransactionType.GOVERNANCE_ADMIN;
    case 'Signatory':
      return TransactionType.SIGNATORY;
    case 'Proposal Instruction':
      return TransactionType.PROPOSAL_INSTRUCTION;
    case 'Refund':
      return TransactionType.REFUND;
    default:
      return TransactionType.OTHER_GOVERNANCE;
  }
}

/**
 * Map governance instruction discriminators to transaction types
 * Uses GOVERNANCE_INSTRUCTION_MAP to cover ALL governance instructions
 */
function getTransactionTypeFromDiscriminator(
  discriminator: number,
  programId: string
): TransactionType | null {
  // Chat program - any instruction is a comment
  if (programId === GOVERNANCE_CHAT_PROGRAM_ID) {
    return TransactionType.COMMENT;
  }

  // Main governance program - use complete mapping
  if (programId === GOVERNANCE_PROGRAM_ID) {
    const typeString = GOVERNANCE_INSTRUCTION_MAP[discriminator];
    if (typeString) {
      return stringToTransactionType(typeString);
    }
    // If discriminator is not in our map, still track it as OTHER_GOVERNANCE
    // This ensures we don't miss any governance fees
    return TransactionType.OTHER_GOVERNANCE;
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
 * Map governance instruction name from logs to TransactionType
 * The governance program logs instructions like: "GOVERNANCE-INSTRUCTION: SignOffProposal"
 */
function mapLogInstructionToType(instructionName: string): TransactionType {
  // Normalize the instruction name (remove spaces, handle case)
  const normalized = instructionName.trim();
  
  switch (normalized) {
    // Vote operations
    case 'CastVote':
    case 'RelinquishVote':
      return TransactionType.VOTE;
    
    // Proposal operations
    case 'CreateProposal':
    case 'SignOffProposal':
    case 'CancelProposal':
    case 'FinalizeVote':
    case 'CompleteProposal':
      return TransactionType.PROPOSAL;
    
    // Token deposit operations
    case 'DepositGoverningTokens':
    case 'CreateTokenOwnerRecord':
      return TransactionType.TOKEN_DEPOSIT;
    
    // Token withdrawal operations
    case 'WithdrawGoverningTokens':
      return TransactionType.TOKEN_WITHDRAWAL;
    
    // Delegate operations
    case 'SetGovernanceDelegate':
      return TransactionType.DELEGATE;
    
    // Execute operations
    case 'ExecuteTransaction':
      return TransactionType.EXECUTE;
    
    // Signatory operations
    case 'AddSignatory':
    case 'RemoveSignatory':
      return TransactionType.SIGNATORY;
    
    // Proposal instruction operations
    case 'InsertTransaction':
    case 'RemoveTransaction':
      return TransactionType.PROPOSAL_INSTRUCTION;
    
    // Governance admin operations
    case 'CreateRealm':
    case 'CreateGovernance':
    case 'CreateProgramGovernance':
    case 'CreateMintGovernance':
    case 'CreateTokenGovernance':
    case 'SetGovernanceConfig':
    case 'FlagTransactionError':
    case 'SetRealmAuthority':
    case 'SetRealmConfig':
    case 'UpdateProgramMetadata':
    case 'CreateNativeTreasury':
    case 'RevokeGoverningTokens':
      return TransactionType.GOVERNANCE_ADMIN;
    
    // Refund operations
    case 'RefundProposalDeposit':
      return TransactionType.REFUND;
    
    // Default to OTHER_GOVERNANCE for any unrecognized instruction
    default:
      return TransactionType.OTHER_GOVERNANCE;
  }
}

/**
 * Extract governance instruction type from transaction logs
 * The governance program logs the instruction type like: "GOVERNANCE-INSTRUCTION: SignOffProposal"
 * This is more reliable than trying to decode instruction data discriminators
 */
function getInstructionTypeFromLogs(tx: ParsedTransactionWithMeta): TransactionType | null {
  const logs = tx.meta?.logMessages || [];
  
  for (const log of logs) {
    // Check for governance instruction log
    if (log.includes('GOVERNANCE-INSTRUCTION:')) {
      const match = log.match(/GOVERNANCE-INSTRUCTION:\s*(\w+)/);
      if (match && match[1]) {
        return mapLogInstructionToType(match[1]);
      }
    }
  }
  
  // Check for chat program (comments) - they may not have the same log format
  // Look for the chat program being invoked
  for (const log of logs) {
    if (log.includes(GOVERNANCE_CHAT_PROGRAM_ID) && log.includes('invoke')) {
      return TransactionType.COMMENT;
    }
  }
  
  return null;
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
 * 
 * Uses a multi-layered approach:
 * 1. First, try log-based detection (most reliable - parses GOVERNANCE-INSTRUCTION logs)
 * 2. Fall back to discriminator-based detection if logs don't contain instruction info
 * 3. If governance program is involved but type is unknown, return OTHER_GOVERNANCE
 */
function determineTransactionType(
  tx: ParsedTransactionWithMeta
): TransactionType | null {
  // PRIMARY METHOD: Try log-based detection first (most reliable)
  const logBasedType = getInstructionTypeFromLogs(tx);
  if (logBasedType) {
    return logBasedType;
  }

  // FALLBACK: Try discriminator-based detection from instruction data
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
        
        // Check for common parsed instruction formats - expanded for all types
        if ('vote' in parsedIx || 'castVote' in parsedIx || 'relinquishVote' in parsedIx) {
          return TransactionType.VOTE;
        }
        if ('proposal' in parsedIx || 'createProposal' in parsedIx || 'cancelProposal' in parsedIx ||
            'signOffProposal' in parsedIx || 'finalizeVote' in parsedIx || 'completeProposal' in parsedIx) {
          return TransactionType.PROPOSAL;
        }
        if ('depositGoverningTokens' in parsedIx || 'createTokenOwnerRecord' in parsedIx) {
          return TransactionType.TOKEN_DEPOSIT;
        }
        if ('withdrawGoverningTokens' in parsedIx) {
          return TransactionType.TOKEN_WITHDRAWAL;
        }
        if ('setGovernanceDelegate' in parsedIx) {
          return TransactionType.DELEGATE;
        }
        if ('executeTransaction' in parsedIx) {
          return TransactionType.EXECUTE;
        }
        if ('addSignatory' in parsedIx || 'removeSignatory' in parsedIx) {
          return TransactionType.SIGNATORY;
        }
        if ('insertTransaction' in parsedIx || 'removeTransaction' in parsedIx) {
          return TransactionType.PROPOSAL_INSTRUCTION;
        }
        if ('refundProposalDeposit' in parsedIx) {
          return TransactionType.REFUND;
        }
        // Admin operations
        if ('createRealm' in parsedIx || 'createGovernance' in parsedIx || 
            'setGovernanceConfig' in parsedIx || 'setRealmAuthority' in parsedIx ||
            'setRealmConfig' in parsedIx || 'createNativeTreasury' in parsedIx) {
          return TransactionType.GOVERNANCE_ADMIN;
        }
        // If it's a governance program but we can't identify the type, still track it
        return TransactionType.OTHER_GOVERNANCE;
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
                // Handle parsed inner instruction data - expanded for all types
                const parsedIx = data as { [key: string]: any };
                if ('vote' in parsedIx || 'castVote' in parsedIx || 'relinquishVote' in parsedIx) {
                  return TransactionType.VOTE;
                }
                if ('proposal' in parsedIx || 'createProposal' in parsedIx || 'cancelProposal' in parsedIx ||
                    'signOffProposal' in parsedIx || 'finalizeVote' in parsedIx || 'completeProposal' in parsedIx) {
                  return TransactionType.PROPOSAL;
                }
                if ('depositGoverningTokens' in parsedIx || 'createTokenOwnerRecord' in parsedIx) {
                  return TransactionType.TOKEN_DEPOSIT;
                }
                if ('withdrawGoverningTokens' in parsedIx) {
                  return TransactionType.TOKEN_WITHDRAWAL;
                }
                if ('setGovernanceDelegate' in parsedIx) {
                  return TransactionType.DELEGATE;
                }
                if ('executeTransaction' in parsedIx) {
                  return TransactionType.EXECUTE;
                }
                if ('addSignatory' in parsedIx || 'removeSignatory' in parsedIx) {
                  return TransactionType.SIGNATORY;
                }
                if ('insertTransaction' in parsedIx || 'removeTransaction' in parsedIx) {
                  return TransactionType.PROPOSAL_INSTRUCTION;
                }
                if ('refundProposalDeposit' in parsedIx) {
                  return TransactionType.REFUND;
                }
                // Admin operations
                if ('createRealm' in parsedIx || 'createGovernance' in parsedIx || 
                    'setGovernanceConfig' in parsedIx || 'setRealmAuthority' in parsedIx ||
                    'setRealmConfig' in parsedIx || 'createNativeTreasury' in parsedIx) {
                  return TransactionType.GOVERNANCE_ADMIN;
                }
                // If it's a governance program but we can't identify the type, still track it
                return TransactionType.OTHER_GOVERNANCE;
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
 * Get the fee payer address from a transaction
 * The fee payer is always the first account in the account keys list
 */
function getFeePayer(tx: ParsedTransactionWithMeta): string | null {
  const accountKeys = tx.transaction.message.accountKeys;
  if (accountKeys.length === 0) {
    return null;
  }
  
  const firstAccount = accountKeys[0];
  if (typeof firstAccount === 'string') {
    return firstAccount;
  }
  
  // Handle ParsedMessageAccount format
  if (firstAccount && 'pubkey' in firstAccount) {
    return firstAccount.pubkey.toString();
  }
  
  return null;
}

/**
 * Parse a transaction and extract relevant data if it's a governance action
 * 
 * This function:
 * 1. Verifies the transaction is a governance program interaction
 * 2. Verifies the configured wallet is the fee payer
 * 3. Extracts transaction type, fees, and rent costs
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

  // Verify the wallet address is the fee payer for this transaction
  const feePayer = getFeePayer(tx);
  if (!feePayer || feePayer !== walletAddress) {
    // This transaction was not paid for by the configured wallet
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

