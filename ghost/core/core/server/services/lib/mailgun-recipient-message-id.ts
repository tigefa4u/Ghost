/**
 * Builds the per-recipient Message-Id values Ghost sends on a Mailgun batch, so every
 * recipient gets its own Message-Id header instead of the single one Mailgun mints per
 * API call (which makes different readers' replies thread together in the publisher's inbox).
 *
 * Not to be confused with `./mailgun-message-id`, which normalizes the id Mailgun returns
 * from the messages API and is used by the automation and gift analytics to match events.
 */
import crypto from 'node:crypto';

/** Name of the recipient variable referenced by the `h:Message-Id` header template */
export const RECIPIENT_MESSAGE_ID_VARIABLE = 'message_id';

type RecipientVariables = Record<string, unknown>;
type RecipientData = Record<string, RecipientVariables>;

type MessageIdOptions = {
  /** Ghost email id; null/undefined for test emails, which have no email record */
  emailId?: string | null;
  /** Mailgun sending domain of this batch (custom or fallback domain) */
  domain: string;
};

/**
 * Returns `<id-left>@<id-right>` without angle brackets (the header template adds them).
 *
 * The left part is the email id followed by a SHA-256 of the email id and the recipient
 * address truncated to 128 bits (32 hex chars: collisions are negligible and the id stays
 * short), so the id is stable for a given (email, recipient) pair without exposing the
 * address. A resubmitted batch therefore reuses the same ids and clients that dedupe on
 * Message-Id show one copy. Test emails have no email id and get a random prefix.
 */
export function buildRecipientMessageId({
  emailId,
  recipientEmail,
  domain,
}: MessageIdOptions & { recipientEmail: string }): string {
  const prefix = emailId || crypto.randomUUID();
  const digest = crypto
    .createHash('sha256')
    .update(`${prefix}:${recipientEmail}`)
    .digest('hex')
    .slice(0, 32);

  return `${prefix}.${digest}@${domain}`;
}

/**
 * Returns a new recipient-variables map with a `message_id` added for every recipient.
 * The input is not mutated.
 */
export function addRecipientMessageIds(
  recipientData: RecipientData,
  { emailId, domain }: MessageIdOptions,
): RecipientData {
  const result: RecipientData = {};

  for (const [recipientEmail, variables] of Object.entries(recipientData)) {
    result[recipientEmail] = {
      ...variables,
      [RECIPIENT_MESSAGE_ID_VARIABLE]: buildRecipientMessageId({ emailId, recipientEmail, domain }),
    };
  }

  return result;
}
