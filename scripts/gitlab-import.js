/**
 * Script to import Gitlab history into the devmetrics Elastic database.
 *
 * @copyright Adam Meily <meily.adam@gmail.com> 2017
 * @license BSD 2-Clause
 */

var request = require('request-promise-native');
var urljoin = require('url-join');
var fs = require('fs');
var ProgressBar = require('progress');
var program = require('commander');

var models = require('../models');


var ASSIGNMENT_PATTERN = /assigned to @(\w+)\b/i;
var CLOSED_PATTERN = /\bclosed\b/;

/**
 * Retrieve all objects from Gitlab at a URL.
 *
 * @param {String} url - Gitlab URL for REST api.
 * @param {String} apiKey - Gitlab private token.
 * @param {Boolean} showProgress - show progress bar.
 * @return {Promise} - A promise that resolves to the array of REST api objects.
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

/**
 * Get a single object from the Gitlab REST api.
 *
 * @param {String} url - Gitlab full REST api URL.
 * @param {String} apiKey - Gitlab private token.
 * @return {Promise} - A promise that resolves the object retrieved from Gitlab.
 */
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

/**
 * Get all merge requests from Gitlab.
 *
 * @param {String} server - The base Gitlab server URL.
 * @param {String} projectPath - The URL-safe Gitlab project path.
 * @param {String} project - The Gitlab project object (retrieved via REST api).
 * @param {String} apiKey - The Gitlab private token.
 * @return {Promise} - A promise that resolves to the list of merge requests.
 */
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

/**
 * Get all issues from Gitlab.
 *
 * @param {String} server - The base Gitlab URL.
 * @param {String} projectPath - The URL-safe Gitlab project path.
 * @param {String} apiKey - The Gitlab private token.
 */
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


/**
 * Import Gitlab history into Elastic.
 *
 * @param {Object} opts - Program options.
 * @param {String} opts.projectPath - Gitlab project path.
 * @param {String} opts.server - The Gitlab base URL.
 * @param {String} opts.apiKey - The Gitlab REST api private token.
 */
function run(opts) {
  var payloads = [];
  var projectPathUrlSafe = opts.projectPath.replace('/', '%2f');
  var projectUrl = urljoin(opts.server, `api/v4/projects/${projectPathUrlSafe}`);
  var project;

  console.log('project url: %s', projectUrl);

  getSingleObject(projectUrl, opts.apiKey).then(function(prj) {
    // Get the Gitlab project
    console.log('found project: #%d', prj.id);
    project = prj;
    return getMergeRequests(opts.server, projectPathUrlSafe, project, opts.apiKey);
  }).then(function(mergeRequests) {
    // Get the Gitlab merge requests
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
    // console.log('payload length: %d', payloads.length);
    var output = payloads.map(function(obj) {
      return JSON.stringify(obj);
    }).join('\n');

    fs.writeFileSync('./elastic.json', output);
  }).catch(function(err) {
    console.error('\n');
    console.trace('unhandled exception: %s', err);
  });
}


program
  .version('0.1.0')
  .option('-g, --gitlab <server>', 'gitlab server address')
  .option('-k, --key <token>', 'gitlab private token')
  .option('-p, --project <path>', 'gitlab project path with namespace/group')
  .parse(process.argv);

if(!program.gitlab) {
  console.error('gitlab-import: error: -g/--gitlab required');
  program.help();
}

if(!program.key) {
  console.error('gitlab-import: error: -k/--key required');
  program.help();
}

if(!program.project) {
  console.error('gitlab-import: error: -p/--project required');
  program.help();
}

run({
  server: program.gitlab,
  apiKey: program.key,
  projectPath: program.project
});
