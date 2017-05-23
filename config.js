/**
 * devmetrics configuration.
 *
 * @copyright Adam Meily <meily.adam@gmail.com> 2017
 * @license BSD 2-Clause
 */

var convict = require('convict');
var config = convict({
  gitlab: {
    privateToken: {
      format: String,
      doc: "The Gitlab REST API private token",
      default: null
    },
    url: {
      format: 'url',
      doc: "Gitlab server base URL (ie. https://gitlab.mycompany.com:9000)",
      default: null
    }
  },
  elastic: {
    url: {
      format: 'url',
      doc: "ElasticSearch server URL (ie. http://es.mycompany.com:9200)",
      default: null
    }
  }
});

config.loadFile("./config/config.json");
config.validate({allowed: 'strict'});

module.exports = config;
