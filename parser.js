"use strict";
//By F6CF (aka Creeplays) for 4PDA
//  Thanks for all SRT members!
//Do not remove copyrights, pls :D

//Specify adb binary
const ADB_CMD='adb';

const TESTS=require('./custom/TESTS.js')(execAdb);

//Do not touch anything after this line, ugly code :D

//Names for fields
//[mode] [pullsel] [din] [dout] [pullen] [dir] [dinv]
const PIN_FIELDS=[
	'MODE   ',
	'PULLSEL',
	'DIN    ',
	'DOUT   ',
	'PULLEN ',
	'DIR    ',
	'DINV   '
];

const DEVICE_PREFIXES = require('./custom/DEVICE_PREFIXES.json')

const DEVICE_NAMES = require('./custom/DEVICE_NAMES.json')

//Imports
const exec = require('child_process').exec;
const fs   = require('fs');

//Helper functions

//Execute console command
function execute(command, callback){
    	exec(command, function(error, stdout, stderr){ callback(stdout); });
};

//Execute ADB command
function execAdb (argument, callback) {
	execute(ADB_CMD+' '+argument,callback);
}

//Parse mtgpio/pin
function parsePins (pinsFile) {
	let out={};
	let lines=pinsFile.split('\n');
	lines.pop();
	lines.shift();
	lines=lines.map(line=>line.replace(/\r/g,''));

	lines.forEach(line=>{
		out[line.split(':')[0].trim()]=line.split(':')[1];
	});
	return out;
}

//Find difference between two mtgpio/pin files
function diffPins (pin1, pin2) {
	pin1=parsePins(pin1);
	pin2=parsePins(pin2);
	let res=[];
	let res2=[];
	Object.keys(pin1).forEach(key=>{
		if(pin1[key]!=pin2[key]){
			res.push(key);
			res2.push([pin1[key],pin2[key]]);
		}
	});
	return {
		pins:res,
		states:res2
	};
}

//Test runner
function runTest (test,cb,oldpins,returnCB){
	if(cb){
		let cmd=test.command;
		if(cb!='DUMMY'){
			console.log('Got answer from preExec function: '+cb+', running command...');
			cmd.replace('%result%',cb);
		}
		execAdb('shell '+cmd,(result)=>{
			console.log('Executed, waiting for timeout...');
			setTimeout(()=>{
				execAdb('shell cat sys/devices/virtual/misc/mtgpio/pin',res=>{
					let out=diffPins(res,oldpins);
					if(out.pins.length==0)
						console.log('Pins not found for '+test.name+'!');
					else
						console.log('Pins for '+test.name+' is '+out.pins.join(','));
					returnCB(test.name,out);
				});
			},test.timeout)
		});
	}else{
		console.log('Running test for '+test.name)
		let pins;
		execAdb('shell cat sys/devices/virtual/misc/mtgpio/pin',res=>{
			pins=res;
			if(test.func){
				console.log('Found pre exec function, running...');
				test.func(out=>runTest(test, out || 'DUMMY', pins, returnCB));
			}else{
				runTest(test,'DUMMY',pins,returnCB);
			}
		})
	}
}

//Parse state from mtgpio/pin
function parseState (state) {
	let out=[];
	let symbols=state.split('');
	for (let i = 0; i < symbols.length; i++) {
		let d=false;
		if(symbols[i]=='-'){
			d=true;
			i++;
		}
		let o=parseInt(symbols[i]);
		if(d)
			o=-o;
		out.push(o);
	}
	return out;
}

//Get diff between two states
function parseStateDiff (state1,state2) {
	state1=parseState(state1);
	state2=parseState(state2);
	let o='';
	PIN_FIELDS.forEach((field,id)=>{
		o+=field+'      '+fixLen(state1[id],2)+'       '+fixLen(state2[id],2)+'\n';
	})
	return o
}

//Make string fixed length, i.e fixLen("123",5) -> "  123" 
function fixLen (str,len) {
	while(str.length<len)
		str=' '+str;
	return str;
}

//Parse args
let args=process.argv;
args.shift();args.shift();//Remove "node parser.js"

