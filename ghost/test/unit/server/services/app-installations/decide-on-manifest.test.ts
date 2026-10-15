import assert from 'node:assert/strict';
import type { AppManifest } from '@tryghost/app-contracts/manifest';
import {
  decideOnManifest,
  type DecisionSource,
  type ManifestKeep,
} from '../../../../../core/server/services/app-installations/decide-on-manifest';
import type { LoadedManifest } from '../../../../../core/server/services/app-installations/load-manifest';

const MANIFEST_URL = 'https://podcast.example.com/ghost-app.json';
const MOVED_URL = 'https://podcast.example.com/v2/ghost-app.json';

const approvedManifest: AppManifest = {
  id: 'com.example.podcast',
  name: 'Podcast',
  description: 'Publish episodes.',
  author: { name: 'Example Audio', url: 'https://example.com/' },
  accent_color: '#ff5500',
  icon: { name: 'audio-lines' },
  surfaces: [{ type: 'admin_page', url: 'https://podcast.example.com/admin' }],
};

/** A loaded manifest as the loader returns it, with a digest made from its URL and contents. */
function loaded(overrides: Partial<AppManifest> = {}, manifestUrl = MANIFEST_URL): LoadedManifest {
  const manifest = { ...approvedManifest, ...overrides };
  const serialised = JSON.stringify(manifest);
  return { manifestUrl, manifest, serialised, digest: `${manifestUrl}\n${serialised}` };
}

const silent = { description: 'Episodes and players.' };
const needsApproval = { name: 'Podcasts' };

type Current = Parameters<typeof decideOnManifest>[0]['current'];

const active: Current = {
  manifest_id: 'approved',
  manifest_url: MANIFEST_URL,
  manifest: approvedManifest,
  pending: null,
};
const suspended: Current = {
  ...active,
  pending: { id: 'pending', digest: loaded(needsApproval).digest },
};

function keepOf(current: Current, manifest: LoadedManifest, source: DecisionSource) {
  return decideOnManifest({ current, loaded: manifest, source }).keep;
}

const nothing: ManifestKeep = { row: 'none' };

function stored(
  source: 'approval' | 'update' | 'resume',
  { requiresApproval = false, pending = false } = {},
): ManifestKeep {
  return { row: 'new', source, requiresApproval, pending };
}

describe('decideOnManifest', function () {
  it('returns the changes the decision was based on', function () {
    for (const source of ['approval', 'update'] as const) {
      assert.deepEqual(
        decideOnManifest({
          current: active,
          loaded: loaded({ ...silent, ...needsApproval }),
          source,
        }).changes,
        [
          { path: 'description', requires_approval: false },
          { path: 'name', requires_approval: true },
        ],
      );
      assert.deepEqual(decideOnManifest({ current: active, loaded: loaded(), source }).changes, []);
    }
  });

  describe('with nothing pending', function () {
    it('writes nothing when the approved manifest is loaded again', function () {
      assert.deepEqual(keepOf(active, loaded(), 'update'), nothing);
      assert.deepEqual(keepOf(active, loaded(), 'approval'), nothing);
    });

    it('stores silent changes as the approved manifest', function () {
      assert.deepEqual(keepOf(active, loaded(silent), 'update'), stored('update'));
      assert.deepEqual(keepOf(active, loaded(silent), 'approval'), stored('approval'));
    });

    it('stores changes that need approval as the pending manifest, unless they are approved', function () {
      // Including when only some of the changes are silent.
      for (const changed of [needsApproval, { ...silent, ...needsApproval }]) {
        assert.deepEqual(
          keepOf(active, loaded(changed), 'update'),
          stored('update', { requiresApproval: true, pending: true }),
        );
        assert.deepEqual(
          keepOf(active, loaded(changed), 'approval'),
          stored('approval', { requiresApproval: true }),
        );
      }
    });

    it('needs approval for the same manifest from another URL', function () {
      assert.deepEqual(
        keepOf(active, loaded({}, MOVED_URL), 'update'),
        stored('update', { requiresApproval: true, pending: true }),
      );
      assert.deepEqual(
        keepOf(active, loaded({}, MOVED_URL), 'approval'),
        stored('approval', { requiresApproval: true }),
      );
    });
  });

  describe('with a pending manifest', function () {
    it('leaves the pending manifest waiting, and approves it without a new row', function () {
      assert.deepEqual(keepOf(suspended, loaded(needsApproval), 'update'), nothing);
      assert.deepEqual(keepOf(suspended, loaded(needsApproval), 'approval'), {
        row: 'existing',
        manifestId: 'pending',
      });
    });

    it('stores a resume row when the app reverts the pending changes', function () {
      // The approved manifest again, with or without silent changes.
      assert.deepEqual(keepOf(suspended, loaded(), 'update'), stored('resume'));
      assert.deepEqual(keepOf(suspended, loaded(silent), 'update'), stored('resume'));
    });

    it('runs the approved row again when a publisher approves the approved manifest', function () {
      assert.deepEqual(keepOf(suspended, loaded(), 'approval'), {
        row: 'existing',
        manifestId: 'approved',
      });
    });

    it('stores silent changes a publisher approves as an approval', function () {
      assert.deepEqual(keepOf(suspended, loaded(silent), 'approval'), stored('approval'));
    });

    it('replaces the pending manifest with different changes that need approval', function () {
      assert.deepEqual(
        keepOf(suspended, loaded({ name: 'Podcasts!' }), 'update'),
        stored('update', { requiresApproval: true, pending: true }),
      );
      assert.deepEqual(
        keepOf(suspended, loaded({ name: 'Podcasts!' }), 'approval'),
        stored('approval', { requiresApproval: true }),
      );
    });

    it('matches the pending manifest by URL as well as contents', function () {
      assert.deepEqual(
        keepOf(suspended, loaded(needsApproval, MOVED_URL), 'update'),
        stored('update', { requiresApproval: true, pending: true }),
      );
      assert.deepEqual(
        keepOf(suspended, loaded(needsApproval, MOVED_URL), 'approval'),
        stored('approval', { requiresApproval: true }),
      );
    });
  });
});
