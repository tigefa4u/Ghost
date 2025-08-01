import Model, {attr, belongsTo} from '@ember-data/model';
import ValidationEngine from 'ghost-admin/mixins/validation-engine';

export default Model.extend(ValidationEngine, {
    validationType: 'webhook',

    name: attr('string'),
    event: attr('string'),
    targetUrl: attr('string'),
    secret: attr('string'),
    lastTriggeredAtUTC: attr('moment-utc'),
    createdAtUTC: attr('moment-utc'),
    updatedAtUTC: attr('moment-utc'),

    integration: belongsTo('integration')
});
