'use strict';

// Native
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

// Packages
const mockery = require('mockery');
const sinon = require('sinon');
const test = require('ava');

mockery.registerMock('node-hid', {
	devices() {
		return [{
			vendorId: 0x0fd9,
			productId: 0x0060,
			path: 'foo'
		}];
	}
});

class DummyHID extends EventEmitter {
	constructor() {
		super();
		this.write = sinon.spy();
		this.sendFeatureReport = sinon.spy();
	}
}

mockery.enable({
	warnOnUnregistered: false
});

// Must be required after we register a mock for `node-hid`.
const StreamDeck = require('../');

const streamDeck = new StreamDeck(new DummyHID());

test.afterEach(() => {
	streamDeck.device.write.reset();
	streamDeck.device.sendFeatureReport.reset();
});

test('fillColor', t => {
	t.plan(2);

	streamDeck.fillColor(0, 255, 0, 0);

	validateWriteCall(
		t,
		streamDeck.device.write,
		[
			'fillColor-red-page1.json',
			'fillColor-red-page2.json'
		]
	);
});

test('checkRGBValue', t => {
	t.plan(4);

	t.throws(() => streamDeck.fillColor(0, 256, 0, 0));
	t.throws(() => streamDeck.fillColor(0, 0, 256, 0));
	t.throws(() => streamDeck.fillColor(0, 0, 0, 256));

	t.throws(() => streamDeck.fillColor(0, -1, 0, 0));
});

test('checkValidKeyIndex', t => {
	t.plan(2);

	t.throws(() => streamDeck.clearKey(-1));
	t.throws(() => streamDeck.clearKey(15));
});

test('clearKey', t => {
	t.plan(2);
	streamDeck.clearKey(0);
	validateWriteCall(
		t,
		streamDeck.device.write,
		[
			'fillColor-red-page1.json',
			'fillColor-red-page2.json'
		],
		data => {
			return data.map(value => (value === 255) ? 0 : value);
		}
	);
});

test.only('fillImageFromFile', t => {
	return streamDeck.fillImageFromFile(0, path.resolve(__dirname, 'fixtures', 'nodecg_logo.png'))
	.then(() => {
		console.log('back from func');
		validateWriteCall(
			t,
			streamDeck.device.write,
			[
				'fillImageFromFile-nodecg_logo-page1.json',
				'fillImageFromFile-nodecg_logo-page2.json'
			]
		);
		console.log('after validate');
	});
});

test('fillImageOnAll', t => {
	return streamDeck.fillImageOnAll(path.resolve(__dirname, 'fixtures', 'red_square.png'))
	.then(() => {
		validateWriteCall(
			t,
			streamDeck.device.write,
			[
				'fillImageOnAll-red_square-page1.json',
				'fillImageOnAll-red_square-page2.json'
			]
		);
	})
	.catch(error => {
		throw error;
	});
});

function validateWriteCall(t, spy, files, filter) {
	const callCount = spy.callCount;
	if (callCount !== files.length) {
		t.fail('Spy was not called correct number of times');
		return;
	}
	console.log(callCount);
	console.log(files);
	for (let i = 0; i < callCount; i++) {

		let data = readFixtureJSON(files[i]);
		if (filter) {
			data = filter(data);
		}
		t.deepEqual(spy.getCall(i).args[0], data);
		console.log('im here');
	}
}

test('down and up events', t => {
	t.plan(2);
	const downSpy = sinon.spy();
	const upSpy = sinon.spy();
	streamDeck.on('down', key => downSpy(key));
	streamDeck.on('up', key => upSpy(key));
	streamDeck.device.emit('data', Buffer.from([0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
	streamDeck.device.emit('data', Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));

	t.is(downSpy.getCall(0).args[0], 0);
	t.is(upSpy.getCall(0).args[0], 0);
});

test.cb('forwards error events from the device', t => {
	streamDeck.on('error', () => {
		t.pass();
		t.end();
	});
	streamDeck.device.emit('error', new Error('Test'));
});

test('fillImage undersized buffer', t => {
	const largeBuffer = Buffer.alloc(1);
	t.throws(() => streamDeck.fillImage(0, largeBuffer));
});

test('setBrightness', t => {
	t.plan(4);
	streamDeck.setBrightness(100);
	streamDeck.setBrightness(0);

	t.deepEqual(streamDeck.device.sendFeatureReport.getCall(1).args[0], [0x05, 0x55, 0xaa, 0xd1, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
	t.deepEqual(streamDeck.device.sendFeatureReport.getCall(0).args[0], [0x05, 0x55, 0xaa, 0xd1, 0x01, 0x64, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

	t.throws(() => streamDeck.setBrightness(101));
	t.throws(() => streamDeck.setBrightness(-1));
});

function readFixtureJSON(fileName) {
	const filePath = path.resolve(__dirname, 'fixtures', fileName);
	console.log('reading', filePath);
	const fileData = fs.readFileSync(filePath);
	console.log(fileData);
	return JSON.parse(fileData);
}
