LINTER=jshint
MINIFY=uglifyjs --compress='drop_console true, warnings true' --mangle --

all: lint minify

debug: all
	cp src/libreum.js js/libreum.min.js

.PHONY: lint

lint:
	$(LINTER) src/libreum.js

minify:
	$(MINIFY) src/esrever.js > js/esrever.min.js
	$(MINIFY) src/stringview.js > js/stringview.min.js
	$(MINIFY) src/libreum.js > js/libreum.min.js
	wc src/libreum.js && wc js/libreum.min.js
