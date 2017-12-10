QUnit.module("Filter");

QUnit.test("comparisons", function(assert) {
	var type = LIBRECAST.FILTER_TIME;
	var ops = [ "<=", "<", ">=", ">", "=" ];

	for (var i in ops) {
		var op = ops[i];
		var key = "1512860944810468536";
		var arg = type + op + key;
		var f = new LIBRECAST.Filter(arg);
		assert.strictEqual(f.arg, arg, "Filter.arg (" + op + ")");
		assert.strictEqual(f.type, type, "Filter.type (" + op + ")");
		assert.strictEqual(f.op, op, "Filter.op (" + op + ")");
		assert.strictEqual(f.key, key, "Filter.key (" + op + ")");
	}
});

QUnit.test("type (defaults to keyword)", function(assert) {

	var arg = "token";
	var f = new LIBRECAST.Filter(arg);
	assert.strictEqual(f.type, LIBRECAST.FILTER_KEY, "Filter.type (default to keyword filter)");
	assert.strictEqual(f.op, "=", "Filter.op (default to keyword filter)");
	assert.strictEqual(f.key, arg, "Filter.key (default to keyword filter)");
});

QUnit.test("type (keyword specified)", function(assert) {
	var arg = "key=token";
	var f = new LIBRECAST.Filter(arg);
	assert.strictEqual(f.type, LIBRECAST.FILTER_KEY, "Filter.type (keyword)");
	assert.strictEqual(f.op, "=", "Filter.op (keyword)");
	assert.strictEqual(f.key, "token", "Filter.key (keyword)");
});

QUnit.test("timestamp formats", function(assert) {
	var type = LIBRECAST.FILTER_TIME;
	var op = '='
	var key = "1512860944810468536";
	var arg = type + op + key;
	var f = new LIBRECAST.Filter(arg);
	assert.strictEqual(f.key, key, "timestamp (" + key + ")");

	key = "2017-12-08";
	res = "1512691200000000000";
	arg = type + op + key;
	f = new LIBRECAST.Filter(arg);
	assert.strictEqual(f.key, res, "timestamp (" + key + ")");

	key = "20171208T121212";
	var d = moment(key);
	res = d.format("x") + "000000";
	arg = type + op + key;
	f = new LIBRECAST.Filter(arg);
	assert.strictEqual(f.key, res, "timestamp (" + key + ")");
});
