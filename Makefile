LINTER=jshint
MINIFY=uglifyjs --compress --mangle --

all: lint minify

.PHONY: lint

lint:
	$(LINTER) src/libreum.js

minify:
	$(MINIFY) src/libreum.js > js/libreum.min.js
	wc src/libreum.js && wc js/libreum.min.js
