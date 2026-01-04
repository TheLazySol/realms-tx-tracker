/**
 * TypeScript interfaces and enums for the DAO Reimbursement Tracker
 */

/**
 * Configuration loaded from config.json
 */
export interface AppConfig {
  realm_id: string;
  wallet_address: string;
  start_date: string; // MM-DD-YYYY format
  end_date: string; // MM-DD-YYYY format or empty for current date
  rps?: number; // Requests per second limit for RPC calls
}

/**
 * Validated configuration with parsed values
 */
export interface ValidatedConfig {
  realmId: string;
  walletAddress: string;
  startTimestamp: number; // Unix timestamp in seconds
  endTimestamp: number; // Unix timestamp in seconds
  rpcUrl: string;
  rps: number; // Requests per second limit for RPC calls
}

/**
 * Transaction type categories for governance actions
 */
export enum TransactionType {
  // Core governance actions
  VOTE = 'Vote',
  PROPOSAL = 'Proposal',
  COMMENT = 'Comment',
  
  // Token management
  TOKEN_DEPOSIT = 'Token Deposit',
  TOKEN_WITHDRAWAL = 'Token Withdrawal',
  
  // Delegation
  DELEGATE = 'Delegate',
  
  // Proposal execution
  EXECUTE = 'Execute Transaction',
  
  // Proposal management
  SIGNATORY = 'Signatory',
  PROPOSAL_INSTRUCTION = 'Proposal Instruction',
  
  // Administrative
  GOVERNANCE_ADMIN = 'Governance Admin',
  
  // Refunds
  REFUND = 'Refund',
  
  // Fallback for any unrecognized governance instruction
  OTHER_GOVERNANCE = 'Other Governance'
}

/**
 * SPL Governance instruction discriminators (first byte of instruction data)
 * These identify the type of governance action in a transaction
 */
export enum GovernanceInstructionType {
  CreateRealm = 0,
  DepositGoverningTokens = 1,
  WithdrawGoverningTokens = 2,
  SetGovernanceDelegate = 3,
  CreateGovernance = 4,
  CreateProgramGovernance = 5,
  CreateProposal = 6,
  AddSignatory = 7,
  RemoveSignatory = 8,
  InsertTransaction = 9,
  RemoveTransaction = 10,
  CancelProposal = 11,
  SignOffProposal = 12,
  CastVote = 13,
  FinalizeVote = 14,
  RelinquishVote = 15,
  ExecuteTransaction = 16,
  CreateMintGovernance = 17,
  CreateTokenGovernance = 18,
  SetGovernanceConfig = 19,
  FlagTransactionError = 20,
  SetRealmAuthority = 21,
  SetRealmConfig = 22,
  CreateTokenOwnerRecord = 23,
  UpdateProgramMetadata = 24,
  CreateNativeTreasury = 25,
  RevokeGoverningTokens = 26,
  RefundProposalDeposit = 27,
  CompleteProposal = 28,
  // Chat/Message related
  PostMessage = 29
}

/**
 * Represents a single tracked governance transaction
 */
export interface TrackedTransaction {
  signature: string;
  blockTime: number; // Unix timestamp
  slot: number;
  transactionType: TransactionType;
  transactionFee: number; // in lamports
  rentCost: number; // in lamports (calculated from balance changes)
  totalCost: number; // in lamports
  dateTime: string; // Human readable date/time
}

/**
 * Summary statistics for each transaction type
 */
export interface CategorySummary {
  count: number;
  totalFees: number; // in lamports
}

/**
 * Overall tracking results
 */
export interface TrackingResults {
  transactions: TrackedTransaction[];
  votes: CategorySummary;
  proposals: CategorySummary;
  comments: CategorySummary;
  tokenDeposits: CategorySummary;
  tokenWithdrawals: CategorySummary;
  delegates: CategorySummary;
  executes: CategorySummary;
  signatories: CategorySummary;
  proposalInstructions: CategorySummary;
  governanceAdmin: CategorySummary;
  refunds: CategorySummary;
  otherGovernance: CategorySummary;
  totalCount: number;
  totalFees: number; // in lamports
}

/**
 * Signature info from getSignaturesForAddress
 */
export interface SignatureInfo {
  signature: string;
  slot: number;
  err: unknown | null;
  memo: string | null;
  blockTime: number | null;
}

/**
 * Parsed instruction with governance context
 */
export interface ParsedGovernanceInstruction {
  instructionType: GovernanceInstructionType;
  transactionType: TransactionType;
  programId: string;
  data: Buffer;
}

/**
 * CSV row structure
 */
export interface CsvRow {
  'Transaction Signature': string;
  'Date/Time': string;
  'Block/Slot': number;
  'Transaction Type': string;
  'Transaction Fee (SOL)': string;
  'Rent Cost (SOL)': string;
  'Total Cost (SOL)': string;
}

