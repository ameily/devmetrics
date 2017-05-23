/**
 * Gitlab test cases.
 *
 * @copyright Adam Meily <meily.adam@gmail.com> 2017
 * @license BSD 2-Clause
 */

var rewire = require('rewire');
var handlers = rewire('../gitlab/handlers');
var api = require('../gitlab/api');
var expect = require('chai').expect;
var path = require('path');
var sinon = require('sinon');
var fs = require('fs');
var models = require('../models');


describe('parseActions', function() {
  var ACTION_COMMANDS = {
    'needs-info': 'Needs more information',
    'incomplete': 'Incomplete',
    'bug': 'Contains bug',
    'redesign': 'Needs redesign',
    'quality': 'Quality needs improvement',
    'reject': 'Rejected'
  };
  var parseActions = handlers.__get__('parseActions');

  it('parses several actions', function() {
    var TEXT = "Hello\n\n\\bug\n\\needs-info\n\\reject  a simple message   ";
    var actions = parseActions(TEXT);

    expect(actions).deep.equal({
      bounce: [{
        reason: ACTION_COMMANDS['bug'],
        message: '',
        rejection: false
      }, {
        reason: ACTION_COMMANDS['needs-info'],
        message: '',
        rejection: false
      }, {
        reason: ACTION_COMMANDS['reject'],
        message: 'a simple message',
        rejection: true
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
          message: '',
          rejection: key == 'reject' ? true : false
        }]
      });
    });

    it('parses ' + key + ' action (with message)', function() {
      var TEXT = `Hello\n\n\\${key}   a simple message `;
      var actions = parseActions(TEXT);
      expect(actions).deep.equal({
        bounce: [{
          reason: ACTION_COMMANDS[key],
          message: 'a simple message',
          rejection: key == 'reject' ? true : false
        }]
      });
    });
  });
});

describe('handleMergeRequest', function() {
  var ignoreNames = ['assign', 'close', 'commit', 'merge', 'update'];
  var handleMergeRequest = handlers.__get__('handleMergeRequest');
  var sandbox = sinon.sandbox.create();
  var createSubmission, getGitlabUser;

  beforeEach(function () {
    // stub out the `hello` method
    createSubmission = sandbox.stub(models, 'createSubmission');
    getGitlabUser = sandbox.stub(api, 'getGitlabUser').resolves({
      username: "test"
    });
  });

  afterEach(function () {
    // completely restore all fakes created through the sandbox
    sandbox.restore();
  });

  ignoreNames.forEach(function(ignoreName) {
    it(`ignores ${ignoreName}`, function() {
      // var createSubmission = sinon.stub(models, 'createSubmission');
      var jsonPath = path.join(__dirname, 'data', 'gitlab', 'webhooks',
                               `merge-request-${ignoreName}.json`);
      var content = fs.readFileSync(jsonPath, 'utf8');
      var webhook = JSON.parse(content);

      handleMergeRequest(webhook).then(function() {
        throw new Error('handleMergeRequest was supposed to fail');
      }).catch(function(err) {
        expect(createSubmission.called).to.be.false;
      });
    });
  });

  it('creates submission from merge request', function() {
    var jsonPath = path.join(__dirname, 'data', 'gitlab', 'webhooks',
                             'merge-request-submit.json');
    var content = fs.readFileSync(jsonPath, 'utf8');
    var webhook = JSON.parse(content);


  });
});
