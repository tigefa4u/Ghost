import assert from 'node:assert/strict';
import _ from 'lodash';

const config = require('../../../../../core/shared/config');

describe('DB connection', function () {
  it('builds knex config without writing into Ghost config', function () {
    // nconf's merge shares nested subtrees by reference, so an in-place
    // configure() leaked knex's own additions into every later reader of
    // `database` - `connection.timezone` and friends for mysql2, and nothing
    // ever removed them
    const before = _.cloneDeep(config.get('database'));

    const knexInstance = require('../../../../../core/server/data/db/connection');

    assert.deepEqual(config.get('database'), before);
    assert.equal(config.get('database:pool'), undefined);
    assert.equal(config.get('database:connection:timezone'), undefined);
    assert.equal(config.get('database:connection:charset'), undefined);

    // ...while knex still gets everything configure() derives
    const knexConfig = knexInstance.client.config;
    assert.equal(knexConfig.client, config.get('database:client'));

    if (knexConfig.client === 'better-sqlite3') {
      assert.equal(typeof knexConfig.pool.afterCreate, 'function');
      assert.equal(knexConfig.useNullAsDefault, true);
    } else {
      assert.equal(knexConfig.connection.timezone, 'Z');
      assert.equal(knexConfig.connection.charset, 'utf8mb4');
      assert.equal(knexConfig.connection.decimalNumbers, true);
    }
  });
});
