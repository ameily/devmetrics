var moment = require('moment');

var MS_PER_DAY = 86400000;

/**
 * A submission bounce signifying that the submission was kicked back to the
 * author.
 *
 * @typedef {Object} SubmissionBounce
 * @prop {String} _type - Elastic search type name (always "SubmissionBounce").
 * @prop {String} ProjectPath - The Gitlab project path (group/project-name).
 * @prop {String} ProjectGroup - The Gitlab project group.
 * @prop {String} SubmissionType - The submission type.
 * @prop {String} Title - Submission title.
 * @prop {String} Url - Gitlab submission URL.
 * @prop {String} Timestamp - ISO 8601 formatted creation date for the note.
 * @prop {String} SubmissionDate - ISO 8601 formatted creation date for the
 *  submission.
 * @prop {Number} DaysSinceSubmission - Number of days since the submission was
 *  created.
 * @prop {String} Author - Submission author's username.
 * @prop {String} Reason - Reason for the bounce.
 * @prop {String} Message - The supplied message describing the bounce.
 */

/**
 * Create a submission bounce object.
 *
 * @param {Object} props - Submission bounce properties.
 * @param {Object} props.note - Gitlab note object.
 * @param {Object} props.project - Gitlab project object.
 * @param {Object} props.submission - Gitlab submission object (either the
 *  Gitlab issue or merge request).
 * @param {Object} props.author - Gitlab author (user) information.
 * @param {String} props.reason - The reason for the bounce.
 * @param {String} props.message - The message of the bounce.
 * @param {String} props.submissionType - The submission type, either "Issue" or
 *  "MergeRequest".
 * @return {SubmissionBounce} The submission bounce object.
 */
function createSubissionBounce(props) {
  var projectPath = props.project.path_with_namespace;
  var projectGroup = projectPath.split('/')[0];
  var elapsed = moment(props.note.created_at).diff(moment(props.submission.created_at)) / MS_PER_DAY;

  return {
    _type: 'SubmissionBounce',
    ProjectPath: projectPath,
    ProjectGroup: projectGroup,
    SubmissionType: props.submissionType,
    Timestamp: props.note.created_at,
    Title: props.submission.title,
    Url: props.note.url,
    SubmissionDate: props.submission.created_at,
    DaysSinceSubmission: elapsed,
    Author: props.author.username,
    Reason: props.reason || 'Unknown',
    Message: props.message || ''
  };
}

/**
 * A submission that wraps a Gitlab issue or merge request.
 *
 * @typedef {Object} Submission
 * @prop {String} _type - Elastic search type name (always "Submission").
 * @prop {String} ProjectPath - The Gitlab project path (group/project-name).
 * @prop {String} ProjectGroup - The Gitlab project group.
 * @prop {String} SubmissionType - The submission type.
 * @prop {String} Title - Submission title.
 * @prop {String} Url - Gitlab submission URL.
 * @prop {String} Timestamp - ISO 8601 formatted creation date for the note.
 * @prop {String} SubmissionDate - ISO 8601 formatted creation date for the
 *  submission (this will always be identical to "Timestamp").
 */

/**
 * Create a submission object, wrapping a Gitlab Issue or Merge Request.
 *
 * @param {Object} props - Submission properties.
 * @param {Object} props.webhook - Webhook payload of the submission created.
 * @param {String} props.submissionType - Submission type, either "Issue" or
 *  "MergeRequest".
 * @return {Submission} The submission object.
 */
function createSubmission(props) {
  var project = props.webhook.project;
  var author = props.webhook.user;
  var submission = props.webhook.object_attributes;
  var projectPath = project.path_with_namespace;
  var projectGroup = projectPath.split('/')[0];

  return {
    _type: 'Submission',
    ProjectPath: projectPath,
    ProjectGroup: projectGroup,
    SubmissionType: props.submissionType,
    Timestamp: submission.created_at,
    SubmissionDate: submission.created_at,
    Title: submission.title,
    Url: submission.url,
    Author: author.username
  };
}

exports.createSubissionBounce = createSubissionBounce;
exports.createSubmission = createSubmission;