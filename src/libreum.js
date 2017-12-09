/* 
 * libreum.js - basic librecast chat demo
 *
 * this file is part of LIBREUM
 *
 * Copyright (c) 2017 Brett Sheffield <brett@gladserv.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program (see the file COPYING in the distribution).
 * If not, see <http://www.gnu.org/licenses/>.
 */

(function ($, lc) {
"use strict";

var KEY_ENTER = 13;
var KEY_DOWN = 40;
var KEY_UP = 38;
var CMD_HISTORY_LIMIT=32;

var MSG_TYPE_JOIN = 1;
var MSG_TYPE_PART = 2;

var PING_INTERVAL = 5000;

var allowedRemoteCmds = [ 'sysmsg' ];
var channelNames = [];
var chanselected;
var chansocks = [];
var cmdCurrent = "";
var cmdHistory = [];
var cmdIndex = -1;
var channelDefault = "#welcome";
var lctx;
var localCache = localStorage;
var nick = "guest";
var sockselected;


/**
 * ChatPane -  a chat window
 * binds one or more Librecast.Channels to a Librecast.Socket
 * @constructor
 * @param {string} channelName	- The name of a channel to bind
 * there can be any number of channelName params.
 */
function ChatPane() {
	var self = this;
	this.channels = [];

	/* create socket */
	this.socket = new LIBRECAST.Socket(lctx, sockready);
	var promises = [this.socket.defer];

	/* create channel(s) - several channels can be bound to one socket */
	for (var i = 0; i < arguments.length; i++) {
		var chan;
		try {
			chan = new LIBRECAST.Channel(lctx, arguments[i], channelReady);
			chan.chatPane = this;
		}
		catch(e) {
			console.log(e);
			console.log("unable to create channel " + arguments[i]);
			continue;
		}
		this.channels.push(chan);
		promises.push(chan.defer);
	}

	/* callback when both the socket and each channel are ready */
	var socket = this.socket;
	this.channels.forEach(function(chan) {
		$.when(socket.defer, chan.defer).done(function () {
			chan.bindSocket(socket, channelBound);
			chan.interval = setInterval(chan.ping.bind(chan), PING_INTERVAL);
		});
	});

	/* callback only when socket and all channels are ready */
	$.when.apply($, promises).done(function () {
		self.onReady();
	});
}

ChatPane.prototype.onReady = function() {
	console.log("ChatPane.onReady()");
};


function User(nick) {
	console.log("User constructor");
	this.nick = nick;
}

/* record a user sighting */
User.prototype.seen = function(timestamp) {
	console.log("User.seen()");
	this.lastSeen = (typeof timestamp === 'undefined') ? new Date() : new Date(timestamp);
	return this;
};

/* tell the channel we're still here */
LIBRECAST.Channel.prototype.ping = function() {
	console.log("--- PING --- (" + this.name + ")");
	this.setval("join", nick);
};

/* user has joined the channel - make a note */
LIBRECAST.Channel.prototype.userJoin = function(nick) {
	console.log("Channel.userJoin()");

	var socketid = this.id2;

	if (typeof this.userStatus(nick) === "undefined") {
		this.users[nick] = new User(nick);
		writeSysMsg(nick + " has joined " + this.name, socketid);
	}
	this.users[nick].seen();

	return this;
};

/* user has left the channel */
LIBRECAST.Channel.prototype.userPart = function(nick) {
	console.log("Channel.userPart()");

	var socketid = this.id2;

	if (typeof this.userStatus(nick) === "undefined") {
		this.users[nick] = new User(nick);
		writeSysMsg(nick + " has left " + this.name, socketid);
	}
	this.users[nick].seen();

};

/* get/set userStatus */
LIBRECAST.Channel.prototype.userStatus = function (nick, status) {
	console.log("Channel.userStatus()");
	if (typeof this.users === "undefined") { this.users = []; }
	if (typeof status === "undefined") { return this.users[nick]; }

	this.users[nick] = new User(nick).seen();

	console.log("user " + nick + " last seen at " + this.users[nick].lastSeen);

	return this;
};


function Message(text) {
	this.nick = nick;
	this.text = text;
}

Message.prototype.format = function() {
	return '<' + this.nick + '> ' + this.text;
};

Message.prototype.parse = function(jsonString) {
	var obj = JSON.parse(jsonString);

	// copy properties from JSON
	for (var key in obj) {
		this[key] = obj[key];
	}
	return this;
};

/* get/set message type */
Message.prototype.type = function(type) {
	if (typeof type === 'undefined') { return this.type; }
	this.type = type;
	return this;
};


/* callback when Librecast.Channel is bound to Librecast.Socket */
var channelBound = function () {
	var chan = this;
	var timestamp;

	/* get timestamp of last message for this channel */
	for (var c in chansocks) {
		if (chansocks[c].name === chan.name) {
			timestamp = chansocks[c].timestamp;
			break;
		}
	}

	chansocks[chan.id2] = chan;
	if ((localCache.activeChannel == chan.name) || (typeof chanselected === 'undefined'))
		changeChannel(chan.id2);

	console.log('channel ' + chan.name + ' bound to socket ' + chan.id2);

	prepChannelElements(chan);

	/* fetch channel topic */
	updateChannelTopic(chan.name, chan.id2);
	chan.getval("topic", gottopic);

	/* fetch channel history */
	var qry = new LIBRECAST.Query().timestamp(timestamp, lc.QUERY_GT);
	chan.getmsg(gotresult, qry);
};

/* callback when Librecast.Channel is created
 * Note: this doesn't mean the socket is ready, 
 * or that we are listening to this channel */
var channelReady = function(cb) {
	var chan = cb.obj;
	console.log("channel " + chan.name + " is ready");
	chan.join(joined);

	if (channelNames.indexOf(chan.name) === -1) {
		channelNames.push(chan.name);
		localCache.channels = JSON.stringify(channelNames);
	}
};

/* /help command - print some help info */
function cmd_help(args) {
	writeSysMsg("/help");
	writeSysMsg("  commands: ");
	writeSysMsg("  /help                       - displays this help message");
	writeSysMsg("  /nick nickname              - changes your channel nick");
	writeSysMsg("  /topic channel topic        - set channel topic");
	writeSysMsg("  /join channel               - join channel");
	writeSysMsg("  /part [channel]             - leave active or specified channel");
	writeSysMsg("  /reset                      - delete all local storage");
	writeSysMsg("  /rtl                        - toggle right-to-left input");
	writeSysMsg("  /who                        - list when users were last seen on channel");
	writeSysMsg("");
	return true;
}

/* /nick command - change user nick */
function cmd_nick(args) {
	var newnick = args[1];
	if (typeof newnick === 'undefined') { newnick = promptNick(nick); }

	if (chanselected) {
		if (nick) {
			chanselected.send('/sysmsg ' + nick + ' is now known as ' + newnick);
		}
	}
	nick = newnick;

	if (typeof localCache !== "undefined")
		localCache.nick = nick;

	return true;
}

/* /join command - join a channel */
function cmd_join(args) {
	var channel = validChannelName(args[1]);
	writeSysMsg('changing channels to "' + channel + '"');
	console.log(channelNames);
	if (channelNames.indexOf(channel) === -1) {
		createChannel(channel);
		localCache.activeChannel = channel;
	}
	else {
		console.log("already joined to channel '" + channel + "'");
		changeChannel(socketidByChannelName(channel));
	}
	return true;
}

/* /part command - leave a channel */
function cmd_part(args) {
	var channelName;
	if (typeof args[1] !== 'undefined') {
		channelName = validChannelName(args[1]);
		if (!(channelName)) {
			console.log("invalid channel name");
			return true;
		}
	}
	else {
		// no channel selected, part active channel
		channelName = chanselected.name;
	}
	writeSysMsg('parting channel "' + channelName + '"');
	if (channelNames.indexOf(channelName) === -1) {
		console.log("invalid channel name");
		return true;
	}
	partChannel(channelName);
	return true;
}

/* search messages */
function cmd_search(args) {
	args.shift();
	var qry = new LIBRECAST.Query();

	/* TODO: search types keyword/time etc. */
	while (args.length > 0) {
		qry.key("message_keyword", args.shift());
	}
	chanselected.getmsg(gotresult, qry);
	return true;
}

/* /sysmsg command -  write system message */
function cmd_sysmsg(args) {
	args.shift();
	var msg = args.join(" ");
	writeSysMsg(msg);
	return true;
}

/* /rtl command - toggle right-to-left input */
function cmd_rtl(args) {
	$("#usercmd").toggleClass('rtl');

	return true;
}

/* /topic command - change the channel topic */
function cmd_topic(args, isRemote) {
	args.shift();
	var topic = args.join(" ");

	if (chanselected) {
		chanselected.setval("topic", topic);
	}

	return true;
}

/* list users on channel */
function cmd_who() {
	writeSysMsg("Users on channel " + chanselected.name + ":");
	for (var u in chanselected.users) {
		var user = chanselected.users[u];

		writeSysMsg(" " + user.nick + " (seen: " + user.lastSeen + ")");
	}
	return true;
}

/* return text in user command input box */
function cmdGet() {
	return $("#usercmd").val();
}

/* set text of user command input box */
function cmdSet(command) {
	$("#usercmd").val(command);
}

/* set contents of user input box from user command history */
function cmdHistoryGet(index) {
	console.log("cmdHistoryGet(" + index + ")");

	if (index > cmdHistory.length) {
		index = cmdHistory.length;
	}
	else if (index < 0) {
		console.log("restoring current command");
		cmdSet(cmdCurrent);
		cmdIndex = -1;
		return;
	}
	else if (index == 0 && cmdIndex == -1) {
		console.log("stashing command history");
		cmdCurrent = cmdGet();
	}
	if (typeof cmdHistory[index] !== "undefined") {
		console.log("getting cmdHistory");
		cmdSet(cmdHistory[index]);
		cmdIndex = index;
	}
}

/* store command on history stack */
function cmdHistorySet(cmd) {
	console.log("cmdHistorySet(" + cmd + ")");
	cmdHistory.unshift(cmd);
	if (cmdHistory.length > CMD_HISTORY_LIMIT)
		cmdHistory.pop();
}

/* switch between channel panes (sockets) */
function changeChannel(socketid) {
	var chatdiv = $('div.chat');
	chatdiv.find('div.topic').removeClass('active');
	chatdiv.find('div.socket').removeClass('active');
	$('div.channels > li.active').removeClass('active');
	$('#topic_' + socketid).addClass('active');
	$('#socket_' + socketid).addClass('active');
	$('#chansock_' + socketid).addClass('active').removeClass('unread');

	chanselected = chansocks[socketid];
	var channelName = $('#chansock_' + socketid).text();
	if (channelName) {
		localCache.activeChannel = channelName;
	}
}

/* create a new chat channel
 * In Librecast terms, this means we set up a chain of callbacks to:
 * 1) create a new socket and channel
 * 2) join the channel when it's ready
 * 3) bind the channel to the socket
 * 4) listen on the socket
 * we also need to create a div to display any channel contents
 * and update our channel list */
function createChannel(channelName) {
	if (!channelName) {
		writeSysMsg("'" + channelName + "' not a valid channel name");
		return false;
	}
	channelName = validChannelName(channelName);

	lctx.chatPanes.push(new ChatPane(channelName));
}

/* remove channel from joined list */
function deleteChannel(channelName) {
	for (var i = 0, ii = channelNames.length; i < ii; i++) {
		if (channelNames[i] === channelName.toLowerCase()) {
			channelNames.splice(channelNames.indexOf(i));
			localCache.channels = JSON.stringify(channelNames);
			break;
		}
	}
}

/* callback when message received on Librecast.Socket */
function gotmail(cb, opcode, len, id, token, key, val, timestamp) {
	console.log("gotmail()");
	var sock = cb.obj;
	var chan = chansocks[sock.id];
	var msg;

	chan.timestamp = timestamp;

	if (opcode === lc.OP_SOCKET_MSG) {
		if (!handleCmd(val, true)) {
			try {
				msg = new Message().parse(val);
			}
			catch(e) {
				console.log(e);
				return false;
			}
			switch (msg.type) {
				case MSG_TYPE_JOIN:
					chan.userJoin(msg.nick);
					break;
				case MSG_TYPE_PART:
					chan.userPart(msg.nick);
					break;
				default:
					writeMsg(msg, sock.id, timestamp);
			}
		}
	}
	else if (opcode === lc.OP_CHANNEL_GETVAL) {
		if (key === 'topic') { updateChannelTopic(val, sock.id); }
	}
	else if (opcode === lc.OP_CHANNEL_SETVAL) {
		if (key == 'join') {
			chan.userJoin(val);
		}
		else if (key == 'topic') {
			updateChannelTopic(val, sock.id);
			writeSysMsg('channel topic changed to "' + val + '"');
		}
		else {
			console.log("ignoring unknown key '" + key + "'");
		}
	}
}

function gotresult(cb, opcode, len, id, token, key, val, timestamp) {
	var socketid = cb.obj.id2;

	if (typeof gotresult.count === 'undefined') {
		gotresult.count = 0;
	}
	console.log("socket " + id + ": got a message result " + ++gotresult.count);
	var msg;
	try {
		msg = new Message().parse(val);
	}
	catch(e) {
		console.log(e);
		console.log("skipping invalid JSON message");
		return false;
	}
	if (typeof msg.text !== 'undefined') writeMsg(msg, socketid, timestamp);
}

function gottopic(obj, opcode, len, id, token, msg) {
	updateChannelTopic(msg, obj.obj.id);
}

/* process any /cmd irc-like commands */
function handleCmd(cmd, isRemote) {
	if (cmd.substring(0,1) != '/')
		return false;

	var args = cmd.split(' ');
	var command = args[0].substring(1);

	/* send remote command */
	if (chanselected) {
		if (!isRemote && allowedRemoteCmds.indexOf(command) >= 0) {
			chanselected.send(cmd);
		}
	}
	if (isRemote && allowedRemoteCmds.indexOf(command) < 0) {
		console.log("bad remote command received: " + command);
	}
	switch (command) {
	case "?":
		return cmd_search(args);
	case "help":
		return cmd_help(args);
	case "join":
		return cmd_join(args);
	case "nick":
		return cmd_nick(args);
	case "part":
		return cmd_part(args);
	case "reset":
		localStorage.clear();
		break;
	case "rtl":
		return cmd_rtl(args);
	case "sysmsg":
		return cmd_sysmsg(args);
	case "topic":
		return cmd_topic(args, isRemote);
	case "who":
		return cmd_who(args);
	}

	return true; /* do not write failed commands to channel */
}

/* user typed something, I guess we'd better see what it was */
function handleInput() {
	var cmd = cmdGet();
	cmdHistorySet(cmd);
	if (chanselected) {
		if (!handleCmd(cmd)) {
			if (isRTL()) {
				cmd = esrever.reverse(cmd);
			}
			console.log("sending " + cmd);
			var msg = new Message(cmd);
			chanselected.send(JSON.stringify(msg));
		}
	}
	cmdSet("");
	cmdIndex = -1;
	cmdCurrent = "";
}

function init() {
	console.log("init()");

	readLocalStorage();

	/* initalize Librecast context */
	lctx = new LIBRECAST.Context(function () { librecastCtxReady(this); });

	initKeyEvents();

	/* set focus to user input box */
	$("#usercmd").focus();
}

function initKeyEvents() {
	console.log("initKeyEvents()");

	/* trap user keypress events */
	$("#usercmd").keypress(function(e) {
		if (e.which == KEY_ENTER) {
			e.preventDefault();
			handleInput();
		}
	});

	/* trap up/down keys for command line history */
	$("#usercmd").keydown(function(e) {
		switch (e.which) {
			case KEY_UP:
				console.log("UP");
				e.preventDefault();
				cmdHistoryGet(cmdIndex + 1);
				break;
			case KEY_DOWN:
				console.log("DOWN");
				e.preventDefault();
				cmdHistoryGet(cmdIndex - 1);
				break;
		}
	});
}

function isRTL() {
	return $('#usercmd').hasClass('rtl');
}

function joined(cb) {
	var chan = cb.obj;
	chan.setval("join", nick);
}

/* callback when Librecast Context is ready */
function librecastCtxReady(ctx) {
	console.log("librecastCtxReady()");

	ctx.chatPanes = [];

	/* join any channels we were on last time */
	channelNames.forEach(function(name) {
		ctx.chatPanes.push(new ChatPane(name));
	});
}

/* leave (part) channel */
function partChannel(channelName) {
	console.log('partChannel(' + channelName + ')');
	var socketid = socketidByChannelName(channelName);
	var chan = chansocks[socketid];

	/* tell the channel we're leaving */
	var msg = new Message().type(MSG_TYPE_PART);
	chan.send(JSON.stringify(msg));

	deleteChannel(channelName);

	/* change to another channel if leaving active */
	if (localCache.activeChannel === channelName) {
		changeChannel(socketidByChannelName(channelNames[0]));
	}

	/* TODO: close both channel and socket */

	/* drop display elements */
	$('#socket_' + socketid).remove();
	$('#chansock_' + socketid).remove();
}

/* prompt user f/* create/update channel elements */
function prepChannelElements(chan) {
	var chansock = $('li:contains(' + chan.name + ')');
	var socketid = chan.id2;
	if (chansock.length) {
		/* update socketids for existing channel */
		var oldsockid = chansock.attr('id').split('_')[1];
		$('li#chansock_' + oldsockid).attr('id', 'chansock_' + socketid);
		$('div#socket_' + oldsockid).attr('id', 'socket_' + socketid);
		$('div#topic_' + oldsockid).attr('id', 'topic_' + socketid);
	}
	else {
		/* create socket pane */
		var chatdiv = $('div.chat');
		chatdiv.append('<div id="topic_' + socketid + '" class="topic"></div>');
		chatdiv.append('<div id="socket_' + socketid + '" class="socket"></div>');
		chansock = $('<li id="chansock_' + socketid  + '">' + chan.name + '</li>');
		$('div.channels').append(chansock);
		chansock.on('click', function() {
				var socketid = $(this).attr('id').split('_')[1];
				changeChannel(socketid);
		});
	}
	if (localCache.activeChannel == chan.name)
		changeChannel(socketid);
}

/* prompt for a new nick */
function promptNick(oldnick) {
	console.log("promptNick()");

	if (typeof oldnick === 'undefined') { oldnick = "guest"; }
	var newnick = prompt('Welcome.  Please choose username ("nick") to continue', oldnick);
	newnick = (newnick === null) ? nick : newnick;
	return newnick;
}

function readLocalStorage() {
	console.log("readLocalStorage()");

	if (typeof localCache !== "undefined") {
		nick = localCache.nick;

		if (typeof localCache.channels !== "undefined") {
			try {
				channelNames = JSON.parse(localCache.channels);
			}
			catch(e) {
				console.log("no channels loaded");
			}
		}
		if (channelNames.length === 0) {
			channelNames = [ channelDefault ];
			localCache.activeChannel = channelDefault;
		}
		console.log(channelNames);
	}
	else {
		channelNames = [ channelDefault ];
		localCache.activeChannel = channelDefault;
	}

	if (typeof nick === 'undefined') { cmd_nick([, promptNick()]); }
}

function socketidByChannelName(channelName) {
	var chansock = $('li:contains(' + channelName + ')');
	var socketid = chansock.attr('id').split('_')[1];
	return socketid;
}

/* check/* callback when Librecast.Socket is created */
function sockready(cb) {
	console.log("my socket is ready");
	var sock = cb.obj;
	sock.listen(gotmail);
}

function timestampFormat(timestamp) {
	/* timestamp message */
	var d = (!timestamp) ? new Date() : new Date(Number(timestamp.toString().substring(0, 13)));
	var month = ("0" + (d.getMonth() + 1)).slice(-2);
	var day = ("0" + d.getDate()).slice(-2);
	var hours = ("0" + d.getHours()).slice(-2);
	var minutes = ("0" + d.getMinutes()).slice(-2);
	var seconds = ("0" + d.getSeconds()).slice(-2);

	/* formatting is mostly CSS, but also use a non-breaking space so cut and paste is legible */
	var strtime = (timestamp) ? timestamp.toString() : "";
	var nanostamp = '<span class="nanostamp">' + strtime + '</span>';
	var date = '<span class="datestamp">' + d.getFullYear() + '-' + month + '-' + day + '&nbsp;</span>';
	var time = '<span class="timestamp">' + hours + ':' + minutes + ':' + seconds + '&nbsp;</span>';

	return nanostamp + date + time;
}

/* set the topic div in the channel window */
function updateChannelTopic(topic, socketid) {
	var divtopic;
	if (socketid === undefined) {
		divtopic = $("div.topic.active");
	}
	else {
		divtopic = $("#topic_" + socketid);
	}
	if (typeof divtopic !== 'undefined') {
		divtopic.html("<h1>" + topic + "</h1>");
	}
}

/* check channel name validity */
function validChannelName(channelName) {
	if (typeof channelName === 'undefined') {
		return false;
	}

	// trim whitespace
	channelName = channelName.replace(/^s+|s+$/g, '');

	/* for now, just insist it starts with a hash */
	if (channelName[0] !== '#') {
		channelName = '#' + channelName;
	}

	/* name must have at least one character + leading hash */
	if (channelName.length < 2) {
		return false;
	}

	return channelName.toLowerCase();
}

/* write chat message to channel window */
function writeMsg(unsafestr, socketid, timestamp) {
	var msg;
	var chan = chansocks[socketid];
	if (typeof unsafestr === 'object') {
		if (typeof unsafestr.text !== 'undefined') {
			msg = $('<div>').text(unsafestr.format()).html();
		}
		else {
			if (unsafestr.type === MSG_TYPE_JOIN) {
				writeSysMsg(unsafestr.nick + " has joined " + chan.name, socketid, timestamp);
			}
			else if (unsafestr.type === MSG_TYPE_PART) {
				writeSysMsg(unsafestr.nick + " has left " + chan.name, socketid, timestamp);
			}
			return false;
		}
	}
	else {
		msg = $('<div>').text(unsafestr).html();
	}

	var datetime = timestampFormat(timestamp);
	var line = '<p><span class="msg">' + datetime + msg + '</span></p>';
	writeChannel(line, socketid);
}

/* write system message to active channel window */
function writeSysMsg(unsafestr, socketid, timestamp) {
	var msg = $('<div>').text(unsafestr).html();
	var datetime = timestampFormat(timestamp);
	var sysmsg = '<pre><span class="sysmsg">' + datetime + msg + '</span></pre>';
	writeChannel(sysmsg, socketid);
}

/* append string to channel window, and scroll to bottom */
function writeChannel(str, socketid) {
	var chanpane;
	if (typeof socketid === 'undefined') {
		chanpane = $("div.socket.active");
	}
	else {
		chanpane = $("#socket_" + socketid);
	}
	if (!chanpane.hasClass('active')) {
		$("#chansock_" + socketid).addClass('unread');
	}
	if (typeof chanpane !== 'undefined') {
		chanpane.append(str);
		chanpane.scrollTop(chanpane.prop("scrollHeight") - chanpane.prop("clientHeight"));
	}
}

/* program entry point - check if we have jQuery available */
if (LIBRECAST.HAS_JQUERY) {
	$(document).ready(function() {
		console.log("document loaded (jQuery)");
		init();
	});
}
else {
	window.onload = function() {
		console.log("document loaded");
		init();
	};
}

}(jQuery, LIBRECAST));
