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
 * @param {string} name			- name of the window
 * @param {string} channelName	- The name of a channel to bind
 * there can be any number of channelName params.
 */
function ChatPane(name) {
	var self = this;
	this.channels = [];

	/* create socket */
	this.socket = new LIBRECAST.Socket(lctx, sockready);
	var promises = [this.socket.defer];

	/* create channel(s) - several channels can be bound to one socket */
	for (var i = 0; i < arguments.length; i++) {
		var chan = new LIBRECAST.Channel(lctx, arguments[i], chanready);
		this.channels.push(chan);
		promises.push(chan.defer);
	}

	/* callback when both the socket and each channel are ready */
	var socket = this.socket;
	this.channels.forEach(function(chan) {
		$.when(socket.defer, chan.defer).done(function () {
			chan.bind(socket, bound); /* FIXME: only create one pane per ChatPane */
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


/* callback when Librecast.Channel is bound to Librecast.Socket */
function bound(cb) {
	var chan = cb.obj;
	chansocks[chan.id2] = chan;
	if ((localCache.activeChannel == chan.name) || (typeof chanselected === 'undefined'))
		changeChannel(chan.id2);

	console.log('channel ' + chan.name + ' bound to socket ' + chan.id2);

	prepChannelElements(chan);

	/* fetch channel topic */
	updateChannelTopic(chan.name, chan.id2);
	chan.getval("topic", gottopic);

	/* fetch channel history */
	chan.getmsg(gotresult);
}

/* callback when Librecast.Channel is created
 * Note: this doesn't mean the socket is ready, 
 * or that we are listening to this channel */
function chanready(cb) {
	var chan = cb.obj;
	console.log("channel " + chan.name + " is ready");
	chan.join(joined);

	if (channelNames.indexOf(chan.name) === -1) {
		channelNames.push(chan.name);
		localCache.channels = JSON.stringify(channelNames);
	}
}

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
	writeSysMsg('channel topic changed to "' + topic + '"');

	if (chanselected) {
		chanselected.setval("topic", topic);
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
	var disarray = [];
	var sock = new lc.Socket(lctx, sockready);
	var chan = new lc.Channel(lctx, channelName, chanready);
	disarray.push(sock.defer);
	disarray.push(chan.defer);

	$.when.apply($, disarray).done(function() {
		console.log("socket and channel both ready (" + chan.name + ")");
		console.log("socket id=" + sock.id);
		console.log("channel id=" + chan.id);
		chan.bind(sock, bound);
	});
}

/* remove channel from joined list */
function deleteChannel(channelName) {
	for (var i = 0, ii = channelNames.length; i < ii; i++) {
		if (channelNames[i] === channelName.toLowerCase()) {
			delete channelNames[i];
			localCache.channels = JSON.stringify(channelNames);
			break;
		}
	}
}

/* callback when message received on Librecast.Socket */
function gotmail(obj, opcode, len, id, token, key, val, timestamp) {
	console.log("gotmail()");
	var socketid = obj.obj.id;
	if (opcode === lc.OP_SOCKET_MSG) {
		if (!handleCmd(val, true)) {
			writeMsg(val, socketid, timestamp);
		}
	}
	else if (opcode === lc.OP_CHANNEL_GETVAL) {
		/* TODO: check key */
		updateChannelTopic(val, socketid);
	}
	else if (opcode === lc.OP_CHANNEL_SETVAL) {
		if (key == 'topic') {
			updateChannelTopic(val, socketid);
		}
		else {
			console.log("ignoring unknown key '" + key + "'");
		}
	}
}

function gotresult(obj, opcode, len, id, token, key, val, timestamp) {
	var socketid = obj.obj.id2;

	if (typeof gotresult.count === 'undefined') {
		gotresult.count = 0;
	}
	console.log("socket " + id + ": got a message result " + ++gotresult.count);
	console.log(val);

	if (val.substring(0,1) != '/' && val !== 'topic') {
		writeMsg(val, socketid, timestamp);
	}
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
			chanselected.send('<' + nick + ">  " + cmd);
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

function isRTL() {
	return $('#usercmd').hasClass('rtl');
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

function joined(cb) {
	var chan = cb.obj;
	console.log("channel " + chan.name + " joined");
	chan.send('/sysmsg ' + nick + ' has joined ' + chan.name);
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
	console.log("promptNick()");
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

/* write chat message to channel window */
function writeMsg(unsafestr, socketid, timestamp) {
	var msg = $('<div>').text(unsafestr).html();

	/* timestamp message */
	var d = (typeof timestamp === 'undefined' || timestamp === 0) ? new Date() : new Date(timestamp);
	var month = ("0" + (d.getMonth() + 1)).slice(-2);
	var day = ("0" + d.getDate()).slice(-2);
	var hours = ("0" + d.getHours()).slice(-2);
	var minutes = ("0" + d.getMinutes()).slice(-2);
	var seconds = ("0" + d.getSeconds()).slice(-2);

	/* formatting is mostly CSS, but also use a non-breaking space so cut and paste is legible */
	var date = '<span class="datestamp">' + d.getFullYear() + '-' + month + '-' + day + '&nbsp;</span>';
	var time = '<span class="timestamp">' + hours + ':' + minutes + ':' + seconds + '&nbsp;</span>';
	var line = '<p><span class="msg">' + date + time + msg + '</span></p>';
	writeChannel(line, socketid);
}

/* write system message to active channel window */
function writeSysMsg(unsafestr, socketid) {
	var msg = $('<div>').text(unsafestr).html();
	var sysmsg = '<pre><span class="sysmsg">' + msg + '</span></pre>';
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
