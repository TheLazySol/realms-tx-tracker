/**
 * Constants for the DAO Reimbursement Tracker
 */

/**
 * SPL Governance Program ID (mainnet)
 */
export const GOVERNANCE_PROGRAM_ID = 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw';

/**
 * SPL Governance Chat Program ID (for comments/messages)
 */
export const GOVERNANCE_CHAT_PROGRAM_ID = 'gCHAtYKrUUktTVzE4hEnZdLV4LXrdBf6Hh9qMaJALET';

/**
 * Lamports per SOL
 */
export const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Maximum signatures to fetch per RPC call
 */
export const MAX_SIGNATURES_PER_FETCH = 1000;

/**
 * Concurrent RPC requests limit (to avoid rate limiting)
 */
export const MAX_CONCURRENT_REQUESTS = 10;

/**
 * Default requests per second limit for RPC calls
 */
export const DEFAULT_RPS = 10;

/**
 * Retry configuration
 */
export const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000
};

/**
 * Complete governance instruction discriminator to TransactionType mapping
 * Maps ALL governance program instructions to their transaction types
 * 
 * Discriminator values correspond to GovernanceInstructionType enum in types.ts
 */
export const GOVERNANCE_INSTRUCTION_MAP: Record<number, string> = {
  // Governance Admin operations
  0: 'Governance Admin',   // CreateRealm
  4: 'Governance Admin',   // CreateGovernance
  5: 'Governance Admin',   // CreateProgramGovernance
  17: 'Governance Admin',  // CreateMintGovernance
  18: 'Governance Admin',  // CreateTokenGovernance
  19: 'Governance Admin',  // SetGovernanceConfig
  20: 'Governance Admin',  // FlagTransactionError
  21: 'Governance Admin',  // SetRealmAuthority
  22: 'Governance Admin',  // SetRealmConfig
  24: 'Governance Admin',  // UpdateProgramMetadata
  25: 'Governance Admin',  // CreateNativeTreasury
  26: 'Governance Admin',  // RevokeGoverningTokens
  
  // Token Deposit operations
  1: 'Token Deposit',      // DepositGoverningTokens
  23: 'Token Deposit',     // CreateTokenOwnerRecord
  
  // Token Withdrawal operations
  2: 'Token Withdrawal',   // WithdrawGoverningTokens
  
  // Delegate operations
  3: 'Delegate',           // SetGovernanceDelegate
  
  // Proposal operations
  6: 'Proposal',           // CreateProposal
  11: 'Proposal',          // CancelProposal
  12: 'Proposal',          // SignOffProposal
  14: 'Proposal',          // FinalizeVote (finalizing vote on proposal)
  28: 'Proposal',          // CompleteProposal
  
  // Signatory operations
  7: 'Signatory',          // AddSignatory
  8: 'Signatory',          // RemoveSignatory
  
  // Proposal Instruction operations
  9: 'Proposal Instruction',   // InsertTransaction
  10: 'Proposal Instruction',  // RemoveTransaction
  
  // Vote operations
  13: 'Vote',              // CastVote
  15: 'Vote',              // RelinquishVote
  
  // Execute operations
  16: 'Execute Transaction',  // ExecuteTransaction
  
  // Refund operations
  27: 'Refund',            // RefundProposalDeposit
} as const;

/**
 * Legacy mapping for backwards compatibility
 * @deprecated Use GOVERNANCE_INSTRUCTION_MAP instead
 */
export const TRACKED_INSTRUCTIONS = GOVERNANCE_INSTRUCTION_MAP;

