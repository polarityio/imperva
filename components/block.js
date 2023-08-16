'use strict';
polarity.export = PolarityComponent.extend({
  details: Ember.computed.alias('block.data.details'),
  expandableTitleStates: Ember.computed.alias('block._state.expandableTitleStates'),

  init() {
    if (!this.get('block._state')) {
      this.set('block._state', {});
      this.set('block._state.expandableTitleStates', {});
    }
    this._super(...arguments);
  },
  actions: {
    toggleExpandableTitle: function (index) {
      this.set(
        `block._state.expandableTitleStates`,
        Object.assign({}, this.get('block._state.expandableTitleStates'), {
          [index]: !this.get('block._state.expandableTitleStates')[index]
        })
      );

      this.get('block').notifyPropertyChange('data');
    }
  }
});
