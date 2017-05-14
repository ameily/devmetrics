
var config = require('../config');
var urljoin = require('url-join');
var request = require('request-promise-native');
var moment = require('moment');

var MS_PER_DAY = 86400000;

var BOUNCE_ACTIONS = [{
  reason: "Needs more information",
  pattern: /^\\info\b(.*)$/
}, {
  reason: "Incomplete",
  pattern: /^\\incomplete\b(.*)$/
}, {
  reason: "Contains bug",
  pattern: /^\\bug\b(.*)$/
}, {
  reason: "Needs redesign",
  pattern: /^\\redesign\b(.*)$/
}, {
  reason: 'Quality needs improvement',
  pattern: /^\\quality\b(.*)$/
}];
var REJECT_PATTERN = /^\\reject\b(.*)$/;

var KNOWN_NOTEABLE_TYPES = [
  'MergeRequest', 'Issue'
];


function getGitlabUser(userId) {
  var url = urljoin(config.get('gitlab.url'), "/api/v4/users", userId);

  return request(url, {
    qs: {
      private_token: config.get('gitlab.privateToken')
    },
    json: true
  });
}


function bounceSubmission(note, author, reason, message) {
  //TODO: get project name: ProjectPath, ProjectGroup
  var obj = note.merge_request || note.issue;
  var elapsed = moment(note.created_at).diff(moment(obj.created_at)) / MS_PER_DAY;

  return {
    _type: 'SubmissionBounce',
    SubmissionType: note.object_attributes.noteable_type,
    Timestamp: note.object_attributes.created_at,
    Title: obj.title,
    Url: note.object_attributes.url,
    SubmissionDate: obj.created_at,
    DaysSinceSubmission: elapsed,
    Author: author,
    Reason: reason,
    Message: message
  };
}

function createSubmission(body, submissionType) {
  var author = body.user.username;
  return {
    _type: 'Submission',
    SubmissionType: submissionType,
    Timestamp: body.object_attributes.created_at,
    Title: body.object_attributes.title,
    Url: body.object_attributes.url,
    SubmissionDate: body.object_attributes.created_at,
    Author: author
  }
}

function handleNote(note) {
  var bounceReasons = [];
  var rejections = [];
  var obj = note.merge_request || note.issue;

  var attrs = note.object_attributes;
  if(attrs.created_at != attrs.updated_at) {
    return null;
  }

  if(!obj) {
    return null;
  }

  note.object_attributes.note.split('\n').forEach((line) => {
    BOUNCE_ACTIONS.forEach((action) => {
      var match = action.pattern.exec(line);
      if(match) {
        bounceReasons.push({
          reason: action.reason,
          message: match[1].trim()
        });
      }
    });
  });

  if(bounceReasons.length == 0) {
    return;
  }

  getGitlabUser(obj.author_id).then(function(author) {
    var bounces = bounceReasons.map((bounce) => {
      return bounceAction(note, user.username, bounce.reason, bounce.message);
    });

    //TODO send to elastic
  });
}

function handleMergeRequest(mergeRequest) {
  if(mergeRequest.object_attributes.action != 'open') {
    return;
  }

  var submission = createSubmission(issue, 'MergeRequest');
  //TODO send to elastic
}

function handleIssue(issue) {
  if(issue.object_attributes.action != 'open') {
    return;
  }

  var submission = createSubmission(issue, 'Issue');
  //TODO send to elastic
}

function handleWebhook(body) {
  if(body.object_kind == 'note') {
    handleNote(body);
  } else if(body.object_kind == 'merge_request') {
    handleMergeRequest(body);
  } else if(body.object_kind == 'issue') {
    handleIssue(body);
  }
}
