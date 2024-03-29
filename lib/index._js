"use strict";

var generic = require('ez-streams').devices.generic;

/// !doc
/// ## ez-streams wrapper for mysql
/// 
/// `var ezmysql = require('ez-mysql');`
/// 
module.exports = {
	/// * `reader = ezmysql.reader(connection, sql, args)`   
	reader: function(connection, sql, args) {
		var received = [], error, callback, done;
		var low = 0, high = 2;

		// handle the pause/resume dance
		var paused = false;
		function push(record) {
			received.push(record);
			if (received.length === high) {
				connection.pause();
				paused = true;
			}
		}
		function shift() {
			if (received.length === low + 1) {
				paused = false;
				connection.resume();
			}
			return received.shift();
		}

		// override release because we need to destroy if connection is released before the end of the reader
		// would be nice to have an API to abort the query without destroying the connection
		var release = connection.release;
		connection.release = function() {
			if (paused) this.destroy();
			else release.call(this);
		}

		function send(err, result) {
			//console.log("SEND err=" + err + ", result=" + result);
			var cb = callback;
			callback = null;
			if (cb) cb(err, result);
			else {
				error = error || err;
				if (result) push(result);
				else done = true;
			}
		}
		function sendResult(result) {
			return send(null, result);
		}
		var reader = generic.reader(_(function(cb) {
			if (error) return cb(error);
			if (received.length) return cb(null, shift());
			if (done) return cb();
			callback = cb;
		}, 0));
		reader.context = {};
		connection.query(sql, args).on('error', send).on('result', sendResult).on('end', sendResult).on('fields', function(fields) {
			reader.context.fields = fields;
		});
		return reader;
	},
	/// * `writer = ezmysql.writer(connection, sql)`  
	writer: function(connection, sql) {
		var done;
		return generic.writer(function(_, obj) {
			if (obj === undefined) done = true;
			if (!done) {
				var vals = Array.isArray(obj) ? obj : Object.keys(obj).map(function(k) {
					return obj[k];
				});
				connection.query(sql, vals, _);
			}
		});
	},
};