# Send SMS Messages via Email with Twilio. a node.js script.

### Below is a list of my server environment.

- CentOS release 5.3 32bit.
- sendmail 8.13.8-2.el5.
- node v0.10.33.
- You also need an account with [Twilio](https://www.twilio.com/try-twilio).

My server host name is "zen1.mydomain.com".

My task is to create a virtual sendmail user e2m, with email address: e2m@zen1.mydomain.com. Once I send a email with special format to e2m@zen1.mydomain.com. It will trigger a node.js script 'e2m.js'. this script will call a Twilio API to send out a SMS.

e2m.js will read a config file e2m.config.json. At this config file. you can specify a couple of users who can send out SMS by email. For each user. you can specify a unique password and a daily SMS limitation amount.

The specail email format look like this: 
```bash
mail to: 	e2m@mydomain.com
subject:	61435222330@USER1_1234565794fasld5
	//first part is a mobile number in e.164 numbering format, 
	//second part is a unique password for sending SMS. which will can be config at file e2m.config.json.
mailbody:	a test SMS message sent by e2m.js.
```

Below is my steps:

### 1. Create scrip folder with a proper ownship and permissions.

Login as a root user.
```bash
[root@zen1 home]# cd /home
[root@zen1 home]# mkdir e2m
[root@zen1 home]# chown kevin:kevin e2m  
[root@zen1 home]# touch e2m/e2m.config.json
[root@zen1 home]# touch e2m/e2m.js
[root@zen1 home]# touch e2m/e2m.log
[root@zen1 home]# chown kevin:kevin /home/e2m -R     ##change ownship to your username.
[root@zen1 home]# chmod a+w e2m/e2m.config.json
[root@zen1 home]# chmod a+w e2m/e2m.log
[root@zen1 home]# chmod a+x e2m/e2m.js
```

### 2. Create a virtual sendmail user, and config sendmail service.

Still as a root user
```bash
[root@zen1 home]# vi /etc/aliases    
e2m:            "|node /home/e2m/e2m.js"                      ## add one line at the bottom. then save and exit vi.
[root@zen1 home]# newaliases
/etc/aliases: 79 aliases, longest 36 bytes, 867 bytes total   ## rebuild /etc/aliases
```

About steps will create a virual sendmail user. Once we send email to e2m@mydomain.com. sendmail will pipe the email content to node script: /home/e2m/e2m.js.

Create smrsh links, this will allow sendmail to call node and my script.
```bash
[root@zen1 home]# ln -s /home/e2m/e2m.js /etc/smrsh/e2m.js
[root@zen1 home]# ln -s /usr/bin/node /etc/smrsh/node
```

Conduct a test to make sure piping to e2m.js work properly. If you can see a similar line in sendmail log file. then means you can go to next step.

```bash
[root@zen1 home]# date | mail -s "Hello world" e2m@localhost
[root@zen1 home]# tail /var/log/maillog
Mar 20 16:54:49 zen1 sendmail[12950]: t2K5snno012949: to="|node /home/e2m/e2m.js", ctladdr=<e2m@zen1.mydomain.com> (8/0), delay=00:00:00, xdelay=00:00:00, mailer=prog, pri=30608, dsn=2.0.0, stat=Sent
```

### 3. Create a node.js scrip and config file.

Edit /home/e2m/e2m.config.json. Add below content. There is two individual users in this files. you can add more if you need.
```jason
{
  "datemark": "20150320",
  "keys": [
    {
      "value": "USER1_1234565794fasld5",
      "limit": "100",
      "times": "100"
    },
    {
      "value": "USER2_1fadsf5794fasld5",
      "limit": "30",
      "times": "30"
    }
  ]
}
```

Edit /home/e2m/e2m.js. Add code as below. 
```javascript
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
				smsObject.from = "+61422222222";	
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

```

Then we send a email to local sendmail server for testing: The mobile number in here is a E.164 numbering format. Country Code + Area Code + Mobile number (without leading zero). If everything ok, Mobile 61443555333 will receive a SMS "my first sms"

```bash
[kevin@zen1 e2m]$ echo 'my first sms' | mail -s '61443555333@USER1_1234565794fasld5' -v e2m@localhost
[kevin@zen1 e2m]$ tail e2m.log
  subject: '61443555333@USER1_1234565794fasld5',
  messageId: '201503230443.t2N4h88k026236@mydomain.com',
  priority: 'normal',
  from: [ { address: 'zen1@mydomain.com', name: 'kevin' } ],
  to: [ { address: 'mydomain.com', name: '' } ],
  date: Mon Mar 23 2015 15:43:08 GMT+1100 (EST),
  receivedDate: Mon Mar 23 2015 15:43:08 GMT+1100 (EST) }
2015-03-23T04:43:09.180Z - info: Key:USER1_1234565794fasld5 after: { value: 'USER1_1234565794fasld5', limit: '100', times: 98 }
2015-03-23T04:43:09.182Z - info: Key:USER1_1234565794fasld5, sending sms
2015-03-23T04:43:11.677Z - info: Key:USER1_1234565794fasld5 [98], sms sent; sid:SM18ae08002e1c4a279279431a0cec9529; accsid:AC94293b132eb6d41f3bb4cb6be31b0f05; to:+61443555333; fr:+61422222222; body:test sms 3 by kevin.
[root@zen1 home]# tail /var/log/maillog
Mar 23 15:43:08 zen1 sendmail[26236]: t2N4h88k026236: to=e2m@localhost, ctladdr=kevin (500/500), delay=00:00:00, xdelay=00:00:00, mailer=relay, pri=30083, relay=[127.0.0.1] [127.0.0.1], dsn=2.0.0, stat=Sent (t2N4h8XZ026237 Message accepted for delivery)
Mar 23 15:43:11 zen1 sendmail[26238]: t2N4h8XZ026237: to="|node /home/e2m/e2m.js", ctladdr=<e2m@zen1.mydomain.com> (8/0), delay=00:00:03, xdelay=00:00:03, mailer=prog, pri=30622, dsn=2.0.0, stat=Sent
```

### 4. Closing.

Email to SMS should work after step 3. The rest of the job is to config local sendmail server to receive normal email from internet. There is out of topic in here :) .

