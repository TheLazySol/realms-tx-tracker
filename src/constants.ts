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
 * Governance instruction discriminators that we track for fees
 * Maps to TransactionType
 */
export const TRACKED_INSTRUCTIONS = {
  // Votes
  13: 'Vote',  // CastVote
  15: 'Vote',  // RelinquishVote
  
  // Proposals
  6: 'Proposal',   // CreateProposal
  11: 'Proposal',  // CancelProposal
  12: 'Proposal',  // SignOffProposal
  14: 'Proposal',  // FinalizeVote
  28: 'Proposal',  // CompleteProposal
  
  // Comments/Messages (from chat program)
  0: 'Comment'  // PostMessage in chat program
} as const;

