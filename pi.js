const raspi = require('raspi');
const Serial = require('raspi-serial').Serial;
const io = require('socket.io-client');
const spawn = require('child_process').spawn;
const config = {
  socketServer: 'http://192.168.0.14:3000',
  tcpServer: 'tcp://192.168.0.14:9999'
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

let ffmpegRunning = null

function streamffmpeg() {
  if (ffmpegRunning === null) {
    console.log('starting ffmpeg')
    var cmd = 'ffmpeg';
    //ffmpeg -re -f video4linux2 -input_format h264 -video_size 640x480 -framerate 3 -i /dev/video0 -vcodec libx264 -profile:v main -g 3 -b:v 500k -keyint_min 250 -strict experimental -pix_fmt yuv420p -movflags empty_moov+default_base_moof -an -preset ultrafast -f mp4 tcp://192.168.0.14:9999
    var args = [
      '-re',
      '-f', 'video4linux2',
      '-input_format', 'h264',
      '-video_size', '640x480',
      '-framerate', '3',
      '-i', '/dev/video0',
      '-vcodec', 'libx264',
      '-profile:v', 'main',
      '-g', '3',
      '-b:v', '500k',
      '-keyint_min', '250',
      '-strict', 'experimental',
      '-pix_fmt', 'yuv420p',
      '-movflags', 'empty_moov+default_base_moof',
      '-an',
      '-preset', 'ultrafast',
      '-f', 'mp4',
      config.tcpServer
    ];
    ffmpegRunning = spawn(cmd, args);
    if (ffmpegRunning) {
      ffmpegRunning.on('close', function () {
        console.log('ffmpeg stopped')
        ffmpegRunning = null
      });
    }
  }
}

function stopffmpeg() {
  if (ffmpegRunning !== null) {
    ffmpegRunning.kill('SIGINT');
    ffmpegRunning = null
  }
}

raspi.init(() => {
  var serial = new Serial({
    portId: '/dev/ttyAMA0',
    baudRate: 19200
  });
  // serial.on('data', (data) => {
  //   console.log('Got data', data)
  // })
  serial.open(async () => {
    // serial.write(Buffer.from([0x82])) // mode?
    //serial.write(Buffer.from([0x83])) // does control?

    var socket = io.connect(config.socketServer);
    socket.on('clientCount', function (clientCount) {
      console.log('Someones watching!', clientCount)
      // start ffmpeg.
      if (clientCount > 1) {
        streamffmpeg()
      } else {
        stopffmpeg()
      }
    });
    socket.on('move', function (moveInstruction) {
      console.log('got move instructions', moveInstruction)
      // todo
    });

    // await sleep(1000)
    // serial.write(Buffer.from([0xD0, 0, 0]))
    // await sleep(1000)
    // serial.write(Buffer.from([0xe9]))
    // serial.write(String.fromCharCode(14));
    // serial.write(String.fromCharCode(14));
    // await sleep(2000)
    // serial.write(Buffer.from([0xD0, 0, 0]))
  })
})
