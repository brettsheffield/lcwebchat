/* 
 * lcwebchat.js - basic librecast chat demo
 *
 * this file is part of LCWEBCHAT
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

"use strict";

const KEY_ENTER = 13;
const KEY_DOWN = 40;
const KEY_UP = 38;
const CMD_HISTORY_LIMIT=32;

var lctx;
var chanselected;
var nick = "guest";
var cmdHistory = [];
var cmdIndex = -1;
var cmdCurrent = "";
var allowedRemoteCmds = [ 'sysmsg' ];
var channels = [];
var chansocks = [];


function init() {
	console.log("init()");

	/* read local storage */
	if (typeof localStorage !== "undefined") {
		if (typeof localStorage["nick"] !== "undefined")
			nick = localStorage["nick"];

		if (typeof localStorage["channels"] !== "undefined") {
			try {
				channels = JSON.parse(localStorage["channels"]);
			}
			catch(e) {
				console.log("no channels loaded");
			}
		}
		if (channels.length === 0)
				channels = [ '#chatx' ];
		console.log(channels);
	}

	/* initalize Librecast context */
	lctx = new Librecast(librecastCtxReady);

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
	$('#chansock_' + socketid).addClass('active');

	chanselected = chansocks[socketid];
}

/* check channel name validity */
function validChannelName(channelName) {
	/* for now, just insist it starts with a hash */
	if (channelName[0] !== '#') {
		channelName = '#' + channelName;
	}
	return channelName;
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
	channelName = validChannelName(channelName);
	if (!channelName) {
		writeSysMsg("'" + channelName + "' not a valid channel name");
		return false;
	}
	var disarray = [];
	var sock = new LibrecastSocket(lctx, sockready);
	var chan = new LibrecastChannel(lctx, channelName, chanready);
	disarray.push(sock.defer);
	disarray.push(chan.defer);

	$.when.apply($, disarray).done(function() {
			console.log("socket and channel both ready");
			console.log("socket id=" + sock.id);
			console.log("channel id=" + chan.id);
			chan.bind(sock, bound);
	});
}

/* callback when LibrecastChannel is created
 * Note: this doesn't mean the socket is ready, 
 * or that we are listening to this channel */
function chanready(cb) {
	console.log("my channel is ready");
	var chan = cb.obj;
	chan.join();

	if (channels.indexOf(chan.name) === -1) {
		channels.push(chan.name);
		localStorage["channels"] = JSON.stringify(channels);
	}
	var chansock = $('<li id="chansock_' + chan.id2  + '">' + chan.name + '</li>');
	$('div.channels').append(chansock);
	chansock.on('click', function() {
			var socketid = $(this).attr('id').split('_')[1];
			changeChannel(socketid);
	});

	/* fetch channel topic */
	updateChannelTopic(chan.name, chan.id2);
	chan.getval("topic", gottopic);
}

function gottopic(obj, opcode, len, id, token, msg) {
	updateChannelTopic(msg, obj.obj.id);
}

/* callback when LibrecastSocket is created */
function sockready(cb) {
	console.log("my socket is ready");
	var sock = cb.obj;
	sock.listen(gotmail);

	/* create socket pane */
	var chatdiv = $('div.chat');
	chatdiv.append('<div id="topic_' + cb.obj.id + '" class="topic"></div>');
	chatdiv.append('<div id="socket_' + cb.obj.id + '" class="socket"></div>');
}

/* callback when LibrecastChannel is bound to LibrecastSocket */
function bound(cb) {
	var chan = cb.obj;
	chansocks[chan.id2] = chan;
	if (typeof chanselected === 'undefined')
		changeChannel(chan.id2);
}

/* callback when message received on LibrecastSocket */
function gotmail(obj, opcode, len, id, token, key, val) {
	console.log("gotmail()");
	var socketid = obj.obj.id;
	if (opcode === LCAST_OP_SOCKET_MSG) {
		if (!handleCmd(val, true)) {
			writeMsg(val, socketid);
		}
	}
	else if (opcode === LCAST_OP_CHANNEL_GETVAL) {
		/* TODO: check key */
		updateChannelTopic(val, socketid);
	}
	else if (opcode === LCAST_OP_CHANNEL_SETVAL) {
		if (key == 'topic') {
			updateChannelTopic(val, socketid);
		}
		else {
			console.log("ignoring unknown key '" + key + "'");
		}
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
	writeSysMsg("");
	return true;
}

/* /nick command - change user nick */
function cmd_nick(args) {
	var newnick = args[1];

	if (chanselected) {
		chanselected.send('/sysmsg ' + nick + ' is now known as ' + newnick);
	}
	nick = newnick;

	if (typeof localStorage !== "undefined")
		localStorage["nick"] = nick;

	return true;
}

/* /join command - join a channel */
function cmd_join(args) {
	var channel = args[1];
	writeSysMsg('changing channels to "' + channel + '"');
	console.log(channels);
	if (channels.indexOf(channel) === -1)
		createChannel(channel);
	else
		console.log("already joined to channel '" + channel + "'");
	return true;
}

/* /sysmsg command -  write system message */
function cmd_sysmsg(args) {
	args.shift();
	var msg = args.join(" ");
	writeSysMsg(msg);
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
	if (socketid === undefined) {
		var divtopic = $("div.topic.active");
	}
	else {
		var divtopic = $("#topic_" + socketid);
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
		if (!isRemote && allowedRemoteCmds.includes(command)) {
			chanselected.send(cmd);
		}
	}
	if (isRemote && !allowedRemoteCmds.includes(command)) {
		console.log("bad remote command received: " + command);
	}
	switch (command) {
	case "help":
		return cmd_help(args);
	case "join":
		return cmd_join(args);
	case "nick":
		return cmd_nick(args);
	case "reset":
		clear();
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
			console.log("sending " + cmd);
			chanselected.send('<' + nick + ">  " + cmd);
		}
	}
	cmdSet("");
	cmdIndex = -1;
	cmdCurrent = "";
}

/* write chat message to channel window */
function writeMsg(unsafestr, socketid) {
	/* formatting is mostly CSS, but also use a non-breaking space so cut and paste is legible */
	var msg = $('<div>').text(unsafestr).html();
	var d = new Date();
	var month = new String("0" + (d.getMonth() + 1)).slice(-2);
	var day = new String("0" + d.getDate()).slice(-2);
	var hours = new String("0" + d.getHours()).slice(-2);
	var minutes = new String("0" + d.getMinutes()).slice(-2);
	var seconds = new String("0" + d.getSeconds()).slice(-2);
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
	if (typeof socketid === undefined) {
		var chanpane = $("div.channel.active");
	}
	else {
		var chanpane = $("#socket_" + socketid);
	}
	if (typeof chanpane !== 'undefined') {
		chanpane.append(str);
		chanpane.scrollTop(chanpane.prop("scrollHeight") - chanpane.prop("clientHeight"));
	}
}

/* program entry point - check if we have jQuery available */
if (HAS_JQUERY) {
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
