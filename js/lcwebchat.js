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
	writeThis(msg);
}

function handleInput() {
	var cmd = $("#usercmd").val();
	if (chanselected) {
		console.log("sending " + cmd);
		$("#usercmd").val("");
		chanselected.send(cmd);
	}
}

function writeThis(str) {
	var chanpane = $("div.channel");
	chanpane.append("<p>" + str + "</p>");
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
