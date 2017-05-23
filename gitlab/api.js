/**
 * Gitlab REST api.
 *
 * @copyright Adam Meily <meily.adam@gmail.com> 2017
 * @license BSD 2-Clause
 */

var urljoin = require('url-join');
var request = require('request-promise-native');
var config = require('../config');

/**
 * Query the Gitlab server for a specific user id.
 *
 * @param {Number} userId - The user id to query
 * @return {Promise} A promise that will resolve the Gitlab user object.
 */
function getGitlabUser(userId) {
  var url = urljoin(config.get('gitlab.url'), "/api/v4/users", userId);

  return request(url, {
    qs: {
      private_token: config.get('gitlab.privateToken')
    },
    json: true
  });
}

exports.getGitlabUser = getGitlabUser;
