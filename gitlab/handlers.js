/**
 * Gitlab webhook handler.
 *
 * @copyright Adam Meily <meily.adam@gmail.com> 2017
 * @license BSD 2-Clause
 */


// var config = require('../config');
// var urljoin = require('url-join');
// var request = require('request-promise-native');
var models = require('../models');
var api = require('./api');

var BOUNCE_ACTIONS = [{
  reason: "Needs more information",
  pattern: /^\\needs-info\b(.*)$/,
  rejection: false
}, {
  reason: "Incomplete",
  pattern: /^\\incomplete\b(.*)$/,
  rejection: false
}, {
  reason: "Contains bug",
  pattern: /^\\bug\b(.*)$/,
  rejection: false
}, {
  reason: "Needs redesign",
  pattern: /^\\redesign\b(.*)$/,
  rejection: false
}, {
  reason: 'Quality needs improvement',
  pattern: /^\\quality\b(.*)$/,
  rejection: false
}, {
  reason: 'Rejected',
  pattern: /^\\reject\b(.*)$/,
  rejection: true
}];

/**
 * Actions to perform on a submission.
 *
 * @typedef {Object} SubmissionActions
 * @prop {SubmissionAction[]} bounce - Bounce actions.
 * @prop {SubmissionAction[]} reject - Rejection actions.
 */

/**
 * A single action to perform on a submission.
 *
 * @typedef {Object} SubmissionAction
 * @prop {String} reason - The reason for the action.
 * @prop {String} message - The user-supplied message justifying the action.
 */

/**
 * Parse a text block and identify actions.
 *
 * @param {String} text - Text to parse.
 * @return {SubmissionActions} The parsed actions.
 */
function parseActions(text) {
  var actions = {
    bounce: []
  };

  text.split('\n').forEach((line) => {
    BOUNCE_ACTIONS.forEach((bounceAction) => {
      var match = bounceAction.pattern.exec(line);
      if(match) {
        actions.bounce.push({
          reason: bounceAction.reason,
          message: match[1].trim(),
          rejection: bounceAction.rejection || false
        });
      }
    });
  });

  return actions;
}


/**
 * Handle a Gitlab Note webhook.
 *
 * @param {Object} webhook - The webhook payload.
 * @return {Promise}
 */
function handleNote(webhook) {
  var submission = webhook.merge_request || webhook.issue;
  var actions;

  var note = webhook.object_attributes;
  if(note.created_at != note.updated_at) {
    return Promise.reject("note is not new");
  }

  if(!submission) {
    return Promise.reject("note does not belong to an issue or merge request");
  }

  actions = parseActions(note.note);

  if(!actions.bounce.length && !actions.reject.length) {
    return Promise.reject("not does not contain any actions");
  }

  return api.getGitlabUser(submission.author_id).then(function(author) {
    var bounces = actions.bounce.map((bounce) => {
      return models.createSubissionBounce({
        note: note,
        author: author,
        reason: bounce.reason,
        message: bounce.message,
        project: webhook.project,
        submission: submission,
        submissionType: note.noteable_type
      });
    });

    var rejects = actions.reject.map((reject) => {
      //TODO
      return reject;
    });

    //TODO send to elastic
    if(bounces.length) {
      console.log("bounces: %s", bounces);
    }

    if(rejects.length) {
      console.log("rejects: %s", rejects);
    }

    return;
  });
}

/**
 * Handle Gitlab merge request webhook.
 *
 * @param {Object} webhook - Gitlab merge request webhook payload.
 * @return {Promise}
 */
function handleMergeRequest(webhook) {
  if(webhook.object_attributes.action != 'open') {
    return Promise.reject('merge request is not new');
  }

  var submission = models.createSubmission({
    submission: webhook.object_attributes,
    author: webhook.user,
    project: webhook.project,
    submissionType: 'MergeRequest'
  });
  //TODO send to elastic
  console.log("submission: %s", submission);

  return Promise.resolve([submission]);
}

/**
 * Handle Gitlab issue webhook.
 *
 * @param {Object} webhook - Gitlab issue webhook payload.
 * @return {Promise}
 */
function handleIssue(webhook) {
  if(webhook.object_attributes.action != 'open') {
    return Promise.reject('issue is not new');
  }

  // TODO send to elastic
  var submission = models.createSubmission({
    submission: webhook.object_attributes,
    author: webhook.user,
    project: webhook.project,
    submissionType: "Issue"
  });

  return Promise.resolve([submission]);
}

/**
 * Handle Gitlab webhook.
 *
 * @param {Object} body - Gitlab webhook payload.
 * @return {Promise}
 */
function handleWebhook(body) {
  if(body.object_kind == 'note') {
    return handleNote(body);
  } else if(body.object_kind == 'merge_request') {
    return handleMergeRequest(body);
  } else if(body.object_kind == 'issue') {
    return handleIssue(body);
  }

  return Promise.reject(`unexpected webhook type ${body.object_kind}`);
}


exports.handleWebhook = handleWebhook;
