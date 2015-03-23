/*
Name:			email to sms with twilio.
Author:		spacesix.
Date:			20150310
Version:	0.9

A node.js script.
*/

var npmpath = '/usr/lib/node_modules/';		//npm modules path
var moment = require(npmpath+'moment');
var email = require(npmpath+'emailjs');
var winston = require(npmpath+'winston');
var MailParser = require(npmpath+"mailparser").MailParser,
    mailparser = new MailParser();
    util = require('util');
    inspect = require('util').inspect;
var jf = require(npmpath+'jsonfile');
var validator = require(npmpath+'validator');
var logger = new (winston.Logger)({
 transports: [
   new (winston.transports.Console)(),
   new (winston.transports.File)({ filename: '/home/e2m/e2m.log', json: false})
 ] });

var appName = 'Email2sms App: ';
var smsBodyLength = 150;
var smsAdminEmail = 'admin@mydomain.com';		//a error message will send to this email
var	testAccount = false;												//true = use twilio.com test Credentials
var	smsObject = {
	body: null,
	to: null,
	from: null	};

var configfile = '/home/e2m/e2m.config.json';

process.stdin.resume();
process.stdin.setEncoding('utf8');
 
buffer = '';
i = 0;
process.stdin.on('data', function(chunk) {		//read pipe buffer.
	buffer += chunk.toString('utf8');
	i = i + 1;
});

process.stdin.once('end', function() {
           
	mailparser.on("end", function(mail_object){
		if (! mail_object.from || ! mail_object.to) {
			logger.info(appName + 'Fail, pipe buffer incorrect. ' + moment().format('YYYY-MM-DD hh:mm:ss'));
			return;
		} else {
			logger.info(appName + 'Running. ' + moment().format('YYYY-MM-DD hh:mm:ss'));
		}
		logger.info(appName + ', pipe buffer:\n' + inspect(mail_object));
		
		var keymatched = false;
		var datematched = true;
		var limitexceeded = false;
		var mobilenumber = 0;		//how many mobile numbers at email subject

		arr = cuStr(mail_object.subject).split("@"),
		mobilelist = extractNumber(arr[0]);
		if (mobilelist) {
			mobilenumber = mobilelist.length;
		} 
	
		key = arr[1];
		var config = jf.readFileSync(configfile);

		var pointer = -1;
		if (config.datemark != moment().format('YYYYMMDD')) {
			logger.info('date nomatch');
			datematched = false;
			config.datemark = moment().format('YYYYMMDD')
		} 

		for(i in config.keys) {
			if (! datematched) {
				config.keys[i].times = config.keys[i].limit;		//reset sms daily limit to set value if day changed
			}
			if (config.keys[i].value == key && !keymatched) {
				keymatched = true;
				pointer = i;
				if (config.keys[i].times > 0) {
					config.keys[i].times = config.keys[i].times - mobilenumber ;
					logger.info('Key:%s after: %s',key,inspect(config.keys[i]));
				} else {
					limitexceeded = true;		//sms daily limit exceeded;
				}
			}
		}
		jf.writeFileSync(configfile,config);

		if (limitexceeded) {
			str1 = util.format('Key:%s, has exceeded daily limit %d. No SMS will be sent.', key, config.keys[pointer].limit);
		} else if (mobilenumber<1) {
			str1 = util.format('Key:%s, I can\'t extract any phone number from email subject. No SMS will be sent.', key);
		} else if (!keymatched) {
			str1 = util.format('Key:%s incorrect. No SMS will be sent.', key);
		} else {
			// key matched and still have sms limit leave.
			str1 = '';
			logger.info('Key:%s, sending sms',key);
			if (testAccount) {
				//put your twilio.com test Credentials
				var accountSid = 'AC5809ufdsofjlsdjfljafsvm043203';
				var authToken = '5b8dfadsfjkljr4329809fojflskdjf';
				smsObject.to	= "+61435222330";
				smsObject.from = "+15005550006";				//twilio magic number refer to: https://www.twilio.com/docs/api/rest/test-credentials
				emailto = mail_object.from[0].address;
				emailcc = smsAdminEmail;
			} else {
				//put your twilio.com real Credentials
				var accountSid = 'ACfjdsalkfjdslfjdlsajfklsajfkls';
				var authToken = 'a9faslkfjlasdfjkldjroiweur0984j';
				smsObject.to	= "+" + mobilelist[0];
				smsObject.from = "+61428133628";	
			}
			smsObject.body = cuStr(mail_object.text).substring(0,smsBodyLength);
			var client = require(npmpath+'twilio')(accountSid, authToken);		
			client.sendMessage(smsObject, function(err, m) {
				if (err) {
					logger.info('Key:%s, sms err; ',key,err);
					var op = {
						body		:	err.message + '.\n\n' ,
						subject	:	appName + '[SMS gateway Fail]',
						to			:	emailto,		
						cc			:	emailcc,
					};			
					sendmail(op);					
				} else {
					logger.info('Key:%s [%s], sms sent; sid:%s; accsid:%s; to:%s; fr:%s; body:%s.',key,config.keys[pointer].times,m.sid,m.account_sid,m.to,m.from,m.body);
				}
			});			
		}
		if (str1) {
			logger.info(str1)
			emailto = mail_object.from[0].address;
			emailcc = smsAdminEmail;
			var op = {
				body		:	str1 + '.\n\n' ,
				subject	:	appName + '[SMS gateway Fail]',
				to			:	emailto,		
				cc			:	emailcc,
			};			
			sendmail(op);					
		};

	});

	mailparser.write(buffer);
	mailparser.end();
	
});

//Remove non-ascii character in string
function cuStr(str) {
	return str.replace(/[^A-Za-z 0-9 \.,\?""!@#\$%\^&\*\(\)-_=\+;:<>\/\\\|\}\{\[\]`~]*/g, '');
}

function extractNumber(string){
	var result = string.match(/([0-9]{8,})/g) ;
	if (result) {
		result = result.splice(0,1) 		//only return first mobile numbers.
	};
	return result;
}

var op = {
	body		:	'test la 111.\n' ,
	subject	:	appName + ' ' + moment().format('YYYY-MM-DD hh:mm:ss'),
	to			:	'zen1@mydomain.com',		
};			


function sendmail(op) {
	var	smtphost = 'localhost';						//use local sentmail server. if smtphost = 'smtp.gmail.com' will use gmail server
	var server  = email.server.connect({
	   host:    smtphost, 
	   ssl:			false,	   });
	var body = op.body +
		'--------------------------------------\n' +
		'This email sent by SMS broker.\n' +
		'If there is any issue please contact zen1@domain.com.\n' +
		moment().format('YYYY-MM-DD hh:mm:ss') + ' sent.';
	var message = {
	   text:    body, 
	   from:    'noreply_zen1 <zen1@mydomain.com>',
	   to:      op.to,
	   cc:			op.cc,
	   subject: op.subject,
	   attachment: 
	   [
	      {	data:op.attbody, 
	      	alternative:false, 
	      	name: op.attname }
	   ]
	};
	if (! op.attbody) {
		message.attachment = [];
	};
	server.send(message, function(err, message) { logger.info(err || message.header); });
};