console.log(`
    MTK Multi Tool  Copyright (C) 2016  F6CF (hhhaker6@gmail.com)
    This program comes with ABSOLUTELY NO WARRANTY.
    This is free software, and you are welcome to redistribute it
    under certain conditions, see LICENSE for details.
`)
//Entry point
console.log('Searching for devices...');
execAdb('devices',(d)=>{
	if(d.split('\n')<2){
		console.log('Please specify correct ADB_CMD!');
		process.exit(0);
	}
	if(d.split('\n')[1].charCodeAt(0)==13){
		console.log('No devices!');
		process.exit(0);
	} else
		if(!(d.split('\n')[1].indexOf('device')+1)){
			console.log('No devices!');
			process.exit(0);
		}
		console.log('Detected: '+d.split('\n')[1]);
	switch(args[0]){
		case '-t':
			console.log('Running tests...');
			let resultStr='';
			let outputStr='';
			let cur=0;
			function result(name,pins) {
				let o;
				if(pins.length==0)
					o='Not found';
				else
					o=pins.pins.join(',');

				resultStr+=name+': '+o+'\n';
				pins.pins.forEach((pin,id)=>{
					resultStr+=pin+': from '+pins.states[id][0]+' to '+pins.states[id][1]+'\n';
					outputStr+='\n\nChanges for '+pin+' ('+name+'):\n             FROM    TO\n';
					outputStr+=parseStateDiff(pins.states[id][0],pins.states[id][1]);
				});
				if(cur==TESTS.length){
					resultStr+='Done, saving full result...';
					console.log(resultStr);
					fs.writeFile(__dirname+'/state.txt',outputStr,(err,res)=>{
						if(err)
							console.log('Error! '+err.message);
						else
							console.log('Finished writing file! Can be found in state.txt');
					});
				}else{
					process();
				}
			}
			function process() {
				runTest(TESTS[cur],undefined,undefined,(name,pins)=>{
					cur++;
					result(name,pins);
				});
			}
			process();
			break;
		case '-d':
			console.log('Getting pins...');
			execAdb('shell cat sys/devices/virtual/misc/mtgpio/pin',res=>{
				console.log('Got, total: '+res.split('\n').length);
				let o='Pin dump:\n\n';
				let pins=parsePins(res);
				Object.keys(pins).forEach(pinNum=>{
					o+='Info for pin #'+pinNum+':\n           VALUE\n'
					let state=pins[pinNum];
					state=parseState(state)
					PIN_FIELDS.forEach((pinName,id)=>{
						o+=pinName+'    '+state[id]+'\n';
					});
					o+='\n\n\n'
				})
				console.log('Parsed, saving to file...');
				fs.writeFile(__dirname+'/dump.txt',o,(err,res)=>{
					if(err)
						console.log('Error! '+err.message);
					else
						console.log('Finished writing file! Can be found in dump.txt');
				});
			});
			break;
		case '-e':
			console.log('Detecting drivers...');
			execAdb('shell ls /sys/bus/i2c/drivers/',res=>{
				let drivers=res.split('\n');
				drivers=drivers.map(driver=>driver.replace(/\r/g,''));
				drivers=drivers.map(driver=>driver.toLowerCase())
				drivers=drivers.filter(driver=>driver!='');
				console.log('Got driver list');
				console.log('Searching for LCM\'s');
				execAdb('shell cat /proc/cmdline',cmdline=>{
					//console.log('CMDLINE is '+cmdline);
					cmdline=cmdline.split(' ');
					cmdline=cmdline.map(cmd=>cmd.trim());
					cmdline=cmdline.filter(cmd=>cmd!='');
					cmdline=cmdline.filter(cmd=>cmd.indexOf('lcm=')==0);
					cmdline=cmdline[0];
					let lcm;
					if(!cmdline)
						console.log('Cannot detect LCM');
					else
						lcm=cmdline.split('-')[1]
					console.log('Searching for camera...');
					execAdb('shell cat /system/lib/libcameracustom.so | grep -a SENSOR_DRVNAME_',drvnames=>{
						drvnames=drvnames.split('SENSOR_DRVNAME_')[1].toLowerCase().split('\0');
						drvnames=drvnames.filter(drvname=>drvname!='')
						drvnames.forEach(drvname=>drivers.push(drvname));
						drivers=new Set(drivers);
						let devices={};
						Object.keys(DEVICE_PREFIXES).forEach(key=>{
							if(!devices[key])
								devices[key]=[];
							DEVICE_PREFIXES[key].forEach(name=>{
								drivers.forEach(driver=>{
									if(driver.indexOf(name)==0){
										drivers.delete(driver);
										devices[key].push(driver);
									}
								});
							});
						});
						if(lcm)
							devices.lcm=[lcm];
						devices.other=Array.from(drivers);
						let o='TYPE          DRIVERS\n';
						Object.keys(devices).forEach(type=>{
							if(devices[type].length==0)
								return;
							o+=DEVICE_NAMES[type]+'   '+devices[type].shift()+'\n';
							devices[type].forEach(device=>{
								o+='              '+device+'\n';
							})
						})
						console.log(o);
					});
				});
			});


			break;
		default:
			console.log('Usage:');
			console.log('	node parser.js [action]');
			console.log('Where action:');
			console.log('	-d Dump mtgpio in readable format');
			console.log('	-t Test all devices and find pins');
			console.log('   -e Detect all drivers')
	}
});
