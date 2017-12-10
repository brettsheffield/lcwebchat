QUnit.test("Filter", function(assert) {
	var type = LIBRECAST.FILTER_TIME;
	var ops = [ "<=", "<", ">=", ">", "=" ];

	for (var i in ops) {
		var op = ops[i];
		var key = "1234";
		var arg = type + op + key;
		var f = new LIBRECAST.Filter(arg);
		assert.strictEqual(f.arg, arg, "Filter.arg (" + op + ")");
		assert.strictEqual(f.type, type, "Filter.type (" + op + ")");
		assert.strictEqual(f.op, op, "Filter.op (" + op + ")");
		assert.strictEqual(f.key, key, "Filter.key (" + op + ")");
	}

	arg = "token";
	f = new LIBRECAST.Filter(arg);
	assert.strictEqual(f.type, LIBRECAST.FILTER_KEY, "Filter.type (default to keyword filter)");
	assert.strictEqual(f.op, "=", "Filter.op (default to keyword filter)");
	assert.strictEqual(f.key, arg, "Filter.key (default to keyword filter)");

	arg = "key=token";
	f = new LIBRECAST.Filter(arg);
	assert.strictEqual(f.type, LIBRECAST.FILTER_KEY, "Filter.type (keyword)");
	assert.strictEqual(f.op, "=", "Filter.op (keyword)");
	assert.strictEqual(f.key, "token", "Filter.key (keyword)");
});
