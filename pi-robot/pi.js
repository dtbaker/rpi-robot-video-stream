const raspi = require('raspi');
const Serial = require('raspi-serial').Serial;
const io = require('socket.io-client');
const fs = require('fs');
const spawn = require('child_process').spawn;
const FormData = require('form-data');
const got = require('got');
const config = {
  socketServer: process.env.STREAM_SERVER || 'http://192.168.0.14:3000',
  webServerPassword: process.env.PASSWORD,
  memoryImageFolder: '/run/shm/pirobot/',
  memoryImageFile: 'stream.jpg'
}

const Agent = require('agentkeepalive');
const keepaliveAgent = new Agent({
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
  freeSocketTimeout: 4000,
});

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

let videoCaptureProcess = null
let currentDirection = null
let serial = null
let socket = null
let currentClientCount = 0
let latestReceivedVotes = null

function startVideoCapture() {
  if (videoCaptureProcess === null) {
    console.log('starting video capture')
    var cmd = 'raspistill'
    var args = [
      '-t', '0',
      '-tl', '500',
      '--thumb', 'none',
      '-n',
      '-q', '6',
      '-w', '640',
      '-h', '480',
      '-o', `${config.memoryImageFolder}${config.memoryImageFile}`
    ]
    cmd = 'sh'
    args = ['-c', `ffmpeg -f video4linux2 -input_format h264 -video_size 640x480 -framerate 2 -i /dev/video0 -vcodec libx264 -profile:v main ${config.memoryImageFolder}${config.memoryImageFile}`]
    videoCaptureProcess = spawn(cmd, args);
    if (videoCaptureProcess) {
      videoCaptureProcess.on('close', function () {
        console.log('capture process stopped for some reason')
      });
    }
  }
}

function stopVideoCapture() {
  if (videoCaptureProcess !== null) {
    videoCaptureProcess.kill('SIGINT');
    videoCaptureProcess = null
  }
}

let watchDebounce = null
if (!fs.existsSync(config.memoryImageFolder)){
  fs.mkdirSync(config.memoryImageFolder);
}
fs.watch(config.memoryImageFolder, (event, filename) => {
  if (filename === config.memoryImageFile && !watchDebounce) {
    watchDebounce = setTimeout(() => {
      watchDebounce = null
    }, 200)
    const form = new FormData()
    const imageData = require('fs').readFileSync(`${config.memoryImageFolder}${config.memoryImageFile}`);
    form.append('file', imageData.toString('base64'), 'image.jpg')
    got.post(`${config.socketServer}/post`, {
      body: form,
      username: config.webServerPassword ? 'admin' : null,
      password: config.webServerPassword,
      // agent: {
      //   http: keepaliveAgent,
      //   https: keepaliveAgent
      // },
    }).catch(e => console.log)
  }
});

setInterval(async () => {
  if (latestReceivedVotes && !currentDirection) {
    const latestReceivedVotesWithNumbers = Object.keys(latestReceivedVotes).filter(vote=> latestReceivedVotes[vote] > 0)
    if(latestReceivedVotesWithNumbers.length > 0) {
      const direction = latestReceivedVotesWithNumbers.reduce((a, b) => latestReceivedVotes[a] > latestReceivedVotes[b] ? a : b);
      if (direction && ['forward', 'back', 'left', 'right'].includes(direction)) {
        console.log('Moving in direction', direction)
        currentDirection = direction
        socket.emit('moveRobotComplete', direction)
        await moveThisThing()
        await sleep(2000)
        currentDirection = null
      }
    }
  }
}, 200)

raspi.init(() => {
  serial = new Serial({
    portId: '/dev/ttyAMA0',
    baudRate: 19200
  });
  serial.open(async () => {
    socket = io.connect(config.socketServer);
    socket.on('clientCount', function (clientCount) {
      currentClientCount = clientCount
      if (currentClientCount > 1) {
        startVideoCapture()
      } else {
        setTimeout(() => {
          if (currentClientCount <= 1) {
            console.log('Client count is ' + currentClientCount + ' so stopping the stream')
            stopVideoCapture();
          }
        }, 5000)
      }
    });
    socket.on('moveVotes', async function (moveVotes) {
      if(moveVotes){
        latestReceivedVotes = moveVotes
      }
    });
  })
})

// 01 = reverse
// 10 = forward

// Set Motor 1:
// C0 = 11000000 brake low
// C1 = 11000001 reverse
// C2 = 11000010 forward
// C3 = 11000011 brake low
// Set Motor 2
// C8 = 11001000 brake low
// C9 = 11001001 forward
// CA = 11001010 forward
// CB = 11001011 brake low
// Set both Motor 1 and 2
// D1 = 11010001 m1 reverse
// D2 = 11010010 m1 forward
// D4 = 11010100 m2 reverse
// D8 = 11011000 m2 forward
// D5 = 11010101 m1 reverse, m2 reverse
// DA = 11011010 m1 forward, m2 forward
// D9 = 11011001 m1 reverse, m2 forward
// D6 = 11010110 m1 forward, m2 reverse
// Accelerate both Motor 1 and 2
// E1 = 11010001 m1 reverse
// E2 = 11010010 m1 forward
// E4 = 11010100 m2 reverse
// E8 = 11011000 m2 forward
// E5 = 11010101 m1 reverse, m2 reverse
// EA = 11011010 m1 forward, m2 forward
// E9 = 11011001 m1 reverse, m2 forward
// E6 = 11010110 m1 forward, m2 reverse
// Accelerate Motor 1:
// C4 = 11000100 brake low
// C5 = 11000101 reverse
// C6 = 11000110 forward
// C7 = 11000111 brake low
// Accelerate Motor 2:
// CC = 11001100 brake low
// CD = 11001101 reverse
// CE = 11001110 forward
// CF = 11001111 brake low

const motorSpeed = 25
const turnSpeed = 22

// DOH! My motor 1 was wired in reverse. Fixing that in software.

async function moveThisThing() {
  if (currentDirection && serial) {
    switch (currentDirection) {
      case 'left':
        // move both forward (m1 wiring is reversed oops) but make right wheel spin faster
        serial.write(Buffer.from([0xE9, turnSpeed / 2, turnSpeed]))
        break;
      case 'right':
        // move both forward (m1 wiring is reversed oops) but make right wheel spin faster
        serial.write(Buffer.from([0xE9, turnSpeed, turnSpeed / 2]))
        break;
      case 'forward':
        // move both forward (m1 wiring is reversed oops)
        serial.write(Buffer.from([0xE9, motorSpeed, motorSpeed]))
        break;
      case 'back':
        // move both back (m1 wiring is reversed oops)
        serial.write(Buffer.from([0xE6, motorSpeed, motorSpeed]))
        break;
    }
    await sleep(400)
    serial.write(Buffer.from([0xD0, 0, 0]))
  }
}
