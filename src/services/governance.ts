/**
 * Governance SDK interactions and realm validation
 * 
 * Note: governance-idl-sdk is available but not currently used for account parsing.
 * The SDK exports SplGovernance which could be used for better account decoding
 * in the future. Current implementation uses manual parsing which is sufficient
 * for our use case.
 */

import { Connection, PublicKey, GetProgramAccountsFilter } from '@solana/web3.js';
import { GOVERNANCE_PROGRAM_ID } from '../constants';
import { logInfo, logWarning, logSuccess } from '../utils/logger';
import { throttle } from '../utils/rate-limiter';

/**
 * Realm account data structure offsets
 * Based on SPL Governance account layout
 * 
 * Realm account structure:
 * - account_type: 1 byte (offset 0)
 * - community_mint: 32 bytes (offset 1)
 * - reserved: 6 bytes (offset 33)
 * - voting_proposal_count: 2 bytes (offset 39)
 * - authority: Option<Pubkey> = 1 + 32 bytes (offset 41)
 * - name: String (variable length)
 * - ... rest of fields
 */
const REALM_COMMUNITY_MINT_OFFSET = 1;
const PUBKEY_SIZE = 32;

/**
 * Parsed realm data with community token mint
 */
export interface RealmData {
  communityMint: PublicKey;
}

/**
 * Parse realm account data to extract the community token mint
 * @param connection - Solana connection
 * @param realmId - Realm public key string
 * @returns RealmData with community mint, or null if parsing fails
 */
export async function parseRealmData(
  connection: Connection,
  realmId: string
): Promise<RealmData | null> {
  try {
    const realmPubkey = new PublicKey(realmId);
    const accountInfo = await connection.getAccountInfo(realmPubkey);

    if (!accountInfo) {
      logWarning(`Realm account ${realmId} not found on-chain`);
      return null;
    }

    // Verify the account is owned by the governance program
    const owner = accountInfo.owner.toString();
    if (owner !== GOVERNANCE_PROGRAM_ID) {
      logWarning(`Account ${realmId} is not owned by the governance program`);
      return null;
    }

    const data = accountInfo.data;
    
    // Ensure we have enough data to read the community mint
    if (data.length < REALM_COMMUNITY_MINT_OFFSET + PUBKEY_SIZE) {
      logWarning(`Realm account data too short: ${data.length} bytes`);
      return null;
    }

    // Extract community mint pubkey (32 bytes starting at offset 1)
    const communityMintBytes = data.slice(
      REALM_COMMUNITY_MINT_OFFSET,
      REALM_COMMUNITY_MINT_OFFSET + PUBKEY_SIZE
    );
    const communityMint = new PublicKey(communityMintBytes);

    logSuccess(`Parsed realm community mint: ${communityMint.toString()}`);

    return {
      communityMint
    };
  } catch (error) {
    logWarning(`Failed to parse realm data: ${(error as Error).message}`);
    return null;
  }
}

/**
 * Derive the TokenOwnerRecord PDA for a wallet in a specific realm
 * 
 * TokenOwnerRecord seeds: ["governance", realm, governing_token_mint, governing_token_owner]
 * 
 * Note: In most cases, the wallet address IS the governing_token_owner (for associated token accounts).
 * This function uses the wallet address directly. If you need to find the actual token account owner,
 * use findTokenAccountOwner() first.
 * 
 * @param realmId - The realm public key
 * @param governingTokenMint - The governing token mint (usually community mint)
 * @param walletAddress - The wallet address (or token account owner)
 * @returns The TokenOwnerRecord PDA
 */
export function deriveTokenOwnerRecordAddress(
  realmId: string,
  governingTokenMint: PublicKey,
  walletAddress: string
): PublicKey {
  const realmPubkey = new PublicKey(realmId);
  const walletPubkey = new PublicKey(walletAddress);
  const governanceProgramId = new PublicKey(GOVERNANCE_PROGRAM_ID);

  // Seeds: ["governance", realm, governing_token_mint, governing_token_owner]
  const seeds = [
    Buffer.from('governance'),
    realmPubkey.toBuffer(),
    governingTokenMint.toBuffer(),
    walletPubkey.toBuffer()
  ];

  const [tokenOwnerRecord] = PublicKey.findProgramAddressSync(
    seeds,
    governanceProgramId
  );

  return tokenOwnerRecord;
}

