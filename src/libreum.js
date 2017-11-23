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

var channels = [];
var chanselected;
var nick = "guest";
var defaultChannel = '#welcome';

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

function readLocalStorage() {
	var localStorage = localStorage;
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
			channels = [ defaultChannel ];
			localStorage.activeChannel = defaultChannel;
		}
		if (typeof localStorage.nick === 'undefined') {
			var newnick = prompt('Welcome.	Please choose username ("nick") to continue', "guest");
			newnick = (newnick === null) ? nick : newnick;
			cmd_nick([,newnick]);
		}
		console.log("nick => " + nick);
		console.log(channels);
	}
}

readLocalStorage();

}(jQuery, LIBRECAST));
