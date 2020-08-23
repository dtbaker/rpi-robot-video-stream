const raspi = require('raspi');
const Serial = require('raspi-serial').Serial;
const io = require('socket.io-client');
const fs = require('fs');
const spawn = require('child_process').spawn;
const FormData = require('form-data');
const got = require('got');
const config = {
  socketServer: 'http://192.168.0.14:3000',
  memoryImagePath: '/run/shm/stream.jpg'
}

const http = require('http');
const https = require('https');

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

let ffmpegRunning = null
let currentDirection = null
let serial = null
let currentClientCount = 0

function streamffmpeg() {
  if (ffmpegRunning === null) {
    console.log('starting ffmpeg')
    var cmd = 'ffmpeg';
    var args = [
      '-input_format', 'h264',
      '-video_size', '640x480',
      '-framerate', '5',
      '-i', '/dev/video0',
      '-update', '1',
      '-y',
      '-q:v', '1',
      config.memoryImagePath
    ]
    ffmpegRunning = spawn(cmd, args);
    if (ffmpegRunning) {
      ffmpegRunning.on('close', function () {
        console.log('ffmpeg stopped for some reason')
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

setInterval(() => {
  if (ffmpegRunning && fs.existsSync(config.memoryImagePath)) {
    console.log('posting image')
    const form = new FormData()
    const imageData = require('fs').readFileSync(config.memoryImagePath);
    form.append('file', imageData.toString('base64'), 'image.jpg')
    got.post(`${config.socketServer}/post`, {body: form})
  }
}, 1000)

raspi.init(() => {
  serial = new Serial({
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
      currentClientCount = clientCount
      console.log('Someones watching!', currentClientCount)
      // start ffmpeg.
      if (currentClientCount > 1) {
        streamffmpeg()
      } else {
        setTimeout(() => {
          if (currentClientCount <= 1) {
            console.log('Client count is ' + currentClientCount + ' so stopping the stream')
            stopffmpeg();
          }
        }, 5000)
      }
    });
    socket.on('moveVotes', function (moveVotes) {
      if (moveVotes && !currentDirection) {
        const direction = Object.keys(moveVotes).reduce((a, b) => moveVotes[a] > moveVotes[b] ? a : b);
        console.log('got move instructions', moveVotes, direction)
        if (direction && ['forward', 'back', 'left', 'right'].includes(direction)) {
          console.log('Moving in direction', direction)
          currentDirection = direction
          moveThisThing()
        }
      }
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

const motorSpeed = 14
const turnSpeed = 14

async function moveThisThing() {
  if (currentDirection && serial) {
    switch (currentDirection) {
      case 'left':
        serial.write(Buffer.from([0xEA, turnSpeed, turnSpeed]))
        break;
      case 'right':
        serial.write(Buffer.from([0xE5, turnSpeed, turnSpeed]))
        break;
      case 'forward':
        serial.write(Buffer.from([0xE9, motorSpeed, motorSpeed]))
        break;
      case 'back':
        serial.write(Buffer.from([0xE6, motorSpeed, motorSpeed]))
        break;
    }
    await sleep(400)
    serial.write(Buffer.from([0xD0, 0, 0]))
    currentDirection = null
  }
}
