import errors from '@tryghost/errors';
import ObjectId from 'bson-objectid';
import type { Knex } from 'knex';
import { z } from 'zod';
import type { AppManifest } from '@tryghost/app-contracts/manifest';
import { DbDate, toDatabaseDate } from '../../lib/db-types/date';
import {
  AppInstallationRow,
  CurrentInstallationRow,
  type AppInstallation,
  type AppInstallationHistoryEntry,
  type CurrentInstallation,
} from './codec';
import type { ManifestKeep } from './decide-on-manifest';
import { approvalManifestIds, buildHistory, type HistoryAction } from './history';
import type { LoadedManifest } from './load-manifest';
import { DbAppInstallationManifest } from './schema';

const INSTALLATIONS = 'app_installations';
const MANIFESTS = 'app_installation_manifests';

const HistoryManifestRow = DbAppInstallationManifest.pick({
  id: true,
  manifest_url: true,
  source: true,
  requires_approval: true,
  created_at: true,
});

const ManifestContentRow = DbAppInstallationManifest.pick({ id: true, manifest: true });

const HistoryActionRow = z
  .object({
    id: z.string(),
    event: z.string(),
    actor_id: z.string(),
    actor_name: z.string().nullable(),
    context: z.string().nullable(),
    created_at: DbDate,
  })
  .transform((row): HistoryAction => ({
    id: row.id,
    event: row.event,
    context: row.context,
    created_at: row.created_at,
    actor: { id: row.actor_id, name: row.actor_name },
  }));

/**
 * What keeping a decision did. `written` says the approved manifest ID before and after.
 * Nothing is written if the decision keeps nothing (`unchanged`), or if the installation has
 * been uninstalled since it was read (`gone`) or changed (`stale`).
 */
export type Kept =
  | { outcome: 'written'; from: string; to: string }
  | { outcome: 'unchanged' | 'gone' | 'stale' };

const MAX_TRANSACTION_ATTEMPTS = 3;

function errorCode(err: unknown): unknown {
  return (err as { code?: unknown } | null)?.code;
}

function isUniqueViolation(err: unknown): boolean {
  const code = errorCode(err);
  return (
    code === 'ER_DUP_ENTRY' || (typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT'))
  );
}

/**
 * Runs `write` in a transaction. MySQL rolls back a deadlock victim's whole transaction, so
 * one that loses a deadlock is started again, up to three attempts in all.
 */
async function transactionRetryingDeadlocks(
  knex: Knex,
  write: (trx: Knex.Transaction) => Promise<void>,
): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await knex.transaction(write);
    } catch (err) {
      if (errorCode(err) !== 'ER_LOCK_DEADLOCK' || attempt === MAX_TRANSACTION_ATTEMPTS) {
        throw err;
      }
    }
  }
}

/** Writes what a decision keeps, in `keepAt`'s transaction. */
async function writeKeep(
  trx: Knex.Transaction,
  before: CurrentInstallation,
  loaded: LoadedManifest,
  keep: ManifestKeep,
  iconSvg: string | null,
): Promise<Kept> {
  if (keep.row === 'none') {
    return { outcome: 'unchanged' };
  }
  const now = toDatabaseDate(new Date());

  let manifestId: string;
  if (keep.row === 'existing') {
    manifestId = keep.manifestId;
  } else {
    manifestId = new ObjectId().toHexString();
    await trx(MANIFESTS).insert({
      id: manifestId,
      installation_id: before.id,
      manifest_url: loaded.manifestUrl,
      manifest: loaded.serialised,
      digest: loaded.digest,
      icon_svg: iconSvg,
      source: keep.source,
      requires_approval: keep.requiresApproval,
      created_at: now,
    });
    if (keep.pending) {
      await trx(INSTALLATIONS)
        .where({ id: before.id })
        .update({
          status: 'suspended',
          pending_manifest_id: manifestId,
          revision: trx.raw('?? + 1', ['revision']),
          updated_at: now,
        });
      return { outcome: 'written', from: before.manifest_id, to: before.manifest_id };
    }
  }
  await trx(INSTALLATIONS)
    .where({ id: before.id })
    .update({
      // Suspended only means changes are waiting for approval, so with none left it's active.
      status: 'active',
      manifest_id: manifestId,
      pending_manifest_id: null,
      revision: trx.raw('?? + 1', ['revision']),
      updated_at: now,
    });
  return { outcome: 'written', from: before.manifest_id, to: manifestId };
}

