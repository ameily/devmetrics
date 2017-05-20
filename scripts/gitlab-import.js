
var request = require('request-promise-native');
var urljoin = require('url-join');
var models = require('../models');
var fs = require('fs');
var ProgressBar = require('progress');


var ASSIGNMENT_PATTERN = /assigned to @(\w+)\b/i;
var CLOSED_PATTERN = /\bclosed\b/;

/**
 * Retrieve all objects from Gitlab at a URL.
 *
 * @param {String} url
 * @param {String} apiKey
 * @param {Boolean} showProgress
 */
function getAllObjects(url, apiKey, showProgress) {
  var page = 0;
  //$res.Headers['X-Total-Pages']
  var pageCount = 1;
  var results = [];

  var progress;

  if(showProgress) {
    progress = new ProgressBar('[:bar] :percent', {
      total: 1,
      width: 40,
      incomplete: ' '
    });
  }

  function getPageResults() {
    // console.log('getting page %d / ', page, pageCount);
    return request({
      url: url,
      resolveWithFullResponse: true,
      strictSSL: false,
      qs: {
        page: page,
        private_token: apiKey
      }
    }).then(function(res) {
      // console.log('res: %s', res);
      pageCount = parseInt(res.headers['x-total-pages']);

      if(progress) {
        progress.total = pageCount;
        progress.tick();
      }

      var items = JSON.parse(res.body);
      // console.log(">> item count: %d", items.length);

      return items;
    }).catch(function(err) {
      console.log(err);
    });
  }

  function getNextPage(items) {
    results = results.concat(items);

    page += 1;
    // console.log('>> %d / %d (%d)', page, pageCount, results.length);
    if(page < pageCount) {
      // console.log('getting another page')
      return getPageResults().then(getNextPage);
    }


    if(progress) {
      console.log('\n');
    }
    return results;
  }

  // will this work?
  return getPageResults().then(getNextPage);
}

function getSingleObject(url, apiKey) {
  return request({
    url: url,
    strictSSL: false,
    json: true,
    qs: {
      private_token: apiKey
    }
  });
}

function getMergeRequests(server, projectPath, project, apiKey) {
  var url = urljoin(server, `api/v4/projects/${projectPath}/merge_requests`);
  console.log('getting merge requests');
  return getAllObjects(url, apiKey, true).then(function(mergeRequests) {
    console.log('found %d merge requests\n', mergeRequests.length);
    console.log('getting notes');
    var progress = new ProgressBar('[:bar] :percent', {
      total: mergeRequests.length,
      width: 40,
      incomplete: ' '
    });

    var notePromises = mergeRequests.map(function(mergeRequest) {
      // console.log('>> mr: %s', mergeRequest.iid);
      var noteUrl = urljoin(server, `api/v4/projects/${projectPath}/merge_requests/${mergeRequest.iid}/notes`);
      // console.log('note url: %s', noteUrl);

      return getAllObjects(noteUrl, apiKey).then(function(notes) {
        // console.log('got %d notes', notes.length);
        progress.tick();
        mergeRequest.notes = notes;
        mergeRequest.project = project;
        return mergeRequest;
      });
    });

    return Promise.all(notePromises).then(function(mergeRequests) {
      console.log('\n');
      return mergeRequests;
    });
  });
}

function getIssues(server, projectPath, apiKey) {
  var url = urljoin(server, `api/v4/projects/${projectPath}/issues`);
  return getAllObjects(url, apiKey, true);
}

function processMergeRequest(mergeRequest) {
  var results = [];

  // create submission
  // console.log('creating submission: %s', mergeRequest.title);
  var submission = models.createSubmission({
    submission: mergeRequest,
    author: mergeRequest.author,
    project: mergeRequest.project,
    submissionType: 'MergeRequest'
  });

  //console.log(JSON.stringify(submission));
  results.push(submission);

  mergeRequest.notes.forEach(function(note) {
    var match = ASSIGNMENT_PATTERN.exec(note.body);
    if(match && match[1] == mergeRequest.author.username) {
      // console.log('reassignment: "%s", "%s"', mergeRequest.created_at, note.created_at);
      var bounce = models.createSubmissionBounce({
        submissionType: 'MergeRequest',
        note: note,
        project: mergeRequest.project,
        submission: mergeRequest,
        author: mergeRequest.author,
        reason: 'Unknown'
      });
      results.push(bounce);
    }

    match = CLOSED_PATTERN.exec(note.body);
    if(match && mergeRequest.state == 'closed') {
      // console.log('closed issue');
      var bounce = models.createSubmissionBounce({
        submissionType: 'MergeRequest',
        note: note,
        project: mergeRequest.project,
        submission: mergeRequest,
        author: mergeRequest.author,
        reason: 'Unknown',
        rejection: true
      });
      results.push(bounce);
    }
  });

  return results;
}


function run(opts) {
  var payloads = [];
  var projectPathUrlSafe = opts.projectPath.replace('/', '%2f');
  var projectUrl = urljoin(opts.server, `api/v4/projects/${projectPathUrlSafe}`);
  var project;

  console.log('project url: %s', projectUrl);

  getSingleObject(projectUrl, opts.apiKey).then(function(prj) {
    // Get the Gitlab project
    console.log('found project: %d', prj.id);
    project = prj;
    return getMergeRequests(opts.server, projectPathUrlSafe, project, opts.apiKey);
  }).then(function(mergeRequests) {
    // Get the Gitlab merge requests
    // console.log('!! %d merge requests!', mergeRequests.length);
    console.log('processing %d merge requests', mergeRequests.length);
    var progress = new ProgressBar('[:bar] :percent', {
      total: mergeRequests.length,
      width: 40,
      incomplete: ' '
    });

    mergeRequests.forEach(function(mergeRequest) {
      payloads = payloads.concat(processMergeRequest(mergeRequest));
      progress.tick();
    });

    console.log('\n');
  }).then(function() {
    // Get the issues
    console.log('getting issues');
    return getIssues(opts.server, projectPathUrlSafe, opts.apiKey);
  }).then(function(issues) {
    // Process the issues
    console.log('processing %d issues', issues.length);
    var progress = new ProgressBar('[:bar] :percent', {
      total: issues.length,
      width: 40,
      incomplete: ' '
    });

    issues.forEach(function(issue) {
      // Process each issue
      // console.log('issue: %s', issue);
      var submission = models.createSubmission({
        submission: issue,
        author: issue.author,
        project: project,
        submissionType: 'issue'
      });
      payloads.push(submission);
      progress.tick();
    });

    console.log('\n');

    return Promise.resolve(payloads);
  }).then(function() {
    console.log('payload length: %d', payloads.length);
    var output = payloads.map(function(obj) {
      return JSON.stringify(obj);
    }).join('\n');

    fs.writeFileSync('./elastic.json', output);
  }).catch(function(err) {
    console.error('\n');
    console.trace('unhandled exception: %s', err);
  });
}


run({
  server: 'https://gitlab.ais',
  projectPath: 'metasponse/metasponse-core',
  apiKey: 'kTQ1aiZCbtxsx6tQzjs9'
});