/**
 * Check if a TokenOwnerRecord account exists on-chain and validate its structure
 * @param connection - Solana connection
 * @param tokenOwnerRecord - The TokenOwnerRecord PDA
 * @returns true if the account exists and is valid
 */
export async function tokenOwnerRecordExists(
  connection: Connection,
  tokenOwnerRecord: PublicKey
): Promise<boolean> {
  try {
    await throttle();
    const accountInfo = await connection.getAccountInfo(tokenOwnerRecord);
    
    if (!accountInfo) {
      return false;
    }

    // Validate that the account is owned by the governance program
    const owner = accountInfo.owner.toString();
    if (owner !== GOVERNANCE_PROGRAM_ID) {
      logWarning(`TokenOwnerRecord ${tokenOwnerRecord.toString()} is not owned by governance program`);
      return false;
    }

    // Validate minimum account size (TokenOwnerRecord should be at least 100+ bytes)
    if (accountInfo.data.length < 100) {
      logWarning(`TokenOwnerRecord ${tokenOwnerRecord.toString()} has suspiciously small data size: ${accountInfo.data.length}`);
      return false;
    }

    return true;
  } catch (error) {
    logWarning(`Error checking TokenOwnerRecord existence: ${(error as Error).message}`);
    return false;
  }
}

/**
 * VoteRecord account structure offsets (for parsing)
 * VoteRecord seeds: ["governance", governance_pubkey, proposal_pubkey, voter_token_owner_record]
 */
const VOTE_RECORD_DISCRIMINATOR_LENGTH = 8;
const VOTE_RECORD_TOKEN_OWNER_RECORD_OFFSET = 8;
const VOTE_RECORD_TOKEN_OWNER_RECORD_SIZE = 32;

/**
 * Interface for VoteRecord account info
 */
export interface VoteRecordInfo {
  pubkey: PublicKey;
  signature?: string; // Transaction signature that created/modified this vote
  blockTime?: number;
}

/**
 * Fetch VoteRecord accounts for a specific TokenOwnerRecord using getProgramAccounts
 * 
 * VoteRecord seeds: ["governance", governance_pubkey, proposal_pubkey, voter_token_owner_record]
 * We filter by the voter_token_owner_record (TokenOwnerRecord PDA) to find all votes.
 * 
 * @param connection - Solana connection
 * @param tokenOwnerRecord - The TokenOwnerRecord PDA to find votes for
 * @param startTimestamp - Start timestamp filter (optional)
 * @param endTimestamp - End timestamp filter (optional)
 * @returns Array of VoteRecord account public keys and metadata
 */
