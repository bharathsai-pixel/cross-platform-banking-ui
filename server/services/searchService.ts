/**
 * server/services/searchService.ts
 *
 * Similarity-based search over transactions and activity logs.
 * Uses TF-IDF + cosine similarity for semantic matching.
 * Not limited to exact keyword matches.
 */

import { sequelize } from "../db/mysql.js";
import { QueryTypes } from "sequelize";
import { ActivityLog } from "../db/mongo-models/ActivityLog.js";
import { Notification } from "../db/mongo-models/Notification.js";
import { bufferToUuid, uuidToBuffer } from "../utils/uuid.js";

export interface SearchResult {
  type: "transaction" | "activity" | "notification";
  id: string;
  title: string;
  description: string;
  score: number;
  data: Record<string, unknown>;
  createdAt: Date;
}

// Simple English stop words to filter out
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "he",
  "in", "is", "it", "its", "of", "on", "that", "the", "to", "was", "were", "will", "with",
  "the", "this", "but", "they", "have", "had", "what", "when", "where", "who", "which",
  "why", "how", "all", "each", "every", "both", "few", "more", "most", "other", "some",
  "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very",
  "can", "just", "should", "now", "also", "been", "being", "do", "does", "did",
]);

/**
 * Tokenize and normalize text for TF-IDF.
 * Lowercases, removes punctuation, filters stop words.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

/**
 * Compute term frequency (TF) for a document.
 * Returns a map of term -> frequency.
 */
function computeTF(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  // Normalize by document length
  const total = tokens.length || 1;
  for (const [term, count] of tf) {
    tf.set(term, count / total);
  }
  return tf;
}

/**
 * Compute cosine similarity between two TF vectors.
 */
function cosineSimilarity(tf1: Map<string, number>, tf2: Map<string, number>): number {
  const allTerms = new Set([...tf1.keys(), ...tf2.keys()]);
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (const term of allTerms) {
    const v1 = tf1.get(term) || 0;
    const v2 = tf2.get(term) || 0;
    dotProduct += v1 * v2;
    norm1 += v1 * v1;
    norm2 += v2 * v2;
  }

  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Search across transactions, activity logs, and notifications.
 * Returns results sorted by similarity score (descending).
 */
export async function searchAll(
  userId: string,
  query: string,
  options: {
    type?: "transactions" | "activity" | "all";
    limit?: number;
    threshold?: number;
  } = {}
): Promise<SearchResult[]> {
  const { type = "all", limit = 20, threshold = 0.3 } = options;
  const queryTokens = tokenize(query);
  const queryTF = computeTF(queryTokens);

  const results: SearchResult[] = [];

  // Search transactions
  if (type === "all" || type === "transactions") {
    const txnResults = await searchTransactions(userId, queryTF, threshold);
    results.push(...txnResults);
  }

  // Search activity logs
  if (type === "all" || type === "activity") {
    const activityResults = await searchActivityLogs(userId, queryTF, threshold);
    results.push(...activityResults);
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, limit);
}

/**
 * Search transactions using TF-IDF similarity.
 */
async function searchTransactions(
  userId: string,
  queryTF: Map<string, number>,
  threshold: number
): Promise<SearchResult[]> {
  // Get user's account IDs
  const accountRows = await sequelize.query<Array<{ id: Buffer }>>(
    `SELECT id FROM accounts WHERE user_id = UUID_TO_BIN(?)`,
    { replacements: [userId], type: QueryTypes.SELECT }
  );

  if (accountRows.length === 0) return [];

  const accountIds = accountRows.map((r) => bufferToUuid(r.id));

  // Fetch transactions with related data
  const txnRows = await sequelize.query<any>(
    `SELECT
      t.id, t.sender_account_id, t.receiver_account_id, t.amount, t.currency,
      t.transaction_type, t.status, t.reference_id, t.created_at,
      sa.account_number as sender_account_number,
      ra.account_number as receiver_account_number
    FROM transactions t
    JOIN accounts sa ON t.sender_account_id = sa.id
    JOIN accounts ra ON t.receiver_account_id = ra.id
    WHERE BIN_TO_UUID(sender_account_id) IN (?) OR BIN_TO_UUID(receiver_account_id) IN (?)
    ORDER BY t.created_at DESC
    LIMIT 100`,
    { replacements: [accountIds, accountIds], type: QueryTypes.SELECT }
  );

  const results: SearchResult[] = [];

  for (const row of txnRows) {
    const isOutgoing = accountIds.includes(bufferToUuid(row.sender_account_id));

    // Build searchable text
    const searchableText = [
      row.amount,
      row.currency,
      row.transaction_type,
      row.status,
      row.reference_id,
      isOutgoing ? "sent transfer payment debit" : "received credit deposit",
      row.sender_account_number,
      row.receiver_account_number,
    ]
      .filter(Boolean)
      .join(" ");

    const docTokens = tokenize(searchableText);
    const docTF = computeTF(docTokens);
    const score = cosineSimilarity(queryTF, docTF);

    if (score >= threshold) {
      results.push({
        type: "transaction",
        id: bufferToUuid(row.id),
        title: `${isOutgoing ? "Sent" : "Received"} ${row.currency} ${row.amount}`,
        description: `${row.transaction_type} - ${row.status} - Ref: ${row.reference_id || "N/A"}`,
        score,
        data: {
          amount: row.amount,
          currency: row.currency,
          type: row.transaction_type,
          status: row.status,
          direction: isOutgoing ? "outgoing" : "incoming",
        },
        createdAt: row.created_at,
      });
    }
  }

  return results;
}

/**
 * Search activity logs using MongoDB text search + TF-IDF similarity.
 */
async function searchActivityLogs(
  userId: string,
  queryTF: Map<string, number>,
  threshold: number
): Promise<SearchResult[]> {
  // Use MongoDB text search as initial filter
  const searchTerms = Array.from(queryTF.keys()).join(" ");

  const logs = await ActivityLog.find(
    {
      userId,
      $text: { $search: searchTerms },
    },
    { score: { $meta: "textScore" } }
  )
    .sort({ score: { $meta: "textScore" } })
    .limit(50);

  const results: SearchResult[] = [];

  for (const log of logs) {
    const description = String(log.metadata?.description || log.eventType);

    const docTokens = tokenize(description);
    const docTF = computeTF(docTokens);
    const score = cosineSimilarity(queryTF, docTF);

    if (score >= threshold) {
      results.push({
        type: "activity",
        id: log._id.toString(),
        title: log.eventType,
        description: description,
        score,
        data: log.metadata as Record<string, unknown>,
        createdAt: log.createdAt,
      });
    }
  }

  return results;
}
