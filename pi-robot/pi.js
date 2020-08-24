const raspi = require('raspi');
const Serial = require('raspi-serial').Serial;
const io = require('socket.io-client');
const fs = require('fs');
const spawn = require('child_process').spawn;
const FormData = require('form-data');
const got = require('got');
const config = {
  socketServer: process.env.STREAM_SERVER || 'http://192.168.0.14:3000',
  webServerPassword: process.env.PASSWORD || 'letmein',
  memoryImagePath: '/run/shm/stream.jpg'
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
let currentClientCount = 0

function startVideoCapture() {
  if (videoCaptureProcess === null) {
    console.log('starting video capture')
    var cmd = 'raspistill'
    var args = [
      '-t', '0',
      '-tl', '1000',
      '--thumb', 'none',
      '-n',
      '-q', '8',
      '-w', '640',
      '-h', '480',
      '-o', config.memoryImagePath
    ]
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

setInterval(() => {
  if (videoCaptureProcess && fs.existsSync(config.memoryImagePath)) {
    console.log('posting image')
    const form = new FormData()
    const imageData = require('fs').readFileSync(config.memoryImagePath);
    form.append('file', imageData.toString('base64'), 'image.jpg')
    try {
      got.post(`${config.socketServer}/post`, {
        body: form,
        username: 'admin',
        password: config.webServerPassword,
        agent: {
          http: keepaliveAgent,
          https: keepaliveAgent
        },
      })
    } catch (e) {

    }
  }
}, 3000)

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
