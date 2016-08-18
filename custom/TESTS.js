//You can add custom tests here, fields:
//	name:                                     Name of test
//	func (optional):                          Function to run before executing command, result will be placed to command
//	command (Will be executed on device):     Command to run test, %result% will be replaced with result of running function
//  	timeout (in ms):                          Time to wait before capturing pins after executing command
module.exports=execAdb=>{
	return [
		{
			name:'Flash',
			command:'echo 1 > /sys/devices/platform/flashlight || echo 1 > /sys/devices/platform/flashlight/leds/flashlight/brightness',
			timeout:500
		},
		{
			name:'Audio',
			func:function(cb){
				execAdb('shell ls /system/media/audio/alarms',(files)=>{
					files=files.split('\n');
					files=files.map(file=>file.replace(/\r/g,''));
					files=files.filter(file=>!!(file.indexOf('.ogg')+1));
					if(!files[0]){
						console.log('No ogg files found in /system/media/audio/alarms!');
						process.exit(0);
					}
					cb(files[0]);
				});
			},
			command:'am start -a "android.intent.action.VIEW" -t "audio/ogg" -d "file:///system/media/audio/alarms/%result%"',
			timeout:1000
		},
		{
			name:'Screen & Touchpanel',
			command:'input keyevent 26',
			timeout:900
		},
		{
			name:'RIL (Will be broken after this, restart phone)',
			command:'kill -9 `pidof rild` || stop service rild',
			timeout:1500
		}
	];
};