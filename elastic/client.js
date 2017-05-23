/**
 * Elasticsearch interface for the devmetrics data and mappings.
 *
 * @copyright Adam Meily <meily.adam@gmail.com> 2017
 * @license BSD 2-Clause
 */

var elastic = require('elastic');

/**
 * Elasticsearch interface.
 */
class ElasticClient {
  /**
   * @param {String} url - The base URL of the Elastic server (ie.
   *  "http://elastic.mycompany.com:9200").
   * @param {String} [index=devmetrics] - The Elastic index name where
   *  devemetrics data is stored.
   */
  constructor(url, index) {
    this.url = url;
    this.index = index || 'devmetrics';
    this.client = null; //TODO
  }

  /**
   * Push and update Elastic type mappings to the server.
   *
   * @param {String[]} types - The list of mapping type names to update.
   * @return {Promise} - A promise that resolves when the mappings have been
   *  pushed.
   */
  _pushMapping(types) {
    var mappingPath = path.join(__dirname, 'mappings.json');
    var content = fs.readFileSync(mappingPath, 'utf8');
    var mapping = JSON.parse(content);
    var body = {};

    Object.keys(mapping).forEach(function(typeName) {
      if(types.indexOf(typeName) >= 0) {
        body[typeName] = mapping[typeName];
      }
    });

    return this.client.putMapping({
      index: this.index,
      body: body
    });
  }

  /**
   * Query the Elastic search to determine if the devmetrics type mappings
   * exist, and, if they don't, update them.
   *
   * @return {Promise} - A promise that resolves when the mappings have either
   *  been confirmed or updated.
   */
  ensureMappingsExists() {
    this.client.getMapping({
      index: this.index
    }, function(err, res) {
      var missingTypes = [];
      if(err) {
        // The index doesn't exist, add both mappings
        missingTypes = ['Submission', 'SubmissionBounce'];
      } else {
        var indexMappings = res[this.index];
        if(!indexMappings.Submission) {
          missingTypes.push('Submission');
        }

        if(!indexMappings.SubmissionBounce) {
          missingTypes.push('SubmissionBounce');
        }

        if(missingTypes.length) {
          return self._pushMapping(missingTypes);
        }
      }

      return Promise.resolve();
    });
  }

  /**
   * Batch insert an array of objects into Elastic.
   *
   * @param {Object[]} docs - List of JSON-serializable objects to insert into
   *  the Elastic server. Each object must have a "_type" property that
   *  determines the Elastic type name.
   * @return {Promise} - A promise the resolves when the batch inserts complete.
   */
  insert(docs) {
    var body = [];
    docs.forEach(function(doc) {
      body.push({
        index: {
          _index: this.index,
          _type: doc._type
        }
      });

      body.push(doc);
    });

    return this.client.bulk({
      body: body
    });
  }
}


