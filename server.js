'use strict';
var http = require('http');
var fs = require('fs');
var child_process = require('child_process');
var PORT = Number(process.argv[2]) || 8080;

var BASE_URL = './';
//Regular expressions for battery and networks paths. We are building a RESTful API, so URL's path will matter
//For battery info, the acceptable patterns are '/battery' and all the ones starting with '/battery/'
var RE_BATTERY = /\/battery\/?/;

var CONFIG = switchConfigForCurrentOS();

var BATTERY_ERROR_MESSAGE = '404 - Unable to retrieve battery status';

function switchConfigForCurrentOS () {
  switch(process.platform) {
    case 'linux': 
      return {
      	command: 'upower -i /org/freedesktop/UPower/devices/battery_BAT0 | grep -E "state|time to empty|to full|percentage"',
      	processFunction: processBatteryStdoutForLinux
      };
    case 'darwin': //MAC
      return {
      	command: 'pmset -g batt | egrep "([0-9]+\%).*" -o',
      	processFunction: processBatteryStdoutForMac
      }; 
    case 'win32':
      return {
      	command: 'WMIC Path Win32_Battery',
      	processFunction: processBatteryStdoutForWindows
      };
    default:
      return {
      	command: '',
      	processFunction: function () {}
      };
  }
}

function processLineForLinux(battery, line) {
  var key;
  var val;

  line = line.trim();
  if (line.length > 0) {
    line = line.split(':');
    if (line.length === 2) {
      line = line.map(trimParam);
      key = line[0];
      val = line[1];
      battery[key] = val;
    }
  }
  return battery;
}

function processLineForWindows(battery, key, val) {
  var key;
  var val;

  key = key.trim();
  val = val.trim();
  battery[key] = val;

  return battery;
}

function mapKeysForLinux(battery) {
	var mappedBattery = {};
	mappedBattery.percentage = battery.percentage;
	mappedBattery.state = battery.state;
	mappedBattery.timeToEmpty = battery['time to empty'];
	return mappedBattery;
}

function mapKeysForMac(battery) {
	var mappedBattery = {};
	mappedBattery.percentage = battery[0];
	mappedBattery.state = battery[1];
	mappedBattery.timeToEmpty = battery[2];
	return mappedBattery;
}

function mapKeysForWindows(battery) {
  var mappedBattery = {};
  mappedBattery.percentage = battery['EstimatedChargeRemaining'];
  mappedBattery.state = battery['BatteryStatus'];
  mappedBattery.timeToEmpty = battery['TimeOnBattery'];
  return mappedBattery;
}

function processBatteryStdoutForLinux(stdout) {
	var battery = {},
			processLine = processLineForLinux.bind(null, battery);
  stdout.split('\n').forEach(processLine);
  return mapKeysForLinux(battery);
}

function processBatteryStdoutForMac(stdout) {
	var battery = stdout.split(';').map(trimParam);
  return mapKeysForMac(battery);
}

function processBatteryStdoutForWindows(stdout) {
  var lines = stdout.split('\n').map(trimParam),
      battery = {},
      processLine = processLineForWindows.bind(null, battery),
      headersStr,
      paramsStr,
      headers,
      fieldsPositions,
      lastIndex,
      i,
      n;
  
  if (lines.length < 2) {
    return {};
  }

  headersStr = lines[0];
  paramsStr = lines[1];
  headers = headersStr
    .split(' ')
    .filter(function(s) {
      return s.length > 0; 
    });
  lastIndex = -1;
  fieldsPositions = headers
    .map(function (h) {
      lastIndex = headersStr.indexOf(h, lastIndex + 1);
      return lastIndex;
    });
  fieldsPositions.push(headersStr.length);
  n = fieldsPositions.length;
  for (i = 0; i < n - 1; i++) {
    processLine(headers[i], paramsStr.substr(fieldsPositions[i], fieldsPositions[i+1] - fieldsPositions[i]));
  }

  return mapKeysForWindows(battery);
}

function onBatteryInfo(response, data) {
  response.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
    'Access-Control-Allow-Origin': '*'
  });
  response.write(data);
  response.end();
}

function onError(response, msg) {
  response.writeHead(404, {'Content-Type': 'text/plain'});
  response.write(msg);
  response.end();
}

function trimParam(param) {
  return param.trim();
}

function getBatteryStatus(response, onSuccess, onError) {

  child_process.exec(CONFIG.command, function execBatteryCommand(err, stdout, stderr) {
    var battery;
    
    if (err) {
      console.log('child_process failed with error code: ' + err.code);
      onError(response, BATTERY_ERROR_MESSAGE);
    } else {

			try {
	      battery = CONFIG.processFunction(stdout);
	      onSuccess(response, JSON.stringify(battery));
	    } catch (e) {
	      console.log(e);
	      onError(response, BATTERY_ERROR_MESSAGE);
	    }
	  }
	});
}

var server = http.createServer(function (request, response) {
  var requestUrl = request.url;
  var filePath = BASE_URL + requestUrl;

  if (requestUrl === '/' || requestUrl === '') {
    response.writeHead(301,
      {
        Location: BASE_URL + 'public/demo.html'
      });
    response.end();
  } else if (RE_BATTERY.test(requestUrl)) {
    getBatteryStatus(response, onBatteryInfo, onError);
  } else {  
    fs.exists(filePath, function (exists) {

      if (exists) {
        fs.readFile(filePath, function (error, content) {
          if (error) {
            response.writeHead(500);
            response.end();
          } else {
            response.writeHead(200);  //, { 'Content-Type': 'text/html' }
            response.end(content, 'utf-8');
          }
        });
      } else {
        response.writeHead(404, {'Content-Type': 'text/plain'});
        response.write('404 - Resurce Not found');
        response.end();
      }
    });
  }
}).listen(PORT);
console.log('Server running on port ' + PORT);  //'at http://127.0.0.1:' + port