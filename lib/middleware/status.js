/**
 * Licensed Materials - Property of IBM
 * (c) Copyright IBM Corporation 2015, 2016. All Rights Reserved.
 *
 * Note to U.S. Government Users Restricted Rights:
 * Use, duplication or disclosure restricted by GSA ADP Schedule
 * Contract with IBM Corp.
 */
"use strict";

const DB_NAME = "slack_broker";

var
	async = require("async"),
	nconf = require("nconf"),
	request = require("request"),
	url = require("url"),
	_ = require("underscore")
;

module.exports.getStatus = getStatus;


function getStatus(req, res) {
	async.parallel({
		slack: function(callback) {
			// Check if the Slack API is up & running
			var options = {
				url: nconf.get("services:slack_api") + "api.test",
				json: true
			};
			var start = process.hrtime();
			request.get(options, function(error, response, body) {
				var diff = process.hrtime(start);
				var result = {
					type: "SERVICE",
					label: "Slack API",
					timestamp: getTimestamp(response.headers['date']),
					duration: (diff[0] * 1e9 + diff[1])/1e6
				}
				if (error) {
					result.status = "FAIL";
					result.details = err.toString();
					result.error_count = 1;
				} else {
					if (body.ok) {
						result.status = "PASS";
						result.details = "The Slack API is operating as expected";
						result.error_count = 0;
					} else {
						result.status = "FAIL";
						result.details = body.error;							
						result.error_count = 1;
					}
				}
				callback(null, result);
			});
		},
		cloudant: function(callback) {
			// Check if the Cloudant DB for Slack broker is up & running
			var options = {
				url: nconf.get("_vcap_services:cloudantNoSQLDB:0:credentials:url") + "/" + DB_NAME,
				json: true
			};
			var start = process.hrtime();
			request.get(options, function(error, response, body) {
				var diff = process.hrtime(start);
				var result = {
					type: "SERVICE",
					label: "Cloudant service and DB access",
					timestamp: getTimestamp(response.headers['date']),
					duration:  (diff[0] * 1e9 + diff[1])/1e6
				}
				if (error) {
					result.status = "FAIL";
					result.details = err.toString();
					result.error_count = 1;
				} else {
					if (response.statusCode == 200) {
						result.status = "PASS";
						result.details = "The Cloudant service and DB access is operating as expected";
						result.error_count = 0;
					} else {
						result.status = "FAIL";
						var cloudantUrl = url.parse(options.url);
						// Remove the authentication part from the options.url
						result.details = response.statusCode + " - HTTP response for " + 
							cloudantUrl.protocol + "//" + cloudantUrl.host + cloudantUrl.path;
						result.error_count = 1;
					}
				}
				callback(null, result);
			});
		}
		// TIAM status is not really needed to provide core slack messaging function
		// as it is only used to obtain additional information on event source (ie toolchain/pipeline)
		
	}, function(err, results) {
		var httpStatus;
		var status = {};
		_.each(results, function(dependency, key) {
			var label = dependency.label;
			if (label) {
				delete dependency.label;
			}
			status[key] = dependency;
			if (dependency.status != "PASS") {
				if (dependency.status == "FAIL") {
					status.status = "FAIL";
					httpStatus = 500;
				} else {
					// dependency is warn
					if (status.status != "FAIL") {
						status.status = dependency.status;
						// TODO Is it really a 500 in that case !
						httpStatus = 500;
					}
				}
				if (status.details) {
					status.details += " " + label + " is not operating as expected.";
				} else {
					status.details = label + " is not operating as expected.";					
				}
			}
		});
		if (!status.status) {
			status.status = "PASS";
			status.details = "All dependencies are operating as expected.";
			httpStatus = 200;			
		}
        return res.status(httpStatus).send(status);
	});	
}

function getTimestamp(headerDate) {
	var date;
	try {
		date = new Date(Date.parse(headerDate)); 
	} catch (ex) {
		date = new Date();
	}
	return date.toISOString();
}