/**
 * The installations and their manifest rows. A manifest row is never changed once written,
 * and every write to an installation increments its revision.
 */
export class AppInstallationsStore {
  private knex: Knex;

  constructor(knex: Knex) {
    this.knex = knex;
  }

  /** Installed apps, suspended ones included, oldest first. Uninstalled apps aren't listed. */
  async list(): Promise<AppInstallation[]> {
    const rows = await this.withApprovedManifest()
      .whereNot('installation.status', 'uninstalled')
      .orderBy('installation.created_at', 'asc')
      .orderBy('installation.id', 'asc');
    return rows.map((row) => z.decode(AppInstallationRow, row));
  }

  /** An installation by ID, uninstalled or not. */
  async find(id: string): Promise<AppInstallation | undefined> {
    const [row] = await this.withApprovedManifest().where('installation.id', id);
    return row ? z.decode(AppInstallationRow, row) : undefined;
  }

  async history(id: string): Promise<AppInstallationHistoryEntry[]> {
    const manifestRows = this.knex(MANIFESTS)
      .where({ installation_id: id })
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')
      .select<z.input<typeof HistoryManifestRow>[]>(
        'id',
        'manifest_url',
        'source',
        'requires_approval',
        'created_at',
      );
    const actionRows = this.knex('actions as action')
      // Left join, so actions by deleted users still show, just without a name.
      .leftJoin('users as actor', 'actor.id', 'action.actor_id')
      .where({ 'action.resource_type': 'app_installation', 'action.resource_id': id })
      .orderBy('action.created_at', 'asc')
      .orderBy('action.id', 'asc')
      .select<z.input<typeof HistoryActionRow>[]>(
        'action.id',
        'action.event',
        'action.actor_id',
        'action.context',
        'action.created_at',
        'actor.name as actor_name',
      );
    const [manifestData, actionData] = await Promise.all([manifestRows, actionRows]);
    const manifests = manifestData.map((row) => z.decode(HistoryManifestRow, row));
    const actions = actionData.map((row) => z.decode(HistoryActionRow, row));
    return buildHistory(
      manifests,
      actions,
      await this.manifestContents(approvalManifestIds(actions)),
    );
  }

  /**
   * Finds an installation that hasn't been uninstalled, by installation ID or app ID, joined
   * with its approved manifest and the pending one's digest. By ID, uninstalled rows are
   * skipped by status. By app ID, the lookup uses `current_app_id`, which uninstalling clears.
   */
  async current(by: { id: string } | { appId: string }): Promise<CurrentInstallation | undefined> {
    const query = this.joinApprovedManifest().leftJoin(
      `${MANIFESTS} as pending`,
      'pending.id',
      'installation.pending_manifest_id',
    );
    if ('id' in by) {
      query.where('installation.id', by.id).whereNot('installation.status', 'uninstalled');
    } else {
      query.where('installation.current_app_id', by.appId);
    }
    const row = await query.first<z.input<typeof CurrentInstallationRow> | undefined>(
      'installation.id',
      'installation.app_id',
      'installation.status',
      'installation.manifest_id',
      'installation.pending_manifest_id',
      'installation.revision',
      'approved.manifest_url',
      'approved.manifest',
      'pending.digest as pending_digest',
    );
    return row ? z.decode(CurrentInstallationRow, row) : undefined;
  }

  /**
   * The icon copy stored with a manifest row. Read only where it's shown, so re-checks and
   * approvals don't load it.
   */
  async icon(manifestId: string): Promise<string | null> {
    const row = await this.knex(MANIFESTS).where({ id: manifestId }).first('icon_svg');
    return row?.icon_svg ?? null;
  }

