var child_process = require('child_process');
var fs = require('fs');
var iconv = require('iconv-lite');
var cheerio = require('cheerio');
var request = require('request');
var async = require('async');

var config = require('./config.js');

var videoIndex = JSON.parse(fs.readFileSync('videoIndex.json'));

request('http://ch.nicovideo.jp/portal/anime', function (error, response, body) {
	if (error) console.error(error);

	console.log('Retrieved channel page with responce ' + response.statusCode);
	var $ = cheerio.load(body);

	async.eachSeries($('div.playerNavs > div > ul > li'), function($li, done) {
		var li_id = $li.attribs.id;
		var match;

		if (match = li_id.match(/^.+?_.+?_(.+)$/)) {
			var id = match[1];

			console.log('Processing ' + id);

			if (videoIndex.indexOf(id) === -1) {
				var url = 'http://www.nicovideo.jp/watch/' + id;

				var youtube_dl = child_process.spawn('python', [
					'youtube-dl',
					'--output', 'video/%(uploader)s/%(title)s-%(id)s.%(ext)s',
					'--username', config.user,
					'--password', config.pass,
					url
				]);

				youtube_dl.stdout.on('data', function (data) {
					var string = iconv.decode(data, 'Shift_JIS');
					process.stdout.write(string);
				});

				youtube_dl.on('close', function (code) {
					videoIndex.push(id);
					done();
				});
			}
		}
	}, function (error) {
		if (error) console.log(error);

		fs.writeFileSync('videoIndex.json', JSON.stringify(videoIndex));
	});
});

console.log('Request sent...');
