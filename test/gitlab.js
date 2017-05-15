
var rewire = require('rewire');
var handlers = rewire('../gitlab/handlers');
var expect = require('chai').expect;


describe('parseActions', function() {
  var ACTION_COMMANDS = {
    'needs-info': 'Needs more information',
    'incomplete': 'Incomplete',
    'bug': 'Contains bug',
    'redesign': 'Needs redesign',
    'quality': 'Quality needs improvement'
  };
  var parseActions = handlers.__get__('parseActions');

  it('parses several actions', function() {
    var TEXT = "Hello\n\n\\bug\n\\needs-info\n\\reject  a simple message   ";
    var actions = parseActions(TEXT);

    expect(actions).deep.equal({
      bounce: [{
        reason: ACTION_COMMANDS['bug'],
        message: ''
      }, {
        reason: ACTION_COMMANDS['needs-info'],
        message: ''
      }],
      reject: [{
        message: 'a simple message'
      }]
    });
  });

  Object.keys(ACTION_COMMANDS).forEach(function(key) {
    it('parses ' + key + ' action (no message)', function() {
      var TEXT = `Hello\n\n\\${key}`;
      var actions = parseActions(TEXT);
      expect(actions).deep.equal({
        bounce: [{
          reason: ACTION_COMMANDS[key],
          message: ''
        }],
        reject: []
      });
    });

    it('parses ' + key + ' action (with message)', function() {
      var TEXT = `Hello\n\n\\${key}   a simple message `;
      var actions = parseActions(TEXT);
      expect(actions).deep.equal({
        bounce: [{
          reason: ACTION_COMMANDS[key],
          message: 'a simple message'
        }],
        reject: []
      });
    });
  })
});
