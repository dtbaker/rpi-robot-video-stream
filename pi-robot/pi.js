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
    console.log('posting image')
    const form = new FormData()
    const imageData = require('fs').readFileSync(`${config.memoryImageFolder}${config.memoryImageFile}`);
    form.append('file', imageData.toString('base64'), 'image.jpg')
    got.post(`${config.socketServer}/post`, {
      body: form,
      username: config.webServerPassword ? 'admin' : null,
      password: config.webServerPassword,
      agent: {
        http: keepaliveAgent,
        https: keepaliveAgent
      },
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
  }
}
