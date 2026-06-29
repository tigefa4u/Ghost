import {GiftLinkQueries} from './queries';
import {GiftLinkCommands} from './commands';
import {recordGiftLinkAction, type RecordGiftLinkAction} from './actions';

export type {RequestContext} from './actions';

// Constructed by init() at boot, not at import: knex is only available once the DB has connected.
export let queries: GiftLinkQueries | undefined;
export let commands: GiftLinkCommands | undefined;

export function init(): void {
    if (queries && commands) {
        return;
    }

    const {knex} = require('../../data/db');
    const models = require('../../models');

    queries = new GiftLinkQueries({knex});
    const recordAction: RecordGiftLinkAction = ({context, verb, subject}) =>
        recordGiftLinkAction({Action: models.Action, context, verb, subject});
    commands = new GiftLinkCommands({knex, queries, recordAction});
}