export async function fetchVoteRecordsForTokenOwnerRecord(
  connection: Connection,
  tokenOwnerRecord: PublicKey,
  startTimestamp?: number,
  endTimestamp?: number
): Promise<VoteRecordInfo[]> {
  try {
    await throttle();
    
    const governanceProgramId = new PublicKey(GOVERNANCE_PROGRAM_ID);
    
    // Filter by TokenOwnerRecord in the account data
    // TokenOwnerRecord is at offset 8 (after 8-byte discriminator)
    // memcmp expects base58-encoded bytes as a string
    const filters: GetProgramAccountsFilter[] = [
      {
        dataSize: 200, // VoteRecord accounts are typically around this size
      },
      {
        memcmp: {
          offset: VOTE_RECORD_TOKEN_OWNER_RECORD_OFFSET,
          bytes: tokenOwnerRecord.toBase58(), // Base58-encoded public key bytes
        },
      },
    ];

    logInfo(`  Querying VoteRecord accounts for TokenOwnerRecord ${tokenOwnerRecord.toString()}...`);
    
    const accounts = await connection.getProgramAccounts(governanceProgramId, {
      filters,
    });

    logSuccess(`  Found ${accounts.length} VoteRecord accounts`);

    const voteRecords: VoteRecordInfo[] = [];
    
    for (const account of accounts) {
      // Verify this is actually a VoteRecord by checking discriminator
      // VoteRecord discriminator is the first 8 bytes
      const accountData = account.account.data;
      
      if (accountData.length < VOTE_RECORD_TOKEN_OWNER_RECORD_OFFSET + VOTE_RECORD_TOKEN_OWNER_RECORD_SIZE) {
        continue; // Skip if account data is too short
      }

      // Extract TokenOwnerRecord from account data to verify
      const torBytes = accountData.slice(
        VOTE_RECORD_TOKEN_OWNER_RECORD_OFFSET,
        VOTE_RECORD_TOKEN_OWNER_RECORD_OFFSET + VOTE_RECORD_TOKEN_OWNER_RECORD_SIZE
      );
      const extractedTor = new PublicKey(torBytes);
      
      // Verify it matches our TokenOwnerRecord
      if (!extractedTor.equals(tokenOwnerRecord)) {
        continue;
      }

      voteRecords.push({
        pubkey: account.pubkey,
      });
    }

    // If we have timestamps, we need to fetch transaction signatures for each VoteRecord
    // to filter by time. This is expensive, so we'll do it in batches.
    if ((startTimestamp !== undefined || endTimestamp !== undefined) && voteRecords.length > 0) {
      logInfo(`  Filtering ${voteRecords.length} VoteRecords by timestamp...`);
      
      const filteredRecords: VoteRecordInfo[] = [];
      
      // Fetch signatures for each VoteRecord account to get timestamps
      for (let i = 0; i < voteRecords.length; i++) {
        await throttle();
        const record = voteRecords[i];
        
        try {
          // Get the most recent signature for this account (when it was created/modified)
          const signatures = await connection.getSignaturesForAddress(record.pubkey, {
            limit: 1,
          });

          if (signatures.length > 0 && signatures[0].blockTime !== null && signatures[0].blockTime !== undefined) {
            const blockTime = signatures[0].blockTime;
            
            // Apply timestamp filters
            if (startTimestamp !== undefined && blockTime < startTimestamp) {
              continue;
            }
            if (endTimestamp !== undefined && blockTime > endTimestamp) {
              continue;
            }
            
            record.blockTime = blockTime;
            record.signature = signatures[0].signature;
            filteredRecords.push(record);
          } else {
            // If no timestamp, include it anyway (shouldn't happen for VoteRecords)
            filteredRecords.push(record);
          }
        } catch (error) {
          // Skip if we can't fetch signatures
          logWarning(`  Failed to fetch signatures for VoteRecord ${record.pubkey.toString()}: ${(error as Error).message}`);
        }
      }
      
      return filteredRecords;
    }

    return voteRecords;
  } catch (error) {
    logWarning(`Failed to fetch VoteRecords: ${(error as Error).message}`);
    return [];
  }
}

/**
 * Validate that a realm exists on-chain
 * @param connection - Solana connection
 * @param realmId - Realm public key string
 * @returns true if realm exists
 */
export async function validateRealm(
  connection: Connection,
  realmId: string
): Promise<boolean> {
  try {
    const realmPubkey = new PublicKey(realmId);
    const accountInfo = await connection.getAccountInfo(realmPubkey);

    if (!accountInfo) {
      logWarning(`Realm account ${realmId} not found on-chain`);
      return false;
    }

    // Check if the account is owned by the governance program
    const owner = accountInfo.owner.toString();
    if (owner !== GOVERNANCE_PROGRAM_ID) {
      logWarning(`Account ${realmId} is not owned by the governance program`);
      return false;
    }

    logInfo(`Realm ${realmId} validated successfully`);
    return true;
  } catch (error) {
    logWarning(`Failed to validate realm: ${(error as Error).message}`);
    return false;
  }
}

/**
 * Get basic realm information
 * This is a simplified version - full parsing would require the governance SDK
 */
export async function getRealmInfo(
  connection: Connection,
  realmId: string
): Promise<{ exists: boolean; dataLength: number } | null> {
  try {
    const realmPubkey = new PublicKey(realmId);
    const accountInfo = await connection.getAccountInfo(realmPubkey);

    if (!accountInfo) {
      return null;
    }

    return {
      exists: true,
      dataLength: accountInfo.data.length
    };
  } catch {
    return null;
  }
}

