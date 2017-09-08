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
var allowedRemoteCmds = [ 'sysmsg', 'topic' ];

function init() {
	console.log("init()");
	lctx = new Librecast(ready);
	handleCmd("/topic no topic set");
	$("#usercmd").keypress(function(e) {
		if (e.which == KEY_ENTER) {
			e.preventDefault();
			handleInput();
		}
	});
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
	$("#usercmd").focus();
}

function cmdGet() {
	return $("#usercmd").val();
}

function cmdSet(command) {
	$("#usercmd").val(command);
}

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

function cmdHistorySet(cmd) {
	console.log("cmdHistorySet(" + cmd + ")");
	cmdHistory.unshift(cmd);
	if (cmdHistory.length > CMD_HISTORY_LIMIT)
		cmdHistory.pop();
}

function ready() {
	console.log("ready()");
	changeChannel("chatx");
}

function changeChannel(channelName) {
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

function chanready(cb) {
	console.log("my channel is ready");
	var chan = cb.obj;
	chan.join();

	/* fetch channel topic */
	chan.getval("topic", gottopic);
}

function gottopic(obj, opcode, len, id, token, msg) {
	updateChannelTopic(msg);
}

function sockready(cb) {
	console.log("my socket is ready");
	var sock = cb.obj;
	sock.listen(gotmail);
}

function bound(cb) {
	var chan = cb.obj;
	chanselected = chan;
}

function gotmail(obj, opcode, len, id, token, msg) {
	console.log("gotmail: " + msg );
	if (!handleCmd(msg, true)) {
		writeMsg(msg);
	}
}

function cmd_help(args) {
	writeSysMsg("/help");
	writeSysMsg("  commands: ");
	writeSysMsg("  /help                       - displays this help message");
	writeSysMsg("  /nick nickname              - changes your channel nick");
	writeSysMsg("  /topic channel topic        - set channel topic");
	writeSysMsg("  /join channel               - join channel");
	writeSysMsg("  /part [channel]             - leave active or specified channel");
	writeSysMsg("");
	return true;
}

function cmd_nick(args) {
	var newnick = args[1];

	if (chanselected) {
		chanselected.send('/sysmsg ' + nick + ' is now known as ' + newnick);
	}
	nick = newnick;

	return true;
}

function cmd_join(args) {
	var channel = args[1];
	writeSysMsg('changing channels to "' + channel + '"');
	changeChannel(channel);
	return true;
}

function cmd_sysmsg(args) {
	args.shift();
	var msg = args.join(" ");
	writeSysMsg(msg);
	return true;
}

function cmd_topic(args, isRemote) {
	args.shift();
	var topic = args.join(" ");
	updateChannelTopic(topic);
	if (isRemote)
		writeSysMsg('channel topic changed to "' + topic + '"');
	return true;
}

function updateChannelTopic(topic) {
	$("div.topic").html("<h1>" + topic + "<h1>");
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
	case "sysmsg":
		return cmd_sysmsg(args);
	case "topic":
		return cmd_topic(args, isRemote);
	}

	return true; /* do not write failed commands to channel */
}

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

function writeMsg(unsafestr) {
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
	writeChannel(line);
}

function writeSysMsg(unsafestr) {
	var msg = $('<div>').text(unsafestr).html();
	var sysmsg = '<pre><span class="sysmsg">' + msg + '</span></pre>';
	writeChannel(sysmsg);
}

function writeChannel(str) {
	var chanpane = $("div.channel");
	chanpane.append(str);
	chanpane.scrollTop(chanpane.prop("scrollHeight") - chanpane.prop("clientHeight"));
}

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
