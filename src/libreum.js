(function ($, lc) {
"use strict";

var channels = [];
var nick = "guest";

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
			channels = [ '#welcome' ];
			localStorage.activeChannel = '#welcome';
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
