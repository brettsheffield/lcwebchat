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
var channels = [];
var chanselected;
var chansocks = [];
var cmdCurrent = "";
var cmdHistory = [];
var cmdIndex = -1;
var channelDefault = "#welcome";
var lctx;
var nick = "guest";
var sockselected;


function init() {
	console.log("init()");

	/* read local storage */
	if (typeof localStorage !== "undefined") {
		if (typeof localStorage.nick !== "undefined")
			nick = localStorage.nick;

		if (typeof localStorage.channels !== "undefined") {
			try {
				channels = JSON.parse(localStorage.channels);
			}
			catch(e) {
				console.log("no channels loaded");
			}
		}
		if (channels.length === 0) {
			channels = [ channelDefault ];
			localStorage.activeChannel = channelDefault;
		}
		if (typeof localStorage.nick === 'undefined') {
			var newnick = prompt('Welcome.  Please choose username ("nick") to continue', "guest");
			newnick = (newnick === null) ? nick : newnick;
			cmd_nick([,newnick]);
		}
		console.log(channels);
	}

	/* initalize Librecast context */
	lctx = new LIBRECAST.Librecast(librecastCtxReady);

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

	/* set focus to user input box */
	$("#usercmd").focus();
}

/* clear any local storage */
function clear() {
	localStorage.clear();
	console.log("local storage wiped");
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

/* callback when Librecast Context is ready */
function librecastCtxReady() {
	console.log("librecastCtxReady()");

	/* join any channels we were on last time */
	channels.forEach(function(name) {
		console.log(name);
		createChannel(name);
	});
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
		localStorage.activeChannel = channelName;
	}
}

/* remove channel from joined list */
function deleteChannel(channelName) {
	for (var i = 0, ii = channels.length; i < ii; i++) {
		if (channels[i] === channelName.toLowerCase()) {
			delete channels[i];
			localStorage.channels = JSON.stringify(channels);
			break;
		}
	}
}

/* leave (part) channel */
function partChannel(channelName) {
	console.log('partChannel(' + channelName + ')');
	var socketid = socketidByChannelName(channelName);

	deleteChannel(channelName);

	/* change to another channel if leaving active */
	if (localStorage.activeChannel === channelName) {
		changeChannel(socketidByChannelName(channels[0]));
	}

	/* TODO: close both channel and socket */

	/* drop display elements */
	$('#socket_' + socketid).remove();
	$('#chansock_' + socketid).remove();
}

function socketidByChannelName(channelName) {
	var chansock = $('li:contains(' + channelName + ')');
	var socketid = chansock.attr('id').split('_')[1];
	return socketid;
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
	var sock = new lc.LibrecastSocket(lctx, sockready);
	var chan = new lc.LibrecastChannel(lctx, channelName, chanready);
	disarray.push(sock.defer);
	disarray.push(chan.defer);

	$.when.apply($, disarray).done(function() {
		console.log("socket and channel both ready (" + chan.name + ")");
		console.log("socket id=" + sock.id);
		console.log("channel id=" + chan.id);
		chan.bind(sock, bound);
	});
}

/* callback when LibrecastChannel is created
 * Note: this doesn't mean the socket is ready, 
 * or that we are listening to this channel */
function chanready(cb) {
	var chan = cb.obj;
	console.log("channel " + chan.name + " is ready");
	chan.join(joined);

	if (channels.indexOf(chan.name) === -1) {
		channels.push(chan.name);
		localStorage.channels = JSON.stringify(channels);
	}
}

function gottopic(obj, opcode, len, id, token, msg) {
	updateChannelTopic(msg, obj.obj.id);
}

/* callback when LibrecastSocket is created */
function sockready(cb) {
	console.log("my socket is ready");
	var sock = cb.obj;
	sock.listen(gotmail);
}

/* create/update channel elements */
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
	if (localStorage.activeChannel == chan.name)
		changeChannel(socketid);
}

/* callback when LibrecastChannel is bound to LibrecastSocket */
function bound(cb) {
	var chan = cb.obj;
	chansocks[chan.id2] = chan;
	if ((localStorage.activeChannel == chan.name) || (typeof chanselected === 'undefined'))
		changeChannel(chan.id2);

	console.log('channel ' + chan.name + ' bound to socket ' + chan.id2);

	prepChannelElements(chan);

	/* fetch channel topic */
	updateChannelTopic(chan.name, chan.id2);
	chan.getval("topic", gottopic);

	/* fetch channel history */
	chan.getmsg(gotresult);
}

function joined(cb) {
	var chan = cb.obj;
	console.log("channel " + chan.name + " joined");
	chan.send('/sysmsg ' + nick + ' has joined ' + chan.name);
}

/* callback when message received on LibrecastSocket */
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

	if (chanselected) {
		if (nick) {
			chanselected.send('/sysmsg ' + nick + ' is now known as ' + newnick);
		}
	}
	nick = newnick;

	if (typeof localStorage !== "undefined")
		localStorage.nick = nick;

	return true;
}

/* /join command - join a channel */
function cmd_join(args) {
	var channel = validChannelName(args[1]);
	writeSysMsg('changing channels to "' + channel + '"');
	console.log(channels);
	if (channels.indexOf(channel) === -1) {
		createChannel(channel);
		localStorage.activeChannel = channel;
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
	if (channels.indexOf(channelName) === -1) {
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
		clear();
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

function isRTL() {
	return $('#usercmd').hasClass('rtl');
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
