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

var lctx;
var chanselected;
var nick = "guest";

function init() {
	console.log("init()");
	lctx = new Librecast(ready);
	$("div.title").html("<h1>Channel Title<h1>");
	$("#usercmd").keypress(function(e) {
			if (e.which == 13) {
				e.preventDefault();
				handleInput();
			}
	});
	$("#usercmd").focus();
}

function ready() {
	console.log("ready()");
	var disarray = [];
	var sock = new LibrecastSocket(lctx, sockready);
	var chan = new LibrecastChannel(lctx, "chatx", chanready);
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
	writeMsg(msg);
}

function cmd_help(args) {
	writeSysMsg("/help");
	writeSysMsg("  commands: ");
	writeSysMsg("  /help                       - displays this help message");
	writeSysMsg("  /nick nickname              - changes your channel nick");
	writeSysMsg("");
	return true;
}

function cmd_nick(args) {
	var newnick = args[1];
	writeSysMsg(nick + ' is now known as ' + newnick);
	nick = newnick;
	return true;
}

/* process any /cmd irc-like commands */
function handleCmd(cmd) {
	if (cmd.substring(0,1) != '/')
		return false;

	var args = cmd.split(' ');
	var command = args[0].substring(1);
	switch (command) {
	case "help":
		return cmd_help(args);
	case "nick":
		return cmd_nick(args);
	}

	return true; /* do not write failed commands to channel */
}

function handleInput() {
	var cmd = $("#usercmd").val();
	if (chanselected) {
		if (!handleCmd(cmd)) {
			console.log("sending " + cmd);
			chanselected.send(cmd);
		}
	}
	$("#usercmd").val("");
}

function writeMsg(str) {
	/* formatting is mostly CSS, but also use a non-breaking space so cut and paste is legible */
	var msg = '<span class="msg">' + str + '</span>';
	var d = new Date();
	var month = new String("0" + (d.getMonth() + 1)).slice(-2);
	var day = new String("0" + d.getDate()).slice(-2);
	var hours = new String("0" + d.getHours()).slice(-2);
	var minutes = new String("0" + d.getMinutes()).slice(-2);
	var seconds = new String("0" + d.getSeconds()).slice(-2);
	var date = '<span class="datestamp">' + d.getFullYear() + '-' + month + '-' + day + '&nbsp;</span>';
	var time = '<span class="timestamp">' + hours + ':' + minutes + ':' + seconds + '&nbsp;</span>';
	var user = '<span class="nick">&lt;' + nick + '&gt;&nbsp;</span>';
	var line = '<p>' + date + time + user + msg + '</p>';
	writeChannel(line);
}

function writeSysMsg(str) {
	var sysmsg = '<pre><span class="sysmsg">' + str + '</span></pre>';
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
