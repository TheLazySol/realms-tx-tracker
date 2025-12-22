/**
 * Governance SDK interactions and realm validation
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { GOVERNANCE_PROGRAM_ID } from '../constants';
import { logInfo, logWarning, logSuccess } from '../utils/logger';

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
 * TokenOwnerRecord seeds: ["governance", realm, governing_token_mint, wallet]
 * 
 * @param realmId - The realm public key
 * @param governingTokenMint - The governing token mint (usually community mint)
 * @param walletAddress - The wallet address
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
 * Check if a TokenOwnerRecord account exists on-chain
 * @param connection - Solana connection
 * @param tokenOwnerRecord - The TokenOwnerRecord PDA
 * @returns true if the account exists
 */
export async function tokenOwnerRecordExists(
  connection: Connection,
  tokenOwnerRecord: PublicKey
): Promise<boolean> {
  try {
    const accountInfo = await connection.getAccountInfo(tokenOwnerRecord);
    return accountInfo !== null;
  } catch {
    return false;
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

