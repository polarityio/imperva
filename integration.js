'use strict';
const request = require('postman-request');
const config = require('./config/config');
const async = require('async');
const fs = require('fs');
const { get, toInteger, flow, fromPairs, size } = require('lodash/fp');
const mapObj = require('lodash/fp/map').convert({ cap: false });

let Logger;
let requestDefault;

/**
 *
 * @param entities
 * @param options
 * @param cb
 */

function doLookup(entities, options, cb) {
  let lookupResults = [];
  let tasks = [];

  Logger.trace({ entities: entities }, 'entities');

  entities.forEach((entity) => {
    //do the lookup
    let requestOptions = {
      method: 'GET',
      url: 'https://api.imperva.com/ip-reputation/v1/reputation',
      qs: {
        ip: entity.value
      },
      headers: {
        accept: 'application/json',
        'x-API-Id': options.apiId,
        'x-API-Key': options.apiKey
      },
      json: true
    };

    Logger.debug({ requestOptions }, 'Request Options');

    tasks.push(function (done) {
      requestDefault(requestOptions, function (error, res, body) {
        if (error) {
          done({
            error: error,
            entity: entity.value,
            detail: 'Error in Request'
          });
          return;
        }

        let result = {};

        if (res.statusCode === 200) {
          result = {
            entity: entity,
            body: body
          };
        } else if (res.statusCode === 429) {
          // reached rate limit
          error = {
            detail: 'Reached API Lookup Limit'
          };
        } else {
          // Non 200 status code
          done({
            error: error,
            httpStatus: res.statusCode,
            body: body,
            detail: 'Unexpected Non 200 HTTP Status Code',
            entity: entity.value
          });
          return;
        }
        Logger.trace({ result: result }, 'checking on the results');

        done(error, result);
      });
    });
  });

  async.parallelLimit(tasks, 10, (err, results) => {
    if (err) {
      cb(err);
      return;
    }

    results.forEach((result) => {
      if (result.body === null || _isMiss(result.body)) {
        lookupResults.push({
          entity: result.entity,
          data: null
        });
      } else {
        const violations_over_time = flow(
          get('body.violations_over_time'),
          mapObj((value, key) => [
            key,
            flow(
              mapObj((occurrences, date) => [toInteger(date), occurrences]),
            )(value)
          ]),
          fromPairs
        )(result);
        lookupResults.push({
          entity: result.entity,
          data: {
            summary: getSummaryTags(result.body),
            details: {
              ...result.body,
              ...(size(violations_over_time) && {violations_over_time} )
            }
          }
        });
      }
    });

    Logger.trace({ lookupResults: lookupResults }, 'Lookup Results');

    cb(null, lookupResults);
  });
}

function getSummaryTags(result) {
  const tags = [];

  const knownFor = get('risk.risk_score', result);
  if (knownFor) tags.push(knownFor);
  const orgName = get('asn.organization_name', result);
  if (orgName) tags.push(orgName);

  return tags;
}

function _isMiss(body) {
  if (body && Array.isArray(body) && body.length === 0) {
    return true;
  }
  return false;
}

function startup(logger) {
  Logger = logger;

  let defaults = {};

  if (typeof config.request.cert === 'string' && config.request.cert.length > 0) {
    defaults.cert = fs.readFileSync(config.request.cert);
  }

  if (typeof config.request.key === 'string' && config.request.key.length > 0) {
    defaults.key = fs.readFileSync(config.request.key);
  }

  if (
    typeof config.request.passphrase === 'string' &&
    config.request.passphrase.length > 0
  ) {
    defaults.passphrase = config.request.passphrase;
  }

  if (typeof config.request.ca === 'string' && config.request.ca.length > 0) {
    defaults.ca = fs.readFileSync(config.request.ca);
  }

  if (typeof config.request.proxy === 'string' && config.request.proxy.length > 0) {
    defaults.proxy = config.request.proxy;
  }

  requestDefault = request.defaults(defaults);
}

function validateOptions(userOptions, cb) {
  let errors = [];
  if (
    typeof userOptions.apiKey.value !== 'string' ||
    (typeof userOptions.apiKey.value === 'string' &&
      userOptions.apiKey.value.length === 0)
  ) {
    errors.push({
      key: 'apiKey',
      message: 'You must provide a valid API key'
    });
  }
  cb(null, errors);
}

module.exports = {
  doLookup: doLookup,
  validateOptions: validateOptions,
  startup: startup
};
