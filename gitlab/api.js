var request = require('request-promise-native');

/**
 * Query the Gitlab server for a specific user id.
 *
 * @param {Number} userId - The user id to query
 * @return {Promise} A promise that will resolve the Gitlab user object.
 */
function getGitlabUser(userId, cb) {
  var url = urljoin(config.get('gitlab.url'), "/api/v4/users", userId);

  return request(url, {
    qs: {
      private_token: config.get('gitlab.privateToken')
    },
    json: true
  });
}

exports.getGitlabUser = getGitlabUser;