  /**
   * Every install creates a new installation with a new ID, reinstalls included; an
   * uninstalled installation is never reused. The unique `current_app_id` column blocks a
   * second installation of the same app, so when two installs race, one succeeds and the
   * other gets `APP_ALREADY_INSTALLED`.
   */
  async install(loaded: LoadedManifest, iconSvg: string | null): Promise<AppInstallation> {
    const { manifest } = loaded;
    const id = new ObjectId().toHexString();
    const manifestId = new ObjectId().toHexString();
    const now = toDatabaseDate(new Date());
    // The row as the read query would return it. Decoding it with the same codec gives the
    // result without reading the row back.
    const written: z.input<typeof AppInstallationRow> = {
      id,
      app_id: manifest.id,
      status: 'active',
      revision: 0,
      manifest_url: loaded.manifestUrl,
      manifest: loaded.serialised,
      icon_svg: iconSvg,
      created_at: now,
      updated_at: now,
    };
    try {
      // Duplicate inserts can deadlock when several confirmations compete for the unique
      // current_app_id. Starting the write again means it either commits or sees the
      // winning install.
      await transactionRetryingDeadlocks(this.knex, async (trx) => {
        await trx(INSTALLATIONS).insert({
          id,
          app_id: written.app_id,
          current_app_id: written.app_id,
          status: written.status,
          manifest_id: manifestId,
          created_at: now,
          updated_at: now,
        });
        await trx(MANIFESTS).insert({
          id: manifestId,
          installation_id: id,
          manifest_url: written.manifest_url,
          manifest: loaded.serialised,
          digest: loaded.digest,
          icon_svg: iconSvg,
          source: 'install',
          requires_approval: false,
          created_at: now,
        });
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new errors.ConflictError({
          message: `The app ${manifest.id} is already installed.`,
          code: 'APP_ALREADY_INSTALLED',
        });
      }
      throw err;
    }
    return z.decode(AppInstallationRow, written);
  }

  /**
   * Writes what a decision keeps, while the installation is still at `before.revision`.
   * Every change moves the revision on, so a decision made from `before` still holds then.
   * `iconSvg` is stored with a new row.
   */
  async keepAt(
    before: CurrentInstallation,
    loaded: LoadedManifest,
    keep: ManifestKeep,
    iconSvg: string | null,
  ): Promise<Kept> {
    return this.knex.transaction(async (trx): Promise<Kept> => {
      const locked = await trx(INSTALLATIONS)
        .where({ id: before.id })
        .forUpdate()
        .first('status', 'revision');
      if (!locked || locked.status === 'uninstalled') {
        return { outcome: 'gone' };
      }
      if (locked.revision !== before.revision) {
        return { outcome: 'stale' };
      }
      return writeKeep(trx, before, loaded, keep, iconSvg);
    });
  }

  /**
   * Ends an installation. The row is kept as a record of what was installed. Returns false if
   * it had already ended.
   */
  async uninstall(id: string): Promise<boolean> {
    const ended = await this.knex(INSTALLATIONS)
      .where({ id })
      .whereNot('status', 'uninstalled')
      .update({
        // In the same update as `status`, so the two always agree.
        current_app_id: null,
        status: 'uninstalled',
        revision: this.knex.raw('?? + 1', ['revision']),
        updated_at: toDatabaseDate(new Date()),
      });
    return ended > 0;
  }

  private joinApprovedManifest() {
    return this.knex(`${INSTALLATIONS} as installation`).join(
      `${MANIFESTS} as approved`,
      'approved.id',
      'installation.manifest_id',
    );
  }

  /** Installations joined with their approved manifests, in the shape the Admin API returns. */
  private withApprovedManifest() {
    return this.joinApprovedManifest().select<z.input<typeof AppInstallationRow>[]>(
      'installation.id',
      'installation.app_id',
      'installation.status',
      'installation.revision',
      'approved.manifest_url',
      'approved.manifest',
      'approved.icon_svg',
      'installation.created_at',
      'installation.updated_at',
    );
  }

  /**
   * Loads the contents of these manifests, by id.
   * A row that no longer decodes is skipped, so one bad row can't break the page.
   */
  private async manifestContents(ids: string[]): Promise<Map<string, AppManifest>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.knex(MANIFESTS)
      .whereIn('id', ids)
      .select<z.input<typeof ManifestContentRow>[]>('id', 'manifest');
    const contents = new Map<string, AppManifest>();
    for (const row of rows) {
      const decoded = ManifestContentRow.safeDecode(row);
      if (decoded.success) {
        contents.set(decoded.data.id, decoded.data.manifest);
      }
    }
    return contents;
  }
}
