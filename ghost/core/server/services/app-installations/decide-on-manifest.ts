import { compareManifests } from '@tryghost/app-contracts/manifest';
import type { CurrentInstallation } from './codec';
import type { LoadedManifest } from './load-manifest';

/** One field that differs from what the publisher approved. */
export interface AppManifestChange {
  /** Where the change is: a path in the manifest, or `manifest_url` when the app moved. */
  path: string;
  requires_approval: boolean;
}

type Approved = Pick<CurrentInstallation, 'manifest_url' | 'manifest'>;

/**
 * Lists what differs between the approved manifest and a loaded one. The preview shows
 * this list and decisions are made from it, so a review always matches what happens.
 */
function compare(approved: Approved, loaded: LoadedManifest) {
  const { changes, requiresApproval } = compareManifests(
    { manifestUrl: approved.manifest_url, manifest: approved.manifest },
    { manifestUrl: loaded.manifestUrl, manifest: loaded.manifest },
  );
  return {
    changes: changes.map(({ path, requiresApproval: requires }) => ({
      path,
      requires_approval: requires,
    })),
    requiresApproval,
  };
}

/** Who keeps a loaded manifest: a publisher's `approval`, or the re-check's `update`. */
export type DecisionSource = 'approval' | 'update';

/**
 * What keeping a decision writes:
 * - `none`: nothing.
 * - `existing`: the installation runs a manifest row it already has, and nothing is left
 *   pending.
 * - `new`: the loaded manifest is stored as a new row. With `pending`, it becomes the pending
 *   manifest, which suspends the installation. Otherwise it becomes the approved manifest,
 *   and nothing is left pending.
 */
export type ManifestKeep =
  | { row: 'none' }
  | { row: 'existing'; manifestId: string }
  | {
      row: 'new';
      source: 'approval' | 'update' | 'resume';
      requiresApproval: boolean;
      pending: boolean;
    };

/** A decision with the changes it was based on, so the preview doesn't compare again. */
export interface ManifestDecision {
  changes: AppManifestChange[];
  keep: ManifestKeep;
}

const NOTHING: ManifestKeep = { row: 'none' };

/**
 * Decides what keeping a loaded manifest writes, given the approved manifest and the
 * pending one, if any:
 *
 * - The approved manifest, with nothing pending: nothing.
 * - The pending manifest: the re-check leaves it waiting. An approval runs its row.
 * - Only silent changes, with nothing pending: a new approved manifest.
 * - Changes that need approval: the re-check stores them as the pending manifest, replacing
 *   any, which suspends the installation. An approval stores them as the approved one.
 * - The approved manifest, with or without silent changes, while something is pending: the
 *   app reverted the pending changes. The re-check stores a `resume` row, since no person
 *   made that change and the row is the only record of it. An approval with no changes runs
 *   the approved row again, and the staff history records it. Either lifts the suspension.
 */
export function decideOnManifest({
  current,
  loaded,
  source,
}: {
  current: Pick<CurrentInstallation, 'manifest_id' | 'manifest_url' | 'manifest' | 'pending'>;
  loaded: LoadedManifest;
  source: DecisionSource;
}): ManifestDecision {
  const { pending } = current;
  const { changes, requiresApproval } = compare(current, loaded);
  const decision = (keep: ManifestKeep) => ({ changes, keep });
  if (pending && pending.digest === loaded.digest) {
    return decision(source === 'approval' ? { row: 'existing', manifestId: pending.id } : NOTHING);
  }
  if (requiresApproval) {
    return decision({ row: 'new', source, requiresApproval: true, pending: source === 'update' });
  }
  if (pending && source === 'update') {
    return decision({ row: 'new', source: 'resume', requiresApproval: false, pending: false });
  }
  if (changes.length === 0) {
    return decision(pending ? { row: 'existing', manifestId: current.manifest_id } : NOTHING);
  }
  return decision({ row: 'new', source, requiresApproval: false, pending: false });
}
