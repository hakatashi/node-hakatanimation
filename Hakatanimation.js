var child_process = require('child_process');
var fs = require('fs');
var readline = require('readline');

var iconv = require('iconv-lite');
var cheerio = require('cheerio');
var request = require('request');
var async = require('async');
var ansi = require('ansi');

var config = require('./config.js');
var videoIndex = require('./videoIndex.json');
var videoIndexRevision = Math.random();
var videoIndexSavedRevision = videoIndexRevision;
var videoIndexFileIsBusy = false;

var cursor = ansi(process.stdout);

// persistent request function
function requestRetry(options, callback) {
	async.retry(5, function (done) {
		request(options, function (error, response, body) {
			if (error) return done(error);
			if (response.statusCode !== 200) return done(new Error('Status code is not OK'));

			return done(null, {response: response, body: body});
		});
	}, function (error, result) {
		if (typeof result !== 'object') result = {};
		callback(error, result.response, result.body);
	});
}

var previousLogIsVolatile = false;

function info(text) {
	cursor.reset();

	if (previousLogIsVolatile) cursor.write('\n');
	cursor.write('[');
	cursor.green().write('hakatanimation');
	cursor.fg.reset().write('] ');
	cursor.write(text + '\n');

	previousLogIsVolatile = false;
}

function error(text) {
	cursor.reset();

	if (previousLogIsVolatile) cursor.write('\n');
	cursor.write('[');
	cursor.red().write('error');
	cursor.fg.reset().write('] ');
	cursor.write(text + '\n');

	previousLogIsVolatile = false;
}

function volatileLog(text) {
	cursor.reset();

	if (previousLogIsVolatile) cursor.horizontalAbsolute(0).eraseLine();
	cursor.write(text.trim());

	previousLogIsVolatile = true;
}

function pushToVideoIndex(id) {
	videoIndex.push(id);
	videoIndexRevision = Math.random();
	updateVideoIndex();
}

function updateVideoIndex() {
	if (videoIndexRevision !== videoIndexSavedRevision && !videoIndexFileIsBusy) {
		videoIndexFileIsBusy = true;
		var currentVideoIndexRevision = videoIndexRevision;

		fs.writeFile('videoIndex.json', JSON.stringify(videoIndex), function (err) {
			if (err) error('Updating video index failed: ' + err.message);
			videoIndexFileIsBusy = false;
			videoIndexSavedRevision = currentVideoIndexRevision;
			updateVideoIndex();
		});
	}
}

async.waterfall([
	function (done) {
		info('Retrieving niconico anime channel page');
		done();
	},
	requestRetry.bind(this, 'http://ch.nicovideo.jp/portal/anime'),
	function (responce, body, done) {
		info('Retrieved niconico anime channel page');

		var $ = cheerio.load(body);

		info('Parsed page');

		async.eachSeries($('div.playerNavs .video').get(), function (el, done) {
			var elementId = el.attribs.id;
			var id = elementId.split('_')[2];

			if (!id) return done();

			if (videoIndex.indexOf(id) === -1) {
				info('Processing video ' + id);

				var url = 'http://www.nicovideo.jp/watch/' + id;

				var youtube_dl = child_process.spawn('python', [
					'youtube-dl',
					'--output', 'video/%(uploader)s/%(title)s-%(id)s.%(ext)s',
					'--username', config.user,
					'--password', config.pass,
					url
				]);

				var stdoutInterface = readline.createInterface({
					input: youtube_dl.stdout.pipe(iconv.decodeStream('Shift_JIS')),
					output: {}
				});

				var stderrInterface = readline.createInterface({
					input: youtube_dl.stderr.pipe(iconv.decodeStream('Shift_JIS')),
					output: {}
				});

				stdoutInterface.on('line', function (data) {
					volatileLog(data);
				});

				stderrInterface.on('line', function (data) {
					error(data);
				});

				youtube_dl.on('exit', function (code) {
					if (code !== 0) error('Process failed');
					else pushToVideoIndex(id);
					done();
				});
			} else {
				done();
			}
		}, done);
	}
], function (err) {
	if (err) error('Mission failed: ' + err.message);
	else info('Mission succeed');
});
